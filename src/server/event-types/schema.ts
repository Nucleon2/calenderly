import { z } from "zod";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const MAX_QUESTIONS = 10;
const MAX_REMINDER_OFFSETS = 5;

// --- primitives -------------------------------------------------------

const slugSchema = z
  .string()
  .trim()
  .max(60, "Slug must be at most 60 characters")
  .regex(SLUG_RE, "Slug can only contain lowercase letters, digits and hyphens")
  .optional()
  .or(z.literal(""));

const localDateSchema = z.string().regex(LOCAL_DATE_RE, "Enter a date as YYYY-MM-DD");

const step = (value: number, multiple: number) => value % multiple === 0;

export const questionTypeSchema = z.enum([
  "text",
  "textarea",
  "select",
  "multiselect",
  "phone",
  "checkbox",
]);

const OPTION_QUESTION_TYPES = new Set<z.infer<typeof questionTypeSchema>>(["select", "multiselect"]);

export const eventTypeQuestionSchema = z
  .object({
    id: z.uuid().optional(),
    type: questionTypeSchema,
    label: z.string().trim().min(1, "Label is required").max(200, "Label must be at most 200 characters"),
    required: z.boolean(),
    options: z
      .array(z.string().trim().min(1, "Option can't be empty").max(100, "Option must be at most 100 characters"))
      .min(1, "Add at least one option")
      .max(20, "At most 20 options")
      .optional(),
    position: z.number().int().min(0),
  })
  .superRefine((question, ctx) => {
    if (OPTION_QUESTION_TYPES.has(question.type) && (!question.options || question.options.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Add at least one option for this question type",
      });
    }
  });

export const locationTypeSchema = z.enum(["google_meet", "phone", "in_person", "custom"]);

export const locationDetailsSchema = z.object({
  text: z.string().trim().max(500, "Must be at most 500 characters").optional(),
  phone: z.string().trim().max(30, "Must be at most 30 characters").optional(),
  address: z.string().trim().max(500, "Must be at most 500 characters").optional(),
});

export const dateRangeTypeSchema = z.enum(["rolling", "fixed", "indefinite"]);

// --- top-level schema ---------------------------------------------------

export const eventTypeInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100, "Title must be at most 100 characters"),
    slug: slugSchema,
    description: z.string().trim().max(2000, "Description must be at most 2000 characters").optional().or(z.literal("")),
    durationMinutes: z
      .number()
      .int()
      .min(5, "Duration must be at least 5 minutes")
      .max(720, "Duration must be at most 720 minutes")
      .refine((v) => step(v, 5), "Duration must be a multiple of 5 minutes"),
    color: z.string().trim().regex(HEX_COLOR_RE, "Enter a valid hex color, e.g. #0069ff"),
    locationType: locationTypeSchema,
    locationDetails: locationDetailsSchema.default({}),
    scheduleId: z.uuid().nullable(),
    bufferBeforeMinutes: z.number().int().min(0).max(240, "Buffer must be at most 240 minutes"),
    bufferAfterMinutes: z.number().int().min(0).max(240, "Buffer must be at most 240 minutes"),
    minNoticeMinutes: z.number().int().min(0).max(43200, "Minimum notice must be at most 30 days"),
    slotIntervalMinutes: z
      .union([
        z.null(),
        z
          .number()
          .int()
          .min(5, "Slot interval must be at least 5 minutes")
          .max(240, "Slot interval must be at most 240 minutes")
          .refine((v) => step(v, 5), "Slot interval must be a multiple of 5 minutes"),
      ])
      .default(null),
    maxBookingsPerDay: z
      .union([z.null(), z.number().int().min(1, "Must be at least 1").max(100, "Must be at most 100")])
      .default(null),
    dateRangeType: dateRangeTypeSchema,
    dateRangeDays: z.number().int().min(1).max(365).default(60),
    dateRangeFrom: z.union([localDateSchema, z.null()]).default(null),
    dateRangeTo: z.union([localDateSchema, z.null()]).default(null),
    isSecret: z.boolean().default(false),
    requiresConfirmation: z.boolean().default(false),
    reminderOffsetsMinutes: z
      .array(z.number().int().min(0).max(20160, "Reminders can be at most 14 days before"))
      .max(MAX_REMINDER_OFFSETS, `At most ${MAX_REMINDER_OFFSETS} reminders`)
      .default([1440, 60]),
    questions: z.array(eventTypeQuestionSchema).max(MAX_QUESTIONS, `At most ${MAX_QUESTIONS} questions`).default([]),
  })
  .superRefine((input, ctx) => {
    if (input.locationType === "phone" && !input.locationDetails.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["locationDetails", "phone"],
        message: "Phone number is required for phone location",
      });
    }
    if (input.locationType === "in_person" && !input.locationDetails.address) {
      ctx.addIssue({
        code: "custom",
        path: ["locationDetails", "address"],
        message: "Address is required for in-person location",
      });
    }
    if (input.locationType === "custom" && !input.locationDetails.text) {
      ctx.addIssue({
        code: "custom",
        path: ["locationDetails", "text"],
        message: "Location details are required",
      });
    }

    if (input.dateRangeType === "rolling" && input.dateRangeDays == null) {
      ctx.addIssue({
        code: "custom",
        path: ["dateRangeDays"],
        message: "Number of days is required for a rolling date range",
      });
    }
    if (input.dateRangeType === "fixed") {
      if (!input.dateRangeFrom) {
        ctx.addIssue({ code: "custom", path: ["dateRangeFrom"], message: "Start date is required" });
      }
      if (!input.dateRangeTo) {
        ctx.addIssue({ code: "custom", path: ["dateRangeTo"], message: "End date is required" });
      }
      if (input.dateRangeFrom && input.dateRangeTo && input.dateRangeTo < input.dateRangeFrom) {
        ctx.addIssue({ code: "custom", path: ["dateRangeTo"], message: "End date must be on or after the start date" });
      }
    }
  });

/** Parsed/output shape: every defaulted field is present. Used server-side (service, actions, tests). */
export type EventTypeInputData = z.output<typeof eventTypeInputSchema>;
/** Pre-parse shape: defaulted fields are optional. Used to type the react-hook-form instance itself. */
export type EventTypeFormFields = z.input<typeof eventTypeInputSchema>;
export type EventTypeQuestionInput = z.output<typeof eventTypeQuestionSchema>;

import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

/**
 * Validation for the public booking form action (create + reschedule) and
 * the cancel action. Reused as-is by the public pages package — keep field
 * names and coercions exact.
 */

export const inviteeAnswerSchema = z.object({
  questionId: z.string().min(1, "questionId is required"),
  value: z.string().max(2000, "Answer must be at most 2000 characters"),
});

export type InviteeAnswerInput = z.infer<typeof inviteeAnswerSchema>;

export const createBookingSchema = z.object({
  eventTypeId: z.uuid("Invalid event type"),
  startUtc: z.coerce.date(),
  inviteeName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be at most 120 characters"),
  inviteeEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  inviteeTimezone: z.string().refine(isValidTimeZone, { message: "Invalid time zone" }),
  answers: z.array(inviteeAnswerSchema).max(20, "At most 20 answers"),
  rescheduleFromUid: z.string().min(1).optional(),
});

export type CreateBookingData = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  uid: z.string().min(1, "uid is required"),
  reason: z.string().trim().max(1000, "Reason must be at most 1000 characters").optional(),
});

export type CancelBookingData = z.infer<typeof cancelBookingSchema>;

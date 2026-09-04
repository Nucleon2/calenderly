"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control, type Resolver } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type BookingQuestionType = "text" | "textarea" | "select" | "multiselect" | "phone" | "checkbox";

export interface BookingFormQuestion {
  id: string;
  type: BookingQuestionType;
  label: string;
  required: boolean;
  options?: string[] | null;
}

export interface BookingAnswerInput {
  questionId: string;
  value: string;
}

export interface BookingFormSubmitValues {
  inviteeName: string;
  inviteeEmail: string;
  answers: BookingAnswerInput[];
  /** Honeypot field — should always be empty for a real invitee. */
  website: string;
  /** `Date.now()` when this form first rendered. */
  startedAt: number;
}

export interface BookingFormSubmitResult {
  ok: boolean;
  error?: string;
  field?: string;
}

export interface BookingFormProps {
  questions: BookingFormQuestion[];
  submitLabel?: string;
  onBack: () => void;
  onSubmit: (values: BookingFormSubmitValues) => Promise<BookingFormSubmitResult>;
}

type FormValues = {
  inviteeName: string;
  inviteeEmail: string;
  /** Honeypot — always empty for a real invitee. */
  website: string;
} & Record<`q_${string}`, string | string[] | boolean>;

function questionKey(id: string): `q_${string}` {
  return `q_${id}`;
}

/**
 * Builds a per-event-type zod schema. The shape is only known at runtime
 * (it depends on `questions`), so its inferred type necessarily collapses to
 * something looser than `FormValues` — the resolver assignment below casts
 * that away, since at runtime the validated keys always match `FormValues`.
 */
function buildSchema(questions: BookingFormQuestion[]) {
  const shape: Record<string, z.ZodTypeAny> = {
    inviteeName: z.string().trim().min(1, "Your name is required").max(200),
    inviteeEmail: z.string().trim().min(1, "Your email is required").email("Enter a valid email address"),
    website: z.string(),
  };

  for (const q of questions) {
    const key = questionKey(q.id);
    if (q.type === "multiselect") {
      shape[key] = q.required
        ? z.array(z.string()).min(1, "This question is required")
        : z.array(z.string());
    } else if (q.type === "checkbox") {
      shape[key] = q.required
        ? z.boolean().refine((v) => v === true, "This question is required")
        : z.boolean();
    } else {
      shape[key] = q.required ? z.string().trim().min(1, "This question is required") : z.string();
    }
  }

  return z.object(shape);
}

function defaultValuesFor(questions: BookingFormQuestion[]): FormValues {
  const values = { inviteeName: "", inviteeEmail: "", website: "" } as FormValues;
  for (const q of questions) {
    values[questionKey(q.id)] = q.type === "multiselect" ? [] : q.type === "checkbox" ? false : "";
  }
  return values;
}

function answerValue(type: BookingQuestionType, raw: string | string[] | boolean): string {
  if (type === "multiselect") return Array.isArray(raw) ? raw.join(", ") : "";
  if (type === "checkbox") return raw ? "Yes" : "No";
  return typeof raw === "string" ? raw.trim() : "";
}

export function BookingForm({ questions, submitLabel = "Schedule event", onBack, onSubmit }: BookingFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  // Lazy initializer: computed once, the first time this form renders.
  const [startedAt] = useState(() => Date.now());

  const schema = useMemo(() => buildSchema(questions), [questions]);
  const defaultValues = useMemo(() => defaultValuesFor(questions), [questions]);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    const answers: BookingAnswerInput[] = questions.map((q) => ({
      questionId: q.id,
      value: answerValue(q.type, values[questionKey(q.id)]),
    }));

    const result = await onSubmit({
      inviteeName: values.inviteeName.trim(),
      inviteeEmail: values.inviteeEmail.trim(),
      answers,
      website: values.website,
      startedAt,
    });

    if (!result.ok) {
      if (result.field === "inviteeName" || result.field === "inviteeEmail") {
        setError(result.field, { message: result.error });
      } else if (result.field?.startsWith("q_")) {
        setError(result.field as `q_${string}`, { message: result.error });
      } else if (result.error) {
        setFormError(result.error);
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {/* Honeypot: visually hidden, never filled by a real invitee. Bots that
          auto-fill every field will trip it. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <Field data-invalid={!!errors.inviteeName}>
        <FieldLabel htmlFor="inviteeName">Name *</FieldLabel>
        <Input
          id="inviteeName"
          autoComplete="name"
          aria-invalid={!!errors.inviteeName}
          {...register("inviteeName")}
        />
        <FieldError errors={[errors.inviteeName]} />
      </Field>

      <Field data-invalid={!!errors.inviteeEmail}>
        <FieldLabel htmlFor="inviteeEmail">Email *</FieldLabel>
        <Input
          id="inviteeEmail"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.inviteeEmail}
          {...register("inviteeEmail")}
        />
        <FieldError errors={[errors.inviteeEmail]} />
      </Field>

      {questions.map((q) => (
        <QuestionField key={q.id} question={q} control={control} register={register} error={errors[questionKey(q.id)]} />
      ))}

      {formError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" data-testid="booking-submit" disabled={isSubmitting}>
          {isSubmitting ? "Scheduling…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function QuestionField({
  question,
  control,
  register,
  error,
}: {
  question: BookingFormQuestion;
  control: Control<FormValues>;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  error?: { message?: string };
}) {
  const key = questionKey(question.id);
  const label = `${question.label}${question.required ? " *" : ""}`;

  if (question.type === "textarea") {
    return (
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={key}>{label}</FieldLabel>
        <Textarea id={key} rows={3} aria-invalid={!!error} {...register(key)} />
        <FieldError errors={[error]} />
      </Field>
    );
  }

  if (question.type === "phone") {
    return (
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={key}>{label}</FieldLabel>
        <Input id={key} type="tel" autoComplete="tel" aria-invalid={!!error} {...register(key)} />
        <FieldError errors={[error]} />
      </Field>
    );
  }

  if (question.type === "select") {
    const items = (question.options ?? []).map((option) => ({ value: option, label: option }));
    return (
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={key}>{label}</FieldLabel>
        <Controller
          control={control}
          name={key}
          render={({ field }) => (
            <Select
              items={items}
              value={typeof field.value === "string" ? field.value : ""}
              onValueChange={field.onChange}
            >
              <SelectTrigger id={key} className="w-full" aria-invalid={!!error}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[error]} />
      </Field>
    );
  }

  if (question.type === "multiselect") {
    const options = question.options ?? [];
    return (
      <Field data-invalid={!!error}>
        <FieldLabel>{label}</FieldLabel>
        <Controller
          control={control}
          name={key}
          render={({ field }) => {
            const selected = Array.isArray(field.value) ? field.value : [];
            const toggle = (option: string, checked: boolean) => {
              field.onChange(checked ? [...selected, option] : selected.filter((v) => v !== option));
            };
            return (
              <div className="flex flex-col gap-2">
                {options.map((option) => {
                  const id = `${key}-${option}`;
                  return (
                    <label key={option} htmlFor={id} className="flex w-fit items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        id={id}
                        checked={selected.includes(option)}
                        onCheckedChange={(checked) => toggle(option, checked === true)}
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            );
          }}
        />
        <FieldError errors={[error]} />
      </Field>
    );
  }

  if (question.type === "checkbox") {
    return (
      <Field data-invalid={!!error}>
        <Controller
          control={control}
          name={key}
          render={({ field }) => (
            <label htmlFor={key} className="flex w-fit items-center gap-2 text-sm text-foreground">
              <Checkbox
                id={key}
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              {label}
            </label>
          )}
        />
        <FieldError errors={[error]} />
      </Field>
    );
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input id={key} aria-invalid={!!error} {...register(key)} />
      <FieldError errors={[error]} />
    </Field>
  );
}

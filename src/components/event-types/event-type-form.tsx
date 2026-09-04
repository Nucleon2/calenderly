"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "@/components/event-types/color-picker";
import { LocationFields } from "@/components/event-types/location-fields";
import { QuestionEditor } from "@/components/event-types/question-editor";
import { slugify } from "@/lib/slug";
import {
  eventTypeInputSchema,
  type EventTypeFormFields,
  type EventTypeInputData,
} from "@/server/event-types/schema";
import { createEventTypeAction, updateEventTypeAction } from "@/app/dashboard/event-types/actions";

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

const DURATION_OPTIONS: { value: string; label: string }[] = [
  ...DURATION_PRESETS.map((preset) => ({ value: String(preset), label: `${preset} minutes` })),
  { value: "custom", label: "Custom" },
];

const NOTICE_UNIT_OPTIONS: { value: "minutes" | "hours" | "days"; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

const LOCATION_TYPE_OPTIONS: { value: EventTypeInputData["locationType"]; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "phone", label: "Phone call" },
  { value: "in_person", label: "In person" },
  { value: "custom", label: "Custom" },
];

const REMINDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "180", label: "3 hours before" },
  { value: "1440", label: "1 day before" },
  { value: "2880", label: "2 days before" },
  { value: "10080", label: "1 week before" },
];

export type SchedulePickerOption = { id: string; name: string; isDefault: boolean };

type EventTypeFormProps = {
  mode: "create" | "edit";
  eventTypeId?: string;
  defaultValues: EventTypeInputData;
  schedules: SchedulePickerOption[];
  urlPrefix: string;
};

export function EventTypeForm({ mode, eventTypeId, defaultValues, schedules, urlPrefix }: EventTypeFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventTypeFormFields, unknown, EventTypeInputData>({
    resolver: zodResolver(eventTypeInputSchema),
    defaultValues,
  });

  const title = useWatch({ control, name: "title" }) ?? "";
  const slug = useWatch({ control, name: "slug" });
  const locationType = useWatch({ control, name: "locationType" });
  const dateRangeType = useWatch({ control, name: "dateRangeType" });

  const slugPreview = slug || slugify(title || "") || "your-event";

  const scheduleItems = useMemo(
    () => [
      { value: "none", label: "Use my default schedule" },
      ...schedules.map((s) => ({ value: s.id, label: `${s.name}${s.isDefault ? " (default)" : ""}` })),
    ],
    [schedules]
  );

  const onSubmit = async (values: EventTypeInputData) => {
    setFormError(null);
    const normalized: EventTypeInputData = {
      ...values,
      questions: values.questions.map((q, index) => ({ ...q, position: index })),
    };

    const result =
      mode === "create"
        ? await createEventTypeAction(normalized)
        : await updateEventTypeAction(eventTypeId!, normalized);

    if (!result.ok) {
      if (result.field && result.field in values) {
        setError(result.field as keyof EventTypeFormFields, { message: result.error });
      } else {
        setFormError(result.error);
      }
      return;
    }

    toast.success(mode === "create" ? "Event type created" : "Event type saved");
    router.push("/dashboard/event-types");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6">
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Basics</FieldLegend>
              <Field data-invalid={!!errors.title}>
                <FieldLabel htmlFor="title">Event name</FieldLabel>
                <Input id="title" placeholder="Intro Call" aria-invalid={!!errors.title} {...register("title")} />
                <FieldError errors={[errors.title]} />
              </Field>

              <Field data-invalid={!!errors.slug}>
                <FieldLabel htmlFor="slug">URL</FieldLabel>
                <Input
                  id="slug"
                  placeholder={slugify(title || "") || "intro-call"}
                  aria-invalid={!!errors.slug}
                  {...register("slug")}
                />
                <FieldDescription>
                  {urlPrefix}
                  {slugPreview}
                </FieldDescription>
                <FieldError errors={[errors.slug]} />
              </Field>

              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="What's this event about?"
                  aria-invalid={!!errors.description}
                  {...register("description")}
                />
                <FieldError errors={[errors.description]} />
              </Field>

              <Field data-invalid={!!errors.durationMinutes}>
                <FieldLabel htmlFor="duration-select">Duration</FieldLabel>
                <DurationField control={control} />
                <FieldError errors={[errors.durationMinutes]} />
              </Field>

              <Field data-invalid={!!errors.color}>
                <FieldLabel htmlFor="color">Color</FieldLabel>
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <ColorPicker id="color" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                  )}
                />
                <FieldError errors={[errors.color]} />
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Location</FieldLegend>
              <Controller
                control={control}
                name="locationType"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                  >
                    {LOCATION_TYPE_OPTIONS.map((option) => (
                      <FieldLabel key={option.value} htmlFor={`location-${option.value}`}>
                        <Field orientation="horizontal">
                          <RadioGroupItem value={option.value} id={`location-${option.value}`} />
                          {option.label}
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                )}
              />
              <LocationFields locationType={locationType} register={register} errors={errors.locationDetails} />
            </FieldSet>

            <FieldSet>
              <FieldLegend>Availability</FieldLegend>
              <Field>
                <FieldLabel htmlFor="scheduleId">Availability schedule</FieldLabel>
                <Controller
                  control={control}
                  name="scheduleId"
                  render={({ field }) => (
                    <Select
                      items={scheduleItems}
                      value={field.value ?? "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                    >
                      <SelectTrigger id="scheduleId" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {scheduleItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="dateRangeType">Date range</FieldLabel>
                <Controller
                  control={control}
                  name="dateRangeType"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                      <FieldLabel htmlFor="range-rolling">
                        <Field orientation="horizontal">
                          <RadioGroupItem value="rolling" id="range-rolling" />
                          Rolling window of days
                        </Field>
                      </FieldLabel>
                      <FieldLabel htmlFor="range-fixed">
                        <Field orientation="horizontal">
                          <RadioGroupItem value="fixed" id="range-fixed" />
                          Fixed date range
                        </Field>
                      </FieldLabel>
                      <FieldLabel htmlFor="range-indefinite">
                        <Field orientation="horizontal">
                          <RadioGroupItem value="indefinite" id="range-indefinite" />
                          Indefinitely into the future
                        </Field>
                      </FieldLabel>
                    </RadioGroup>
                  )}
                />

                {dateRangeType === "rolling" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      id="dateRangeDays"
                      type="number"
                      min={1}
                      max={365}
                      className="w-24"
                      aria-invalid={!!errors.dateRangeDays}
                      {...register("dateRangeDays", { valueAsNumber: true })}
                    />
                    <span className="text-sm text-muted-foreground">days into the future</span>
                  </div>
                )}
                {dateRangeType === "fixed" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Controller
                      control={control}
                      name="dateRangeFrom"
                      render={({ field }) => (
                        <Input
                          type="date"
                          className="w-40"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          aria-invalid={!!errors.dateRangeFrom}
                        />
                      )}
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Controller
                      control={control}
                      name="dateRangeTo"
                      render={({ field }) => (
                        <Input
                          type="date"
                          className="w-40"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          aria-invalid={!!errors.dateRangeTo}
                        />
                      )}
                    />
                  </div>
                )}
                <FieldError errors={[errors.dateRangeDays, errors.dateRangeFrom, errors.dateRangeTo]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="minNotice-amount">Minimum notice</FieldLabel>
                <MinNoticeField control={control} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.bufferBeforeMinutes}>
                  <FieldLabel htmlFor="bufferBeforeMinutes">Buffer before</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bufferBeforeMinutes"
                      type="number"
                      min={0}
                      max={240}
                      step={5}
                      className="w-24"
                      aria-invalid={!!errors.bufferBeforeMinutes}
                      {...register("bufferBeforeMinutes", { valueAsNumber: true })}
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                  <FieldError errors={[errors.bufferBeforeMinutes]} />
                </Field>
                <Field data-invalid={!!errors.bufferAfterMinutes}>
                  <FieldLabel htmlFor="bufferAfterMinutes">Buffer after</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bufferAfterMinutes"
                      type="number"
                      min={0}
                      max={240}
                      step={5}
                      className="w-24"
                      aria-invalid={!!errors.bufferAfterMinutes}
                      {...register("bufferAfterMinutes", { valueAsNumber: true })}
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                  <FieldError errors={[errors.bufferAfterMinutes]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.slotIntervalMinutes}>
                  <FieldLabel htmlFor="slotIntervalMinutes">Time-slot interval</FieldLabel>
                  <Controller
                    control={control}
                    name="slotIntervalMinutes"
                    render={({ field }) => (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex w-fit items-center gap-2 text-sm">
                          <Switch
                            size="sm"
                            checked={field.value != null}
                            onCheckedChange={(checked) => field.onChange(checked ? field.value ?? 30 : null)}
                          />
                          Use a custom interval
                        </label>
                        {field.value != null && (
                          <div className="flex items-center gap-2">
                            <Input
                              id="slotIntervalMinutes"
                              type="number"
                              min={5}
                              max={240}
                              step={5}
                              className="w-24"
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                            <span className="text-sm text-muted-foreground">minutes</span>
                          </div>
                        )}
                      </div>
                    )}
                  />
                  <FieldDescription>Defaults to the event&apos;s duration.</FieldDescription>
                  <FieldError errors={[errors.slotIntervalMinutes]} />
                </Field>

                <Field data-invalid={!!errors.maxBookingsPerDay}>
                  <FieldLabel htmlFor="maxBookingsPerDay">Max bookings per day</FieldLabel>
                  <Controller
                    control={control}
                    name="maxBookingsPerDay"
                    render={({ field }) => (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex w-fit items-center gap-2 text-sm">
                          <Switch
                            size="sm"
                            checked={field.value != null}
                            onCheckedChange={(checked) => field.onChange(checked ? field.value ?? 1 : null)}
                          />
                          Limit bookings per day
                        </label>
                        {field.value != null && (
                          <Input
                            id="maxBookingsPerDay"
                            type="number"
                            min={1}
                            max={100}
                            className="w-24"
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        )}
                      </div>
                    )}
                  />
                  <FieldError errors={[errors.maxBookingsPerDay]} />
                </Field>
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Questions</FieldLegend>
              <QuestionEditor control={control} register={register} errors={errors.questions} />
            </FieldSet>

            <FieldSet>
              <FieldLegend>Advanced</FieldLegend>
              <Controller
                control={control}
                name="isSecret"
                render={({ field }) => (
                  <FieldLabel htmlFor="isSecret">
                    <Field orientation="horizontal">
                      <Switch id="isSecret" checked={field.value} onCheckedChange={field.onChange} />
                      <div className="flex flex-col">
                        <span>Secret</span>
                        <span className="text-sm font-normal text-muted-foreground">
                          Hide this event type from your public profile page. Still bookable by direct link.
                        </span>
                      </div>
                    </Field>
                  </FieldLabel>
                )}
              />

              <Controller
                control={control}
                name="requiresConfirmation"
                render={({ field }) => (
                  <FieldLabel htmlFor="requiresConfirmation" aria-disabled="true">
                    <Field orientation="horizontal">
                      <Switch id="requiresConfirmation" checked={field.value} onCheckedChange={field.onChange} disabled />
                      <div className="flex flex-col">
                        <span>Requires confirmation</span>
                        <span className="text-sm font-normal text-muted-foreground">Coming soon.</span>
                      </div>
                    </Field>
                  </FieldLabel>
                )}
              />

              <Field>
                <FieldLabel>Reminder emails</FieldLabel>
                <ReminderFields control={control} />
                <FieldDescription>Sent to the invitee before the event.</FieldDescription>
              </Field>
            </FieldSet>

            {formError && (
              <p role="alert" className="text-sm font-normal text-destructive">
                {formError}
              </p>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-background px-1 py-4">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/event-types")}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : mode === "create" ? "Create event type" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function DurationField({ control }: { control: Control<EventTypeFormFields> }) {
  return (
    <Controller
      control={control}
      name="durationMinutes"
      render={({ field }) => {
        const isPreset = DURATION_PRESETS.includes(field.value);
        return (
          <div className="flex items-center gap-2">
            <Select
              items={DURATION_OPTIONS}
              value={isPreset ? String(field.value) : "custom"}
              onValueChange={(v) => {
                if (v !== "custom") field.onChange(Number(v));
              }}
            >
              <SelectTrigger id="duration-select" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isPreset && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  className="w-24"
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function guessNoticeUnit(minutes: number): "minutes" | "hours" | "days" {
  if (minutes !== 0 && minutes % 1440 === 0) return "days";
  if (minutes !== 0 && minutes % 60 === 0) return "hours";
  return "minutes";
}

function minutesToFriendly(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function MinNoticeField({ control }: { control: Control<EventTypeFormFields> }) {
  return (
    <Controller
      control={control}
      name="minNoticeMinutes"
      render={({ field }) => {
        const unit = guessNoticeUnit(field.value);
        const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
        const amount = Math.round(field.value / multiplier);

        return (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Input
                id="minNotice-amount"
                type="number"
                min={0}
                className="w-24"
                value={amount}
                onChange={(e) => field.onChange(Math.max(0, Number(e.target.value)) * multiplier)}
              />
              <Select
                items={NOTICE_UNIT_OPTIONS}
                value={unit}
                onValueChange={(next) => {
                  const nextMultiplier = next === "days" ? 1440 : next === "hours" ? 60 : 1;
                  field.onChange(amount * nextMultiplier);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_UNIT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              {field.value === 0
                ? "Invitees can book with no minimum notice."
                : `Invitees can't book less than ${minutesToFriendly(field.value)} before the event.`}
            </p>
          </div>
        );
      }}
    />
  );
}

function ReminderFields({ control }: { control: Control<EventTypeFormFields> }) {
  return (
    <Controller
      control={control}
      name="reminderOffsetsMinutes"
      render={({ field }) => {
        const current = field.value ?? [];
        const first = current[0] ?? null;
        const second = current[1] ?? null;

        const update = (slot: 0 | 1, raw: string | null) => {
          const value = raw && raw !== "none" ? Number(raw) : null;
          const slots: (number | null)[] = [first, second];
          slots[slot] = value;
          field.onChange(slots.filter((v): v is number => v != null));
        };

        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Select items={REMINDER_OPTIONS} value={first != null ? String(first) : "none"} onValueChange={(v) => update(0, v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select items={REMINDER_OPTIONS} value={second != null ? String(second) : "none"} onValueChange={(v) => update(1, v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      }}
    />
  );
}

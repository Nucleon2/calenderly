"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { DateOverrides } from "@/components/availability/date-overrides";
import { ScheduleHeader } from "@/components/availability/schedule-header";
import { TimezonePicker } from "@/components/availability/timezone-picker";
import { WeeklyHours } from "@/components/availability/weekly-hours";
import { scheduleInputSchema, type AvailabilityScheduleInput } from "@/server/availability/schema";
import type { ScheduleDetail } from "@/server/availability/service";
import { updateScheduleAction } from "@/app/dashboard/availability/actions";

interface ScheduleEditorProps {
  schedule: ScheduleDetail;
  /** 0 = Sunday, 1 = Monday, 6 = Saturday. Determines weekly-hours row order only. */
  weekStart?: 0 | 1 | 6;
}

function toFormValues(schedule: ScheduleDetail): AvailabilityScheduleInput {
  return {
    name: schedule.name,
    timezone: schedule.timezone,
    rules: schedule.rules.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
    overrides: schedule.overrides.map(({ date, isUnavailable, intervals }) => ({
      date,
      intervals: isUnavailable ? null : intervals.map(({ startMinute, endMinute }) => ({ startMinute, endMinute })),
    })),
  };
}

export function ScheduleEditor({ schedule, weekStart = 0 }: ScheduleEditorProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AvailabilityScheduleInput>({
    resolver: zodResolver(scheduleInputSchema),
    defaultValues: toFormValues(schedule),
  });

  const name = useWatch({ control, name: "name" });
  const timezone = useWatch({ control, name: "timezone" });
  const rules = useWatch({ control, name: "rules" });
  const overrides = useWatch({ control, name: "overrides" });

  const onSubmit = async (values: AvailabilityScheduleInput) => {
    setFormError(null);
    const result = await updateScheduleAction(schedule.id, values);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success("Schedule saved");
    reset(values);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <ScheduleHeader
        scheduleId={schedule.id}
        name={name}
        onNameChange={(next) => setValue("name", next, { shouldDirty: true, shouldValidate: true })}
        nameError={errors.name?.message}
        isDefault={schedule.isDefault}
      />

      <FieldGroup>
        <Field data-invalid={!!errors.timezone} className="max-w-sm">
          <FieldLabel htmlFor="schedule-timezone">Time zone</FieldLabel>
          <TimezonePicker
            id="schedule-timezone"
            value={timezone}
            onValueChange={(next) => setValue("timezone", next, { shouldDirty: true, shouldValidate: true })}
            aria-invalid={!!errors.timezone}
          />
          <FieldError errors={[errors.timezone]} />
        </Field>
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">Weekly hours</FieldLegend>
        <WeeklyHours
          rules={rules}
          onChange={(next) => setValue("rules", next, { shouldDirty: true, shouldValidate: true })}
          weekStart={weekStart}
          errorFor={(index) => errors.rules?.[index]?.startMinute?.message ?? errors.rules?.[index]?.endMinute?.message}
        />
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Date overrides</FieldLegend>
        <DateOverrides
          overrides={overrides}
          onChange={(next) => setValue("overrides", next, { shouldDirty: true, shouldValidate: true })}
          timezone={timezone}
          errorFor={(index) =>
            errors.overrides?.[index]?.date?.message ?? errors.overrides?.[index]?.intervals?.message
          }
        />
      </FieldSet>

      {formError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          {formError}
        </p>
      )}

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
        {isDirty && <span className="text-sm text-muted-foreground">You have unsaved changes</span>}
      </div>
    </form>
  );
}

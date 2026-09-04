"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EventTypeFormFields } from "@/server/event-types/schema";

type LocationFieldsProps = {
  locationType: EventTypeFormFields["locationType"];
  register: UseFormRegister<EventTypeFormFields>;
  errors?: FieldErrors<EventTypeFormFields>["locationDetails"];
};

/** Conditional inputs shown below the location type radio, one per location type. */
export function LocationFields({ locationType, register, errors }: LocationFieldsProps) {
  if (locationType === "google_meet") {
    return (
      <p className="text-sm text-muted-foreground">
        A Google Meet link is generated automatically for each booking.
      </p>
    );
  }

  if (locationType === "phone") {
    return (
      <Field data-invalid={!!errors?.phone}>
        <FieldLabel htmlFor="locationDetails-phone">Phone number</FieldLabel>
        <Input
          id="locationDetails-phone"
          type="tel"
          placeholder="+1 555 0100"
          aria-invalid={!!errors?.phone}
          {...register("locationDetails.phone")}
        />
        <FieldError errors={[errors?.phone]} />
      </Field>
    );
  }

  if (locationType === "in_person") {
    return (
      <Field data-invalid={!!errors?.address}>
        <FieldLabel htmlFor="locationDetails-address">Address</FieldLabel>
        <Input
          id="locationDetails-address"
          placeholder="123 Main St, Springfield"
          aria-invalid={!!errors?.address}
          {...register("locationDetails.address")}
        />
        <FieldError errors={[errors?.address]} />
      </Field>
    );
  }

  return (
    <Field data-invalid={!!errors?.text}>
      <FieldLabel htmlFor="locationDetails-text">Location details</FieldLabel>
      <Input
        id="locationDetails-text"
        placeholder="e.g. a Zoom link or instructions"
        aria-invalid={!!errors?.text}
        {...register("locationDetails.text")}
      />
      <FieldDescription>Shown to invitees once they book.</FieldDescription>
      <FieldError errors={[errors?.text]} />
    </Field>
  );
}

"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { getTimezoneOptions, type TimezoneOption } from "@/lib/timezones";

interface TimezoneSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

/** Searchable IANA time zone picker, labelled with each zone's current UTC offset. */
export function TimezoneSelect({
  id,
  value,
  onValueChange,
  disabled,
  "aria-invalid": ariaInvalid,
}: TimezoneSelectProps) {
  const options = useMemo(() => getTimezoneOptions(), []);
  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange(next ? next.value : "")}
      isItemEqualToValue={(a, b) => a.value === b.value}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder="Search time zone…"
        aria-invalid={ariaInvalid}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>No time zone found.</ComboboxEmpty>
        <ComboboxList>
          {(item: TimezoneOption) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

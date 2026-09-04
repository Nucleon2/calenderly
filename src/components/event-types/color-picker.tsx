"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SWATCHES = ["#0069ff", "#7c3aed", "#e11d48", "#f59e0b", "#16a34a", "#0891b2", "#525252", "#1e293b"];

type ColorPickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
};

export function ColorPicker({ id, value, onChange, onBlur, ...props }: ColorPickerProps) {
  const normalized = value?.toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {SWATCHES.map((swatch) => {
        const selected = normalized === swatch;
        return (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            aria-label={`Use color ${swatch}`}
            aria-pressed={selected}
            className={cn(
              "size-7 shrink-0 rounded-full ring-1 ring-foreground/10 transition-transform outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "scale-110 ring-2 ring-offset-2 ring-offset-background ring-foreground",
            )}
            style={{ backgroundColor: swatch }}
          />
        );
      })}
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-7 shrink-0 rounded-full ring-1 ring-foreground/10"
          style={{ backgroundColor: /^#[0-9a-fA-F]{3,6}$/.test(value) ? value : "transparent" }}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="#0069ff"
          className="w-28"
          {...props}
        />
      </div>
    </div>
  );
}

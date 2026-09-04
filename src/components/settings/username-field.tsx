"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { checkUsernameAction } from "@/app/(auth)/onboarding/actions";

interface UsernameFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** e.g. "scheduler.app/" — shown before the input as the resulting public URL. */
  urlPrefix: string;
  /** The user's current username, if any. Availability checks are skipped while unchanged. */
  initialUsername?: string;
  "aria-invalid"?: boolean;
}

type CheckState = "idle" | "checking" | "available" | "unavailable";

interface CheckResult {
  forValue: string;
  available: boolean;
  error?: string;
}

const DEBOUNCE_MS = 400;

/** Username input with a live, debounced server-side availability check. */
export function UsernameField({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  urlPrefix,
  initialUsername,
  "aria-invalid": ariaInvalid,
}: UsernameFieldProps) {
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const requestIdRef = useRef(0);

  const normalized = value.trim().toLowerCase();
  const isUnchanged = initialUsername
    ? normalized === initialUsername.trim().toLowerCase()
    : false;
  const isCheckable = normalized.length >= 3 && !isUnchanged;

  useEffect(() => {
    if (!isCheckable) {
      return;
    }
    const requestId = ++requestIdRef.current;
    const timeout = setTimeout(() => {
      void checkUsernameAction(normalized).then((result) => {
        if (requestId !== requestIdRef.current) return; // superseded by a newer check
        setCheckResult({ forValue: normalized, available: result.available, error: result.error });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [normalized, isCheckable]);

  const state: CheckState = !isCheckable
    ? "idle"
    : checkResult?.forValue === normalized
      ? checkResult.available
        ? "available"
        : "unavailable"
      : "checking";

  const message =
    state === "unavailable" ? (checkResult?.error ?? "That username is already taken.") : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-sm text-muted-foreground">{urlPrefix}</span>
        <div className="relative min-w-0 flex-1">
          <Input
            id={id}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            onBlur={onBlur}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={ariaInvalid}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            {state === "checking" && (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            )}
            {state === "available" && <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />}
            {state === "unavailable" && <XIcon className="size-4 text-destructive" />}
          </span>
        </div>
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      {state === "available" && <p className="text-sm text-emerald-600 dark:text-emerald-400">Available</p>}
    </div>
  );
}

"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EventTypeFormFields, EventTypeQuestionInput } from "@/server/event-types/schema";

const MAX_QUESTIONS = 10;

const QUESTION_TYPE_OPTIONS: { value: EventTypeQuestionInput["type"]; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown (single choice)" },
  { value: "multiselect", label: "Dropdown (multiple choice)" },
  { value: "phone", label: "Phone number" },
  { value: "checkbox", label: "Checkbox" },
];

const OPTION_TYPES = new Set<EventTypeQuestionInput["type"]>(["select", "multiselect"]);

type QuestionEditorProps = {
  control: Control<EventTypeFormFields>;
  register: UseFormRegister<EventTypeFormFields>;
  errors?: FieldErrors<EventTypeFormFields>["questions"];
};

export function QuestionEditor({ control, register, errors }: QuestionEditorProps) {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "questions",
    keyName: "fieldKey",
  });

  const addQuestion = () => {
    append({ type: "text", label: "", required: false, options: undefined, position: fields.length });
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No custom questions yet. Invitees are always asked for their name and email.
        </p>
      )}
      {fields.map((field, index) => (
        <QuestionRow
          key={field.fieldKey}
          index={index}
          total={fields.length}
          control={control}
          register={register}
          error={errors?.[index]}
          onRemove={() => remove(index)}
          onMoveUp={() => move(index, index - 1)}
          onMoveDown={() => move(index, index + 1)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addQuestion}
        disabled={fields.length >= MAX_QUESTIONS}
        className="self-start"
      >
        <Plus /> Add question
      </Button>
    </div>
  );
}

type QuestionRowError = NonNullable<FieldErrors<EventTypeFormFields>["questions"]>[number];

function QuestionRow({
  index,
  total,
  control,
  register,
  error,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  total: number;
  control: Control<EventTypeFormFields>;
  register: UseFormRegister<EventTypeFormFields>;
  error?: QuestionRowError;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const type = useWatch({ control, name: `questions.${index}.type` });
  const hasOptions = OPTION_TYPES.has(type ?? "text");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move question up"
            className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-30"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move question down"
            className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-30"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Field data-invalid={!!error?.label}>
            <FieldLabel htmlFor={`question-${index}-label`}>Question</FieldLabel>
            <Input
              id={`question-${index}-label`}
              placeholder="e.g. What would you like to discuss?"
              aria-invalid={!!error?.label}
              {...register(`questions.${index}.label`)}
            />
            <FieldError errors={[error?.label]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`question-${index}-type`}>Answer type</FieldLabel>
            <Controller
              control={control}
              name={`questions.${index}.type`}
              render={({ field }) => (
                <Select items={QUESTION_TYPE_OPTIONS} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={`question-${index}-type`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove question"
          className="mt-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {hasOptions && (
        <Field data-invalid={!!error?.options}>
          <FieldLabel htmlFor={`question-${index}-options`}>Options (one per line)</FieldLabel>
          <Controller
            control={control}
            name={`questions.${index}.options`}
            render={({ field }) => (
              <Textarea
                id={`question-${index}-options`}
                rows={3}
                placeholder={"Search\nFriend\nOther"}
                aria-invalid={!!error?.options}
                value={(field.value ?? []).join("\n")}
                onChange={(e) => {
                  const options = e.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
                  field.onChange(options.length > 0 ? options : undefined);
                }}
                onBlur={field.onBlur}
              />
            )}
          />
          <FieldError errors={[error?.options]} />
        </Field>
      )}

      <Controller
        control={control}
        name={`questions.${index}.required`}
        render={({ field }) => (
          <label className="flex w-fit items-center gap-2 text-sm text-foreground">
            <Switch size="sm" checked={field.value} onCheckedChange={field.onChange} />
            Required
          </label>
        )}
      />
    </div>
  );
}

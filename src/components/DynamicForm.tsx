import { Controller, useForm, type FieldErrors } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { evaluateVisibility, type FormValues } from "@/lib/form-evaluator";
import type { FieldConfig, TemplateConfig } from "@/types";

type Props = {
  config: TemplateConfig;
  onSubmit: (values: FormValues) => void;
  disabled?: boolean;
};

const requiredMsg = "Обязательное поле";

export function DynamicForm({ config, onSubmit, disabled }: Props) {
  // shouldUnregister: невидимые поля автоматически выкидываются из state и
  // не валидируются. По сабмиту через handleSubmit придут только видимые.
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ shouldUnregister: true, mode: "onSubmit" });

  const values = watch();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {config.fields.map((f) => {
        if (f.type === "dictionary") return null; // этап 5
        if (!evaluateVisibility(f.visible_if, values)) return null;

        const err = errors[f.name]?.message as string | undefined;

        return (
          <div key={f.name} className="space-y-2">
            <Label htmlFor={f.name}>
              {f.label}
              {f.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {renderField(f, register, control)}
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        );
      })}

      <Button type="submit" disabled={disabled}>
        {disabled ? "Формируем…" : "Сформировать документ"}
      </Button>
    </form>
  );
}

function renderField(
  f: FieldConfig,
  register: ReturnType<typeof useForm<FormValues>>["register"],
  control: ReturnType<typeof useForm<FormValues>>["control"],
) {
  const rules = { required: f.required ? requiredMsg : false };

  switch (f.type) {
    case "text":
      return <Input id={f.name} {...register(f.name, rules)} />;

    case "textarea":
      return <Textarea id={f.name} {...register(f.name, rules)} />;

    case "number":
      return (
        <Input
          id={f.name}
          type="number"
          {...register(f.name, {
            ...rules,
            valueAsNumber: true,
            validate: (v) =>
              v === undefined || v === null || v === "" || !Number.isNaN(v) || "Введите число",
          })}
        />
      );

    case "date":
      return <Input id={f.name} type="date" {...register(f.name, rules)} />;

    case "radio":
      return (
        <Controller
          control={control}
          name={f.name}
          rules={rules}
          render={({ field: { value, onChange } }) => (
            <RadioGroup value={(value as string) ?? ""} onValueChange={onChange}>
              {(f.options ?? []).map((opt) => (
                <div key={opt} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt} id={`${f.name}-${opt}`} />
                  <Label htmlFor={`${f.name}-${opt}`} className="font-normal">
                    {opt}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
      );

    case "dropdown":
      return (
        <Controller
          control={control}
          name={f.name}
          rules={rules}
          render={({ field: { value, onChange } }) => (
            <Select value={(value as string) ?? ""} onValueChange={onChange}>
              <SelectTrigger id={f.name}>
                <SelectValue placeholder="Выберите…" />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );

    default:
      return null;
  }
}

export type { FormValues, FieldErrors };

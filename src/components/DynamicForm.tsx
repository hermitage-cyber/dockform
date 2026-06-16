import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, type FieldErrors } from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { CalculatorField } from "@/components/CalculatorField";
import { DecimalInput } from "@/components/DecimalInput";
import { DictionaryField } from "@/components/DictionaryField";
import { NumberAmountWords } from "@/components/NumberAmountWords";
import { evaluateVisibility, type FormValues } from "@/lib/form-evaluator";
import {
  deleteDraft as deleteDraftApi,
  listDictionaries,
  loadDraft,
  saveDraft,
  type DraftPayload,
} from "@/lib/tauri";
import type { Dictionaries, FieldConfig, TemplateConfig } from "@/types";

type Props = {
  config: TemplateConfig;
  onSubmit: (values: FormValues) => void;
  disabled?: boolean;
  /// Если задан — включается автосохранение черновика и баннер восстановления.
  draftKey?: string;
  /// Подпись кнопки отправки (по умолчанию «Сформировать документ»).
  submitLabel?: string;
};

const requiredMsg = "Обязательное поле";
const DEBOUNCE_MS = 500;

export function DynamicForm({ config, onSubmit, disabled, draftKey, submitLabel }: Props) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ shouldUnregister: true, mode: "onSubmit" });

  const values = watch();

  const [dictionaries, setDictionaries] = useState<Dictionaries>({});
  useEffect(() => {
    listDictionaries().then(setDictionaries).catch(() => setDictionaries({}));
  }, []);

  const fillField = (name: string, value: string) => {
    setValue(name, value, { shouldDirty: true, shouldValidate: false });
  };

  // ─── Черновик ───────────────────────────────────────────────────────────
  // Состояния:
  //   draftFound  — payload, найденный на старте, ждём решения пользователя.
  //   staleFields — список полей черновика, которых нет в текущем шаблоне
  //                 (например, шаблон обновился). Показываем после «Восстановить».
  const [draftFound, setDraftFound] = useState<DraftPayload | null>(null);
  const [staleFields, setStaleFields] = useState<string[] | null>(null);
  const decisionMadeRef = useRef(false);

  const knownFieldNames = useMemo(
    () => new Set(config.fields.map((f) => f.name)),
    [config.fields],
  );

  // Загружаем черновик при первом маунте/смене ключа.
  useEffect(() => {
    if (!draftKey) return;
    let cancelled = false;
    decisionMadeRef.current = false;
    loadDraft(draftKey)
      .then((payload) => {
        if (cancelled) return;
        if (payload && hasAnyValue(payload.values)) {
          setDraftFound(payload);
        } else {
          // Пустой/отсутствующий черновик — сразу разрешаем автосохранение.
          decisionMadeRef.current = true;
        }
      })
      .catch(() => {
        decisionMadeRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  // Дебаунс автосохранения через watch(cb) — он триггерится только на реальном
  // изменении поля, а не на каждом ререндере. Не пишем, пока пользователь не
  // решил судьбу найденного черновика, иначе перетрём диск пустыми значениями.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftKey) return;
    const sub = watch((data) => {
      if (!decisionMadeRef.current) return;
      if (!hasAnyValue(data as FormValues)) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDraft(draftKey, {
          saved_at: new Date().toISOString(),
          values: data as FormValues,
        }).catch((e) => {
          // Не блокируем работу формы из-за фоновой записи.
          console.error("[draft] save failed:", e);
        });
      }, DEBOUNCE_MS);
    });
    return () => {
      sub.unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftKey, watch]);

  const handleRestore = () => {
    if (!draftFound) return;
    const incoming = draftFound.values;
    const stale = Object.keys(incoming).filter((k) => !knownFieldNames.has(k));
    // Заливаем только поля, которые есть в текущем шаблоне.
    const filtered: FormValues = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (knownFieldNames.has(k)) filtered[k] = v;
    }
    reset(filtered);
    setDraftFound(null);
    setStaleFields(stale.length > 0 ? stale : null);
    decisionMadeRef.current = true;
  };

  const handleDiscard = () => {
    if (draftKey) deleteDraftApi(draftKey).catch(() => undefined);
    setDraftFound(null);
    setStaleFields(null);
    decisionMadeRef.current = true;
  };

  return (
    <>
      {draftFound && (
        <Alert className="mb-4">
          <AlertTitle>Найден незавершённый черновик</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>Сохранён {formatDateTime(draftFound.saved_at)}.</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleRestore}>
                Восстановить
              </Button>
              <Button size="sm" variant="outline" onClick={handleDiscard}>
                Начать заново
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {staleFields && staleFields.length > 0 && (
        <Alert className="mb-4">
          <AlertTitle>Шаблон обновился</AlertTitle>
          <AlertDescription>
            Часть полей из черновика не подставится: {staleFields.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {config.fields.map((f) => {
          if (!evaluateVisibility(f.visible_if, values)) return null;

          if (f.type === "calculator") {
            return (
              <div key={f.name} className="space-y-2">
                <CalculatorField field={f} control={control} setValue={setValue} />
                {f.help_text && (
                  <p className="text-sm text-muted-foreground">{f.help_text}</p>
                )}
              </div>
            );
          }

          const err = errors[f.name]?.message as string | undefined;

          return (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={f.name}>
                {f.label}
                {f.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {renderField(f, register, control, dictionaries, fillField)}
              {f.type === "number" && f.text_output && (
                <NumberAmountWords
                  sourceName={f.name}
                  targetName={f.text_output}
                  control={control}
                  setValue={setValue}
                />
              )}
              {f.help_text && <p className="text-sm text-muted-foreground">{f.help_text}</p>}
              {err && <p className="text-sm text-destructive">{err}</p>}
            </div>
          );
        })}

        <Button type="submit" disabled={disabled || draftFound !== null}>
          {disabled ? "Формируем…" : (submitLabel ?? "Сформировать документ")}
        </Button>
      </form>
    </>
  );
}

function hasAnyValue(values: FormValues): boolean {
  for (const v of Object.values(values)) {
    if (v === undefined || v === null || v === "") continue;
    return true;
  }
  return false;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderField(
  f: FieldConfig,
  register: ReturnType<typeof useForm<FormValues>>["register"],
  control: ReturnType<typeof useForm<FormValues>>["control"],
  dictionaries: Dictionaries,
  fillField: (name: string, value: string) => void,
) {
  const rules = { required: f.required ? requiredMsg : false };

  switch (f.type) {
    case "text":
      return <Input id={f.name} placeholder={f.placeholder} {...register(f.name, rules)} />;

    case "textarea":
      return <Textarea id={f.name} placeholder={f.placeholder} {...register(f.name, rules)} />;

    case "number":
      return (
        <DecimalInput
          name={f.name}
          control={control}
          placeholder={f.placeholder}
          rules={rules}
        />
      );

    case "date":
      return <Input id={f.name} type="date" placeholder={f.placeholder} {...register(f.name, rules)} />;

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

    case "dictionary": {
      const records = f.source ? dictionaries[f.source] ?? [] : [];
      return (
        <Controller
          control={control}
          name={f.name}
          rules={rules}
          render={({ field: { value, onChange } }) => (
            <DictionaryField
              fieldConfig={f}
              records={records}
              value={(value as string) ?? ""}
              onChange={onChange}
              onFill={fillField}
            />
          )}
        />
      );
    }

    default:
      return null;
  }
}

export type { FormValues, FieldErrors };

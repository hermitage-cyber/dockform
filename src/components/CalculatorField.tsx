import { useEffect, useMemo, useState } from "react";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runCalculator, type CalculatorInputs, type CalculatorOutputs } from "@/lib/calculators";
import type { FormValues } from "@/lib/form-evaluator";
import { getHolidays } from "@/lib/holidays";
import type { FieldConfig } from "@/types";

type Props = {
  field: FieldConfig;
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

type State =
  | { phase: "incomplete" }
  | { phase: "ok"; result: CalculatorOutputs }
  | { phase: "error"; message: string }
  | { phase: "misconfigured"; message: string };

const RECALC_DEBOUNCE_MS = 200;

export function CalculatorField({ field, control, setValue }: Props) {
  const misconfigured = !field.calculator || !field.inputs || !field.outputs;

  // useWatch требует фиксированный набор name на маунте; формируем заранее.
  const watchedNames = useMemo(
    () => (field.inputs ? Object.values(field.inputs) : []),
    [field.inputs],
  );
  const inputKeys = useMemo(
    () => (field.inputs ? Object.keys(field.inputs) : []),
    [field.inputs],
  );

  const watched = useWatch({ control, name: watchedNames }) as unknown[];
  // useWatch отдаёт новую ссылку на каждый рендер — стабилизируем по содержимому,
  // чтобы пересчёт не запускался без реальных изменений.
  const watchedKey = JSON.stringify(watched);

  const [state, setState] = useState<State>(() =>
    misconfigured
      ? { phase: "misconfigured", message: "Калькулятор не настроен в YAML." }
      : { phase: "incomplete" },
  );

  // Производственный календарь грузится один раз на сессию (см. lib/holidays.ts).
  // До загрузки калькулятор работает без сдвига — это безопасный фолбэк, который
  // переключится на корректное значение через ререндер, когда holidays придут.
  const [holidays, setHolidays] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    getHolidays().then((h) => {
      if (!cancelled) setHolidays(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (misconfigured) return;
    const timer = setTimeout(() => {
      const raw: CalculatorInputs = {};
      inputKeys.forEach((calcKey, i) => {
        raw[calcKey] = watched[i];
      });

      try {
        const result = runCalculator(field.calculator!, raw, {
          holidays: holidays ?? undefined,
        });
        if (result === null) {
          setState({ phase: "incomplete" });
          // Чистим выходы, чтобы в .docx не уехали значения от прошлых данных,
          // если пользователь вычистил один из входов.
          for (const varName of Object.values(field.outputs!)) {
            setValue(varName, "", { shouldDirty: false, shouldValidate: false });
          }
          return;
        }
        for (const [calcOutputKey, varName] of Object.entries(field.outputs!)) {
          const v = result[calcOutputKey];
          setValue(varName, (v as string | number | undefined) ?? "", {
            shouldDirty: false,
            shouldValidate: false,
          });
        }
        setState({ phase: "ok", result });
      } catch (e) {
        setState({
          phase: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }, RECALC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedKey, misconfigured, holidays]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{field.label}</CardTitle>
      </CardHeader>
      <CardContent>
        {state.phase === "misconfigured" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        {state.phase === "incomplete" && (
          <p className="text-sm text-muted-foreground">Заполните поля выше для расчёта.</p>
        )}
        {state.phase === "error" && (
          <p className="text-sm text-destructive">Ошибка расчёта: {state.message}</p>
        )}
        {state.phase === "ok" && field.outputs && (
          <dl className="space-y-1 text-sm">
            {(field.display_outputs ?? Object.keys(field.outputs)).map((calcKey) => (
              <div key={calcKey} className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{humanize(calcKey)}:</dt>
                <dd className="font-medium">{formatValue(state.result[calcKey])}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function humanize(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("ru-RU");
  return String(v);
}

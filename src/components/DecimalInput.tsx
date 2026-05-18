import { useEffect, useRef, useState } from "react";
import { Controller, type Control } from "react-hook-form";
import { Input } from "@/components/ui/input";
import type { FormValues } from "@/lib/form-evaluator";

/**
 * Текстовый инпут под десятичные числа с поддержкой запятой и дробной части.
 * `type="number"` в HTML отказывается принимать запятую в большинстве локалей
 * (а в WebView2 локаль непредсказуема), поэтому управляем разбором сами.
 *
 * Хранится в форме как number (или "" если пусто/невалидно). Это то, что
 * получают калькуляторы и docxtemplater.
 *
 * Принимаем оба разделителя ("1,5" и "1.5"); по умолчанию выводим обратно
 * с запятой (русский шаблон отображения).
 */
type Props = {
  name: string;
  control: Control<FormValues>;
  placeholder?: string;
  rules?: Parameters<Control<FormValues>["register"]>[1];
};

export function DecimalInput({ name, control, placeholder, rules }: Props) {
  return (
    <Controller
      control={control}
      name={name}
      rules={{
        ...rules,
        validate: (v) => {
          if (v === undefined || v === null || v === "") return true;
          return (
            (typeof v === "number" && Number.isFinite(v)) || "Введите число"
          );
        },
      }}
      render={({ field: { value, onChange, onBlur } }) => (
        <DecimalInputInner
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      )}
    />
  );
}

type InnerProps = {
  name: string;
  value: unknown;
  onChange: (v: number | "") => void;
  onBlur: () => void;
  placeholder?: string;
};

function DecimalInputInner({ name, value, onChange, onBlur, placeholder }: InnerProps) {
  // Локальный raw-текст независим от значения в форме — иначе запятая
  // мгновенно превращалась бы обратно в точку при ререндере.
  const [text, setText] = useState(() => formatDisplay(value));
  // Запоминаем, что было результатом нашего onChange — чтобы отличать «эхо»
  // от формы (когда value пришло из нашего собственного вызова) от настоящих
  // внешних обновлений (черновик, setValue из калькулятора и т.п.).
  const lastEmitted = useRef<number | "" | null>(parseDecimal(text));

  useEffect(() => {
    // Сравнение по значению: если форма вернула нам ровно то же число, что
    // мы только что отдали — не трогаем text. Иначе пересинхронизируемся.
    if (value === lastEmitted.current) return;
    setText(formatDisplay(value));
    lastEmitted.current = value as number | "" | null;
  }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    const parsed = parseDecimal(raw);
    lastEmitted.current = parsed;
    onChange(parsed);
  };

  return (
    <Input
      id={name}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

function formatDisplay(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // По умолчанию показываем с запятой (русская локаль документов).
    return String(value).replace(".", ",");
  }
  return String(value);
}

/// Возвращает число, либо "" если пусто/невалидно. Допускаются пробелы
/// (1 234,56), запятая или точка как десятичный.
function parseDecimal(raw: string): number | "" {
  if (raw === "" || raw == null) return "";
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  // "1." / "1,"  — Number("1.") === 1, принимаем как 1.
  // "-"  — Number("-") === NaN, возвращаем "".
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : "";
}

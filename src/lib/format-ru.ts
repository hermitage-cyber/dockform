// Форматирование чисел и дат под русскую юридическую локаль.
// См. CLAUDE.md, секция «Конвенции» — даты «дд.мм.гггг», суммы «1 234,56».
// Используется и калькуляторами (когда они сами формируют выход для .docx),
// и формой через formatValuesForDocx перед вызовом docxtemplater.

import type { TemplateConfig } from "@/types";

/// Денежная сумма с двумя знаками после запятой: 1234.5 → "1 234,50"
/// (разделитель тысяч — неразрывный пробел U+00A0).
export function formatRubAmount(n: number): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/// Дата из объекта Date в формате дд.мм.гггг (по UTC, чтобы не уезжать
/// по таймзоне).
export function formatRuDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/// ISO-дата (`YYYY-MM-DD`, как её хранит HTML input type=date и react-hook-form)
/// → строка дд.мм.гггг. Невалидный ввод возвращается как есть.
export function isoDateToRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/// Заменяет прямые кавычки `"` на русские ёлочки: нечётное вхождение → `«`,
/// чётное → `»`. Уже стоящие `«`/`»` не трогаются. Юристы пишут `ООО "Альфа"`,
/// а в документе должны быть `ООО «Альфа»` — иначе и типографика страдает,
/// и Windows не сохранит файл с `"` в имени.
export function normalizeQuotes(s: string): string {
  let n = 0;
  return s.replace(/"/g, () => (n++ % 2 === 0 ? "«" : "»"));
}

/// Преобразует значения формы перед подстановкой в .docx согласно
/// конвенции локали:
///   - поля type:date     →  дд.мм.гггг
///
/// Калькуляторы свои выходы форматируют сами (см. format-ru), здесь
/// они не трогаются.
///
/// Условные блоки в .docx: docxtemplater по умолчанию считает истинной любую
/// непустую строку, в том числе «Нет». Конвенция проекта (CLAUDE.md) — «Нет»
/// должно скрывать блок {#поле}. Поэтому ответ «Нет» у radio-поля приводим к
/// пустой строке (falsy), а «Да» и описательные варианты оставляем как есть.
/// Это включает блоки {#поле}…{/поле} / {^поле}…{/поле} для radio Да/Нет.
///
/// Возвращает новый объект, исходный не мутирует.
export function formatValuesForDocx(
  template: TemplateConfig,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const field of template.fields) {
    if (field.type === "date") {
      const v = out[field.name];
      if (typeof v === "string" && v !== "") {
        out[field.name] = isoDateToRu(v);
      }
    } else if (field.type === "radio" && out[field.name] === "Нет") {
      out[field.name] = "";
    } else {
      const v = out[field.name];
      if (typeof v === "string") {
        out[field.name] = normalizeQuotes(v);
      }
    }
  }
  return out;
}

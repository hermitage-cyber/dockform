import { useEffect, useState } from "react";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { amountToWords } from "@/lib/amount-to-words";
import type { FormValues } from "@/lib/form-evaluator";

type Props = {
  /// Имя исходного числового поля формы.
  sourceName: string;
  /// Имя переменной, куда писать пропись (для подстановки в .docx).
  targetName: string;
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

/**
 * Сайдкар к полю type:"number" с атрибутом text_output. Подписывается на
 * исходное значение и автоматически кладёт пропись в форму под именем
 * targetName — оттуда её подхватит docxtemplater при генерации.
 */
export function NumberAmountWords({ sourceName, targetName, control, setValue }: Props) {
  const value = useWatch({ control, name: sourceName });
  const [text, setText] = useState<string>("");

  useEffect(() => {
    const num = typeof value === "number" && Number.isFinite(value) ? value : null;
    if (num === null) {
      setText("");
      setValue(targetName, "", { shouldDirty: false, shouldValidate: false });
      return;
    }
    try {
      const words = amountToWords(num);
      setText(words);
      setValue(targetName, words, { shouldDirty: false, shouldValidate: false });
    } catch {
      setText("");
      setValue(targetName, "", { shouldDirty: false, shouldValidate: false });
    }
  }, [value, targetName, setValue]);

  if (!text) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Прописью: <span className="font-medium text-foreground">{text}</span>
    </p>
  );
}

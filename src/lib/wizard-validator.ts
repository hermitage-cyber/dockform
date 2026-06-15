import { evaluateVisibility } from "@/lib/form-evaluator";
import type { TemplateConfig, WizardConfig } from "@/types";

/**
 * Строгая валидация анкеты против тегов шаблонов (этап 8.2). Прогоняется при
 * старте режима «претензии». Любая ошибка блокирует работу — кривая конфигурация
 * не должна выпускать юриста в незаконсистентную форму.
 *
 * Передавать только шаблоны режима с анкетой (для «документации» не вызывается).
 * Возвращает список понятных сообщений; пустой — конфигурация валидна.
 *
 * Правила:
 *  1. Все оси из tags шаблонов объявлены в axes анкеты.
 *  2. Каждый шаблон указывает ровно те оси, что видимы для его ветви ответов
 *     (при тип_поставки: первая ось количество_частичных НЕ указывается).
 *  3. Значение тега существует среди вариантов соответствующего вопроса.
 *  4. Нет двух шаблонов с одинаковым полным набором тегов (коллизия комбинации).
 */
export function validateWizard(
  wizard: WizardConfig,
  templates: TemplateConfig[],
): string[] {
  const errors: string[] = [];
  const axes = new Set(wizard.axes);
  const questionsById = new Map(wizard.questions.map((q) => [q.id, q]));

  const signatures = new Map<string, string>(); // подпись тегов → id шаблона

  for (const tpl of templates) {
    const at = `Шаблон «${tpl.template || tpl.id}»`;
    const tags = tpl.tags ?? {};
    const tagKeys = Object.keys(tags);

    // (1) Оси тегов объявлены в анкете.
    for (const key of tagKeys) {
      if (!axes.has(key)) {
        errors.push(`${at}: ось «${key}» не объявлена в axes анкеты.`);
      }
    }

    // (2) Ровно видимые оси: считаем ожидаемый набор по visible_if от tags.
    const expected = new Set<string>();
    for (const q of wizard.questions) {
      if (!axes.has(q.id)) continue; // вопросы-ветвления без оси не требуют тега
      if (evaluateVisibility(q.visible_if, tags)) expected.add(q.id);
    }
    for (const axis of expected) {
      if (!(axis in tags)) {
        errors.push(`${at}: для этой ветви требуется ось «${axis}», но тега нет.`);
      }
    }
    for (const key of tagKeys) {
      if (axes.has(key) && !expected.has(key)) {
        errors.push(
          `${at}: ось «${key}» неприменима для этой ветви ответов — убрать тег.`,
        );
      }
    }

    // (3) Значение тега существует среди вариантов вопроса.
    for (const [key, value] of Object.entries(tags)) {
      const q = questionsById.get(key);
      if (!q) continue; // про необъявленную ось уже сообщили в (1)
      const ok = q.options.some((o) => String(o.value) === String(value));
      if (!ok) {
        errors.push(
          `${at}: значение «${value}» оси «${key}» отсутствует среди вариантов вопроса.`,
        );
      }
    }

    // (4) Коллизия полного набора тегов.
    const sig = signatureOf(tags);
    const prev = signatures.get(sig);
    if (prev) {
      errors.push(
        `${at}: одинаковый набор тегов с шаблоном «${prev}» — на комбинацию ответов должен быть один шаблон.`,
      );
    } else {
      signatures.set(sig, tpl.template || tpl.id);
    }
  }

  return errors;
}

/// Канонная подпись набора тегов: сортируем ключи, чтобы порядок в YAML не влиял.
function signatureOf(tags: Record<string, string | number>): string {
  return Object.keys(tags)
    .sort()
    .map((k) => `${k}=${tags[k]}`)
    .join("&");
}

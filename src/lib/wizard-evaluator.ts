import { evaluateVisibility } from "@/lib/form-evaluator";
import type {
  TemplateConfig,
  WizardAnswers,
  WizardConfig,
  WizardQuestion,
} from "@/types";

// Логика прохождения анкеты (этап 8.3). Чистые функции без UI: WizardPage
// держит состояние ответов и дёргает эти хелперы. DSL visible_if —
// переиспользуем form-evaluator, второй парсер не плодим.

/// Вопросы, видимые при текущих ответах, в порядке объявления.
export function getVisibleQuestions(
  answers: WizardAnswers,
  wizard: WizardConfig,
): WizardQuestion[] {
  return wizard.questions.filter((q) => evaluateVisibility(q.visible_if, answers));
}

/// Следующий нескрытый вопрос без ответа или null, если все пройдены.
export function getNextQuestion(
  answers: WizardAnswers,
  wizard: WizardConfig,
): WizardQuestion | null {
  for (const q of getVisibleQuestions(answers, wizard)) {
    if (!(q.id in answers)) return q;
  }
  return null;
}

/// Убирает ответы на вопросы, ставшие невидимыми после смены ветви.
/// Иначе устаревший ответ (например, количество_частичных после переключения
/// на «первая») попал бы в матчинг и сломал подбор шаблона.
export function pruneAnswers(
  answers: WizardAnswers,
  wizard: WizardConfig,
): WizardAnswers {
  const visibleIds = new Set(getVisibleQuestions(answers, wizard).map((q) => q.id));
  const pruned: WizardAnswers = {};
  for (const [key, value] of Object.entries(answers)) {
    if (visibleIds.has(key)) pruned[key] = value;
  }
  return pruned;
}

/// Человекочитаемая сводка ответов в порядке вопросов: подписи выбранных
/// вариантов (для экрана «в разработке» и кнопок навигации).
export function answerLabels(
  answers: WizardAnswers,
  wizard: WizardConfig,
): string[] {
  const labels: string[] = [];
  for (const q of getVisibleQuestions(answers, wizard)) {
    if (!(q.id in answers)) continue;
    const opt = q.options.find((o) => String(o.value) === String(answers[q.id]));
    labels.push(opt ? opt.label : String(answers[q.id]));
  }
  return labels;
}

/// Шаблон, у которого все теги совпадают с ответами (сравнение по строке).
/// Коллизия ≥2 шаблонов — это ошибка конфигурации, отлавливается валидатором,
/// здесь берём первое совпадение.
export function matchTemplate(
  answers: WizardAnswers,
  templates: TemplateConfig[],
): TemplateConfig | null {
  return (
    templates.find((tpl) => {
      const tags = tpl.tags;
      if (!tags) return false;
      const keys = Object.keys(tags);
      if (keys.length === 0) return false;
      return keys.every((k) => String(tags[k]) === String(answers[k]));
    }) ?? null
  );
}

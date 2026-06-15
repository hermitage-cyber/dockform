// Типы анкеты-навигатора по шаблонам (этап 8). Источник правды о вопросах —
// templates/{mode}/_wizard.yaml; шаблоны несут только теги (TemplateConfig.tags).

export type WizardOption = {
  /// Значение, попадающее в ответы и сверяемое с тегами шаблона.
  value: string | number;
  label: string;
};

export type WizardQuestion = {
  id: string;
  label: string;
  options: WizardOption[];
  /// Тот же DSL, что у полей формы (form-evaluator): "поле == 'значение'".
  visible_if?: string;
};

export type WizardConfig = {
  /// Полный список осей анкеты. По ним валидатор сверяет теги шаблонов.
  axes: string[];
  questions: WizardQuestion[];
};

/// Ответы пользователя: id вопроса → выбранное значение.
export type WizardAnswers = Record<string, string | number>;

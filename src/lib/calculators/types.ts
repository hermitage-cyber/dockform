export type CalculatorInputs = Record<string, unknown>;
export type CalculatorOutputs = Record<string, unknown>;

/**
 * Определение калькулятора. id — ключ в реестре, по которому YAML на него ссылается.
 *
 * inputs / outputs — декларативные списки имён ключей. Нужны, чтобы при загрузке
 * шаблона убедиться, что маппинг в YAML согласован с реальной функцией
 * (этап 7.4 — валидация на старте).
 */
export type CalculatorDef = {
  id: string;
  inputs: readonly string[];
  outputs: readonly string[];
  // Опциональные входы/выходы (подмножество inputs/outputs). Их разрешено НЕ
  // указывать в YAML — нужно для калькуляторов с переменным числом слагаемых
  // (напр. до 4 частичных поставок: поставка2..4 необязательны). Отсутствующий
  // опциональный вход не блокирует расчёт (runCalculator его не требует), run()
  // трактует его как пустой; неуказанный опциональный выход просто не пишется.
  optionalInputs?: readonly string[];
  optionalOutputs?: readonly string[];
  run: (inputs: CalculatorInputs) => CalculatorOutputs;
};

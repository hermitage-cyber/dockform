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
  run: (inputs: CalculatorInputs) => CalculatorOutputs;
};

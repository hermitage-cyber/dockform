import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { answerLabels } from "@/lib/wizard-evaluator";
import type { WizardAnswers, WizardConfig } from "@/types";

type Props = {
  wizard: WizardConfig;
  answers: WizardAnswers;
  /// Вернуться в начало анкеты текущего режима.
  onRestart: () => void;
  /// На главный экран (выбор режима).
  onHome: () => void;
};

export function InDevelopmentPage({ wizard, answers, onRestart, onHome }: Props) {
  const summary = answerLabels(answers, wizard).join(" · ");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <Construction className="w-14 h-14 text-muted-foreground" />
      <div>
        <h1 className="text-2xl font-semibold mb-2">Шаблона под эту ситуацию пока нет</h1>
        {summary && <p className="text-muted-foreground">{summary}</p>}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onRestart}>
          Изменить ответы
        </Button>
        <Button onClick={onHome}>На главный экран</Button>
      </div>
    </div>
  );
}

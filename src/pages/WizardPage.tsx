import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getNextQuestion,
  getVisibleQuestions,
  matchTemplate,
  pruneAnswers,
} from "@/lib/wizard-evaluator";
import type {
  TemplateConfig,
  WizardAnswers,
  WizardConfig,
  WizardOption,
} from "@/types";

type Props = {
  wizard: WizardConfig;
  templates: TemplateConfig[];
  /// Анкета пройдена: template — найденный шаблон или null («в разработке»).
  onComplete: (result: { template: TemplateConfig | null; answers: WizardAnswers }) => void;
  /// «Назад» с первого вопроса — выход из анкеты (к выбору режима).
  onExit: () => void;
};

export function WizardPage({ wizard, templates, onComplete, onExit }: Props) {
  const [answers, setAnswers] = useState<WizardAnswers>({});

  const current = getNextQuestion(answers, wizard);
  const visible = getVisibleQuestions(answers, wizard);
  // Сколько видимых вопросов уже отвечено — для индикатора и «Назад».
  const answered = visible.filter((q) => q.id in answers);

  // Текущий выбор в радио. Сбрасывается при смене вопроса; при возврате назад
  // подставляется ранее данный ответ.
  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    setSelected(current ? String(answers[current.id] ?? "") : "");
    // answers намеренно не в зависимостях: синхронизируем только при смене вопроса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Анкета пройдена (нет следующего вопроса) → отдаём результат наверх.
  useEffect(() => {
    if (current === null) {
      onComplete({ template: matchTemplate(answers, templates), answers });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const progress = useMemo(() => {
    if (!current) return null;
    return { position: answered.length + 1, total: visible.length };
  }, [current, answered.length, visible.length]);

  if (!current) return null; // идёт переход через onComplete

  const commit = (option: WizardOption) => {
    const next = pruneAnswers({ ...answers, [current.id]: option.value }, wizard);
    setAnswers(next);
  };

  const onNext = () => {
    const option = current.options.find((o) => String(o.value) === selected);
    if (option) commit(option);
  };

  const onBack = () => {
    if (answered.length === 0) {
      onExit();
      return;
    }
    // Снимаем ответ на последний отвеченный видимый вопрос — он станет текущим.
    const last = answered[answered.length - 1];
    const { [last.id]: _removed, ...rest } = answers;
    void _removed;
    setAnswers(pruneAnswers(rest, wizard));
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        {progress && (
          <p className="text-sm text-muted-foreground mb-2">
            Вопрос {progress.position} из {progress.total}
          </p>
        )}
        <h1 className="text-2xl font-semibold mb-6">{current.label}</h1>

        <div className="grid gap-3">
          {current.options.map((opt) => {
            const isSelected = String(opt.value) === selected;
            return (
              <Card
                key={String(opt.value)}
                onClick={() => setSelected(String(opt.value))}
                className={cn(
                  "cursor-pointer transition-colors",
                  isSelected ? "border-primary bg-accent" : "hover:bg-accent",
                )}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <span className="font-medium">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-primary" />}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-between mt-8">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <Button onClick={onNext} disabled={!selected}>
            Далее
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

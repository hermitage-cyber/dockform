import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Mode, Template } from "@/types";

type Props = {
  mode: Mode;
  templates: Template[];
  onSelect: (template: Template) => void;
  onBackToModes?: () => void;
};

const modeLabels: Record<Mode, string> = {
  pretenzii: "Претензионная работа",
  documentation: "Документация",
};

export function TemplatesList({ mode, templates, onSelect, onBackToModes }: Props) {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        {onBackToModes && (
          <Button variant="ghost" size="sm" onClick={onBackToModes} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            К выбору режима
          </Button>
        )}
        <h1 className="text-2xl font-semibold mb-1">{modeLabels[mode]}</h1>
        <p className="text-muted-foreground mb-6">Выберите шаблон</p>

        {templates.length === 0 ? (
          <p className="text-muted-foreground">Шаблоны не найдены.</p>
        ) : (
          <div className="grid gap-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                onClick={() => onSelect(t)}
                className="cursor-pointer hover:bg-accent transition-colors"
              >
                <CardContent className="p-5">
                  <div className="font-medium">{t.title}</div>
                  {t.description && (
                    <div className="text-sm text-muted-foreground mt-1">{t.description}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

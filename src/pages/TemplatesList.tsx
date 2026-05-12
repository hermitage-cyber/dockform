import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listTemplates } from "@/lib/tauri";
import type { Mode, Template, TemplateConfig } from "@/types";

type Props = {
  mode: Mode;
  onSelect: (template: Template) => void;
  onBackToModes?: () => void;
};

const modeLabels: Record<Mode, string> = {
  pretenzii: "Претензионная работа",
  documentation: "Документация",
};

export function TemplatesList({ mode, onSelect, onBackToModes }: Props) {
  const [templates, setTemplates] = useState<TemplateConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(null);
    setError(null);
    listTemplates(mode)
      .then(setTemplates)
      .catch((e) => setError(String(e)));
  }, [mode]);

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

        {error && (
          <p className="text-sm text-destructive">Ошибка: {error}</p>
        )}

        {!error && templates === null && (
          <p className="text-muted-foreground">Загружаем…</p>
        )}

        {!error && templates !== null && templates.length === 0 && (
          <p className="text-muted-foreground">
            Шаблоны не найдены. Проверьте, что папка{" "}
            <code className="font-mono text-foreground">templates/{mode}/</code>{" "}
            существует и содержит парные <code className="font-mono text-foreground">.docx</code>{" "}
            + <code className="font-mono text-foreground">.yaml</code> файлы.
          </p>
        )}

        {templates && templates.length > 0 && (
          <div className="grid gap-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                onClick={() => onSelect({ id: t.id, title: t.title, description: t.description })}
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

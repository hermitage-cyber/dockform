import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicForm } from "@/components/DynamicForm";
import type { FormValues } from "@/lib/form-evaluator";
import type { TemplateConfig } from "@/types";

type Props = {
  template: TemplateConfig;
  onBack: () => void;
};

export function FormPage({ template, onBack }: Props) {
  const handleSubmit = (values: FormValues) => {
    // Этап 3: только лог. Генерация .docx — этап 4.
    console.log("Form submit", JSON.stringify(values, null, 2));
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          К списку шаблонов
        </Button>
        <h1 className="text-2xl font-semibold mb-1">{template.title}</h1>
        {template.description && (
          <p className="text-muted-foreground mb-6">{template.description}</p>
        )}
        <DynamicForm config={template} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}

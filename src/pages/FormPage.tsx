import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Template } from "@/types";

type Props = {
  template: Template;
  onBack: () => void;
};

export function FormPage({ template, onBack }: Props) {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          К списку шаблонов
        </Button>
        <h1 className="text-2xl font-semibold mb-2">{template.title}</h1>
        <p className="text-muted-foreground">Здесь будет форма для «{template.title}».</p>
      </div>
    </div>
  );
}

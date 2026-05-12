import { Briefcase, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Mode } from "@/types";

type Props = {
  onSelect: (mode: Mode) => void;
};

const modes: Array<{ id: Mode; title: string; description: string; Icon: typeof Briefcase }> = [
  {
    id: "pretenzii",
    title: "Претензионная работа",
    description: "Претензии и требования",
    Icon: Briefcase,
  },
  {
    id: "documentation",
    title: "Документация",
    description: "Сопроводительные документы к закупкам",
    Icon: FileText,
  },
];

export function ModeSelect({ onSelect }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-semibold">Dockform</h1>
      <p className="text-muted-foreground">Выберите раздел</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {modes.map(({ id, title, description, Icon }) => (
          <Card
            key={id}
            onClick={() => onSelect(id)}
            className="cursor-pointer hover:bg-accent transition-colors"
          >
            <CardContent className="flex flex-col items-center gap-4 p-8">
              <Icon className="w-12 h-12" />
              <div className="text-center">
                <div className="text-lg font-medium">{title}</div>
                <div className="text-sm text-muted-foreground mt-1">{description}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

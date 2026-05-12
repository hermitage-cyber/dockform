import { useState } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DynamicForm } from "@/components/DynamicForm";
import { buildFilename } from "@/lib/filename";
import { generateDocx } from "@/lib/generator";
import { openInExplorer, writeFile } from "@/lib/tauri";
import type { FormValues } from "@/lib/form-evaluator";
import type { Mode, TemplateConfig } from "@/types";

type Props = {
  mode: Mode;
  template: TemplateConfig;
  onBack: () => void;
};

export function FormPage({ mode, template, onBack }: Props) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const fieldLabel = (name: string): string => {
    const f = template.fields.find((x) => x.name === name);
    return f?.label ?? name;
  };

  const onSubmit = async (values: FormValues) => {
    setMissing(null);
    setError(null);

    // 1. Сборка имени файла + проверка обязательных полей паттерна.
    const fn = buildFilename(
      template.output_filename.pattern,
      template.output_filename.fields,
      values,
    );
    if (!fn.ok) {
      setMissing(fn.missing);
      return;
    }

    // 2. Save-диалог системный.
    let dest: string | null;
    try {
      dest = await save({
        defaultPath: fn.filename,
        filters: [{ name: "Word document", extensions: ["docx"] }],
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    if (!dest) return; // пользователь отменил

    // 3. Генерация и запись.
    setBusy(true);
    try {
      const bytes = await generateDocx(mode, template.template, values);
      await writeFile(dest, bytes);
      setSavedPath(dest);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
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

        {missing && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Заполните поля для имени файла</AlertTitle>
            <AlertDescription>{missing.map(fieldLabel).join(", ")}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Ошибка</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DynamicForm config={template} onSubmit={onSubmit} disabled={busy} />
      </div>

      <Dialog open={savedPath !== null} onOpenChange={(open) => !open && setSavedPath(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Документ сохранён</DialogTitle>
            <DialogDescription className="break-all">{savedPath}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => savedPath && openInExplorer(savedPath)}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Открыть папку
            </Button>
            <Button onClick={() => setSavedPath(null)}>ОК</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

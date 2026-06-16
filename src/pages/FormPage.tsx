import { useMemo, useState } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
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
import { validateTemplate } from "@/lib/template-validator";
import { formatValuesForDocx } from "@/lib/format-ru";
import { FilenameFieldsError, generateBundle } from "@/lib/generator";
import { deleteDraft, draftKey, openInExplorer, writeFile } from "@/lib/tauri";
import type { FormValues } from "@/lib/form-evaluator";
import type { Mode, TemplateConfig } from "@/types";

/// Результат успешной записи: одиночный файл или связка в папке.
type SavedResult =
  | { kind: "single"; path: string }
  | { kind: "bundle"; dir: string; names: string[] };

type Props = {
  mode: Mode;
  template: TemplateConfig;
  onBack: () => void;
  /// Начать новый подбор шаблона (претензии → анкета, документация → список).
  onNewTemplate: () => void;
};

export function FormPage({ mode, template, onBack, onNewTemplate }: Props) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedResult | null>(null);
  // Подтверждение «Новый шаблон» при незавершённой форме (потеря черновика).
  const [confirmNew, setConfirmNew] = useState(false);
  const key = draftKey(mode, template.id);
  // Связка документов (этап 8.8): основной + extra_templates.
  const extraCount = template.extra_templates?.length ?? 0;
  const totalDocs = extraCount + 1;

  // Статическая проверка конфига при загрузке (этап 7.4): несогласованный
  // калькулятор / text_output блокирует форму понятной ошибкой, а не молча
  // ломается на рантайме.
  const configErrors = useMemo(() => validateTemplate(template), [template]);

  const fieldLabel = (name: string): string => {
    const f = template.fields.find((x) => x.name === name);
    return f?.label ?? name;
  };

  const onSubmit = async (values: FormValues) => {
    setMissing(null);
    setError(null);

    // 1. Генерация всех документов связки в память. При нехватке полей имени —
    //    показываем их и выходим; при битом плейсхолдере — бросит ниже, на диск
    //    ничего не попадёт.
    let files;
    try {
      const docxValues = formatValuesForDocx(template, values);
      files = await generateBundle(mode, template, values, docxValues);
    } catch (e) {
      if (e instanceof FilenameFieldsError) {
        setMissing(e.missing);
        return;
      }
      setError(extractError(e));
      return;
    }

    // 2. Выбор назначения: связка → папка, один документ → «Сохранить как…».
    setBusy(true);
    try {
      if (totalDocs > 1) {
        const dir = await open({ directory: true });
        if (typeof dir !== "string") return; // отмена
        for (const f of files) {
          await writeFile(await join(dir, f.filename), f.bytes);
        }
        await deleteDraft(key).catch(() => undefined);
        setSaved({ kind: "bundle", dir, names: files.map((f) => f.filename) });
      } else {
        const dest = await save({
          defaultPath: files[0].filename,
          filters: [{ name: "Word document", extensions: ["docx"] }],
        });
        if (!dest) return; // отмена
        await writeFile(dest, files[0].bytes);
        await deleteDraft(key).catch(() => undefined);
        setSaved({ kind: "single", path: dest });
      }
    } catch (e) {
      // Черновик не трогаем — работа пользователя сохранится.
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {mode === "pretenzii" ? "К анкете" : "К списку шаблонов"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmNew(true)}>
            Новый шаблон
          </Button>
        </div>
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

        {configErrors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>Шаблон настроен некорректно</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 space-y-1">
                {configErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <DynamicForm
            config={template}
            onSubmit={onSubmit}
            disabled={busy}
            draftKey={key}
            submitLabel={totalDocs > 1 ? `Сформировать ${totalDocs} документа` : undefined}
          />
        )}
      </div>

      <Dialog open={saved !== null} onOpenChange={(open) => !open && setSaved(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {saved?.kind === "bundle"
                ? `Создано ${saved.names.length} файлов`
                : "Документ сохранён"}
            </DialogTitle>
            <DialogDescription className="break-all">
              {saved?.kind === "bundle" ? saved.dir : saved?.path}
            </DialogDescription>
          </DialogHeader>
          {saved?.kind === "bundle" && (
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {saved.names.map((n) => (
                <li key={n} className="break-all">{n}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                saved && openInExplorer(saved.kind === "bundle" ? saved.dir : saved.path)
              }
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Открыть папку
            </Button>
            {/* Черновик уже удалён после успешной генерации — confirm не нужен. */}
            <Button variant="outline" onClick={() => { setSaved(null); onNewTemplate(); }}>
              Создать ещё один
            </Button>
            <Button onClick={() => setSaved(null)}>ОК</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Начать новый шаблон?</DialogTitle>
            <DialogDescription>
              Введённые данные будут утеряны. Продолжить?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmNew(false)}>
              Отмена
            </Button>
            <Button
              onClick={async () => {
                setConfirmNew(false);
                await deleteDraft(key).catch(() => undefined);
                onNewTemplate();
              }}
            >
              Продолжить
            </Button>
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

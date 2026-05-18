import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "@/components/ui/button";

type Props = {
  update: Update;
  onDismiss: () => void;
};

type Phase = "prompt" | "downloading" | "error";

export function UpdaterPrompt({ update, onDismiss }: Props) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function install() {
    setPhase("downloading");
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setTotal(event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
          setDownloaded((d) => d + event.data.chunkLength);
        }
      });
      await relaunch();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6">
        <h2 className="text-lg font-semibold">
          Доступно обновление {update.version ? `(v${update.version})` : ""}
        </h2>

        {phase === "prompt" && (
          <>
            {update.body && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {update.body}
              </p>
            )}
            <p className="text-sm">Установить сейчас? Приложение перезапустится.</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={install}>
                Установить
              </Button>
              <Button variant="outline" className="flex-1" onClick={onDismiss}>
                Позже
              </Button>
            </div>
          </>
        )}

        {phase === "downloading" && (
          <>
            <p className="text-sm">Скачиваем обновление…</p>
            <ProgressBar downloaded={downloaded} total={total} />
          </>
        )}

        {phase === "error" && (
          <>
            <p className="text-sm text-destructive">Не удалось установить обновление.</p>
            {error && (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{error}</p>
            )}
            <Button className="w-full" onClick={onDismiss}>
              Закрыть
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ downloaded, total }: { downloaded: number; total: number | null }) {
  const pct = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: pct != null ? `${pct}%` : "33%" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {pct != null
          ? `${pct}% (${formatBytes(downloaded)} / ${formatBytes(total ?? 0)})`
          : formatBytes(downloaded)}
      </p>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

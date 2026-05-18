import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Button } from "@/components/ui/button";
import { UpdaterPrompt } from "@/components/UpdaterPrompt";
import { ModeSelect } from "@/pages/ModeSelect";
import { TemplatesList } from "@/pages/TemplatesList";
import { FormPage } from "@/pages/FormPage";
import { fetchKillswitch, getMode, saveWindowState, updateTemplates } from "@/lib/tauri";
import type { Mode, TemplateConfig } from "@/types";

type Screen = "mode" | "list" | "form";

const titles: Record<Mode | "none", string> = {
  pretenzii: "Dockform — Претензионная работа",
  documentation: "Dockform — Документация",
  none: "Dockform",
};

function App() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [screen, setScreen] = useState<Screen>("mode");
  const [selected, setSelected] = useState<TemplateConfig | null>(null);
  const [ready, setReady] = useState(false);
  // Если режим зашит в argv (ярлык --mode=...), кнопка «К выбору режима»
  // не показывается — менять его в UI бессмысленно, всё равно перезапуск
  // вернёт сюда же.
  const [modeFromArgv, setModeFromArgv] = useState(false);
  const [blocked, setBlocked] = useState<{ message?: string } | null>(null);
  // Инкрементируется после успешного обновления шаблонов, чтобы TemplatesList
  // перечитал список с диска.
  const [templatesNonce, setTemplatesNonce] = useState(0);
  const [appUpdate, setAppUpdate] = useState<Update | null>(null);

  // Kill switch — асинхронно, не блокирует UI. Если ответ пришёл с
  // active:false, поверх обычного UI накрывает оверлей. До ответа
  // приложение работает в обычном режиме (CLAUDE.md: старт ≤ 5 сек).
  useEffect(() => {
    fetchKillswitch()
      .then((k) => {
        if (k && k.active === false) {
          setBlocked({ message: k.message });
        }
      })
      .catch(() => undefined);
  }, []);

  // Обновление шаблонов с GitHub — фоновое, не блокирует старт.
  // При успешных изменениях бьём nonce → TemplatesList переподтягивает список.
  // Если пользователь к моменту завершения уже в форме, конкретный экран
  // не дёргаем: его данные уже в JS-памяти, файлы перечитаются при возврате к
  // списку и следующем открытии формы.
  // Сразу после — проверка обновления самого приложения (plan.md 6.3).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await updateTemplates();
        if (cancelled) return;
        if (r.updated.length > 0 || r.removed.length > 0) {
          setTemplatesNonce((n) => n + 1);
        }
        if (r.failed.length > 0) {
          console.warn("[templates] не удалось обновить:", r.failed);
        }
      } catch (e) {
        console.error("[templates] ошибка:", e);
      }

      try {
        const upd = await check();
        if (cancelled) return;
        if (upd) setAppUpdate(upd);
      } catch (e) {
        // Нет интернета, заблочен GitHub, ещё не настроен pubkey — не валим UI.
        console.warn("[updater] check:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getMode().then((m) => {
      if (m) {
        setMode(m);
        setScreen("list");
        setModeFromArgv(true);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const title = mode ? titles[mode] : titles.none;
    getCurrentWindow().setTitle(title);
  }, [mode]);

  // Сохранение размера окна с дебаунсом — innerSize в логических единицах,
  // чтобы при следующем старте Rust применил тот же размер через LogicalSize.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    win
      .onResized(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          const size = await win.innerSize();
          const scale = await win.scaleFactor();
          const logical = size.toLogical(scale);
          if (logical.width > 0 && logical.height > 0) {
            saveWindowState(logical.width, logical.height);
          }
        }, 500);
      })
      .then((u) => {
        unlisten = u;
      });

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      unlisten?.();
    };
  }, []);

  if (!ready) return null;

  let content;
  if (screen === "form" && selected && mode) {
    content = (
      <FormPage
        mode={mode}
        template={selected}
        onBack={() => {
          setSelected(null);
          setScreen("list");
        }}
      />
    );
  } else if (screen === "list" && mode) {
    content = (
      <TemplatesList
        mode={mode}
        refreshNonce={templatesNonce}
        onSelect={(t) => {
          setSelected(t);
          setScreen("form");
        }}
        onBackToModes={
          modeFromArgv
            ? undefined
            : () => {
                setMode(null);
                setScreen("mode");
              }
        }
      />
    );
  } else {
    content = (
      <ModeSelect
        onSelect={(m) => {
          setMode(m);
          setScreen("list");
        }}
      />
    );
  }

  return (
    <>
      {content}
      {appUpdate && !blocked && (
        <UpdaterPrompt update={appUpdate} onDismiss={() => setAppUpdate(null)} />
      )}
      {blocked && <BlockedOverlay message={blocked.message} />}
    </>
  );
}

/// Полноэкранный оверлей, который накрывает любой UI. Закрывается только
/// через закрытие самого приложения — без ESC, без клика по фону.
function BlockedOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="max-w-md space-y-4 rounded-lg border bg-background p-6">
        <h2 className="text-lg font-semibold">Приложение временно недоступно</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {message ?? "Доступ к приложению временно ограничен администратором."}
        </p>
        <Button className="w-full" onClick={() => getCurrentWindow().close()}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

export default App;

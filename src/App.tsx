import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ModeSelect } from "@/pages/ModeSelect";
import { TemplatesList } from "@/pages/TemplatesList";
import { FormPage } from "@/pages/FormPage";
import { getMode, saveWindowState } from "@/lib/tauri";
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

  if (screen === "form" && selected) {
    return (
      <FormPage
        template={selected}
        onBack={() => {
          setSelected(null);
          setScreen("list");
        }}
      />
    );
  }

  if (screen === "list" && mode) {
    return (
      <TemplatesList
        mode={mode}
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
  }

  return (
    <ModeSelect
      onSelect={(m) => {
        setMode(m);
        setScreen("list");
      }}
    />
  );
}

export default App;

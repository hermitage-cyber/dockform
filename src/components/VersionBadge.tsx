import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/// Версия сборки в углу экрана. Нужна на скриншотах от пилотов: без неё
/// нельзя понять, старый ли у человека .exe (отзыв пилота 2026-08-10, п. 1 и 3).
/// Значение берётся из tauri.conf.json через API — второго источника правды нет.
export function VersionBadge() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  if (!version) return null;

  return (
    <div className="pointer-events-none fixed bottom-1.5 right-2 z-40 select-none text-[11px] leading-none text-muted-foreground/60">
      v{version}
    </div>
  );
}

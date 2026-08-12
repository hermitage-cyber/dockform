import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { cn } from "@/lib/utils";
import type { SyncStatus, UpdateReport } from "@/lib/tauri";

/// Версия сборки и состояние шаблонов в углу окна.
///
/// Зачем: пилоту надо на старте понять, что что-то не так, не открывая форму, а
/// нам — читать это со скриншота. До версии в интерфейсе причину сбоя у пилота
/// искали вслепую: номер `0.1.0` не менялся 41 коммит и не отличал майскую
/// сборку от июньской (разбор — `docs/отзыв-пилота-2026-08-10.md`).
///
/// Цвет точки: зелёный — шаблоны сошлись с GitHub; жёлтый — связи нет, работаем
/// на локальных; красный — надо вмешаться.

type Props = {
  /// `null`, пока проверка не завершилась (до 8 секунд на медленной сети).
  report: UpdateReport | null;
};

type Look = { dot: string; caption: string | null; hint: string };

/// Подпись показывается только для нештатных состояний: зелёная точка без
/// текста не отвлекает, а «нет связи» юрист должен прочитать без наведения.
const looks: Record<SyncStatus | "checking", Look> = {
  checking: {
    dot: "bg-muted-foreground/40 animate-pulse",
    caption: null,
    hint: "Проверяем обновления шаблонов…",
  },
  synced: {
    dot: "bg-emerald-500",
    caption: null,
    hint: "Шаблоны совпадают с сервером.",
  },
  offline: {
    dot: "bg-amber-500",
    caption: "нет связи",
    hint:
      "Не удалось связаться с сервером обновлений — работаем на шаблонах, которые уже загружены. " +
      "Это нормально без интернета. Если сеть есть, возможно, доступ режет антивирус или фильтр.",
  },
  partial: {
    dot: "bg-red-500",
    caption: "обновилось не всё",
    hint:
      "Часть шаблонов не догрузилась — на диске смесь старых и новых. " +
      "Перезапустите программу при устойчивом интернете.",
  },
  error: {
    dot: "bg-red-500",
    caption: "ошибка обновления",
    hint: "Список шаблонов на сервере повреждён. Сообщите разработчику.",
  },
  app_outdated: {
    dot: "bg-red-500",
    caption: "нужна новая версия",
    hint: "Новые шаблоны требуют более свежую версию программы. Обновите dockform.exe.",
  },
  unknown: {
    dot: "bg-muted-foreground/40",
    caption: null,
    hint: "Состояние обновления неизвестно.",
  },
};

/// Дата по конвенции проекта — дд.мм.гггг (см. CLAUDE.md).
function formatSync(unix?: number): string {
  if (!unix) return "Сверки с сервером ещё не было.";
  const d = new Date(unix * 1000);
  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Шаблоны сверялись ${date} в ${time}.`;
}

export function StatusBadge({ report }: Props) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  const look = looks[report?.status ?? "checking"];
  // Точка кликабельна только как область наведения — title даёт подробности,
  // включая дату последней удачной сверки.
  const title = `${look.hint}\n${formatSync(report?.last_sync_unix)}`;

  return (
    <div
      title={title}
      className="fixed bottom-1.5 right-2 z-40 flex cursor-default select-none items-center gap-1.5 text-[11px] leading-none text-muted-foreground/70"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", look.dot)} />
      {look.caption && <span>{look.caption}</span>}
      {version && <span className="text-muted-foreground/50">v{version}</span>}
    </div>
  );
}

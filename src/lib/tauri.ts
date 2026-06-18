import { invoke } from "@tauri-apps/api/core";
import type { Dictionaries, Mode, TemplateConfig, WizardConfig } from "@/types";

export type WindowState = { width: number; height: number };

export type ListTemplatesResult = {
  templates: TemplateConfig[];
  wizard: WizardConfig | null;
};

export async function getMode(): Promise<Mode | null> {
  const raw = await invoke<string | null>("get_mode");
  return raw === "pretenzii" || raw === "documentation" ? raw : null;
}

export async function listTemplates(mode: Mode): Promise<ListTemplatesResult> {
  return await invoke<ListTemplatesResult>("list_templates", { mode });
}

export async function listDictionaries(): Promise<Dictionaries> {
  return await invoke<Dictionaries>("list_dictionaries");
}

export async function readTemplate(mode: Mode, template: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("read_template", { mode, template });
  return new Uint8Array(bytes);
}

export async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("write_file", { path, bytes: Array.from(bytes) });
}

export async function openInExplorer(path: string): Promise<void> {
  await invoke("open_in_explorer", { path });
}

export async function saveWindowState(width: number, height: number): Promise<void> {
  await invoke("save_window_state", { width, height });
}

export async function loadWindowState(): Promise<WindowState | null> {
  return await invoke<WindowState | null>("load_window_state");
}

export type DraftPayload = {
  saved_at: string;
  values: Record<string, unknown>;
};

/// Rust-сторона (validate_key в commands/drafts.rs) принимает только
/// `[A-Za-z0-9_-]`. У претензий имена шаблонов на кириллице, поэтому
/// неASCII-идентификатор кодируем в base64url без паддинга. Чисто-ASCII id
/// пропускаются как есть — чтобы старые черновики documentation остались
/// читаемыми.
function encodeTemplateId(id: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(id)) return id;
  const bytes = new TextEncoder().encode(id);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function draftKey(mode: Mode, templateId: string): string {
  return `${mode}__${encodeTemplateId(templateId)}`;
}

export async function saveDraft(key: string, payload: DraftPayload): Promise<void> {
  await invoke("save_draft", { key, json: JSON.stringify(payload) });
}

export async function loadDraft(key: string): Promise<DraftPayload | null> {
  const raw = await invoke<string | null>("load_draft", { key });
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftPayload;
    if (!parsed || typeof parsed.saved_at !== "string" || typeof parsed.values !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteDraft(key: string): Promise<void> {
  await invoke("delete_draft", { key });
}

export type Killswitch = {
  /// `false` → блокировать запуск. Семантика по plan.md 6.1.
  active: boolean;
  message?: string;
};

/// `null` — ни сети, ни кеша. Фронт работает в обычном режиме.
export async function fetchKillswitch(): Promise<Killswitch | null> {
  return await invoke<Killswitch | null>("fetch_killswitch");
}

export type UpdateReport = {
  updated: string[];
  removed: string[];
  failed: string[];
};

/// Скачивает manifest.json с GitHub и синхронизирует templates/ + dictionaries/.
/// Сетевые ошибки не пробрасываются: на их месте — пустой отчёт.
export async function updateTemplates(): Promise<UpdateReport> {
  return await invoke<UpdateReport>("update_templates");
}

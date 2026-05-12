import { invoke } from "@tauri-apps/api/core";
import type { Mode, TemplateConfig } from "@/types";

export type WindowState = { width: number; height: number };

export async function getMode(): Promise<Mode | null> {
  const raw = await invoke<string | null>("get_mode");
  return raw === "pretenzii" || raw === "documentation" ? raw : null;
}

export async function listTemplates(mode: Mode): Promise<TemplateConfig[]> {
  return await invoke<TemplateConfig[]>("list_templates", { mode });
}

export async function saveWindowState(width: number, height: number): Promise<void> {
  await invoke("save_window_state", { width, height });
}

export async function loadWindowState(): Promise<WindowState | null> {
  return await invoke<WindowState | null>("load_window_state");
}

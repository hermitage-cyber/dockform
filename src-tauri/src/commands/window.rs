use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Copy)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
}

/// Папка `cache/` рядом с исполняемым файлом. В dev — `src-tauri/target/debug/cache`.
fn cache_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = exe
        .parent()
        .ok_or_else(|| "executable has no parent dir".to_string())?;
    Ok(parent.join("cache"))
}

fn state_file() -> Result<PathBuf, String> {
    Ok(cache_dir()?.join("window.json"))
}

#[tauri::command]
pub fn save_window_state(width: f64, height: f64) -> Result<(), String> {
    let dir = cache_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let state = WindowState { width, height };
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(state_file()?, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_window_state() -> Option<WindowState> {
    let path = state_file().ok()?;
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

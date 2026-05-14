use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

/// Грузит все JSON из `dictionaries/` рядом с .exe. Ключ — имя файла без расширения,
/// значение — содержимое (массив объектов). Невалидные файлы логируются и пропускаются.
#[tauri::command]
pub fn list_dictionaries() -> HashMap<String, Vec<Value>> {
    let dir = match exe_dir() {
        Ok(p) => p.join("dictionaries"),
        Err(_) => return HashMap::new(),
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return HashMap::new(),
    };

    let mut out = HashMap::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let name = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let raw = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[list_dictionaries] read {}: {e}", path.display());
                continue;
            }
        };
        match serde_json::from_str::<Vec<Value>>(&raw) {
            Ok(records) => {
                out.insert(name, records);
            }
            Err(e) => {
                eprintln!("[list_dictionaries] parse {}: {e}", path.display());
            }
        }
    }
    out
}

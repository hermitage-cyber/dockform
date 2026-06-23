use std::path::{Path, PathBuf};

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

/// Читает производственный календарь — массив строк YYYY-MM-DD из
/// `dictionaries/holidays.json` рядом с .exe. На отсутствии/ошибке парсинга
/// возвращает пустой вектор: фронт работает в режиме «только сб/вс»
/// (см. `src/lib/date-utils.ts::isNonBusinessDay`).
#[tauri::command]
pub fn read_holidays() -> Vec<String> {
    let path = match exe_dir() {
        Ok(p) => p.join("dictionaries").join("holidays.json"),
        Err(_) => return Vec::new(),
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    match serde_json::from_str::<Vec<String>>(&raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[read_holidays] parse {}: {e}", path.display());
            Vec::new()
        }
    }
}

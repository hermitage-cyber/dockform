use std::io::Write;
use std::path::{Path, PathBuf};

/// Папка с .exe — рядом с ней лежат templates/, dictionaries/, cache/.
fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

fn drafts_dir() -> Result<PathBuf, String> {
    Ok(exe_dir()?.join("cache").join("drafts"))
}

/// Ключ черновика приходит с фронта (вид `{mode}__{template_id}`) и подставляется
/// в имя файла. Чтобы исключить path traversal, разрешаем только латиницу/цифры/`_`/`-`.
/// Имена шаблонов по конвенции на латинице, поэтому ограничение не мешает.
fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() || key.len() > 200 {
        return Err("invalid draft key length".to_string());
    }
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("draft key contains forbidden characters".to_string());
    }
    Ok(())
}

fn draft_path(key: &str) -> Result<PathBuf, String> {
    validate_key(key)?;
    Ok(drafts_dir()?.join(format!("{key}.json")))
}

/// Создаёт cache/drafts/ если её нет. Вызывается из lib.rs один раз при старте,
/// чтобы команды save_draft не падали на первой попытке.
pub fn ensure_drafts_dir() {
    if let Ok(dir) = drafts_dir() {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("[drafts] не удалось создать {}: {e}", dir.display());
        }
    }
}

/// Атомарная запись через временный файл + rename — при крэше посередине
/// не получится «полу-записанный» json, который потом не распарсится.
#[tauri::command]
pub fn save_draft(key: String, json: String) -> Result<(), String> {
    let path = draft_path(&key)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let tmp = path.with_extension("json.tmp");
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// `Ok(None)` — черновика нет (нормальная ситуация при первом открытии шаблона).
/// `Err` — реальная ошибка чтения (битый файл, нет прав).
#[tauri::command]
pub fn load_draft(key: String) -> Result<Option<String>, String> {
    let path = draft_path(&key)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Удаление без файла — не ошибка (вызывается после успешной генерации,
/// файла может уже не быть, если пользователь нажал «Начать заново»).
#[tauri::command]
pub fn delete_draft(key: String) -> Result<(), String> {
    let path = draft_path(&key)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

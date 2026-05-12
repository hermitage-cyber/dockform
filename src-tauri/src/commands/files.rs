use std::path::{Path, PathBuf};

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

/// Читает .docx шаблон по mode + имени файла. Путь собираем в Rust,
/// чтобы фронт не мог передать произвольный путь (path traversal).
#[tauri::command]
pub fn read_template(mode: String, template: String) -> Result<Vec<u8>, String> {
    if mode != "pretenzii" && mode != "documentation" {
        return Err(format!("unknown mode: {mode}"));
    }
    // Защита от выхода из templates/{mode}/: запрещаем разделители и ..
    if template.contains('/') || template.contains('\\') || template.contains("..") {
        return Err("invalid template name".into());
    }

    let path = exe_dir()?.join("templates").join(&mode).join(&template);
    std::fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))
}

/// Записывает файл по абсолютному пути, выбранному пользователем в save-диалоге.
#[tauri::command]
pub fn write_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &bytes).map_err(|e| format!("write {path}: {e}"))
}

/// Открывает Finder/Explorer/файловый менеджер с выделенным файлом.
#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        // `/select,<file>` — открыть Explorer и подсветить файл.
        Command::new("explorer.exe")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        // `-R` — открыть Finder и подсветить файл.
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        // xdg-open не умеет «select» — открываем папку с файлом.
        let dir = Path::new(&path)
            .parent()
            .ok_or_else(|| "file has no parent dir".to_string())?;
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

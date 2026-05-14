use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// URL репозитория зашит при сборке. Менять — пересобирать .exe.
/// Выбран этот путь (а не app-config.json рядом с .exe), чтобы никто не
/// мог подменить kill switch URL подкладыванием своего конфига на флешку.
const REPO_OWNER: &str = "hermitage-cyber";
const REPO_NAME: &str = "dockform";
const REPO_BRANCH: &str = "main";

/// CLAUDE.md: сетевой запрос не должен задерживать старт > 5 сек.
/// 3 секунды — компромисс: достаточно для медленного интернета, но не блокирует
/// дольше, чем приемлемо при обрыве сети.
const NETWORK_TIMEOUT_SECS: u64 = 3;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Killswitch {
    /// `false` → блокировать запуск приложения. Семантика по plan.md 6.1.
    pub active: bool,
    #[serde(default)]
    pub message: Option<String>,
}

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

fn cache_path() -> Result<PathBuf, String> {
    Ok(exe_dir()?.join("cache").join("last_killswitch.json"))
}

fn killswitch_url() -> String {
    format!(
        "https://raw.githubusercontent.com/{REPO_OWNER}/{REPO_NAME}/{REPO_BRANCH}/killswitch.json"
    )
}

fn write_cache(bytes: &[u8]) {
    if let Ok(path) = cache_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, bytes);
    }
}

fn read_cache() -> Option<Killswitch> {
    let path = cache_path().ok()?;
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// `Ok(Some(k))` — есть свежий с сети или кешированный ответ.
/// `Ok(None)` — ни сети, ни кеша → фронт работает в обычном режиме.
/// `Err(_)` — фатальная ошибка (битый JSON и т.п.). Фронт всё равно не блокирует.
#[tauri::command]
pub async fn fetch_killswitch() -> Result<Option<Killswitch>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(NETWORK_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(killswitch_url()).send().await {
        Ok(resp) if resp.status().is_success() => match resp.bytes().await {
            Ok(bytes) => {
                write_cache(&bytes);
                match serde_json::from_slice::<Killswitch>(&bytes) {
                    Ok(k) => Ok(Some(k)),
                    // Ответ пришёл, но JSON битый — это администратор ошибся.
                    // Фолбэк на кеш, чтобы не блокировать без причины.
                    Err(_) => Ok(read_cache()),
                }
            }
            Err(_) => Ok(read_cache()),
        },
        // Сеть недоступна, таймаут, 4xx/5xx — пробуем кеш.
        _ => Ok(read_cache()),
    }
}

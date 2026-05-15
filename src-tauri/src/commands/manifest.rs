use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Те же const, что и в network.rs — намеренно дублируются, чтобы изменение
/// одной не уехало в другой по ошибке.
const REPO_OWNER: &str = "hermitage-cyber";
const REPO_NAME: &str = "dockform";
const REPO_BRANCH: &str = "main";

/// Чуть больше, чем у kill switch — таймаут на загрузку каждого файла.
/// Манифест мал, файлы шаблонов до пары МБ; 8 секунд — компромисс на медленном wifi.
const NETWORK_TIMEOUT_SECS: u64 = 8;

#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct Manifest {
    #[serde(default)]
    pub templates: BTreeMap<String, String>,
    #[serde(default)]
    pub dictionaries: BTreeMap<String, String>,
}

#[derive(Serialize, Default, Debug)]
pub struct UpdateReport {
    /// Файлы, скачанные с GitHub в этот раз (новые или с изменённым содержимым).
    pub updated: Vec<String>,
    /// Файлы, удалённые локально (их больше нет в remote-манифесте).
    pub removed: Vec<String>,
    /// Файлы, которые попытались скачать, но не получилось (сеть, hash mismatch).
    /// Не попадают в кеш — на следующем запуске будут перетянуты заново.
    pub failed: Vec<String>,
}

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

fn manifest_url() -> String {
    format!("https://raw.githubusercontent.com/{REPO_OWNER}/{REPO_NAME}/{REPO_BRANCH}/manifest.json")
}

fn file_url(section: &str, rel: &str) -> String {
    format!("https://raw.githubusercontent.com/{REPO_OWNER}/{REPO_NAME}/{REPO_BRANCH}/{section}/{rel}")
}

fn cache_path() -> Result<PathBuf, String> {
    Ok(exe_dir()?.join("cache").join("last_manifest.json"))
}

fn read_cache() -> Manifest {
    let bytes = match cache_path().ok().and_then(|p| std::fs::read(p).ok()) {
        Some(b) => b,
        None => return Manifest::default(),
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn write_cache(m: &Manifest) {
    let Ok(path) = cache_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(bytes) = serde_json::to_vec_pretty(m) {
        let _ = std::fs::write(&path, bytes);
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Защита от path traversal: rel приходит из remote-манифеста, который теоретически
/// мог быть модифицирован атакующим с push-доступом. Запрещаем `..`, абсолютные
/// пути и пустые/слешевые имена.
fn safe_rel(rel: &str) -> Option<PathBuf> {
    if rel.is_empty() || rel.starts_with('/') || rel.starts_with('\\') {
        return None;
    }
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        return None;
    }
    for c in p.components() {
        use std::path::Component;
        match c {
            Component::Normal(_) => {}
            _ => return None, // ParentDir (..), RootDir, CurDir, Prefix — всё запрещено
        }
    }
    Some(p)
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_hash: &str,
) -> Result<(), String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("status {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("body: {e}"))?;
    let actual = sha256_hex(&bytes);
    if actual != expected_hash {
        return Err(format!("hash mismatch: expected {expected_hash}, got {actual}"));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    // Атомарно: .download.tmp + rename, чтобы при крэше посередине не остался
    // полу-скачанный файл, на который потом наткнётся docxtemplater.
    let tmp = dest.with_extension("download.tmp");
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| format!("create tmp: {e}"))?;
        f.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
        f.sync_all().map_err(|e| format!("fsync: {e}"))?;
    }
    std::fs::rename(&tmp, dest).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

async fn sync_section(
    client: &reqwest::Client,
    section: &str,
    base_dir: &Path,
    remote: &BTreeMap<String, String>,
    cache: &BTreeMap<String, String>,
    report: &mut UpdateReport,
    new_cache: &mut BTreeMap<String, String>,
) {
    for (rel, remote_hash) in remote {
        // Безопасность: rel приходит из remote-манифеста, проверяем перед путём на диске.
        let Some(safe) = safe_rel(rel) else {
            report.failed.push(format!("{section}/{rel} (unsafe path)"));
            continue;
        };
        // Кеш совпал → файл актуален, ничего не качаем, переносим хеш в новый кеш.
        if cache.get(rel) == Some(remote_hash) && base_dir.join(&safe).exists() {
            new_cache.insert(rel.clone(), remote_hash.clone());
            continue;
        }
        let dest = base_dir.join(&safe);
        match download_file(client, &file_url(section, rel), &dest, remote_hash).await {
            Ok(()) => {
                report.updated.push(format!("{section}/{rel}"));
                new_cache.insert(rel.clone(), remote_hash.clone());
            }
            Err(e) => {
                eprintln!("[updater] {section}/{rel}: {e}");
                report.failed.push(format!("{section}/{rel}"));
            }
        }
    }

    // Удаляем файлы, которые были в прошлом кеше, но исчезли из remote-манифеста.
    // Не трогаем файлы, которые есть на диске, но не были в кеше: возможно, это
    // ручные локальные шаблоны, которые мы не должны затирать.
    for rel in cache.keys() {
        if remote.contains_key(rel) {
            continue;
        }
        let Some(safe) = safe_rel(rel) else { continue };
        let path = base_dir.join(&safe);
        if path.exists() {
            if std::fs::remove_file(&path).is_ok() {
                report.removed.push(format!("{section}/{rel}"));
            }
        }
    }
}

/// На старте: качаем manifest.json, сверяем с кешем, докачиваем изменённое,
/// удаляем то, что исчезло из манифеста.
///
/// Сетевые ошибки — НЕ ошибка команды: возвращаем пустой отчёт, чтобы фронт
/// не показывал «всё сломалось» при обычном отсутствии интернета.
#[tauri::command]
pub async fn update_templates() -> Result<UpdateReport, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(NETWORK_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let remote: Manifest = match client.get(manifest_url()).send().await {
        Ok(resp) if resp.status().is_success() => match resp.bytes().await {
            Ok(b) => match serde_json::from_slice(&b) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[updater] bad manifest json: {e}");
                    return Ok(UpdateReport::default());
                }
            },
            Err(e) => {
                eprintln!("[updater] body read: {e}");
                return Ok(UpdateReport::default());
            }
        },
        Ok(resp) => {
            eprintln!("[updater] manifest status: {}", resp.status());
            return Ok(UpdateReport::default());
        }
        Err(e) => {
            eprintln!("[updater] network: {e}");
            return Ok(UpdateReport::default());
        }
    };

    let cache = read_cache();
    let exe = exe_dir()?;
    let mut report = UpdateReport::default();
    let mut new_cache = Manifest::default();

    sync_section(
        &client,
        "templates",
        &exe.join("templates"),
        &remote.templates,
        &cache.templates,
        &mut report,
        &mut new_cache.templates,
    )
    .await;

    sync_section(
        &client,
        "dictionaries",
        &exe.join("dictionaries"),
        &remote.dictionaries,
        &cache.dictionaries,
        &mut report,
        &mut new_cache.dictionaries,
    )
    .await;

    write_cache(&new_cache);
    Ok(report)
}

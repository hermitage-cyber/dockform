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
    /// Минимальная версия приложения, на которой эти шаблоны заработают.
    /// В кеше не хранится и не участвует в сравнении хешей — только в проверке
    /// совместимости. Отсутствие поля = «совместимо с любой версией» (старые
    /// манифесты не должны блокировать обновление).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_app_version: Option<String>,
}

/// Версия приложения зашивается компилятором из Cargo.toml — второго источника
/// правды нет. `docs/release.md` требует поднимать её синхронно с package.json
/// и tauri.conf.json.
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Разбор `MAJOR.MINOR.PATCH` в кортеж. Хвост после патча (`1.2.3-beta`,
/// `1.2.3+win`) отбрасывается, лишние сегменты игнорируются. Мусор → None.
fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim();
    let core = core.split(['-', '+']).next()?;
    let mut it = core.split('.');
    let major = it.next()?.parse().ok()?;
    let minor = it.next().unwrap_or("0").parse().ok()?;
    let patch = it.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

/// Достаточно ли свежее приложение для манифеста.
///
/// Намеренно «оптимистично» при неопределённости: нет поля или в поле мусор →
/// true. Иначе одна опечатка в manifest.json заблокировала бы обновления у всех
/// пилотов разом, а это хуже, чем пропустить проверку.
fn app_is_compatible(required: Option<&str>, current: &str) -> bool {
    let Some(required) = required else { return true };
    let Some(req) = parse_version(required) else {
        eprintln!("[updater] не разобрал min_app_version: {required:?}, пропускаю проверку");
        return true;
    };
    let Some(cur) = parse_version(current) else {
        eprintln!("[updater] не разобрал версию приложения: {current:?}, пропускаю проверку");
        return true;
    };
    cur >= req
}

/// Приложение старее, чем требует манифест: шаблоны не трогаем, фронт объясняет
/// это пользователю вместо красной плашки «шаблон настроен некорректно».
#[derive(Serialize, Default, Debug)]
pub struct AppOutdated {
    pub required: String,
    pub current: String,
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
    /// Заполнено, если синхронизация отменена из-за старого .exe.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_outdated: Option<AppOutdated>,
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
    // Атомарно: <dest>.download.tmp + rename, чтобы при крэше посередине не
    // остался полу-скачанный файл, на который потом наткнётся docxtemplater.
    // ВАЖНО: добавляем суффикс к ПОЛНОМУ имени файла. `with_extension` заменяет
    // расширение целиком — file.docx и file.yaml оба превратятся в один и тот
    // же file.download.tmp и затрут друг друга при параллельной синхронизации.
    let tmp = {
        let mut name = dest
            .file_name()
            .ok_or_else(|| "no file name".to_string())?
            .to_owned();
        name.push(".download.tmp");
        dest.with_file_name(name)
    };
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

    // Шаблоны могут требовать калькуляторы/валидатор, которых в этой сборке нет.
    // Тогда синхронизация только сломала бы рабочее состояние: .yaml объявил бы
    // outputs, которых старый калькулятор не отдаёт, и форма перестала бы
    // открываться. Оставляем то, что лежит на диске, и говорим об этом фронту.
    if !app_is_compatible(remote.min_app_version.as_deref(), app_version()) {
        return Ok(UpdateReport {
            app_outdated: Some(AppOutdated {
                required: remote.min_app_version.unwrap_or_default(),
                current: app_version().to_string(),
            }),
            ..UpdateReport::default()
        });
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_semver() {
        assert_eq!(parse_version("1.0.0"), Some((1, 0, 0)));
        assert_eq!(parse_version("0.10.3"), Some((0, 10, 3)));
        assert_eq!(parse_version(" 2.4.1 "), Some((2, 4, 1)));
    }

    #[test]
    fn parses_short_and_suffixed_versions() {
        assert_eq!(parse_version("1"), Some((1, 0, 0)));
        assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_version("1.2.3-beta.1"), Some((1, 2, 3)));
        assert_eq!(parse_version("1.2.3+win"), Some((1, 2, 3)));
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("latest"), None);
        assert_eq!(parse_version("v1.0.0"), None);
        assert_eq!(parse_version("1.x.0"), None);
    }

    #[test]
    fn equal_version_is_compatible() {
        assert!(app_is_compatible(Some("1.0.0"), "1.0.0"));
    }

    #[test]
    fn newer_app_is_compatible() {
        assert!(app_is_compatible(Some("1.0.0"), "1.0.1"));
        assert!(app_is_compatible(Some("1.0.0"), "1.1.0"));
        assert!(app_is_compatible(Some("0.9.9"), "1.0.0"));
    }

    #[test]
    fn older_app_is_not_compatible() {
        assert!(!app_is_compatible(Some("1.0.0"), "0.1.0"));
        assert!(!app_is_compatible(Some("1.1.0"), "1.0.9"));
        assert!(!app_is_compatible(Some("1.0.1"), "1.0.0"));
    }

    /// Ключевой сценарий обратной совместимости: манифесты, выпущенные до
    /// появления поля, не должны блокировать обновление ни у кого.
    #[test]
    fn missing_field_means_compatible() {
        assert!(app_is_compatible(None, "0.1.0"));
    }

    /// Опечатка в manifest.json не должна класть обновления всем пилотам разом.
    #[test]
    fn garbage_field_means_compatible() {
        assert!(app_is_compatible(Some("не знаю"), "1.0.0"));
        assert!(app_is_compatible(Some(""), "1.0.0"));
        assert!(app_is_compatible(Some("v2.0.0"), "1.0.0"));
    }

    /// Кеш пишется без min_app_version — поле относится к манифесту, а не к
    /// набору файлов, и не должно всплывать при сравнении хешей.
    #[test]
    fn cache_roundtrip_ignores_min_app_version() {
        let m = Manifest {
            min_app_version: Some("1.0.0".into()),
            ..Manifest::default()
        };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("min_app_version"));

        let empty = Manifest::default();
        let json = serde_json::to_string(&empty).unwrap();
        assert!(!json.contains("min_app_version"));

        // Старый кеш без поля читается без ошибок.
        let old: Manifest = serde_json::from_str(r#"{"templates":{},"dictionaries":{}}"#).unwrap();
        assert_eq!(old.min_app_version, None);
    }
}

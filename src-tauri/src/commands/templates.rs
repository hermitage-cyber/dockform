use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
    Text,
    Textarea,
    Number,
    Radio,
    Dropdown,
    Dictionary,
    Date,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FieldConfig {
    pub name: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: FieldType,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default)]
    pub options: Option<Vec<String>>,
    #[serde(default)]
    pub visible_if: Option<String>,
    // Поля dictionary — пригодятся на этапе 5, тащим сразу, чтобы YAML не ломались.
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub display: Option<String>,
    #[serde(default)]
    pub fills: Option<BTreeMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OutputFilename {
    pub pattern: String,
    #[serde(default)]
    pub fields: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TemplateConfig {
    /// Имя файла .docx (без пути) рядом с .yaml.
    pub template: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub output_filename: OutputFilename,
    pub fields: Vec<FieldConfig>,
    /// Заполняется Rust'ом: ID шаблона (= имя yaml без расширения). На фронте используется как ключ.
    #[serde(default)]
    pub id: String,
}

/// Папка рядом с исполняемым файлом. В dev — `src-tauri/target/debug/`,
/// в проде — папка с `.exe`.
fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

#[tauri::command]
pub fn list_templates(mode: String) -> Result<Vec<TemplateConfig>, String> {
    if mode != "pretenzii" && mode != "documentation" {
        return Err(format!("unknown mode: {mode}"));
    }

    let dir = exe_dir()?.join("templates").join(&mode);
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        // Папки нет — отдаём пустой список, фронт покажет пустое состояние.
        Err(_) => return Ok(Vec::new()),
    };

    let mut templates = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("yaml") {
            continue;
        }

        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        let yaml = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[list_templates] не удалось прочитать {}: {e}", path.display());
                continue;
            }
        };

        let mut config: TemplateConfig = match serde_yaml::from_str(&yaml) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[list_templates] невалидный YAML {}: {e}", path.display());
                continue;
            }
        };

        let docx_path = dir.join(&config.template);
        if !docx_path.is_file() {
            eprintln!(
                "[list_templates] для {} не найден файл {}",
                path.display(),
                docx_path.display()
            );
            continue;
        }

        config.id = id;
        templates.push(config);
    }

    templates.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(templates)
}

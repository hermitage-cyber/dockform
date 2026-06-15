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
    Calculator,
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
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub help_text: Option<String>,
    // Поля dictionary — пригодятся на этапе 5, тащим сразу, чтобы YAML не ломались.
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub display: Option<String>,
    #[serde(default)]
    pub fills: Option<BTreeMap<String, String>>,
    // Поля calculator — этап 7. См. src/lib/calculators/.
    #[serde(default)]
    pub calculator: Option<String>,
    #[serde(default)]
    pub inputs: Option<BTreeMap<String, String>>,
    #[serde(default)]
    pub outputs: Option<BTreeMap<String, String>>,
    // text_output — этап 7.5: парная переменная-пропись для type:number.
    #[serde(default)]
    pub text_output: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OutputFilename {
    pub pattern: String,
    #[serde(default)]
    pub fields: Vec<String>,
}

/// Значение тега/ответа анкеты: строка («аукцион») или число (44). Untagged —
/// сериализуется во фронт как обычный JSON string/number.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum TagValue {
    Int(i64),
    Str(String),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WizardOption {
    pub value: TagValue,
    pub label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WizardQuestion {
    pub id: String,
    pub label: String,
    pub options: Vec<WizardOption>,
    #[serde(default)]
    pub visible_if: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WizardConfig {
    pub axes: Vec<String>,
    pub questions: Vec<WizardQuestion>,
}

/// Ответ команды list_templates: список шаблонов + анкета режима (если есть).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ListTemplatesResult {
    pub templates: Vec<TemplateConfig>,
    pub wizard: Option<WizardConfig>,
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
    /// Теги для анкеты-навигатора (этап 8). Только у шаблонов претензий.
    #[serde(default)]
    pub tags: Option<BTreeMap<String, TagValue>>,
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
pub fn list_templates(mode: String) -> Result<ListTemplatesResult, String> {
    if mode != "pretenzii" && mode != "documentation" {
        return Err(format!("unknown mode: {mode}"));
    }

    let dir = exe_dir()?.join("templates").join(&mode);
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        // Папки нет — отдаём пустой результат, фронт покажет пустое состояние.
        Err(_) => return Ok(ListTemplatesResult { templates: Vec::new(), wizard: None }),
    };

    let wizard = read_wizard(&dir);

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

        // Файлы с префиксом «_» (например, _wizard.yaml) — служебные, не шаблоны.
        if id.starts_with('_') {
            continue;
        }

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
    Ok(ListTemplatesResult { templates, wizard })
}

/// Читает анкету `_wizard.yaml` из папки режима, если файл есть. Битый YAML —
/// в лог, возвращаем None (фронт-валидатор тогда не запускает строгую проверку).
fn read_wizard(dir: &Path) -> Option<WizardConfig> {
    let path = dir.join("_wizard.yaml");
    let yaml = std::fs::read_to_string(&path).ok()?;
    match serde_yaml::from_str(&yaml) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("[list_templates] невалидный _wizard.yaml {}: {e}", path.display());
            None
        }
    }
}

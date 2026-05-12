use tauri::State;

pub struct AppMode(pub Option<String>);

#[tauri::command]
pub fn get_mode(state: State<'_, AppMode>) -> Option<String> {
    state.0.clone()
}

/// Парсит `--mode=pretenzii|documentation` из argv. Пустое/неизвестное значение → None.
pub fn parse_mode_from_argv() -> Option<String> {
    for arg in std::env::args() {
        if let Some(rest) = arg.strip_prefix("--mode=") {
            match rest {
                "pretenzii" | "documentation" => return Some(rest.to_string()),
                _ => return None,
            }
        }
    }
    None
}

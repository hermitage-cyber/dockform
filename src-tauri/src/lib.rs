mod commands;

use commands::app::{get_mode, parse_mode_from_argv, AppMode};
use commands::window::{load_window_state, save_window_state};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppMode(parse_mode_from_argv()))
        .setup(|app| {
            if let Some(state) = load_window_state() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ =
                        window.set_size(tauri::LogicalSize::new(state.width, state.height));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_mode,
            save_window_state,
            load_window_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

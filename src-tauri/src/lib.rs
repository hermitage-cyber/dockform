mod commands;

use commands::app::{get_mode, parse_mode_from_argv, AppMode};
use commands::dictionaries::list_dictionaries;
use commands::drafts::{delete_draft, ensure_drafts_dir, load_draft, save_draft};
use commands::files::{open_in_explorer, read_template, write_file};
use commands::manifest::update_templates;
use commands::network::fetch_killswitch;
use commands::templates::list_templates;
use commands::window::{load_window_state, save_window_state};
use tauri::Manager;

/// В dev-режиме исполняемый файл лежит в `src-tauri/target/debug/`,
/// а шаблоны и справочники — в корне проекта. Создаём симлинки,
/// чтобы правило «всё относительно current_exe() parent» работало
/// одинаково в dev и проде. В release-сборку этот код не попадает.
#[cfg(debug_assertions)]
fn ensure_dev_symlinks() {
    let exe_dir = match std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        Some(d) => d,
        None => return,
    };

    for name in ["templates", "dictionaries"] {
        let link = exe_dir.join(name);
        if link.exists() {
            continue;
        }
        let target: std::path::PathBuf = ["..", "..", "..", name].iter().collect();

        #[cfg(unix)]
        let result = std::os::unix::fs::symlink(&target, &link);
        #[cfg(windows)]
        let result = std::os::windows::fs::symlink_dir(&target, &link);

        if let Err(e) = result {
            eprintln!("[dev] не удалось создать симлинк {}: {e}", link.display());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    ensure_dev_symlinks();

    ensure_drafts_dir();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppMode(parse_mode_from_argv()))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(state) = load_window_state() {
                    let _ =
                        window.set_size(tauri::LogicalSize::new(state.width, state.height));
                }
                // В dev сразу открываем встроенный DevTools панелью —
                // удобнее, чем искать шорткат, и release-сборки это не затрагивает.
                #[cfg(debug_assertions)]
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_mode,
            list_templates,
            list_dictionaries,
            read_template,
            write_file,
            open_in_explorer,
            save_window_state,
            load_window_state,
            save_draft,
            load_draft,
            delete_draft,
            fetch_killswitch,
            update_templates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

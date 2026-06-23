//! Создаёт «Претензионная.lnk» и «Документация.lnk» рядом с dockform.exe.
//!
//! Проблема, которую это решает: ярлыки, созданные `make_shortcuts.ps1` на ПК
//! сборки, содержат абсолютный путь до .exe (например, `D:\dockform\dockform.exe`).
//! При копировании папки на ПК пилота путь уже другой — Windows не находит
//! целевой файл, ярлык не запускается. WScript.Shell не умеет относительных
//! путей в .lnk, обойти на уровне ярлыка нельзя.
//!
//! Решение: на каждом старте release-сборки Rust перезаписывает оба ярлыка,
//! беря текущий `current_exe()`. Кост — один маленький write на старте; цена
//! приемлемая. После перезаписи путь в .lnk всегда совпадает с реальным
//! расположением .exe.
//!
//! Гейтинг:
//! - `target_os = "windows"`: только на винде вообще имеет смысл;
//! - `not(debug_assertions)`: в `cargo tauri dev` исполняемый файл лежит
//!   в `target/debug/`, рядом с ним создавать «портабл-ярлыки» бессмысленно.

#[cfg(all(target_os = "windows", not(debug_assertions)))]
pub fn ensure_shortcuts() {
    use std::path::PathBuf;

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[shortcuts] current_exe: {e}");
            return;
        }
    };
    let Some(exe_dir) = exe.parent().map(PathBuf::from) else {
        return;
    };

    for (name, mode) in [
        ("Претензионная", "pretenzii"),
        ("Документация", "documentation"),
    ] {
        let lnk_path = exe_dir.join(format!("{name}.lnk"));
        if let Err(e) = create_one(&exe, &exe_dir, mode, &lnk_path) {
            // Не блокируем запуск приложения: ярлыки — удобство, не обязательны.
            // Чаще всего ошибка тут — .lnk занят другим процессом или AV блочит.
            eprintln!("[shortcuts] {name}.lnk: {e}");
        }
    }
}

#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn create_one(
    exe: &std::path::Path,
    exe_dir: &std::path::Path,
    mode: &str,
    lnk_path: &std::path::Path,
) -> Result<(), String> {
    use mslnk::ShellLink;

    let exe_str = exe.to_str().ok_or("exe path is not valid UTF-8")?;
    let exe_dir_str = exe_dir.to_str().ok_or("exe dir is not valid UTF-8")?;
    let lnk_str = lnk_path.to_str().ok_or("lnk path is not valid UTF-8")?;

    let mut sl = ShellLink::new(exe_str).map_err(|e| format!("ShellLink::new: {e}"))?;
    sl.set_arguments(Some(format!("--mode={mode}")));
    sl.set_working_dir(Some(exe_dir_str.to_string()));
    sl.set_icon_location(Some(format!("{exe_str},0")));
    sl.create_lnk(lnk_str)
        .map_err(|e| format!("create_lnk: {e}"))?;
    Ok(())
}

// На macOS/Linux и в dev-сборках — no-op, чтобы не плодить `cfg` в местах вызова.
#[cfg(not(all(target_os = "windows", not(debug_assertions))))]
pub fn ensure_shortcuts() {}

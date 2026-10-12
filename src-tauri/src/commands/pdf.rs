//! PDF из готового .docx через Microsoft Word на машине оператора (отзыв пилота
//! 2026-10-12): COM через PowerShell. Сам общий .docx собирает фронт
//! (`src/lib/docx-merge.ts`) — Word здесь только открывает файл и печатает в PDF.
//! Склеивать через Word (InsertFile) пробовали: на машине пилота он отказался
//! задавать вставленному разделу поля страницы.

use std::path::{Path, PathBuf};

/// Больше — значит Word завис (диалог, лицензия, повреждённый профиль).
#[cfg_attr(not(windows), allow(dead_code))]
const WORD_TIMEOUT_SECS: u64 = 120;

/// Скрипт для Word. Путь — через переменную окружения: так кириллица и пробелы
/// в пути к .exe не проходят через экранирование командной строки. Причину
/// сбоя пишет в error.txt с названием шага — по скриншоту видно, где упало.
#[cfg_attr(not(windows), allow(dead_code))]
const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
# Иначе PowerShell пишет в stderr служебный прогресс в формате CLIXML.
$ProgressPreference = 'SilentlyContinue'
$dir = $env:DOCKFORM_PDF_DIR
$errFile = Join-Path $dir 'error.txt'
function Fail([string]$msg) {
  [System.IO.File]::WriteAllText($errFile, $msg, (New-Object System.Text.UTF8Encoding $false))
}
$word = $null
$own = $false
$doc = $null
$step = 'запуск Word'
try {
  try {
    $word = New-Object -ComObject Word.Application
  } catch {
    Fail 'Microsoft Word не найден'
    exit 2
  }
  # Если Word уже был открыт у пользователя, COM может вернуть его экземпляр:
  # тогда не прячем окно и не закрываем Word в конце.
  $own = ($word.Documents.Count -eq 0)
  if ($own) { $word.Visible = $false }
  $word.DisplayAlerts = 0
  $step = 'открытие документа'
  $doc = $word.Documents.Open((Join-Path $dir 'in.docx'), $false, $true, $false)
  $step = 'сохранение PDF'
  $doc.ExportAsFixedFormat((Join-Path $dir 'out.pdf'), 17)    # wdExportFormatPDF
} catch {
  Fail ("шаг «$step»: " + $_.Exception.Message)
  exit 1
} finally {
  if ($doc) { $doc.Saved = $true; $doc.Close() }
  if ($word -and $own) { $word.Quit() }
}
"#;

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "executable has no parent".to_string())
}

/// Сохраняет `docx` как `<out_dir>/<base_name>.pdf` и возвращает путь к PDF.
/// Word работает во временной папке в `cache/` рядом с .exe с ASCII-именами;
/// готовый PDF копируется в папку пользователя.
#[tauri::command]
pub async fn export_pdf(docx: Vec<u8>, out_dir: String, base_name: String) -> Result<String, String> {
    if base_name.is_empty() || base_name.contains(['/', '\\']) || base_name.contains("..") {
        return Err("недопустимое имя файла".into());
    }
    tauri::async_runtime::spawn_blocking(move || export_blocking(&docx, &out_dir, &base_name))
        .await
        .map_err(|e| e.to_string())?
}

fn export_blocking(docx: &[u8], out_dir: &str, base_name: &str) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let work = exe_dir()?.join("cache").join("pdf").join(format!("{stamp}-{}", std::process::id()));
    std::fs::create_dir_all(&work).map_err(|e| format!("временная папка: {e}"))?;

    let result = (|| {
        std::fs::write(work.join("in.docx"), docx).map_err(|e| format!("временный файл: {e}"))?;
        run_word(&work)?;
        let dest = Path::new(out_dir).join(format!("{base_name}.pdf"));
        // copy, а не rename: папка пользователя может быть на другом диске.
        std::fs::copy(work.join("out.pdf"), &dest).map_err(|e| format!("запись PDF: {e}"))?;
        Ok(dest.to_string_lossy().into_owned())
    })();

    let _ = std::fs::remove_dir_all(&work);
    result
}

#[cfg(windows)]
fn run_word(work: &Path) -> Result<(), String> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    // -EncodedCommand, а не -File: на него не действует ExecutionPolicy,
    // которую в корпоративной сети часто зажимают групповой политикой.
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encode_command(SCRIPT)])
        .env("DOCKFORM_PDF_DIR", work)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("не удалось запустить PowerShell: {e}"))?;

    // stderr читаем в отдельном потоке, чтобы длинный текст ошибки не забил
    // буфер канала и не подвесил процесс.
    let mut stderr = child.stderr.take().expect("stderr piped");
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        String::from_utf8_lossy(&buf).trim().to_string()
    });

    let deadline = Instant::now() + Duration::from_secs(WORD_TIMEOUT_SECS);
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            return Err(format!("Word не ответил за {} секунд", WORD_TIMEOUT_SECS));
        }
        std::thread::sleep(Duration::from_millis(200));
    };
    let stderr_text = reader.join().unwrap_or_default();

    if !status.success() {
        // Причину скрипт пишет в error.txt. stderr — запасной канал: PowerShell
        // кладёт туда и служебный CLIXML, показывать его оператору бессмысленно.
        let from_file = std::fs::read_to_string(work.join("error.txt"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let reason = if !from_file.is_empty() {
            from_file
        } else if !stderr_text.is_empty() && !stderr_text.starts_with("#< CLIXML") {
            stderr_text
        } else {
            format!("Word завершился с кодом {}", status.code().unwrap_or(-1))
        };
        return Err(reason);
    }
    if !work.join("out.pdf").exists() {
        return Err("Word не создал PDF".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_word(_work: &Path) -> Result<(), String> {
    Err("доступно только в Windows с Microsoft Word".into())
}

/// Формат `-EncodedCommand`: base64 от UTF-16LE.
#[cfg_attr(not(windows), allow(dead_code))]
fn encode_command(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64(&bytes)
}

#[cfg_attr(not(windows), allow(dead_code))]
fn base64(data: &[u8]) -> String {
    const ABC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ABC[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_rfc4648_vectors() {
        for (input, expected) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
            ("fooba", "Zm9vYmE="),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(base64(input.as_bytes()), expected);
        }
    }

    #[test]
    fn encoded_command_is_utf16le() {
        // "ab" → 61 00 62 00
        assert_eq!(encode_command("ab"), "YQBiAA==");
    }
}

# Создаёт ярлыки «Претензионная.lnk» и «Документация.lnk» рядом с dockform.exe.
#
# !!! РУЧНОЙ ФОЛБЭК. В основном workflow НЕ используется. !!!
# Начиная с v0.x, dockform.exe сам создаёт оба ярлыка при первом запуске
# (src-tauri/src/commands/shortcuts.rs). Этот PS-скрипт остался на случай,
# если у пилота WebView2 / антивирус мешают запустить .exe — администратор
# может прийти к нему на машину и сгенерировать ярлыки руками.
#
# Запускать на Windows из папки портабла, либо с параметром -PortableDir.
#
# Пример:
#   powershell -ExecutionPolicy Bypass -File scripts\make_shortcuts.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\make_shortcuts.ps1 -PortableDir D:\dockform

[CmdletBinding()]
param(
    [string]$PortableDir = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$PortableDir = (Resolve-Path $PortableDir).Path
$exe = Join-Path $PortableDir "dockform.exe"
if (-not (Test-Path $exe)) {
    throw "Не найден $exe. Запустите скрипт из папки портабла или передайте -PortableDir."
}

$shell = New-Object -ComObject WScript.Shell

function New-DockformShortcut {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$Mode
    )
    $lnkPath = Join-Path $PortableDir "$Name.lnk"
    $sc = $shell.CreateShortcut($lnkPath)
    $sc.TargetPath       = $exe
    $sc.Arguments        = "--mode=$Mode"
    $sc.WorkingDirectory = $PortableDir
    $sc.IconLocation     = "$exe,0"
    $sc.Description      = "Dockform — $Name"
    $sc.Save()
    Write-Host "Создан ярлык: $lnkPath"
}

New-DockformShortcut -Name "Претензионная"  -Mode "pretenzii"
New-DockformShortcut -Name "Документация"   -Mode "documentation"

<#
.SYNOPSIS
    Собирает папку портабла dockform/ из репозитория.

.DESCRIPTION
    Заменяет ручной шаг 6 из docs/release.md. Кладёт готовую структуру (.exe,
    templates/, dictionaries/, пустые cache/ и output/, README.txt) в
    versions/<версия>/dockform/ рядом с репозиторием. Ярлыки .lnk не создаёт —
    от них отказались в v1.0.0.

    Папка versions/ лежит РЯДОМ с репозиторием, а не внутри: сборки не
    перемешиваются с исходниками и переживают git reset --hard на build-машине.
    Раскладка накопительная — прошлые версии остаются, можно откатиться на
    предыдущую раздачу:

        versions/
        ├── 1.1.0/
        │   ├── dockform/              ← папка ровно в том виде, как раздаём
        │   └── dockform_1.1.0.zip
        └── 1.0.0/ …

    Из templates/ и dictionaries/ исключается то же, что игнорирует
    scripts/build_manifest.py: папка old/ (архив старых редакций), файлы .md
    (заметки разработчика), временные ~$-блокировки Word и скрытые файлы.
    Иначе пилот получил бы десяток архивных .docx и служебную разметку.

    Перед сборкой сверяет версию .exe с package.json и останавливается при
    расхождении — это защита от сборки без git pull (типовая ошибка: собрали
    0.1.0, когда в репозитории уже 1.0.0).

.PARAMETER OutDir
    Корень для версий. По умолчанию versions/ рядом с репозиторием.
    Внутри создаётся подпапка с номером версии.

.PARAMETER Zip
    Дополнительно упаковать в dockform_<версия>.zip рядом с папкой.

.PARAMETER Build
    Сначала выполнить npm run tauri build.

.EXAMPLE
    .\scripts\build_portable.ps1
    .\scripts\build_portable.ps1 -Build -Zip
    .\scripts\build_portable.ps1 -Build -Zip -OutDir D:\раздача
#>
[CmdletBinding()]
param(
    [string]$OutDir,
    [switch]$Zip,
    [switch]$Build
)

$ErrorActionPreference = "Stop"

# Корень репозитория — родитель папки scripts/, где лежит этот файл.
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# Рядом с репозиторием, не внутри: сборки не мешаются с исходниками и не
# сносятся вместе с рабочей копией.
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $RepoRoot) "versions" }

function Fail($msg) {
    Write-Host ""
    Write-Host "ОШИБКА: $msg" -ForegroundColor Red
    exit 1
}

function Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }

# ─────────── Версия из package.json ───────────

$pkgPath = Join-Path $RepoRoot "package.json"
if (-not (Test-Path $pkgPath)) { Fail "не найден package.json — запускай скрипт из репозитория." }
$Version = (Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (-not $Version) { Fail "в package.json нет поля version." }
Info "Версия по package.json: $Version"

# ─────────── Сборка (опционально) ───────────

if ($Build) {
    Info "Запускаю npm run tauri build..."
    Push-Location $RepoRoot
    try {
        & npm run tauri build
        if ($LASTEXITCODE -ne 0) { Fail "npm run tauri build завершился с кодом $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}

# ─────────── Проверка .exe ───────────

$ExePath = Join-Path $RepoRoot "src-tauri\target\release\dockform.exe"
if (-not (Test-Path $ExePath)) {
    Fail "не найден $ExePath. Сначала собери: npm run tauri build (или запусти скрипт с -Build)."
}

# Tauri пишет версию в ресурсы .exe. Сверяем с package.json: если собирали до
# git pull, здесь будет старый номер, и раздача уедет не той сборкой.
$ExeVersion = (Get-Item $ExePath).VersionInfo.FileVersion
if ($ExeVersion) {
    $norm = { param($v) ($v.Trim() -split '[.,]')[0..2] -join '.' }
    $a = & $norm $ExeVersion
    $b = & $norm $Version
    if ($a -ne $b) {
        Fail @"
версия .exe ($a) не совпадает с package.json ($b).

Скорее всего сборка сделана до git pull. Выполни:
    git pull
    npm install
    npm run tauri build
"@
    }
    Ok ".exe версии $a — совпадает с package.json"
} else {
    Write-Host "  ВНИМАНИЕ: не удалось прочитать версию из .exe, пропускаю сверку." -ForegroundColor Yellow
}

$exeAge = (Get-Date) - (Get-Item $ExePath).LastWriteTime
if ($exeAge.TotalHours -gt 24) {
    Write-Host ("  ВНИМАНИЕ: .exe собран {0:N0} ч назад — точно свежий?" -f $exeAge.TotalHours) -ForegroundColor Yellow
}

# ─────────── Проверка манифеста ───────────

# Манифест обязан быть новее шаблонов, иначе у пилотов не сработает обновление.
$manifestPath = Join-Path $RepoRoot "manifest.json"
if (Test-Path $manifestPath) {
    $manifestTime = (Get-Item $manifestPath).LastWriteTime
    $newer = Get-ChildItem (Join-Path $RepoRoot "templates"), (Join-Path $RepoRoot "dictionaries") -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\old\\' -and $_.Extension -ne '.md' -and $_.LastWriteTime -gt $manifestTime }
    if ($newer) {
        Write-Host "  ВНИМАНИЕ: шаблоны новее manifest.json. Выполни: python3 scripts/build_manifest.py" -ForegroundColor Yellow
    }
}

# ─────────── Сборка папки ───────────

# Каждая версия в своей подпапке: прошлые раздачи остаются на диске.
$VersionDir = Join-Path $OutDir $Version
$Dest = Join-Path $VersionDir "dockform"
if (Test-Path $Dest) {
    # Чистим только текущую версию — соседние не трогаем.
    Info "Пересобираю версию $Version, очищаю $Dest"
    Remove-Item $Dest -Recurse -Force
}
New-Item -ItemType Directory -Path $Dest -Force | Out-Null

Info "Собираю $Dest"

Copy-Item $ExePath (Join-Path $Dest "dockform.exe")
Ok "dockform.exe"

# Те же исключения, что в scripts/build_manifest.py — списки должны сходиться,
# иначе на диске у пилота окажутся файлы, которых нет в манифесте.
function Copy-Assets($name) {
    $srcRoot = Join-Path $RepoRoot $name
    if (-not (Test-Path $srcRoot)) { Fail "не найдена папка $name/." }
    $prefix = $srcRoot.TrimEnd('\') + '\'
    $count = 0
    foreach ($f in Get-ChildItem $srcRoot -Recurse -File -Force) {
        $rel = $f.FullName.Substring($prefix.Length)
        $parts = $rel -split '\\'
        if ($parts -contains 'old') { continue }
        if ($f.Extension -eq '.md') { continue }
        if ($parts | Where-Object { $_.StartsWith('~$') -or $_.StartsWith('.') }) { continue }

        $target = Join-Path (Join-Path $Dest $name) $rel
        $targetDir = Split-Path -Parent $target
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Copy-Item $f.FullName $target
        $count++
    }
    Ok "$name/ — $count файлов"
    return $count
}

$nTemplates = Copy-Assets "templates"
$nDicts = Copy-Assets "dictionaries"

# Пустые рабочие папки: приложение создаёт их само, но пилоту спокойнее,
# когда output/ уже есть и видно, куда складываются документы.
New-Item -ItemType Directory -Path (Join-Path $Dest "cache") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Dest "output") -Force | Out-Null
Ok "cache/ и output/ (пустые)"

$readmeSrc = Join-Path $RepoRoot "docs\portable-README.txt"
if (-not (Test-Path $readmeSrc)) { Fail "не найден docs\portable-README.txt." }
Copy-Item $readmeSrc (Join-Path $Dest "README.txt")
Ok "README.txt"

# ─────────── Итог ───────────

$size = (Get-ChildItem $Dest -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Info ("Готово: {0}  ({1:N1} МБ, шаблонов {2}, справочников {3})" -f $Dest, ($size / 1MB), $nTemplates, $nDicts)

if ($Zip) {
    $zipPath = Join-Path $VersionDir ("dockform_{0}.zip" -f $Version)
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path $Dest -DestinationPath $zipPath
    $zipSize = (Get-Item $zipPath).Length
    Info ("Архив:  {0}  ({1:N1} МБ)" -f $zipPath, ($zipSize / 1MB))
}

Write-Host ""
Write-Host "Дальше: проверь запуск .exe из собранной папки, потом раздавай (docs/release.md, шаг 8)."

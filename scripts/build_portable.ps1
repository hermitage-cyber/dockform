<#
.SYNOPSIS
    Полный цикл сборки портабла: обновление, сборка, готовая папка, архив.

.DESCRIPTION
    Один запуск делает всё, что нужно для раздачи:

      1. git pull + npm install (см. «Про lock-файлы» ниже);
      2. npm run tauri build;
      3. сверка версии .exe с package.json;
      4. сборка папки dockform/ с templates/, dictionaries/, cache/, output/;
      5. упаковка в zip.

    Результат — в versions/<версия>/ РЯДОМ с репозиторием, накопительно:

        versions/
        ├── 1.1.0/
        │   ├── dockform/              ← папка ровно в том виде, как раздаём
        │   └── dockform_1.1.0.zip
        └── 1.0.0/ …

    Прошлые версии не удаляются — можно откатить пилота на предыдущую раздачу.
    Папка лежит вне репозитория намеренно: сборки не мешаются с исходниками,
    не попадают в git status и переживают git reset --hard.

    Ярлыки .lnk не создаются — от них отказались в v1.0.0.

    Из templates/ и dictionaries/ исключается то же, что игнорирует
    scripts/build_manifest.py: папка old/, файлы .md, временные ~$-блокировки
    Word и скрытые файлы. Списки обязаны совпадать, иначе у пилота на диске
    окажутся файлы, которых нет в манифесте.

    ПРО LOCK-ФАЙЛЫ. Сборка каждый раз переписывает src-tauri/Cargo.lock (а npm —
    package-lock.json), из-за чего git pull падает с «local changes would be
    overwritten». На build-машине своего в этих файлах нет, поэтому перед pull
    скрипт откатывает их к репозиторию. Если изменено что-то ЕЩЁ — pull
    останавливается и скрипт скажет, что именно мешает: молча затирать чужую
    работу он не станет.

.PARAMETER OutDir
    Корень для версий. По умолчанию versions/ рядом с репозиторием.

.PARAMETER NoUpdate
    Пропустить git pull и npm install (собрать из того, что уже лежит).

.PARAMETER NoBuild
    Не пересобирать .exe, взять готовый из src-tauri/target/release/.

.PARAMETER NoZip
    Не паковать архив, оставить только папку.

.EXAMPLE
    .\scripts\build_portable.ps1
    .\scripts\build_portable.ps1 -NoUpdate -NoBuild
    .\scripts\build_portable.ps1 -OutDir D:\раздача
#>
[CmdletBinding()]
param(
    [string]$OutDir,
    [switch]$NoUpdate,
    [switch]$NoBuild,
    [switch]$NoZip
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# Рядом с репозиторием, не внутри.
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $RepoRoot) "versions" }

function Fail($msg) {
    Write-Host ""
    Write-Host "ОШИБКА: $msg" -ForegroundColor Red
    exit 1
}
function Info($msg) { Write-Host ""; Write-Host $msg -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  ВНИМАНИЕ: $msg" -ForegroundColor Yellow }

# Внешние команды пишут прогресс в stderr, а при $ErrorActionPreference = Stop
# PowerShell 5.1 принимает это за фатальную ошибку. Поэтому вызываем их с
# временно ослабленной политикой и смотрим на код возврата, а не на stderr.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments, [string]$What)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Exe @Arguments 2>&1 | ForEach-Object { Write-Host "    $_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    if ($code -ne 0) { Fail "$What — код возврата $code." }
}

# ─────────── Шаг 1. Обновление ───────────

if (-not $NoUpdate) {
    Info "Обновляю репозиторий"

    # Lock-файлы переписывает сборка, своего в них на build-машине нет.
    foreach ($lock in @("src-tauri/Cargo.lock", "package-lock.json")) {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & git -C $RepoRoot checkout -- $lock 2>&1 | Out-Null
        $ErrorActionPreference = $prev
    }

    # Всё, что осталось изменённым, — не наше дело: не затираем, а показываем.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $dirty = & git -C $RepoRoot status --porcelain 2>&1
    $ErrorActionPreference = $prev
    if ($dirty) {
        Write-Host ""
        Write-Host "В рабочей копии есть незакоммиченные изменения:" -ForegroundColor Yellow
        $dirty | ForEach-Object { Write-Host "    $_" }
        Fail @"
git pull их затрёт, поэтому останавливаюсь.

Если правки не нужны (обычный случай на build-машине):
    git -C "$RepoRoot" reset --hard origin/main

Если нужны — сохрани их, потом запусти скрипт снова.
Собрать без обновления: -NoUpdate
"@
    }

    # --ff-only: на build-машине не должно возникать merge-коммитов.
    Invoke-Native "git" @("-C", $RepoRoot, "pull", "--ff-only") "git pull"
    Ok "репозиторий обновлён"

    Info "Ставлю зависимости (npm install)"
    Push-Location $RepoRoot
    try { Invoke-Native "npm" @("install") "npm install" } finally { Pop-Location }
    Ok "зависимости на месте"
}

# ─────────── Шаг 2. Версия ───────────
# Читаем ПОСЛЕ pull: версия могла подняться в только что подтянутых коммитах.

$pkgPath = Join-Path $RepoRoot "package.json"
if (-not (Test-Path $pkgPath)) { Fail "не найден package.json — скрипт запущен не из репозитория." }
$Version = (Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (-not $Version) { Fail "в package.json нет поля version." }
Info "Версия по package.json: $Version"

# ─────────── Шаг 3. Сборка ───────────

if (-not $NoBuild) {
    Info "Собираю приложение (npm run tauri build) — это 3–10 минут"
    Push-Location $RepoRoot
    try { Invoke-Native "npm" @("run", "tauri", "build") "npm run tauri build" } finally { Pop-Location }
}

$ExePath = Join-Path $RepoRoot "src-tauri\target\release\dockform.exe"
if (-not (Test-Path $ExePath)) {
    Fail "не найден $ExePath. Убери -NoBuild, чтобы скрипт собрал приложение сам."
}

# Tauri пишет версию в ресурсы .exe. Расхождение = собрано не из этого кода.
$ExeVersion = (Get-Item $ExePath).VersionInfo.FileVersion
if ($ExeVersion) {
    $norm = { param($v) ($v.Trim() -split '[.,]')[0..2] -join '.' }
    $a = & $norm $ExeVersion
    $b = & $norm $Version
    if ($a -ne $b) {
        Fail @"
версия .exe ($a) не совпадает с package.json ($b).

Похоже, .exe собран из старого кода. Запусти скрипт без -NoBuild.
"@
    }
    Ok ".exe версии $a — совпадает с package.json"
} else {
    Warn "не удалось прочитать версию из .exe, пропускаю сверку."
}

$exeAge = (Get-Date) - (Get-Item $ExePath).LastWriteTime
if ($exeAge.TotalHours -gt 24) {
    Warn ("{0:N0} ч назад собран .exe — точно свежий?" -f $exeAge.TotalHours)
}

# ─────────── Шаг 4. Проверка манифеста ───────────

# Манифест обязан быть новее шаблонов, иначе у пилотов не сработает обновление.
$manifestPath = Join-Path $RepoRoot "manifest.json"
if (Test-Path $manifestPath) {
    $manifestTime = (Get-Item $manifestPath).LastWriteTime
    $newer = Get-ChildItem (Join-Path $RepoRoot "templates"), (Join-Path $RepoRoot "dictionaries") -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\old\\' -and $_.Extension -ne '.md' -and $_.LastWriteTime -gt $manifestTime }
    if ($newer) {
        Warn "шаблоны новее manifest.json. Выполни: python3 scripts/build_manifest.py"
    }
}

# ─────────── Шаг 5. Папка ───────────

$VersionDir = Join-Path $OutDir $Version
$Dest = Join-Path $VersionDir "dockform"
if (Test-Path $Dest) {
    Info "Пересобираю версию $Version, очищаю $Dest"
    Remove-Item $Dest -Recurse -Force   # только текущая версия, соседние не трогаем
}
New-Item -ItemType Directory -Path $Dest -Force | Out-Null

Info "Собираю $Dest"

Copy-Item $ExePath (Join-Path $Dest "dockform.exe")
Ok "dockform.exe"

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

# Приложение создаёт их само, но пилоту спокойнее, когда output/ уже есть.
New-Item -ItemType Directory -Path (Join-Path $Dest "cache") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Dest "output") -Force | Out-Null
Ok "cache/ и output/ (пустые)"

# README в папку НЕ кладём — решение от 2026-08-31. Инструкция для конечного
# пользователя осталась в docs/portable-README.txt, но пилотам она отдаётся
# отдельно, а не файлом рядом с .exe.

# ─────────── Шаг 6. Архив и итог ───────────

$size = (Get-ChildItem $Dest -Recurse -File | Measure-Object -Property Length -Sum).Sum
Info ("Готово: {0}  ({1:N1} МБ, шаблонов {2}, справочников {3})" -f $Dest, ($size / 1MB), $nTemplates, $nDicts)

if (-not $NoZip) {
    $zipPath = Join-Path $VersionDir ("dockform_{0}.zip" -f $Version)
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path $Dest -DestinationPath $zipPath
    Info ("Архив:  {0}  ({1:N1} МБ)" -f $zipPath, ((Get-Item $zipPath).Length / 1MB))
}

Write-Host ""
Write-Host "Дальше: запусти .exe из собранной папки и проверь, потом раздавай (docs/release.md, шаг 8)."

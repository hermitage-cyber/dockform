@echo off
rem Sborka portabla v odin klik. Vsyu rabotu delaet scripts\build_portable.ps1.
rem Fayl namerenno bez kirillicy: cmd chitaet .cmd v kodirovke konsoli,
rem i russkiy tekst zdes prevratilsya by v krakozyabry.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_portable.ps1" %*
echo.
pause

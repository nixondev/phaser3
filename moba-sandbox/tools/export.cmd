@echo off
rem Build the Windows game: builds\windows\MOBA Sandbox.exe (one file, game
rem packed inside) plus builds\MOBA-Sandbox-windows-v1.0.N.zip ready to send — no play
rem log in it — and builds\windows-playtest\ (the same with the play log switch).
rem Every run makes a NEW numbered pair of zips, kept for posterity (old ones
rem are deleted by hand): version VERSION.N, N = one past the highest already
rem in builds\. Raise VERSION by hand when it's time (e.g. 1.1).
rem Needs Godot 4.7.2's export templates installed (Editor -> Manage Export
rem Templates). Set GODOT to your Godot executable if it isn't the Steam install.
setlocal
if "%GODOT%"=="" set "GODOT=C:\Program Files (x86)\Steam\steamapps\common\Godot Engine\godot.windows.opt.tools.64.exe"
cd /d "%~dp0.."
set "VERSION=1.0"
set /a N=1
:nextv
if exist "builds\MOBA-Sandbox-windows-v%VERSION%.%N%.zip" ( set /a N+=1 & goto nextv )
if exist "builds\MOBA-Sandbox-playtest-v%VERSION%.%N%.zip" ( set /a N+=1 & goto nextv )
set "V=%VERSION%.%N%"
rem the game knows its own version (play logs record it)
> scripts\build_version.gd (
  echo extends RefCounted
  echo ## The build's version - tools/export.cmd rewrites this file on every build.
  echo const VERSION := "%V%"
)
if not exist builds\windows mkdir builds\windows
"%GODOT%" --headless --path . --export-release "Windows Desktop" "builds/windows/MOBA Sandbox.exe"
if errorlevel 1 exit /b 1
copy /y tools\HOW_TO_PLAY.txt builds\windows\ >nul
powershell -NoProfile -Command "Compress-Archive -Force -Path 'builds/windows/*' -DestinationPath 'builds/MOBA-Sandbox-windows-v%V%.zip'"
echo Built builds\MOBA-Sandbox-windows-v%V%.zip
rem The playtest build: same game plus the play log switch (feature "playlog").
if not exist builds\windows-playtest mkdir builds\windows-playtest
"%GODOT%" --headless --path . --export-release "Windows Playtest" "builds/windows-playtest/MOBA Sandbox (playtest).exe"
if errorlevel 1 exit /b 1
copy /y tools\HOW_TO_PLAY.txt builds\windows-playtest\ >nul
copy /y tools\PLAYTEST_README.txt builds\windows-playtest\ >nul
powershell -NoProfile -Command "Compress-Archive -Force -Path 'builds/windows-playtest/*.exe','builds/windows-playtest/*.txt' -DestinationPath 'builds/MOBA-Sandbox-playtest-v%V%.zip'"
echo Built builds\MOBA-Sandbox-playtest-v%V%.zip (with the play log switch)

@echo off
rem Autoplay: bot-vs-bot full roguelite runs, headless. Options pass through:
rem   tools\autoplay.cmd --runs 10 --policy greedy --hero cycle --seed 42
rem Add --playlog for full play logs (both bots' decisions), then read them with
rem   python tools\analyze_log.py --dir autoplay --list
rem Set GODOT to your Godot executable if it isn't the Steam install.
setlocal
if "%GODOT%"=="" set "GODOT=C:\Program Files (x86)\Steam\steamapps\common\Godot Engine\godot.windows.opt.tools.64.exe"
cd /d "%~dp0.."
"%GODOT%" --headless --fixed-fps 60 --path . --script res://tools/autoplay.gd -- %*

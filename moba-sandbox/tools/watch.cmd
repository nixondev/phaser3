@echo off
rem Watch a bot-vs-bot match in a window, at normal speed — the same runner as
rem autoplay.cmd without --headless (so it draws) and without --fixed-fps (so
rem it plays in real time instead of flat out). Every autoplay option works:
rem   tools\watch.cmd --hero 0 --red-hero 2
rem   tools\watch.cmd --hero 0 --red-hero 2 --playlog
rem The camera starts locked to the blue bot and follows it. Y unlocks for a
rem free camera (edge-pan, arrows, Space to snap back); Y again re-locks.
rem It keeps going run after run, cycling KYLE / CHAD / KAREN / BECKY (--hero
rem cycle is the default); pass --hero 0 to watch one hero over and over.
rem Close the window to stop it.
rem
rem This view has no run screens — autoplay drives the rounds, so they run back
rem to back and the shop happens in code. For the full game with a bot in your
rem seat (shop, round-over screen, pause), use the hero-pick screen's
rem "Watch bots" toggle instead; it's a dev-only button and never ships.
setlocal
if "%GODOT%"=="" set "GODOT=C:\Program Files (x86)\Steam\steamapps\common\Godot Engine\godot.windows.opt.tools.64.exe"
cd /d "%~dp0.."
rem --max-rounds 99 so a run ends by losing rather than capping at autoplay's 10.
"%GODOT%" --path . --script res://tools/autoplay.gd -- --runs 999 --max-rounds 99 %*

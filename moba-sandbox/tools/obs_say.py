# -*- coding: utf-8 -*-
"""Push live commentary onto the OBS overlay while the bots play.

    python tools/obs_say.py "blue is frozen in the wave again"
    python tools/obs_say.py --list                 # what sources exist
    python tools/obs_say.py --source "Caster" "..."

Reads the connection details straight out of OBS's own obs-websocket config,
so there is nothing to configure and no password to keep anywhere: the plugin
already wrote one, and it is the only copy.

Protocol is obs-websocket v5: Hello (op 0) carries a salt + challenge, we
answer with Identify (op 1) holding base64(sha256(base64(sha256(pw+salt)) +
challenge)), OBS replies Identified (op 2), then requests are op 6 and their
results op 7. Ported from the NGS casting kit's panel/obs.js, which does the
same handshake in the browser.
"""
import argparse
import asyncio
import io
import base64
import hashlib
import json
import os
import sys

CONFIG = os.path.join(os.environ.get("APPDATA", ""), "obs-studio",
                      "plugin_config", "obs-websocket", "config.json")
DEFAULT_SOURCE = "Claude"


def settings():
    with open(CONFIG, encoding="utf-8") as fh:
        c = json.load(fh)
    if not c.get("server_enabled"):
        sys.exit("obs-websocket is installed but not enabled "
                 "(OBS -> Tools -> WebSocket Server Settings -> Enable).")
    return int(c.get("server_port", 4455)), str(c.get("server_password", "") or "")


def auth(password, salt, challenge):
    first = base64.b64encode(hashlib.sha256((password + salt).encode()).digest()).decode()
    return base64.b64encode(hashlib.sha256((first + challenge).encode()).digest()).decode()


async def session(do):
    import websockets
    port, password = settings()
    url = "ws://127.0.0.1:%d" % port
    async with websockets.connect(url, max_size=None) as ws:
        hello = json.loads(await ws.recv())
        ident = {"rpcVersion": 1}
        a = hello.get("d", {}).get("authentication")
        if a:
            ident["authentication"] = auth(password, a["salt"], a["challenge"])
        await ws.send(json.dumps({"op": 1, "d": ident}))
        while json.loads(await ws.recv()).get("op") != 2:
            pass  # anything before Identified is not ours

        async def req(kind, data=None):
            rid = "claude-1"
            await ws.send(json.dumps({"op": 6, "d": {
                "requestType": kind, "requestId": rid, "requestData": data or {}}}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("op") == 7 and m["d"].get("requestId") == rid:
                    return m["d"]

        return await do(req)


async def list_inputs(req):
    scenes = await req("GetSceneList")
    cur = scenes["responseData"].get("currentProgramSceneName")
    print("current scene: %s" % cur)
    print("scenes: %s" % ", ".join(s["sceneName"] for s in scenes["responseData"]["scenes"]))
    inputs = await req("GetInputList")
    print("\ninputs:")
    for i in inputs["responseData"]["inputs"]:
        print("  %-34s %s" % (i["inputName"], i["inputKind"]))
    return None


## Make the caster bar if it is not there yet: a wide text source pinned low
## and centred, white on a translucent slab so it reads over any lane colour.
## Idempotent — run it as often as you like.
async def ensure_source(req, name):
    scene = (await req("GetSceneList"))["responseData"]["currentProgramSceneName"]
    have = [i["inputName"] for i in (await req("GetInputList"))["responseData"]["inputs"]]
    settings = {
        "text": "",
        "font": {"face": "Segoe UI", "size": 36, "style": "Regular"},
        "color1": 0xFFFFFFFF, "color2": 0xFFFFFFFF,
        "outline": True, "outline_size": 3, "outline_color": 0xFF000000,
        "bk_color": 0xFF000000, "bk_opacity": 60,
        "align": "center", "extents": True, "extents_cx": 1700, "extents_cy": 120,
        "extents_wrap": True, "word_wrap": True,
    }
    if name in have:
        await req("SetInputSettings", {"inputName": name, "inputSettings": settings})
        print("updated existing source %r" % name)
    else:
        await req("CreateInput", {"sceneName": scene, "inputName": name,
                                  "inputKind": "text_gdiplus_v3", "inputSettings": settings})
        print("created %r in scene %r" % (name, scene))
    items = (await req("GetSceneItemList", {"sceneName": scene}))["responseData"]["sceneItems"]
    sid = next((i["sceneItemId"] for i in items if i["sourceName"] == name), None)
    if sid is not None:
        # 110 px off the bottom of a 1080 canvas: clear of the game's own HUD.
        await req("SetSceneItemTransform", {"sceneName": scene, "sceneItemId": sid,
            "sceneItemTransform": {"positionX": 960.0, "positionY": 950.0,
                                   "alignment": 0}})
        print("positioned at the bottom centre")
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("text", nargs="?", help="the line to show, or - to read it from stdin")
    p.add_argument("--source", default=DEFAULT_SOURCE, help="OBS text source (default: %s)" % DEFAULT_SOURCE)
    p.add_argument("--list", action="store_true", help="list scenes and inputs, then exit")
    p.add_argument("--setup", action="store_true", help="create the caster bar in the current scene")
    a = p.parse_args()

    if a.list:
        asyncio.run(session(list_inputs))
        return
    if a.setup:
        asyncio.run(session(lambda req: ensure_source(req, a.source)))
        return
    if a.text is None:
        p.error("give a line to show, or --setup, or --list")

    # Windows mangles non-ASCII in argv (an em-dash arrived as U+FFFD and was
    # stored that way in OBS), so anything with punctuation beyond ASCII comes
    # in on stdin, which is bytes we decode ourselves.
    text = a.text
    if text == "-":
        text = io.open(sys.stdin.fileno(), encoding="utf-8", errors="replace").read().strip()

    async def do(req):
        # `read_from_file` off with the text: a source left reading a file
        # ignores a text write and fails silently (NGS obs.js, same trap).
        r = await req("SetInputSettings", {
            "inputName": a.source,
            "inputSettings": {"read_from_file": False, "text": text},
        })
        if not r.get("requestStatus", {}).get("result"):
            c = r.get("requestStatus", {})
            sys.exit("OBS refused: %s %s (is there a text source named %r?)"
                     % (c.get("code"), c.get("comment", ""), a.source))
        print("said: %s" % text.encode("ascii", "replace").decode())

    asyncio.run(session(do))


if __name__ == "__main__":
    main()

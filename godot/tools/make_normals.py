#!/usr/bin/env python3
"""
Style experiment: derive a normal map for each tile sheet in godot/art/tilesets/.

    python godot/tools/make_normals.py [strength]

Writes <sheet>_n.png next to each sheet — NEVER modifies the source PNGs, and
refuses derived inputs (_n) so normals can't stack. Height = luminance x alpha,
so bright pixels read as raised; gradients are computed per 64px tile with
edge clamping, so neighbouring tiles in the atlas never bleed into each other.
Output is OpenGL / Y+ convention (green = up), which Godot's 2D lights expect.

A stand-in for the real thing: shade.mjs already builds a proper per-frame
height field (silhouette domes + outlines) and could export normals from it.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TILE = 64
SHEETS = Path(__file__).resolve().parent.parent / "art" / "tilesets"
strength = float(sys.argv[1]) if len(sys.argv) > 1 else 2.5

for src in sorted(SHEETS.glob("*.png")):
    if src.stem.endswith("_n") or src.stem.endswith("-colors"):
        continue  # derived file, or flat colour swatches (nothing to emboss)
    rgba = np.asarray(Image.open(src).convert("RGBA"), dtype=np.float32) / 255.0
    h, w = rgba.shape[:2]
    lum = rgba[..., 0] * 0.299 + rgba[..., 1] * 0.587 + rgba[..., 2] * 0.114
    height = lum * rgba[..., 3]

    nx = np.zeros((h, w), np.float32)
    ny = np.zeros((h, w), np.float32)
    for ty in range(0, h, TILE):
        for tx in range(0, w, TILE):
            cell = np.pad(height[ty:ty + TILE, tx:tx + TILE], 1, mode="edge")
            # Sobel, per tile
            dx = (cell[:-2, 2:] + 2 * cell[1:-1, 2:] + cell[2:, 2:]
                  - cell[:-2, :-2] - 2 * cell[1:-1, :-2] - cell[2:, :-2]) / 8
            dy = (cell[2:, :-2] + 2 * cell[2:, 1:-1] + cell[2:, 2:]
                  - cell[:-2, :-2] - 2 * cell[:-2, 1:-1] - cell[:-2, 2:]) / 8
            nx[ty:ty + TILE, tx:tx + TILE] = -dx * strength * 8
            ny[ty:ty + TILE, tx:tx + TILE] = dy * strength * 8  # screen y is down; Y+ normal is up

    nz = np.ones_like(nx)
    length = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    normal = np.stack([nx / length, ny / length, nz / length], axis=-1) * 0.5 + 0.5
    out = np.dstack([normal, rgba[..., 3:4]])
    dst = src.with_name(src.stem + "_n.png")
    Image.fromarray((out * 255).round().astype(np.uint8), "RGBA").save(dst)
    print(f"[normals] {src.name} -> {dst.name} (strength {strength})")

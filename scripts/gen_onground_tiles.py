"""
Generate OnGround overlay tiles 97-104.

These sit on the OnGround tilemap layer (depth 0.3) and are dimmed by
onGroundAlpha (default 0.2), so per-pixel alpha is kept high (160-220)
and transparency comes from coverage — most pixels are fully transparent,
only the drawn marks carry alpha.

Tile catalogue:
  97  grit scatter         — tileable repeater, toroidal RNG
  98  crack network        — accent, branching hairline cracks
  99  puddle sheen         — accent, muted blue-grey translucent blob
  100 diagonal grime       — semi-tileable, faint diagonal scratches
  101 corner vignette      — tileable repeater, darkens edges/corners
  102 crosshatch grid      — tileable repeater, perfectly modular
  103 scuff arcs           — accent, curved drag marks
  104 organic stain        — accent, irregular dark blotch
"""

import os
import math
import random
from PIL import Image

SIZE = 64
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets_src', 'tiles')


def blank():
    return Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))


def save(idx, img):
    path = os.path.join(OUT, f'tile_{idx}.png')
    img.save(path)
    print(f'  tile_{idx}.png')


# ---------------------------------------------------------------------------
# 97 — grit scatter (tileable)
# Sparse dark pixel clusters placed on a toroidal grid so wrapping is seamless.
# ---------------------------------------------------------------------------
def make_97():
    img = blank()
    px = img.load()
    rng = random.Random(97)

    # Place N small grit clusters; each cluster wraps at tile boundaries.
    n_clusters = 28
    for _ in range(n_clusters):
        cx = rng.randint(0, SIZE - 1)
        cy = rng.randint(0, SIZE - 1)
        size = rng.choice([1, 1, 1, 2])
        alpha = rng.randint(140, 210)
        dark = rng.randint(12, 28)
        for dy in range(-size, size + 1):
            for dx in range(-size, size + 1):
                if abs(dx) + abs(dy) <= size:
                    x = (cx + dx) % SIZE
                    y = (cy + dy) % SIZE
                    a = alpha if (dx == 0 and dy == 0) else int(alpha * 0.5)
                    px[x, y] = (dark, int(dark * 0.9), int(dark * 0.75), a)

    return img


# ---------------------------------------------------------------------------
# 98 — crack network (accent)
# Several branching random-walk cracks.
# ---------------------------------------------------------------------------
def make_98():
    img = blank()
    px = img.load()
    arr = [[0.0] * SIZE for _ in range(SIZE)]
    rng = random.Random(98)

    def walk(x, y, length, dx, dy):
        for _ in range(length):
            if 0 <= x < SIZE and 0 <= y < SIZE:
                arr[y][x] = 1.0
                # thin hairline border
                for bdy in (-1, 1):
                    nx, ny = x, y + bdy
                    if 0 <= nx < SIZE and 0 <= ny < SIZE:
                        arr[ny][nx] = max(arr[ny][nx], 0.35)
            # slight curve
            if rng.random() < 0.35:
                dx = max(-1, min(1, dx + rng.randint(-1, 1)))
                dy = max(-1, min(1, dy + rng.randint(-1, 1)))
            # branch
            if rng.random() < 0.12 and length > 6:
                bdx = rng.randint(-1, 1)
                bdy = rng.randint(-1, 1)
                walk(x, y, length // 3, bdx, bdy)
            x += dx
            y += dy

    starts = [
        (16, 20, 1, 1),
        (40, 10, -1, 1),
        (30, 40, 0, 1),
        (8,  48, 1, -1),
    ]
    for sx, sy, dx, dy in starts:
        walk(sx, sy, rng.randint(14, 24), dx, dy)

    for y in range(SIZE):
        for x in range(SIZE):
            v = arr[y][x]
            if v > 0:
                a = int(v * 190)
                px[x, y] = (14, 11, 9, a)

    return img


# ---------------------------------------------------------------------------
# 99 — puddle sheen (accent)
# Two overlapping ellipses with a soft edge, muted blue-grey.
# ---------------------------------------------------------------------------
def make_99():
    img = blank()
    px = img.load()

    blobs = [
        (32, 36, 18, 10),   # cx, cy, rx, ry
        (22, 28, 11, 7),
        (42, 30, 8,  5),
    ]

    for y in range(SIZE):
        for x in range(SIZE):
            best = 0.0
            for cx, cy, rx, ry in blobs:
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if d < 1.0:
                    best = max(best, 1.0 - d)
            if best > 0:
                edge = min(1.0, best / 0.6)
                a = int(edge ** 0.6 * 170)
                # desaturated blue-grey, very dark
                px[x, y] = (16, 24, 38, a)

    return img


# ---------------------------------------------------------------------------
# 100 — diagonal grime streaks (semi-tileable)
# Faint diagonal scratches running upper-left → lower-right.
# ---------------------------------------------------------------------------
def make_100():
    img = blank()
    px = img.load()
    rng = random.Random(100)

    # Each streak: a diagonal band of y = x * slope + offset
    streaks = []
    for _ in range(10):
        offset = rng.randint(-SIZE, SIZE * 2)
        alpha  = rng.randint(80, 160)
        width  = rng.choice([0, 0, 1])
        streaks.append((offset, alpha, width))

    slope = 0.55
    for y in range(SIZE):
        for x in range(SIZE):
            for offset, alpha, width in streaks:
                proj = y - slope * x - offset
                if abs(proj) <= width + 0.5:
                    fade = max(0.0, 1.0 - abs(proj) / (width + 1.0))
                    a = int(fade * alpha)
                    if a > px[x, y][3]:
                        dark = 20
                        px[x, y] = (dark, int(dark * 0.85), int(dark * 0.7), a)

    return img


# ---------------------------------------------------------------------------
# 101 — corner vignette (tileable repeater)
# Darkens edges and corners; transparent center. Tiles into a grid of
# light-center dark-edge cells.
# ---------------------------------------------------------------------------
def make_101():
    img = blank()
    px = img.load()
    half = SIZE / 2.0
    max_r = math.sqrt(half ** 2 + half ** 2)

    for y in range(SIZE):
        for x in range(SIZE):
            dx = abs(x - half + 0.5)
            dy = abs(y - half + 0.5)
            # distance from centre normalised 0→1
            t = math.sqrt(dx ** 2 + dy ** 2) / max_r
            if t > 0.38:
                strength = ((t - 0.38) / 0.62) ** 1.8
                a = int(strength * 190)
                px[x, y] = (5, 5, 9, a)

    return img


# ---------------------------------------------------------------------------
# 102 — crosshatch grid (tileable, perfectly modular)
# Thin dark lines every 8 px in both axes; intersections slightly darker.
# ---------------------------------------------------------------------------
def make_102():
    img = blank()
    px = img.load()
    spacing = 8

    for y in range(SIZE):
        for x in range(SIZE):
            h = (y % spacing == 0)
            v = (x % spacing == 0)
            if h or v:
                a = 75 if (h and v) else 40
                dark = 18
                px[x, y] = (dark, int(dark * 0.88), int(dark * 0.72), a)

    return img


# ---------------------------------------------------------------------------
# 103 — scuff arcs (accent)
# Curved drag/scuff marks left by something being pushed across the floor.
# ---------------------------------------------------------------------------
def make_103():
    img = blank()
    px = img.load()
    arr = [[0.0] * SIZE for _ in range(SIZE)]
    rng = random.Random(103)

    for _ in range(6):
        sx = rng.randint(8, 56)
        sy = rng.randint(8, 56)
        angle = rng.uniform(0, 2 * math.pi)
        curve = rng.uniform(-0.12, 0.12)
        length = rng.randint(10, 22)

        for i in range(length):
            angle += curve
            fx = sx + math.cos(angle) * i
            fy = sy + math.sin(angle) * i
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    nx = int(fx) + dx
                    ny = int(fy) + dy
                    if 0 <= nx < SIZE and 0 <= ny < SIZE:
                        fade = 1.0 - (abs(dx) + abs(dy)) * 0.4
                        taper = 1.0 - i / length
                        arr[ny][nx] = max(arr[ny][nx], fade * taper * rng.uniform(0.7, 1.0))

    for y in range(SIZE):
        for x in range(SIZE):
            v = arr[y][x]
            if v > 0:
                a = int(v * 180)
                px[x, y] = (13, 10, 8, a)

    return img


# ---------------------------------------------------------------------------
# 104 — organic stain (accent)
# Irregular dark blotch — water damage, old spill, biological growth.
# ---------------------------------------------------------------------------
def make_104():
    img = blank()
    px = img.load()
    rng = random.Random(104)

    # Several overlapping gaussian-ish blobs
    blobs = []
    for _ in range(9):
        bx = rng.randint(18, 46)
        by = rng.randint(18, 46)
        br = rng.uniform(4, 13)
        blobs.append((bx, by, br))

    for y in range(SIZE):
        for x in range(SIZE):
            v = 0.0
            for bx, by, br in blobs:
                d = math.sqrt((x - bx) ** 2 + (y - by) ** 2)
                v = max(v, max(0.0, 1.0 - d / br))
            if v > 0.22:
                t = (v - 0.22) / 0.78
                a = int(t ** 0.65 * 175)
                r = int(16 + t * 14)
                g = int(12 + t * 9)
                b = int(9  + t * 5)
                px[x, y] = (r, g, b, a)

    return img


# ---------------------------------------------------------------------------
if __name__ == '__main__':
    print('Generating OnGround overlay tiles 97–104...')
    save(97,  make_97())
    save(98,  make_98())
    save(99,  make_99())
    save(100, make_100())
    save(101, make_101())
    save(102, make_102())
    save(103, make_103())
    save(104, make_104())
    print('Done. Review tiles then run: npm run build-tiles')

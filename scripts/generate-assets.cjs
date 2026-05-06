/**
 * Procedural asset generator for WARDEN placeholder art.
 * Pure Node.js — zero external dependencies (uses built-in zlib).
 * Run: node scripts/generate-assets.cjs
 */

const fs = require('fs');
const path = require('path');

// ── Drawing helpers ─────────────────────────────────────────────────────────

const S = 4; // Scale Factor (e.g. 4x)
const BASE = 16;


// ── Tilemap generator ───────────────────────────────────────────────────────

const TILESET_META = {
  firstgid: 1,
  name: 'tileset',
  tilewidth: BASE * S,
  tileheight: BASE * S,
  tilecount: 128,
  columns: 8,
  image: 'tileset.png',
  imagewidth: 128 * S,   // 512px — 8 cols unchanged
  imageheight: 256 * S,  // 1024px — 16 rows (was 8)
  margin: 0,
  spacing: 0,
};

function generateTilemap(roomWidth, roomHeight, opts) {
  const {
    groundTile = 1,
    doorGaps = [],
    decorations = [],
    interiorWalls = [],
    signPositions = [],
    trees = [],
  } = opts;

  const ground = [];
  const collision = [];
  const above = [];

  for (let y = 0; y < roomHeight; y++) {
    for (let x = 0; x < roomWidth; x++) {
      above.push(0);

      // Ground: base tile
      let gTile = groundTile;
      // Door accent tile at doorway gaps
      for (const gap of doorGaps) {
        if (x >= gap.x1 && x <= gap.x2 && y >= gap.y1 && y <= gap.y2) {
          gTile = gap.tile || 29;
        }
      }
      // Decorations layered on top
      for (const d of decorations) {
        if (x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2) gTile = d.tile;
      }

      // Trees (3x3)
      for (const t of trees) {
        if (x >= t.x && x <= t.x + 2 && y >= t.y && y <= t.y + 2) {
          const relX = x - t.x;
          const relY = y - t.y;
          const tIdx = relY * 3 + relX;
          const tileId = 41 + tIdx;

          if (tIdx === 7) {
            // Trunk tile
            gTile = tileId;
          } else {
            // Foliage tile
            above[above.length - 1] = tileId;
          }
        }
      }

      ground.push(gTile);

      // Collision: border walls + interior walls + sign blocking + tree trunk
      const isBorder = x === 0 || x === roomWidth - 1 || y === 0 || y === roomHeight - 1;
      let isInterior = false;
      for (const w of interiorWalls) {
        if (x >= w.x1 && x <= w.x2 && y >= w.y1 && y <= w.y2) {
          isInterior = true;
          break;
        }
      }
      let isSign = false;
      for (const s of signPositions) {
        if (x === s.x && y === s.y) {
          isSign = true;
          break;
        }
      }
      let treeCollisionGID = 0;
      for (const t of trees) {
        if (x === t.x + 1 && y === t.y + 2) {
          treeCollisionGID = 48; // Trunk GID
          break;
        }
      }
      let isDoorGap = false;
      for (const gap of doorGaps) {
        if (x >= gap.x1 && x <= gap.x2 && y >= gap.y1 && y <= gap.y2) {
          isDoorGap = true;
          break;
        }
      }

      if (isSign) {
        collision.push(5);
      } else if (treeCollisionGID) {
        collision.push(treeCollisionGID);
      } else if (isDoorGap) {
        collision.push(0);
      } else if (isInterior || isBorder) {
        collision.push(2);
      } else {
        collision.push(0);
      }
    }
  }

  return {
    width: roomWidth,
    height: roomHeight,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tilewidth: BASE * S,
    tileheight: BASE * S,
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    nextlayerid: 4,
    nextobjectid: 1,
    layers: [
      { id: 1, name: 'Ground', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: roomWidth, height: roomHeight, data: ground },
      { id: 2, name: 'Collision', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: roomWidth, height: roomHeight, data: collision },
      { id: 3, name: 'Above', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: roomWidth, height: roomHeight, data: above },
    ],
    tilesets: [TILESET_META],
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

const root = path.join(__dirname, '..');
const tilemapDir = path.join(root, 'public', 'assets', 'tilemaps');
const spriteDir = path.join(root, 'public', 'assets', 'sprites');

fs.mkdirSync(tilemapDir, { recursive: true });
fs.mkdirSync(spriteDir, { recursive: true });

require('./generate-tileset.cjs');

// Player spritesheet PNG
const { generatePlayer, PLAYER_VARIANTS } = require('./generate-player-lib.cjs');
const { generateAfflicted, generateVialCure, AFFLICTED_VARIANTS } = require('./generate-afflicted-lib.cjs');

fs.writeFileSync(path.join(spriteDir, 'player.png'), generatePlayer(1.0625, 'cultist'));
console.log(`  player.png   (68x68, 4x4 frames of 17x17, cultist)`);

fs.writeFileSync(path.join(spriteDir, 'player-bigger.png'), generatePlayer(1.0625 * 1.35, 'cultist'));
console.log(`  player-bigger.png (${Math.round(64 * 1.0625 * 1.35)}x${Math.round(64 * 1.0625 * 1.35)})`);

// Item sprites
fs.writeFileSync(path.join(spriteDir, 'vial_cure.png'), generateVialCure());
console.log(`  vial_cure.png (32x32)`);

// Named player variant sprites for recovered residents (all except cultist = protagonist)
for (const variantName of Object.keys(PLAYER_VARIANTS).filter(v => v !== 'cultist')) {
  const outputPath = path.join(spriteDir, `player-${variantName}.png`);
  fs.writeFileSync(outputPath, generatePlayer(1.0625, variantName));
  console.log(`  player-${variantName}.png (68x68, 4x4 frames of 17x17)`);
}

// Afflicted variants
for (const variantName of Object.keys(AFFLICTED_VARIANTS)) {
  const outputPath = path.join(spriteDir, `afflicted-${variantName}.png`);
  fs.writeFileSync(outputPath, generateAfflicted(1.0625, variantName));
  console.log(`  afflicted-${variantName}.png (68x68, 4x4 frames of 17x17)`);
}

// ── City street (96×72 = 1536×1152px) ───────────────────────────────────────
//
// The city is SEALED — no border gaps. The outer walls are the game boundary.
// Escaping them is the endgame.
//
// Door zone positions from rooms.json:
//   Apt 4A:         x=128  → gap tiles x=8-9,   y=60
//   House B:        x=368  → gap tiles x=23-24, y=60
//   Protag house:   x=752  → gap tiles x=47-48, y=60
//   Laundromat:     x=928  → gap tiles x=58-59, y=60
//   House C:        x=1136 → gap tiles x=71-72, y=60
//   Depot:          x=1312 → gap tiles x=82-83, y=60
//
//   Clinic:         x=160  → gap tiles x=10-11, y=19
//   Records:        x=160  → gap tiles x=10-11, y=33
//   Utility:        x=160  → gap tiles x=10-11, y=53
//   Market:         x=1280 → gap tiles x=80-81, y=19
//   Ration:         x=1312 → gap tiles x=82-83, y=33
//   East Block:     x=1312 → gap tiles x=82-83, y=53
//
// City wall inner faces: y=1-5 (N), y=66-70 (S), x=1-4 (W), x=91-94 (E).
const cityStreet = generateTilemap(96, 72, {
  groundTile: 1, // dark pavement
  doorGaps: [
    { x1: 8,  x2: 9,  y1: 60, y2: 60 },
    { x1: 23, x2: 24, y1: 60, y2: 60 },
    { x1: 47, x2: 48, y1: 60, y2: 60 },
    { x1: 58, x2: 59, y1: 60, y2: 60 },
    { x1: 71, x2: 72, y1: 60, y2: 60 },
    { x1: 82, x2: 83, y1: 60, y2: 60 },
    { x1: 10, x2: 11, y1: 19, y2: 19 },
    { x1: 10, x2: 11, y1: 33, y2: 33 },
    { x1: 10, x2: 11, y1: 53, y2: 53 },
    { x1: 80, x2: 81, y1: 19, y2: 19 },
    { x1: 82, x2: 83, y1: 33, y2: 33 },
    { x1: 82, x2: 83, y1: 53, y2: 53 },
  ],
  decorations: [
    // Cracked pavement approach to south building row
    { x1:  5, x2: 90, y1: 57, y2: 59, tile: 32 },
    // Overgrown strips along north sidewalk (inside of north city wall)
    { x1:  5, x2: 90, y1:  6, y2:  7, tile: 6 },
    // Scattered overgrown patches — nature reclaiming the street
    { x1: 22, x2: 24, y1: 28, y2: 30, tile: 6 },
    { x1: 58, x2: 60, y1: 28, y2: 30, tile: 6 },
    { x1: 38, x2: 40, y1: 44, y2: 46, tile: 6 }, // memorial area
    { x1: 52, x2: 54, y1: 44, y2: 46, tile: 6 },
    // Rubble patches near east and west walls
    { x1:  5, x2:  8, y1: 20, y2: 25, tile: 7 },
    { x1: 86, x2: 90, y1: 20, y2: 25, tile: 7 },
  ],
  trees: [
    { x: 40, y: 42 },
    { x: 50, y: 42 },
    { x: 15, y: 10 },
    { x: 75, y: 10 },
    { x: 30, y: 25 },
    { x: 60, y: 25 },
  ],
  interiorWalls: [
    // ── City wall inner faces (sealed, no gaps) ──────────────────────────
    { x1:  1, x2: 94, y1:  1, y2:  5 }, // north
    { x1:  1, x2: 94, y1: 66, y2: 70 }, // south
    { x1:  1, x2:  4, y1:  6, y2: 65 }, // west
    { x1: 91, x2: 94, y1:  6, y2: 65 }, // east

    // ── North-side building facades ──────────────────────────
    { x1: 10, x2: 22, y1: 19, y2: 22 }, // Clinic (west side)
    { x1: 38, x2: 52, y1: 11, y2: 14 }, // Central block (north gate)
    { x1: 72, x2: 86, y1: 19, y2: 22 }, // Market Grocer (east side)

    // ── West-side building facades ──────────────────────────
    { x1:  9, x2: 15, y1: 33, y2: 36 }, // Civic Records Office
    { x1:  9, x2: 15, y1: 53, y2: 56 }, // Utilities Substation

    // ── East-side building facades ──────────────────────────
    { x1: 80, x2: 86, y1: 33, y2: 36 }, // Emergency Ration Office
    { x1: 80, x2: 86, y1: 53, y2: 56 }, // East Block Apartments

    // ── South building row — 2 tiles deep (face + one body row)
    // Layout west→east: Apt4A | [HouseB] | Boarded | [Protag] | Laundromat | [HouseC] | Depot

    // Apt 4A
    { x1:  7, x2: 15, y1: 60, y2: 61 },

    // House B — gap at x=23-24
    { x1: 20, x2: 22, y1: 60, y2: 60 },
    { x1: 25, x2: 28, y1: 60, y2: 60 },
    { x1: 20, x2: 28, y1: 61, y2: 61 },

    // Boarded suite
    { x1: 32, x2: 39, y1: 60, y2: 61 },

    // Protag house — gap at x=47-48
    { x1: 44, x2: 46, y1: 60, y2: 60 },
    { x1: 49, x2: 52, y1: 60, y2: 60 },
    { x1: 44, x2: 52, y1: 61, y2: 61 },

    // Laundromat — gap at 58-59
    { x1: 57, x2: 57, y1: 60, y2: 60 },
    { x1: 60, x2: 64, y1: 60, y2: 60 },
    { x1: 57, x2: 64, y1: 61, y2: 61 },

    // House C — gap at x=71-72
    { x1: 68, x2: 70, y1: 60, y2: 60 },
    { x1: 73, x2: 76, y1: 60, y2: 60 },
    { x1: 68, x2: 76, y1: 61, y2: 61 },

    // Depot / Maintenance — gap at 82-83
    { x1: 80, x2: 81, y1: 60, y2: 60 },
    { x1: 84, x2: 88, y1: 60, y2: 60 },
    { x1: 80, x2: 88, y1: 61, y2: 61 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'city-street.json'), JSON.stringify(cityStreet));
console.log('  city-street.json  (96x72)');

// ── House B interior — Apartment 4B (18×13 = 288×208px — fits viewport, centered) ─
// Smaller than protag house. Single room with a kitchen area, table, and a bed nook.
// Door at north wall center (x=8-9). Calendar on west wall. Note on kitchen table.
const houseB = generateTilemap(18, 13, {
  groundTile: 3,
  doorGaps: [
    { x1: 8, x2: 9, y1: 0, y2: 0 }, // north door → city street
  ],
  decorations: [
    // Bed nook (east side) — worn carpet
    { x1: 14, x2: 16, y1: 7, y2: 11, tile: 32 },
    // Kitchen area (south-west) — same interior floor, no change needed
    { x1: 1, x2: 5, y1: 9, y2: 11, tile: 3 },
  ],
  interiorWalls: [
    // Calendar wall (west, top — blocking prop)
    { x1: 1, x2: 2, y1: 1, y2: 2 },
    // Kitchen counter
    { x1: 1, x2: 5, y1: 8, y2: 8 },
    // Wardrobe (east wall)
    { x1: 16, x2: 16, y1: 1, y2: 4 },
    // Partition nook for bed
    { x1: 12, x2: 13, y1: 6, y2: 6 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'house-b.json'), JSON.stringify(houseB));
console.log('  house-b.json      (18x13)');

// ── House C interior — Community Room (26×18 = 416×288px — scrolls both axes) ─
// Larger than the others. A shared community space: notice board on north wall,
// folding tables in the center, shelving on the east wall.
// Door at north wall center (x=12-13). Notice board top-center. Logbook on table.
const houseC = generateTilemap(26, 18, {
  groundTile: 3,
  doorGaps: [
    { x1: 12, x2: 13, y1: 0, y2: 0 }, // north door → city street
  ],
  decorations: [
    // Stage / presentation area (north end) — worn carpet
    { x1: 1, x2: 24, y1: 1, y2: 3, tile: 32 },
    // Rug / gathering area (center) — worn carpet
    { x1: 4, x2: 21, y1: 8, y2: 14, tile: 32 },
  ],
  interiorWalls: [
    // Notice board (north wall, flanking door)
    { x1: 4, x2: 9,  y1: 1, y2: 2 },
    { x1: 16, x2: 21, y1: 1, y2: 2 },
    // Folding tables (center rows)
    { x1: 2,  x2: 10, y1: 9,  y2: 9  },
    { x1: 14, x2: 23, y1: 9,  y2: 9  },
    { x1: 2,  x2: 10, y1: 13, y2: 13 },
    { x1: 14, x2: 23, y1: 13, y2: 13 },
    // East shelving
    { x1: 23, x2: 24, y1: 4, y2: 16 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'house-c.json'), JSON.stringify(houseC));
console.log('  house-c.json      (26x18)');

// ── Protagonist apartment interior (20×15 = 320×240px — fits viewport exactly) ─
// Exit door at north wall (x=9-10). Player spawns near east wall (bed area) on first load.
// Desk and wardrobe block the top corners. A partition divides the main room from the sleeping area.
const protagHouse = generateTilemap(20, 15, {
  groundTile: 3,
  doorGaps: [
    { x1: 9, x2: 10, y1: 0, y2: 0 }, // north door → city street
  ],
  decorations: [
    // Bed area (east side, lower half of room) — worn carpet
    { x1: 14, x2: 17, y1: 8, y2: 12, tile: 32 },
    // Desk surface
    { x1: 1, x2: 3, y1: 1, y2: 2, tile: 19 },
    // Bed
    { x1: 15, x2: 16, y1: 9, y2: 11, tile: 22 },
  ],
  interiorWalls: [
    // Desk (west wall, top corner)
    { x1: 1, x2: 3, y1: 1, y2: 2 },
    // Wardrobe (east wall, top corner)
    { x1: 16, x2: 18, y1: 1, y2: 3 },
    // Partition wall (separates main room from bed area)
    { x1: 8, x2: 12, y1: 6, y2: 6 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'protag-house.json'), JSON.stringify(protagHouse));
console.log('  protag-house.json (20x15)');

// ── Clinic ──────────────────────────────────────────────────────────────────
const clinic = generateTilemap(20, 15, {
  groundTile: 4, // Concrete
  doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  decorations: [
    { x1: 2, x2: 17, y1: 2, y2: 4, tile: 32 }, // Worn carpet in waiting area
    { x1: 1, x2: 3, y1: 10, y2: 12, tile: 22 }, // Medical beds
    { x1: 6, x2: 8, y1: 10, y2: 12, tile: 22 },
  ],
  interiorWalls: [
    { x1: 1, x2: 5, y1: 1, y2: 1 }, // Shelves
    { x1: 14, x2: 18, y1: 1, y2: 1 }, // Shelves
    { x1: 1, x2: 3, y1: 10, y2: 13 }, // Beds
    { x1: 6, x2: 8, y1: 10, y2: 13 }, // Beds
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'clinic.json'), JSON.stringify(clinic));
console.log('  clinic.json       (20x15)');

// ── Records Office ──────────────────────────────────────────────────────────
const records = generateTilemap(20, 15, {
  groundTile: 3,
  doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  decorations: [
    { x1: 2, x2: 17, y1: 5, y2: 10, tile: 7 }, // Scattered papers
    { x1: 8, x2: 11, y1: 7, y2: 8, tile: 19 }, // Central desk
  ],
  interiorWalls: [
    { x1: 1, x2: 1, y1: 1, y2: 13 }, // Filing cabinets west
    { x1: 18, x2: 18, y1: 1, y2: 13 }, // Filing cabinets east
    { x1: 8, x2: 11, y1: 7, y2: 8 }, // Central desk
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'records-office.json'), JSON.stringify(records));
console.log('  records-office.json (20x15)');

// ── Utility Substation (Spruced Up) ─────────────────────────────────────────
const substation = generateTilemap(20, 15, {
  groundTile: 4, // Concrete
  doorGaps: [
    { x1: 9, x2: 10, y1: 0, y2: 0 }, // North exit
    { x1: 2, x2: 2, y1: 12, y2: 12 }, // Trapdoor location
  ],
  decorations: [
    { x1: 2, x2: 2, y1: 12, y2: 12, tile: 34 }, // Trapdoor tile
    { x1: 1, x2: 18, y1: 5, y2: 5, tile: 35 },  // Horizontal pipe
    { x1: 5, x2: 5, y1: 1, y2: 13, tile: 36 },  // Vertical pipe
    { x1: 14, x2: 14, y1: 1, y2: 13, tile: 36 }, // Vertical pipe
  ],
  interiorWalls: [
    { x1: 1, x2: 4, y1: 1, y2: 3 }, // Generators
    { x1: 15, x2: 18, y1: 1, y2: 3 }, // Generators
    { x1: 8, x2: 11, y1: 13, y2: 13 }, // Main console
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'utility-substation.json'), JSON.stringify(substation));
console.log('  utility-substation.json (20x15)');

// ── Market ──────────────────────────────────────────────────────────────────
const market = generateTilemap(20, 15, {
  groundTile: 4,
  doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  interiorWalls: [
    { x1: 1, x2: 18, y1: 4, y2: 4 }, // Shelves row 1
    { x1: 1, x2: 18, y1: 8, y2: 8 }, // Shelves row 2
    { x1: 1, x2: 18, y1: 12, y2: 12 }, // Shelves row 3
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'market.json'), JSON.stringify(market));
console.log('  market.json       (20x15)');

// ── Laundromat ──────────────────────────────────────────────────────────────
const laundromat = generateTilemap(20, 15, {
  groundTile: 4,
  doorGaps: [
    { x1: 9, x2: 10, y1: 0, y2: 0 },
    { x1: 17, x2: 17, y1: 12, y2: 12 }, // Tunnel entrance
  ],
  decorations: [
    { x1: 17, x2: 17, y1: 12, y2: 12, tile: 37 }, // Grating
  ],
  interiorWalls: [
    { x1: 1, x2: 1, y1: 1, y2: 13 }, // Washers west
    { x1: 18, x2: 18, y1: 1, y2: 11 }, // Washers east (stop before tunnel entrance at y=12)
    { x1: 8, x2: 11, y1: 5, y2: 10 }, // Folding tables
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'laundromat.json'), JSON.stringify(laundromat));
console.log('  laundromat.json   (20x15)');

// ── Substation Tunnel ───────────────────────────────────────────────────────
const tunnel = generateTilemap(40, 10, {
  groundTile: 7, // Rubble/Pavement
  doorGaps: [
    { x1: 2, x2: 2, y1: 0, y2: 0 },   // To Substation
    { x1: 37, x2: 37, y1: 0, y2: 0 }, // To Laundromat
  ],
  decorations: [
    { x1: 1, x2: 38, y1: 2, y2: 2, tile: 35 }, // Long pipe
    { x1: 1, x2: 38, y1: 7, y2: 7, tile: 35 }, // Long pipe
    { x1: 5, x2: 5, y1: 1, y2: 8, tile: 36 },
    { x1: 15, x2: 15, y1: 1, y2: 8, tile: 36 },
    { x1: 25, x2: 25, y1: 1, y2: 8, tile: 36 },
    { x1: 35, x2: 35, y1: 1, y2: 8, tile: 36 },
  ],
  interiorWalls: [],
});
fs.writeFileSync(path.join(tilemapDir, 'substation-tunnel.json'), JSON.stringify(tunnel));
console.log('  substation-tunnel.json (40x10)');

// ── Generic for the rest ────────────────────────────────────────────────────
['ration-office', 'east-block', 'depot', 'apt-4a'].forEach(id => {
  const map = generateTilemap(20, 15, {
    groundTile: 3,
    doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  });
  fs.writeFileSync(path.join(tilemapDir, id + '.json'), JSON.stringify(map));
  console.log(`  ${id}.json`.padEnd(20) + ' (20x15)');
});

console.log('\nAll assets generated successfully!');

/**
 * Regenerate all character sprites at 64×64 frames (scale 4.0).
 * Produces 256×256 spritesheets (4×4 frames of 64×64).
 * Run: node scripts/regen-sprites-64.cjs
 */

const fs   = require('fs');
const path = require('path');

const { generatePlayer,   PLAYER_VARIANTS   } = require('./generate-player-lib.cjs');
const { generateAfflicted, AFFLICTED_VARIANTS } = require('./generate-afflicted-lib.cjs');

const S         = 4.0;   // 64 * 4 = 256px sheet, 64×64 frames
const FRAME     = Math.round(64 * S);   // 256
const spriteDir = path.join(__dirname, '..', 'public', 'assets', 'sprites');

fs.mkdirSync(spriteDir, { recursive: true });

// ── Player variants ──────────────────────────────────────────────────────────
for (const variantName of Object.keys(PLAYER_VARIANTS)) {
  const fileName = variantName === 'cultist' ? 'player.png' : `player-${variantName}.png`;
  const outPath  = path.join(spriteDir, fileName);
  fs.writeFileSync(outPath, generatePlayer(S, variantName));
  console.log(`  ${fileName}  (${FRAME}×${FRAME}, 64×64 frames)`);
}

// ── Afflicted variants ───────────────────────────────────────────────────────
for (const variantName of Object.keys(AFFLICTED_VARIANTS)) {
  const outPath = path.join(spriteDir, `afflicted-${variantName}.png`);
  fs.writeFileSync(outPath, generateAfflicted(S, variantName));
  console.log(`  afflicted-${variantName}.png  (${FRAME}×${FRAME}, 64×64 frames)`);
}

console.log('\nDone. All sprites regenerated at 64×64 frames.');

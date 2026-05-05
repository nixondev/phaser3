/**
 * Standalone Player Spritesheet Generator
 * Run: node scripts/generate-player.cjs
 */

const fs = require('fs');
const path = require('path');

const { generatePlayer, PLAYER_VARIANTS } = require('./generate-player-lib.cjs');

function makeTimestamp(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0');

  const datePart = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('');

  const timePart = [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');

  const msPart = pad(date.getMilliseconds(), 3);

  return `${datePart}-${timePart}-${msPart}`;
}

// --- Execution ---
const spriteDir = path.join(__dirname, '..', 'public', 'assets', 'sprites');
if (!fs.existsSync(spriteDir)) {
  fs.mkdirSync(spriteDir, { recursive: true });
}

const timestamp = makeTimestamp();

const variants = Object.keys(PLAYER_VARIANTS);

// Clean 96x96 output.
// 64 * 1.5 = 96
const standardScale = 1.5;

// Clean 128x128 output.
// 64 * 2 = 128
// Better than 1.5 * 1.35 because every frame is exactly 32x32.
const biggerScale = 2;

for (const variantName of variants) {
  const standardPath = path.join(
    spriteDir,
    `player-${variantName}-${timestamp}.png`
  );

  fs.writeFileSync(standardPath, generatePlayer(standardScale, variantName));
  console.log(`Generated: ${standardPath}`);

  const biggerPath = path.join(
    spriteDir,
    `player-${variantName}-bigger-${timestamp}.png`
  );

  fs.writeFileSync(biggerPath, generatePlayer(biggerScale, variantName));
  console.log(`Generated: ${biggerPath}`);
}

console.log('');
console.log(`Generated ${variants.length * 2} player spritesheets.`);
console.log(`Output directory: ${spriteDir}`);

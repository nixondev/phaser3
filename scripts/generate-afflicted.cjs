/**
 * Standalone Afflicted Spritesheet Generator
 * Run: node scripts/generate-afflicted.cjs
 */

const fs = require('fs');
const path = require('path');

const {
  generateAfflicted,
  AFFLICTED_VARIANTS,
} = require('./generate-afflicted-lib.cjs');

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

// 68x68 spritesheet.
// 4x4 frames, each frame 17x17.
const scale = 1.0625;

const variants = Object.keys(AFFLICTED_VARIANTS);

for (const variantName of variants) {
  const outputPath = path.join(
    spriteDir,
    `afflicted-${variantName}.png`
  );

  fs.writeFileSync(outputPath, generateAfflicted(scale, variantName));
  console.log(`Generated: ${outputPath}`);
}

console.log('');
console.log(`Generated ${variants.length} afflicted spritesheets.`);
console.log(`Output directory: ${spriteDir}`);

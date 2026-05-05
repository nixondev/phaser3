/**
 * Standalone Infected Spritesheet Generator
 * Run: node scripts/generate-infected.cjs
 */

const fs = require('fs');
const path = require('path');

const {
  generateInfected,
  INFECTED_VARIANTS,
} = require('./generate-infected-lib.cjs');

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

// 96x96 spritesheet.
// 4x4 frames, each frame 24x24.
const scale = 1.5;

const variants = Object.keys(INFECTED_VARIANTS);

for (const variantName of variants) {
  const outputPath = path.join(
    spriteDir,
    `infected-${variantName}.png`
  );

  fs.writeFileSync(outputPath, generateInfected(scale, variantName));
  console.log(`Generated: ${outputPath}`);
}

console.log('');
console.log(`Generated ${variants.length} infected spritesheets.`);
console.log(`Output directory: ${spriteDir}`);

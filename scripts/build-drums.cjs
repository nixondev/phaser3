#!/usr/bin/env node
'use strict';

/**
 * build-drums — Convert GoldBaby Tape909 samples into GUS .pat files and
 * write a custom freepats.cfg that replaces drumset 0 with Custom_000/.
 *
 * Usage:  node scripts/build-drums.cjs
 *
 * Requires: ffmpeg on PATH, wav2pat.cjs in the same directory.
 * Writes:
 *   public/timidity/Custom_000/*.pat
 *   public/timidity/freepats.cfg   (drumset 0 → Custom_000, bank 0 unchanged)
 *   public/timidity/freepats.old.cfg  (original backup)
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Paths ────────────────────────────────────────────────────────────────────

const TAPE909 = 'E:/Samples/GoldBaby Drum Samples Collection/Tape909';
const ROOT    = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'timidity', 'Custom_000');
const PUB_TIM = path.join(ROOT, 'public', 'timidity');
const WAV2PAT = path.join(__dirname, 'wav2pat.cjs');
const SRC_CFG = path.join(ROOT, 'node_modules', 'timidity', 'freepats.cfg');

// ── Sample selection ─────────────────────────────────────────────────────────
// [GM note, Tape909 relative path, output .pat filename]
// All _tapesat variants — medium tune/decay/accent where applicable.

const SAMPLES = [
  [35, 'BD/909bd_t6a6d6v1_tapesat.wav',    '035_Kick_1.pat'],
  [36, 'BD/909bd_t6a6d11v1_tapesat.wav',   '036_Kick_2.pat'],
  [37, 'Perc/909rimv2_tapesat.wav',         '037_Rim.pat'],
  [38, 'SD/909sd_t6t6s6v1_tapesat.wav',    '038_Snare_1.pat'],
  [39, 'Perc/909clapv2_tapesat.wav',        '039_Clap.pat'],
  [40, 'SD/909sd_t3t6s6v2_tapesat.wav',    '040_Snare_2.pat'],
  [41, 'Toms/909lt_t6d6v1_tapesat.wav',    '041_Tom_Low_2.pat'],
  [42, 'HH/909hh_d6v1_tapesat.wav',        '042_HiHat_Closed.pat'],
  [43, 'Toms/909lt_t6d11v1_tapesat.wav',   '043_Tom_Low_1.pat'],
  [44, 'HH/909hh_d3v1_tapesat.wav',        '044_HiHat_Pedal.pat'],
  [45, 'Toms/909mt_t6d6v1_tapesat.wav',    '045_Tom_Mid_2.pat'],
  [46, 'HH/909ohh_d6v1_tapesat.wav',       '046_HiHat_Open.pat'],
  [47, 'Toms/909mt_t6d11v1_tapesat.wav',   '047_Tom_Mid_1.pat'],
  [48, 'Toms/909ht_t6d6v1_tapesat.wav',    '048_Tom_High_2.pat'],
  [49, 'Cym/909cym_t6v1_tapesat.wav',      '049_Crash.pat'],
  [50, 'Toms/909ht_t6d11v1_tapesat.wav',   '050_Tom_High_1.pat'],
  [51, 'Cym/909ride_t6v1_tapesat.wav',     '051_Ride.pat'],
];

// note → pat filename for the cfg rewrite step
const overrides = new Map(SAMPLES.map(([note, , pat]) => [note, pat]));

// ── Step 1: Convert and build .pat files ─────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PUB_TIM, { recursive: true });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-drums-'));
console.log(`Converting ${SAMPLES.length} Tape909 samples → Custom_000/ ...\n`);

try {
  for (const [note, srcRel, outName] of SAMPLES) {
    // forward-slash path that both ffmpeg and Node handle on Windows/bash
    const src = `${TAPE909}/${srcRel}`;
    const tmp = path.join(tmpDir, outName.replace('.pat', '.wav'));
    const out = path.join(OUT_DIR, outName);

    // 24-bit mono → 16-bit signed LE PCM at 44100 Hz, attenuated -16 dB.
    // Balances drum kit against the freepats tone instruments (which are quieter).
    execSync(`ffmpeg -y -i "${src}" -ar 44100 -ac 1 -af "volume=-20dB" -c:a pcm_s16le "${tmp}" -loglevel error`);

    // WAV → GUS patch with root_freq tuned to the GM drum note. Without this
    // libtimidity pitch-shifts the sample by (played_note - root_note) semitones.
    execSync(`node "${WAV2PAT}" -n ${note} "${tmp}" "${out}"`);

    console.log(`  ✓  ${outName}`);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── Step 2: Build custom freepats.cfg ────────────────────────────────────────

const origCfg = fs.readFileSync(SRC_CFG, 'utf8');

// Backup the original
fs.writeFileSync(path.join(PUB_TIM, 'freepats.old.cfg'), origCfg);

// Rewrite: replace drumset 0 lines 35–51 with Custom_000 entries; keep all else.
const lines    = origCfg.split(/\r?\n/);
const newLines = [];
let inDrumset0 = false;

for (const line of lines) {
  const trimmed = line.trim();

  if (/^drumset\s+0\b/.test(trimmed)) {
    inDrumset0 = true;
    newLines.push(line);
    continue;
  }

  // Another drumset or bank block ends the drumset 0 scope
  if (inDrumset0 && (/^drumset\s+\d/.test(trimmed) || /^bank\s+\d/.test(trimmed))) {
    inDrumset0 = false;
  }

  if (inDrumset0) {
    const m = trimmed.match(/^(\d+)\s+/);
    if (m) {
      const note = parseInt(m[1], 10);
      if (overrides.has(note)) {
        // No amp= boost — Tape909 samples are already at full peak level.
        // Freepats's amp=100 was added because its source samples were quiet;
        // applying it to our hot samples causes clipping when voices sum.
        newLines.push(` ${note}\tCustom_000/${overrides.get(note)}`);
        continue;
      }
    }
  }

  newLines.push(line);
}

const newCfg = newLines.join('\n');
fs.writeFileSync(path.join(PUB_TIM, 'freepats.cfg'), newCfg);

console.log('\n  ✓  public/timidity/freepats.old.cfg  (original backup)');
console.log('  ✓  public/timidity/freepats.cfg       (custom drumset 0)');
console.log(`\nDone. ${SAMPLES.length} patches written to public/timidity/Custom_000/`);

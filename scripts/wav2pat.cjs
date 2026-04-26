#!/usr/bin/env node
'use strict';

/**
 * wav2pat — Convert a 16-bit mono WAV to a GUS-compatible .pat patch file.
 *
 * Usage:
 *   node scripts/wav2pat.cjs [-n <midi_note>] input.wav output.pat
 *
 * Options:
 *   -n <0-127>   Root MIDI note (default: 60 = middle C)
 *
 * The resulting .pat file has a 335-byte header followed by the raw PCM data.
 * Modes byte is set to 2 (16-bit signed, no loop) for one-shot drum behaviour.
 */

const fs   = require('fs');
const path = require('path');

// ── Argument parsing ────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let note = 60;           // default: middle C (MIDI 60)
const positional = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-n') {
    const n = parseInt(argv[++i], 10);
    if (isNaN(n) || n < 0 || n > 127) {
      console.error('Error: -n <note> must be an integer 0–127');
      process.exit(1);
    }
    note = n;
  } else {
    positional.push(argv[i]);
  }
}

if (positional.length < 2) {
  console.error('Usage: node scripts/wav2pat.cjs [-n <note>] input.wav output.pat');
  process.exit(1);
}

const [inputFile, outputFile] = positional;

// ── Read & validate WAV ─────────────────────────────────────────────────────

const wav = fs.readFileSync(inputFile);

if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
  console.error('Error: Not a valid WAV file (missing RIFF/WAVE header)');
  process.exit(1);
}

let sampleRate, bitsPerSample, numChannels, sampleData;
let pos = 12;

while (pos + 8 <= wav.length) {
  const chunkId   = wav.toString('ascii', pos, pos + 4);
  const chunkSize = wav.readUInt32LE(pos + 4);
  pos += 8;

  if (chunkId === 'fmt ') {
    const audioFormat = wav.readUInt16LE(pos);
    numChannels   = wav.readUInt16LE(pos + 2);
    sampleRate    = wav.readUInt32LE(pos + 4);
    bitsPerSample = wav.readUInt16LE(pos + 14);

    if (audioFormat !== 1) {
      console.error(`Error: Only PCM WAV is supported (got format ${audioFormat})`);
      process.exit(1);
    }
    if (numChannels !== 1) {
      console.error(`Error: Only mono WAV is supported (got ${numChannels} channels)`);
      process.exit(1);
    }
    if (bitsPerSample !== 16) {
      console.error(`Error: Only 16-bit WAV is supported (got ${bitsPerSample}-bit)`);
      process.exit(1);
    }
  } else if (chunkId === 'data') {
    sampleData = wav.slice(pos, pos + chunkSize);
  }

  pos += chunkSize + (chunkSize & 1); // word-align per RIFF spec
}

if (!sampleData || !sampleRate) {
  console.error('Error: Could not find required WAV chunks (fmt/data)');
  process.exit(1);
}

const waveSize = sampleData.length;

// Root frequency in milliHz: 440000 * 2^((note - 69) / 12)
// Middle C (MIDI 60) = 261626 mHz
const rootFreq = Math.round(440000 * Math.pow(2, (note - 69) / 12));

// ── Build 335-byte GUS patch header ────────────────────────────────────────

const header = Buffer.alloc(335, 0);
let off = 0;

/** Write a fixed-width ASCII field, null-padded (header is pre-zeroed). */
const wstr = (s, len) => {
  const b = Buffer.from(s, 'ascii');
  b.copy(header, off, 0, Math.min(b.length, len));
  off += len;
};
const wu8  = (v) => { header.writeUInt8(v, off);     off += 1; };
const wu16 = (v) => { header.writeUInt16LE(v, off);  off += 2; };
const wi16 = (v) => { header.writeInt16LE(v, off);   off += 2; };
const wu32 = (v) => { header.writeUInt32LE(v, off);  off += 4; };
const skip = (n) => { off += n; }; // region stays zeroed

// ── Global header (129 bytes) ───────────────────────────────────────────────
wstr('GF1PATCH110\0', 12);   // patch identifier
wstr('ID#000002\0',  10);    // copyright marker (9 chars + null = 10 bytes)
skip(60);                    // description (null padded)
wu8(1);                      // instruments
wu8(14);                     // voices
wu8(0);                      // channels
wu16(1);                     // waveforms
wu16(127);                   // master volume
wu32(waveSize);              // data size
skip(36);                    // reserved

// ── Instrument header (63 bytes) ───────────────────────────────────────────
wu16(0);                     // instrument number (zero-indexed; matches freepats)
skip(16);                    // instrument name (null padded)
wu32(waveSize);              // instrument size
wu8(1);                      // layers
skip(40);                    // reserved

// ── Layer header (47 bytes) ────────────────────────────────────────────────
wu8(0);                      // layer_duplicate
wu8(0);                      // layer
wu32(waveSize);              // layer_size
wu8(1);                      // samples
skip(40);                    // reserved

// ── Sample header (96 bytes) ───────────────────────────────────────────────
skip(7);                     // wave name (null padded)
wu8(0);                      // fractions
wu32(waveSize);              // wave size
wu32(0);                     // loop start
wu32(waveSize);              // loop end
wu16(sampleRate);            // sample rate
wu32(8176);                  // low freq  (8.176 Hz in mHz)
wu32(12543854);              // high freq (12543.854 Hz in mHz)
wu32(rootFreq);              // root freq (in mHz)
wi16(512);                   // tune
wu8(7);                      // balance
for (let i = 0; i < 6; i++) wu8(63);    // envelope rates  (all 63)
for (let i = 0; i < 6; i++) wu8(246);   // envelope offsets (matches freepats one-shot drums)
wu8(0);                      // tremolo sweep
wu8(0);                      // tremolo rate
wu8(0);                      // tremolo depth
wu8(0);                      // vibrato sweep
wu8(0);                      // vibrato rate
wu8(0);                      // vibrato depth
wu8(65);                     // modes: MODES_16BIT (1) | MODES_ENVELOPE (64) — matches freepats one-shot drums
wu16(60);                    // scale freq
wu16(1024);                  // scale factor
skip(36);                    // reserved

if (off !== 335) {
  console.error(`Internal error: header is ${off} bytes, expected 335`);
  process.exit(1);
}

// ── Write output ────────────────────────────────────────────────────────────

const outDir = path.dirname(outputFile);
if (outDir && !fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outputFile, Buffer.concat([header, sampleData]));

const durationMs = Math.round((waveSize / 2 / sampleRate) * 1000);
const noteNames  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName   = noteNames[note % 12] + (Math.floor(note / 12) - 1);

console.log(`${outputFile}`);
console.log(`  sample rate : ${sampleRate} Hz`);
console.log(`  duration    : ${durationMs} ms  (${waveSize} bytes PCM)`);
console.log(`  root note   : MIDI ${note}  ${noteName}  (${rootFreq} mHz)`);

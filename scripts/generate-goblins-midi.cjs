'use strict';

const fs = require('fs');
const path = require('path');

function createMidiFile(outputPath) {
  // MIDI Header: 'MThd' (4 bytes), Header length (4 bytes = 6), Format (2 bytes = 0), Tracks (2 bytes = 1), Division (2 bytes = 480)
  const header = Buffer.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0 // 480 PPQ
  ]);

  const trackEvents = [];

  // Delta time 0, Program Change (0xC0), Program 102 (0x66)
  trackEvents.push(0x00, 0xc0, 0x66);

  // Delta time 0, Note On (0x90), Note 62 (D4), Velocity 100
  trackEvents.push(0x00, 0x90, 0x3e, 0x64);

  // Delta time 480*4 (one bar at 4/4), Note Off (0x80), Note 62 (D4), Velocity 0
  // Variable length quantity for 1920 (0x07 * 128 + 0x80 = 0x0F 0x00 is not right)
  // 1920 = 0x780 = (0x0F << 7) | 0x00 -> 0x8F, 0x00
  trackEvents.push(0x8f, 0x00, 0x80, 0x3e, 0x00);

  // Delta time 0, End of Track (0xFF 0x2F 0x00)
  trackEvents.push(0x00, 0xff, 0x2f, 0x00);

  const trackData = Buffer.from(trackEvents);
  const trackHeader = Buffer.alloc(8);
  trackHeader.write('MTrk', 0);
  trackHeader.writeUInt32BE(trackData.length, 4);

  const finalMidi = Buffer.concat([header, trackHeader, trackData]);
  fs.writeFileSync(outputPath, finalMidi);
  console.log(`MIDI file created at ${outputPath}`);
}

const outputPath = path.join(__dirname, '..', 'public', 'music', 'goblins.mid');
createMidiFile(outputPath);

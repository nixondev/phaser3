const fs = require('fs');
const path = require('path');

function createMinimalWav() {
  const numChannels = 1;
  const sampleRate = 44100;
  const bitsPerSample = 16;
  const numSamples = 1;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const chunkSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(chunkSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // subchunk1size
  buf.writeUInt16LE(1, 20); // audioFormat (PCM)
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // data is already 0 (silence)
  return buf;
}

const wav = createMinimalWav();
const reverbDir = path.join(__dirname, '..', 'public', 'music', 'reverb');
const files = ['city.wav', 'hospital.wav', 'indoor.wav', 'sewer.wav', 'substation.wav'];

files.forEach(file => {
  fs.writeFileSync(path.join(reverbDir, file), wav);
  console.log(`Created valid minimal WAV: ${file}`);
});

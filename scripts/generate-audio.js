import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_RATE = 44100;
const DURATION = 23.0;
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);

const buffer = new Float32Array(NUM_SAMPLES);

function addTone(startSec, durationSec, freq, type = 'square', volume = 0.25, endFreq = null) {
  const startSample = Math.floor(startSec * SAMPLE_RATE);
  const totalSamples = Math.floor(durationSec * SAMPLE_RATE);

  for (let i = 0; i < totalSamples; i++) {
    const idx = startSample + i;
    if (idx >= NUM_SAMPLES) break;

    const t = i / SAMPLE_RATE;
    const progress = i / totalSamples;
    const currentFreq = endFreq !== null ? freq + (endFreq - freq) * progress : freq;

    let sample = 0;
    const phase = 2 * Math.PI * currentFreq * t;

    if (type === 'square') {
      sample = Math.sin(phase) >= 0 ? 1 : -1;
    } else if (type === 'triangle') {
      sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else if (type === 'sine') {
      sample = Math.sin(phase);
    } else if (type === 'noise') {
      sample = (Math.random() * 2 - 1);
    }

    let env = 1.0;
    const attack = 0.005 * SAMPLE_RATE;
    const decay = totalSamples - attack;
    if (i < attack) {
      env = i / attack;
    } else {
      env = Math.max(0, 1 - (i - attack) / decay);
    }

    buffer[idx] += sample * volume * env;
  }
}

// 1. Scene 1: Solo Hook on 3D Laptop (0.0 - 3.5s)
for (let t = 0.2; t <= 2.0; t += 0.09) {
  addTone(t, 0.02, 750 + (Math.random() * 80), 'square', 0.03);
}
addTone(1.4, 0.12, 600, 'square', 0.22, 900); // Dino Solo Jump
addTone(1.85, 0.03, 180, 'triangle', 0.15);  // Landing tap

// 2. Scene 2: Multiplayer Reveal with 3D Rotation (3.5 - 7.0s)
addTone(3.5, 0.08, 440, 'square', 0.2, 554);
addTone(3.58, 0.14, 554, 'square', 0.25, 880);
addTone(3.72, 0.25, 220, 'triangle', 0.3);
addTone(4.6, 0.12, 620, 'square', 0.22, 920); // P1 Jump
addTone(5.5, 0.12, 520, 'square', 0.22, 820); // P2 Jump
addTone(6.4, 0.1, 1046, 'sine', 0.22);
addTone(6.52, 0.14, 1318, 'sine', 0.25);

// 3. Scene 3: Customize Skins & Colors (7.0 - 10.5s)
addTone(7.0, 0.08, 400, 'triangle', 0.15);
const skinTimes = [7.6, 8.2, 8.8, 9.4, 10.0];
skinTimes.forEach((st, idx) => {
  addTone(st, 0.035, 800 + idx * 80, 'square', 0.18);
});

// 4. Scene 4: Room Create & Share Code (10.5 - 13.5s)
addTone(10.8, 0.06, 320, 'square', 0.25); // Click "Crear Sala"
addTone(11.4, 0.05, 880, 'sine', 0.2);     // Code badge pop
addTone(11.48, 0.05, 1108, 'sine', 0.2);
addTone(11.56, 0.08, 1320, 'sine', 0.25);
addTone(12.5, 0.05, 440, 'triangle', 0.2); // Click "Copiar"
addTone(12.65, 0.12, 1480, 'sine', 0.22);  // Feedback chime
addTone(12.75, 0.2, 1760, 'sine', 0.25);

// 5. Scene 5: Mobile Crossplay Showcase (13.5 - 16.5s)
addTone(13.5, 0.15, 300, 'triangle', 0.2, 600); // 3D Mobile swoop
addTone(14.2, 0.04, 900, 'square', 0.18);        // Mobile touch tap
addTone(14.3, 0.11, 580, 'square', 0.22, 850);   // Mobile jump
addTone(15.2, 0.04, 900, 'square', 0.18);        // Mobile touch tap duck
addTone(15.3, 0.08, 450, 'square', 0.2, 350);    // Duck whoosh

// 6. Scene 6: Intense Gameplay & Crash (16.5 - 19.5s)
addTone(16.8, 0.11, 600, 'square', 0.2, 880);
addTone(17.4, 0.11, 580, 'square', 0.2, 860);
// Rival crashes at 18.2s!
addTone(18.2, 0.28, 140, 'noise', 0.45);
addTone(18.2, 0.22, 110, 'square', 0.35, 70);
// Victory fanfare (C5 -> E5 -> G5 -> C6)
addTone(18.6, 0.08, 523.25, 'square', 0.2);
addTone(18.68, 0.08, 659.25, 'square', 0.22);
addTone(18.76, 0.08, 783.99, 'square', 0.25);
addTone(18.84, 0.35, 1046.50, 'square', 0.28);

// 7. Scene 7: Real Browser Typing & Outro (19.5 - 23.0s)
const urlStr = 'https://dino-1v1.vercel.app/';
let typeStart = 19.7;
for (let i = 0; i < urlStr.length; i++) {
  addTone(typeStart, 0.02, 600 + (Math.random() * 200), 'triangle', 0.12);
  typeStart += 0.045;
}
addTone(21.15, 0.06, 250, 'square', 0.25); // Enter keypress
// Sustained C Major power chord
addTone(21.3, 1.6, 261.63, 'square', 0.12); // C4
addTone(21.3, 1.6, 329.63, 'square', 0.12); // E4
addTone(21.3, 1.6, 392.00, 'square', 0.12); // G4
addTone(21.3, 1.7, 523.25, 'square', 0.14); // C5

// Encode to 16-bit PCM WAV
const pcmData = new Int16Array(NUM_SAMPLES);
for (let i = 0; i < NUM_SAMPLES; i++) {
  const val = Math.max(-1, Math.min(1, buffer[i]));
  pcmData[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
}

function writeWavFile(filepath, samples, sampleRate) {
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  fs.writeFileSync(filepath, buffer);
}

const outWav = path.resolve(__dirname, '../public/trailer-audio.wav');
writeWavFile(outWav, pcmData, SAMPLE_RATE);
console.log(`✓ Audio de 23s generado en ${outWav}`);

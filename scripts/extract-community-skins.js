import fs from 'fs';
import zlib from 'zlib';

const buf = fs.readFileSync('Browser Games - Google Dinosaur Run Game - Playable Characters - Dinosaur.png');
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);

let pos = 8;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
  pos += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = 4;
const stride = 1 + width * bpp;
const uncompressed = Buffer.alloc(width * height * bpp);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

let prevRow = Buffer.alloc(width * bpp);
for (let y = 0; y < height; y++) {
  const filter = raw[y * stride];
  const currentRow = Buffer.alloc(width * bpp);
  for (let x = 0; x < width * bpp; x++) {
    const rawByte = raw[y * stride + 1 + x];
    const left = x >= bpp ? currentRow[x - bpp] : 0;
    const up = prevRow[x];
    const upLeft = x >= bpp ? prevRow[x - bpp] : 0;
    let val = 0;
    if (filter === 0) val = rawByte;
    else if (filter === 1) val = (rawByte + left) & 0xff;
    else if (filter === 2) val = (rawByte + up) & 0xff;
    else if (filter === 3) val = (rawByte + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) val = (rawByte + paeth(left, up, upLeft)) & 0xff;
    currentRow[x] = val;
  }
  currentRow.copy(uncompressed, y * width * bpp);
  prevRow = currentRow;
}

const bgR = uncompressed[0], bgG = uncompressed[1], bgB = uncompressed[2];

function isBg(r, g, b) {
  return Math.abs(r - bgR) < 15 && Math.abs(g - bgG) < 15 && Math.abs(b - bgB) < 15;
}

// 7 Authentic Google Chrome Community Skins
const SKINS_DEF = [
  {
    id: 'classic',
    name: 'T-Rex Clásico Original',
    targetHeight: 47,
    duckHeight: 30,
    frames: {
      idle: { sx: 55, sy: 3, w: 44, h: 47 },
      run1: { sx: 104, sy: 3, w: 44, h: 47 },
      run2: { sx: 153, sy: 3, w: 44, h: 47 },
      dead: { sx: 202, sy: 3, w: 44, h: 47 },
      duck1: { sx: 349, sy: 20, w: 59, h: 30 },
      duck2: { sx: 413, sy: 20, w: 59, h: 30 },
    }
  },
  {
    id: 'party',
    name: 'T-Rex Cumpleaños 🥳',
    targetHeight: 63,
    duckHeight: 43,
    frames: {
      idle: { sx: 55, sy: 158, w: 44, h: 61 },
      run1: { sx: 104, sy: 156, w: 44, h: 63 },
      run2: { sx: 153, sy: 156, w: 44, h: 63 },
      dead: { sx: 204, sy: 157, w: 40, h: 60 },
      duck1: { sx: 251, sy: 176, w: 59, h: 43 },
      duck2: { sx: 315, sy: 176, w: 59, h: 43 },
    }
  },
  {
    id: 'hurdles',
    name: 'T-Rex Atleta 🏃',
    targetHeight: 47,
    duckHeight: 38,
    frames: {
      idle: { sx: 701, sy: 396, w: 44, h: 47 },
      run1: { sx: 544, sy: 396, w: 44, h: 47 },
      run2: { sx: 591, sy: 396, w: 44, h: 47 },
      dead: { sx: 748, sy: 398, w: 40, h: 43 },
      duck1: { sx: 638, sy: 396, w: 60, h: 38 },
      duck2: { sx: 638, sy: 396, w: 60, h: 38 },
    }
  },
  {
    id: 'gymnastics',
    name: 'T-Rex Gimnasta 🤸',
    targetHeight: 47,
    duckHeight: 35,
    frames: {
      idle: { sx: 441, sy: 398, w: 44, h: 47 },
      run1: { sx: 253, sy: 398, w: 44, h: 47 },
      run2: { sx: 300, sy: 398, w: 44, h: 47 },
      dead: { sx: 489, sy: 400, w: 40, h: 43 },
      duck1: { sx: 397, sy: 398, w: 40, h: 40 },
      duck2: { sx: 350, sy: 398, w: 42, h: 54 },
    }
  },
  {
    id: 'surfing',
    name: 'T-Rex Surfista 🏄',
    targetHeight: 55,
    duckHeight: 45,
    frames: {
      idle: { sx: 6, sy: 462, w: 50, h: 55 },
      run1: { sx: 61, sy: 462, w: 50, h: 51 },
      run2: { sx: 115, sy: 462, w: 50, h: 55 },
      dead: { sx: 169, sy: 462, w: 50, h: 55 },
      duck1: { sx: 61, sy: 462, w: 50, h: 51 },
      duck2: { sx: 115, sy: 462, w: 50, h: 55 },
    }
  },
  {
    id: 'equestrian',
    name: 'T-Rex Ecuestre 🐎',
    targetHeight: 67,
    duckHeight: 55,
    frames: {
      idle: { sx: 6, sy: 381, w: 50, h: 67 },
      run1: { sx: 6, sy: 381, w: 50, h: 67 },
      run2: { sx: 61, sy: 381, w: 50, h: 67 },
      dead: { sx: 188, sy: 383, w: 46, h: 62 },
      duck1: { sx: 123, sy: 381, w: 54, h: 71 },
      duck2: { sx: 123, sy: 381, w: 54, h: 71 },
    }
  },
  {
    id: 'swimming',
    name: 'T-Rex Natación 🏊',
    targetHeight: 35,
    duckHeight: 26,
    frames: {
      idle: { sx: 803, sy: 411, w: 65, h: 30 },
      run1: { sx: 803, sy: 411, w: 65, h: 30 },
      run2: { sx: 871, sy: 411, w: 65, h: 30 },
      dead: { sx: 939, sy: 411, w: 63, h: 32 },
      duck1: { sx: 1005, sy: 413, w: 61, h: 26 },
      duck2: { sx: 1005, sy: 413, w: 61, h: 26 },
    }
  }
];

// Layout on output sheet
// Each skin gets a row with 6 frames: idle, run1, run2, dead, duck1, duck2
const rowHeight = 78;
const totalSheetWidth = 420;
const totalSheetHeight = rowHeight * SKINS_DEF.length;

const sheetBuf = Buffer.alloc(totalSheetWidth * totalSheetHeight * 4); // All zeros = transparent!

const skinMetadata = {};

SKINS_DEF.forEach((skin, rowIndex) => {
  const rowStartY = rowIndex * rowHeight;
  let currentX = 4;

  const skinFrames = {
    id: skin.id,
    name: skin.name,
    targetHeight: skin.targetHeight,
    duckHeight: skin.duckHeight,
  };

  const frameKeys = ['idle', 'run1', 'run2', 'dead', 'duck1', 'duck2'];

  frameKeys.forEach((fKey) => {
    const src = skin.frames[fKey];
    // Align frame to bottom of the row so ground alignments match
    const destY = rowStartY + (rowHeight - src.h - 4);
    const destRect = { x: currentX, y: destY, w: src.w, h: src.h };

    if (fKey === 'idle') skinFrames.idle = destRect;
    if (fKey === 'run1') skinFrames.run = [destRect];
    if (fKey === 'run2') skinFrames.run.push(destRect);
    if (fKey === 'dead') skinFrames.dead = destRect;
    if (fKey === 'duck1') skinFrames.duck = [destRect];
    if (fKey === 'duck2') skinFrames.duck.push(destRect);

    // Copy exact pixels from source, making background cyan transparent
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const srcIdx = ((src.sy + y) * width + (src.sx + x)) * 4;
        const r = uncompressed[srcIdx], g = uncompressed[srcIdx+1], b = uncompressed[srcIdx+2];

        if (isBg(r, g, b)) continue; // Keep transparent!

        const destIdx = ((destY + y) * totalSheetWidth + (currentX + x)) * 4;
        sheetBuf[destIdx] = r;
        sheetBuf[destIdx+1] = g;
        sheetBuf[destIdx+2] = b;
        sheetBuf[destIdx+3] = 255;
      }
    }

    currentX += src.w + 6;
  });

  skinMetadata[skin.id] = skinFrames;
});

// Encode PNG
const filtered = Buffer.alloc(totalSheetHeight * (1 + totalSheetWidth * 4));
for (let y = 0; y < totalSheetHeight; y++) {
  filtered[y * (1 + totalSheetWidth * 4)] = 0;
  sheetBuf.copy(filtered, y * (1 + totalSheetWidth * 4) + 1, y * totalSheetWidth * 4, (y + 1) * totalSheetWidth * 4);
}
const compressed = zlib.deflateSync(filtered);

function crc32(b) {
  let crc = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    crc ^= b[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(totalSheetWidth, 0);
ihdr.writeUInt32BE(totalSheetHeight, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  header,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', compressed),
  makeChunk('IEND', Buffer.alloc(0))
]);

fs.writeFileSync('public/dino-skins.png', png);
fs.writeFileSync('src/render/skin-data.json', JSON.stringify(skinMetadata, null, 2));

console.log('Successfully extracted 7 authentic Google community skins into public/dino-skins.png and src/render/skin-data.json');

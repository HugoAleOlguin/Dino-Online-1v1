import fs from 'fs';
import zlib from 'zlib';

// 1. Read base PNG
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

function extractMask(sx, sy, w, h) {
  const mask = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const idx = ((sy + y) * width + (sx + x)) * 4;
      const r = uncompressed[idx], g = uncompressed[idx+1], b = uncompressed[idx+2];
      const isBg = Math.abs(r - bgR) < 20 && Math.abs(g - bgG) < 20 && Math.abs(b - bgB) < 20;
      row.push(isBg ? 0 : 1);
    }
    mask.push(row);
  }
  return mask;
}

const baseFrames = {
  idle: extractMask(55, 3, 44, 47),
  run1: extractMask(104, 3, 44, 47),
  run2: extractMask(153, 3, 44, 47),
  dead: extractMask(202, 3, 44, 47),
  duck1: extractMask(349, 20, 59, 30),
  duck2: extractMask(413, 20, 59, 30),
};

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

function hexToRgb(hex: string): ColorRGB {
  const num = parseInt(hex.replace('#', ''), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: 255
  };
}

// 8 Unique Handcrafted Skins
interface SkinSpec {
  id: string;
  name: string;
  bodyColor: string;
  highlightColor: string;
  shadowColor: string;
  eyeWhiteColor: string;
  pupilColor: string;
  accentPattern: (x: number, y: number, w: number, h: number, isDuck: boolean) => ColorRGB | null;
}

const SKINS_DEF: SkinSpec[] = [
  {
    id: 'classic',
    name: 'T-Rex Clásico HD',
    bodyColor: '#acacac',
    highlightColor: '#d6d8db',
    shadowColor: '#787c82',
    eyeWhiteColor: '#ffffff',
    pupilColor: '#202124',
    accentPattern: () => null,
  },
  {
    id: 'skeleton',
    name: 'T-Rex Fósil 🦴',
    bodyColor: '#e9ecef',
    highlightColor: '#ffffff',
    shadowColor: '#2b2d31',
    eyeWhiteColor: '#2b2d31',
    pupilColor: '#00ff88', // Glowing fossil green eye
    accentPattern: (x, y, w, h, isDuck) => {
      // Skeletal rib lines across torso
      if (!isDuck && y >= 20 && y <= 32 && x >= 12 && x <= 28) {
        if (y % 3 === 0) return hexToRgb('#2b2d31'); // Rib gap
      }
      return null;
    },
  },
  {
    id: 'cyborg',
    name: 'T-Rex Cyborg 🤖',
    bodyColor: '#6c757d',
    highlightColor: '#adb5bd',
    shadowColor: '#343a40',
    eyeWhiteColor: '#e63946', // Crimson cyber visor
    pupilColor: '#ffffff',
    accentPattern: (x, y, w, h, isDuck) => {
      // Cyber armor seams & chest reactor core
      if (!isDuck && x >= 24 && x <= 26 && y >= 22 && y <= 24) {
        return hexToRgb('#00ffff'); // Cyan reactor core
      }
      // Bolted plating seams
      if (y === 18 && x >= 10 && x <= 32) return hexToRgb('#212529');
      return null;
    },
  },
  {
    id: 'ninja',
    name: 'T-Rex Ninja 🥷',
    bodyColor: '#212529',
    highlightColor: '#343a40',
    shadowColor: '#121416',
    eyeWhiteColor: '#ffffff',
    pupilColor: '#111111',
    accentPattern: (x, y, w, h, isDuck) => {
      // Red headband across forehead and trailing behind head
      if (!isDuck) {
        if (y >= 4 && y <= 5 && x >= 20 && x <= 42) {
          return hexToRgb('#e63946'); // Red headband
        }
        // Trailing ribbon behind head
        if (x >= 14 && x <= 19 && y >= 4 && y <= 6) {
          return hexToRgb('#d90429');
        }
      }
      return null;
    },
  },
  {
    id: 'magma',
    name: 'T-Rex Volcánico 🔥',
    bodyColor: '#1f1f1f',
    highlightColor: '#2e2e2e',
    shadowColor: '#0f0f0f',
    eyeWhiteColor: '#ffb703',
    pupilColor: '#d00000',
    accentPattern: (x, y, w, h, isDuck) => {
      // Glowing lava cracks through rock
      if ((x + y * 2) % 11 === 0 && x > 8 && y > 8) {
        return hexToRgb('#fb8500'); // Hot lava orange
      }
      if ((x * 2 + y) % 13 === 0 && x > 10 && y > 10) {
        return hexToRgb('#ffb703'); // Molten yellow
      }
      return null;
    },
  },
  {
    id: 'gold',
    name: 'T-Rex Trofeo 🏆',
    bodyColor: '#f59e0b',
    highlightColor: '#fde047',
    shadowColor: '#b45309',
    eyeWhiteColor: '#ffffff',
    pupilColor: '#b91c1c', // Ruby eye
    accentPattern: (x, y, w, h) => {
      // Shimmering crown on head
      if (y <= 2 && x >= 28 && x <= 36) {
        return hexToRgb('#fef08a');
      }
      return null;
    },
  },
  {
    id: 'party',
    name: 'T-Rex Fiesta 🥳',
    bodyColor: '#acacac',
    highlightColor: '#d6d8db',
    shadowColor: '#787c82',
    eyeWhiteColor: '#ffffff',
    pupilColor: '#202124',
    accentPattern: (x, y, w, h, isDuck) => {
      // Colorful Party Hat on top of head
      if (!isDuck && y <= 6 && x >= 26 && x <= 34) {
        const hatY = y;
        if (hatY === 0) return hexToRgb('#ff007f'); // Pom-pom
        if (hatY <= 2) return hexToRgb('#ffd700'); // Yellow tip
        if (hatY <= 4) return hexToRgb('#00e5ff'); // Cyan band
        return hexToRgb('#ff007f'); // Pink base
      }
      return null;
    },
  },
  {
    id: 'emerald',
    name: 'T-Rex Esmeralda 💎',
    bodyColor: '#10b981',
    highlightColor: '#6ee7b7',
    shadowColor: '#047857',
    eyeWhiteColor: '#ffffff',
    pupilColor: '#064e3b',
    accentPattern: (x, y, w, h) => {
      // Crystalline facets
      if ((x + y) % 7 === 0 && x > 10 && y > 10) {
        return hexToRgb('#a7f3d0');
      }
      return null;
    },
  },
];

// Layout for spritesheet:
// Each skin gets 1 row:
// Total columns per row:
// Frame 0: Idle (44x47)
// Frame 1: Run1 (44x47)
// Frame 2: Run2 (44x47)
// Frame 3: Dead (44x47)
// Frame 4: Duck1 (59x30)
// Frame 5: Duck2 (59x30)

const frameWidths = [44, 44, 44, 44, 59, 59];
const rowWidth = 44 * 4 + 59 * 2 + 30; // ~324px
const rowHeight = 52;
const totalSheetWidth = rowWidth;
const totalSheetHeight = rowHeight * SKINS_DEF.length;

const sheetBuf = Buffer.alloc(totalSheetWidth * totalSheetHeight * 4); // All transparent

const skinMetadata: Record<string, any> = {};

SKINS_DEF.forEach((skin, rowIndex) => {
  const rowStartY = rowIndex * rowHeight;
  let currentX = 4;

  const skinFrames: any = {
    id: skin.id,
    name: skin.name,
    targetHeight: 47,
    duckHeight: 30,
  };

  const frameTypes = ['idle', 'run1', 'run2', 'dead', 'duck1', 'duck2'];

  frameTypes.forEach((fType, colIndex) => {
    const isDuck = fType.startsWith('duck');
    const mask = (baseFrames as any)[fType];
    const fw = isDuck ? 59 : 44;
    const fh = isDuck ? 30 : 47;
    const destY = rowStartY + (rowHeight - fh - 2);

    const frameRect = { x: currentX, y: destY, w: fw, h: fh };

    if (fType === 'idle') skinFrames.idle = frameRect;
    if (fType === 'run1') skinFrames.run = [frameRect];
    if (fType === 'run2') skinFrames.run.push(frameRect);
    if (fType === 'dead') skinFrames.dead = frameRect;
    if (fType === 'duck1') skinFrames.duck = [frameRect];
    if (fType === 'duck2') skinFrames.duck.push(frameRect);

    const bodyCol = hexToRgb(skin.bodyColor);
    const hiCol = hexToRgb(skin.highlightColor);
    const shCol = hexToRgb(skin.shadowColor);
    const eyeWhite = hexToRgb(skin.eyeWhiteColor);
    const pupilCol = hexToRgb(skin.pupilColor);

    // Render this frame
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        if (!mask[y] || mask[y][x] === 0) continue;

        const destIdx = ((destY + y) * totalSheetWidth + (currentX + x)) * 4;

        // Check if eye area
        let isEyeWhite = false;
        let isPupil = false;

        if (!isDuck) {
          // Standing Dino Eye:
          // Eye socket: x: 27..30, y: 5..8
          if (x >= 27 && x <= 30 && y >= 5 && y <= 8) {
            isEyeWhite = true;
            if (fType === 'dead') {
              // Dead frame: Open pupil with red or X
              if (x >= 28 && x <= 29 && y >= 6 && y <= 7) isPupil = true;
            } else {
              // Living pupil at x: 28..29, y: 6..7
              if (x >= 28 && x <= 29 && y >= 6 && y <= 7) isPupil = true;
            }
          }
        } else {
          // Ducking Dino Eye:
          if (x >= 44 && x <= 47 && y >= 5 && y <= 7) {
            isEyeWhite = true;
            if (x >= 45 && x <= 46 && y === 6) isPupil = true;
          }
        }

        if (isPupil) {
          sheetBuf[destIdx] = pupilCol.r;
          sheetBuf[destIdx + 1] = pupilCol.g;
          sheetBuf[destIdx + 2] = pupilCol.b;
          sheetBuf[destIdx + 3] = 255;
          continue;
        }

        if (isEyeWhite) {
          sheetBuf[destIdx] = eyeWhite.r;
          sheetBuf[destIdx + 1] = eyeWhite.g;
          sheetBuf[destIdx + 2] = eyeWhite.b;
          sheetBuf[destIdx + 3] = 255;
          continue;
        }

        // Check custom skin accent patterns
        const customColor = skin.accentPattern(x, y, fw, fh, isDuck);
        if (customColor) {
          sheetBuf[destIdx] = customColor.r;
          sheetBuf[destIdx + 1] = customColor.g;
          sheetBuf[destIdx + 2] = customColor.b;
          sheetBuf[destIdx + 3] = 255;
          continue;
        }

        // Shading & Relief
        // Top & front edges get highlight
        const isTopEdge = (y <= 2) || (y <= 8 && x >= 36);
        // Bottom edges & inner legs get shadow
        const isBottomEdge = (y >= fh - 8) || (y >= 26 && x <= 18);

        let finalColor = bodyCol;
        if (isTopEdge) finalColor = hiCol;
        else if (isBottomEdge) finalColor = shCol;

        sheetBuf[destIdx] = finalColor.r;
        sheetBuf[destIdx + 1] = finalColor.g;
        sheetBuf[destIdx + 2] = finalColor.b;
        sheetBuf[destIdx + 3] = 255;
      }
    }

    currentX += fw + 4;
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

function crc32(b: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    crc ^= b[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeChunk(type: string, data: Buffer) {
  const len = data.length;
  const b = Buffer.alloc(12 + len);
  b.writeUInt32BE(len, 0);
  b.write(type, 4, 4, 'ascii');
  data.copy(b, 8);
  const typeAndData = b.subarray(4, 8 + len);
  b.writeUInt32BE(crc32(typeAndData), 8 + len);
  return b;
}

const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(totalSheetWidth, 0);
ihdrData.writeUInt32BE(totalSheetHeight, 4);
ihdrData[8] = 8;
ihdrData[9] = 6;
const ihdr = makeChunk('IHDR', ihdrData);
const idatChunk = makeChunk('IDAT', compressed);
const iend = makeChunk('IEND', Buffer.alloc(0));

const out = Buffer.concat([header, ihdr, idatChunk, iend]);
fs.writeFileSync('public/dino-skins.png', out);
fs.writeFileSync('src/render/skin-data.json', JSON.stringify(skinMetadata, null, 2));
console.log('Successfully generated public/dino-skins.png and src/render/skin-data.json!');

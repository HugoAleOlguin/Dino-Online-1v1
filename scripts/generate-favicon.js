import fs from 'fs';
import zlib from 'zlib';

const buf = fs.readFileSync('public/dino-skins.png');
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
const stride = 1 + width * 4;
const uncompressed = Buffer.alloc(width * height * 4);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

let prevRow = Buffer.alloc(width * 4);
for (let y = 0; y < height; y++) {
  const filter = raw[y * stride];
  const currentRow = Buffer.alloc(width * 4);
  for (let x = 0; x < width * 4; x++) {
    const rawByte = raw[y * stride + 1 + x];
    const left = x >= 4 ? currentRow[x - 4] : 0;
    const up = prevRow[x];
    const upLeft = x >= 4 ? prevRow[x - 4] : 0;
    let val = 0;
    if (filter === 0) val = rawByte;
    else if (filter === 1) val = (rawByte + left) & 0xff;
    else if (filter === 2) val = (rawByte + up) & 0xff;
    else if (filter === 3) val = (rawByte + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) val = (rawByte + paeth(left, up, upLeft)) & 0xff;
    currentRow[x] = val;
  }
  currentRow.copy(uncompressed, y * width * 4);
  prevRow = currentRow;
}

// Dino classic idle sprite is at x=4, y=27, w=44, h=47
const dinoX = 4;
const dinoY = 27;
const dinoW = 44;
const dinoH = 47;

let svgRects = '';
for (let dy = 0; dy < dinoH; dy++) {
  for (let dx = 0; dx < dinoW; dx++) {
    const idx = ((dinoY + dy) * width + (dinoX + dx)) * 4;
    const r = uncompressed[idx];
    const g = uncompressed[idx + 1];
    const b = uncompressed[idx + 2];
    const a = uncompressed[idx + 3];

    if (a > 30) {
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      svgRects += `<rect x="${dx}" y="${dy}" width="1" height="1" fill="${hex}"/>\n`;
    }
  }
}

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 47" shape-rendering="crispEdges">
${svgRects}
</svg>`;

fs.writeFileSync('public/favicon.svg', svgContent.trim());
console.log('Generated public/favicon.svg successfully!');

// Also write a 48x48 PNG with 2px padding
const targetSize = 48;
const targetBuf = Buffer.alloc(targetSize * targetSize * 4, 0); // transparent background

// Center 44x47 in 48x48: offset x=2, y=0
const offsetX = 2;
const offsetY = 0;

for (let dy = 0; dy < dinoH; dy++) {
  for (let dx = 0; dx < dinoW; dx++) {
    const srcIdx = ((dinoY + dy) * width + (dinoX + dx)) * 4;
    const destIdx = ((offsetY + dy) * targetSize + (offsetX + dx)) * 4;
    targetBuf[destIdx] = uncompressed[srcIdx];
    targetBuf[destIdx + 1] = uncompressed[srcIdx + 1];
    targetBuf[destIdx + 2] = uncompressed[srcIdx + 2];
    targetBuf[destIdx + 3] = uncompressed[srcIdx + 3];
  }
}

function makePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  function createChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    const crc = zlib.crc32(chunk.subarray(4, 8 + len));
    chunk.writeUInt32BE(crc >>> 0, 8 + len);
    return chunk;
  }

  const rawLines = [];
  const lineStride = width * 4;
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + lineStride);
    line[0] = 0; // Filter: None
    rgbaBuffer.copy(line, 1, y * lineStride, (y + 1) * lineStride);
    rawLines.push(line);
  }
  const idatData = zlib.deflateSync(Buffer.concat(rawLines));

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', idatData),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

const pngBuf = makePng(targetSize, targetSize, targetBuf);
fs.writeFileSync('public/favicon.png', pngBuf);
console.log('Generated public/favicon.png successfully!');


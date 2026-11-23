import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]);
  const out = Buffer.alloc(data.length + 8);
  out.writeUInt32BE(bytes.length); data.copy(out, 4); out.writeUInt32BE(crc32(data), data.length + 4);
  return out;
}

// Brand blue (#2563EB) means Pause after; ordinary held access stays orange-yellow.
export function iconPng(availability, size = 32) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const scale = size / 32;
  const rgb = availability === 'available' ? [28, 177, 98] : availability === 'in_use' ? [245, 179, 1] : availability === 'pausing' ? [37, 99, 235] : [229, 63, 73];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + 0.5) / scale - 16, (y + 0.5) / scale - 16);
    const edge = Math.min(1, Math.max(0, 12.5 - radius));
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set([...rgb, Math.round(255 * edge)], offset);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

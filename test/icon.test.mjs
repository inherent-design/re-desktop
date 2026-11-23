import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { iconPng } from '../src/icon.mjs';

test('Tray PNGs retain transparent edges and distinct human-policy colors at native sizes', () => {
  for (const size of [16, 32, 64, 128]) {
    for (const [mode, rgb] of Object.entries({ available: [28, 177, 98], blocked: [229, 63, 73], in_use: [245, 179, 1], pausing: [37, 99, 235] })) {
      const png = iconPng(mode, size);
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png[25], 6, 'Native status artwork is RGBA');
      let offset = 8;
      const parts = [];
      while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
      }
      const pixels = inflateSync(Buffer.concat(parts)), stride = size * 4 + 1;
      const center = Math.floor(size / 2) * stride + 1 + Math.floor(size / 2) * 4;
      assert.deepEqual([...pixels.subarray(center, center + 4)], [...rgb, 255]);
      assert.equal(pixels[4], 0, 'The corner remains transparent');
      assert.ok(Array.from({ length: size * size }, (_, i) => pixels[Math.floor(i / size) * stride + 1 + i % size * 4 + 3]).some(a => a > 0 && a < 255), 'Disc edges are antialiased');
    }
  }
});

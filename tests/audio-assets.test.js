import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MOODS} from '../shared/analysis.js';

// Inspect the committed bytes directly: no Python, media player, or build output
// is required to catch truncated uploads, text-encoded binaries, or silent audio.
function waveChunks(bytes) {
  assert.ok(bytes.length >= 12, 'WAV header is incomplete');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'RIFF length must match the actual file');

  const chunks = new Map();
  let offset = 12;
  while (offset < bytes.length) {
    assert.ok(offset + 8 <= bytes.length, 'Chunk header is incomplete');
    const id = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    const paddedEnd = end + (length % 2);
    assert.ok(paddedEnd <= bytes.length, `${id} chunk extends beyond the file`);
    if (id === 'fmt ' || id === 'data') {
      assert.ok(!chunks.has(id), `Duplicate ${id} chunk`);
      chunks.set(id, bytes.subarray(offset + 8, end));
    }
    offset = paddedEnd;
  }
  assert.equal(offset, bytes.length, 'Chunk boundaries must consume the complete file');
  return chunks;
}

for (const mood of MOODS) {
  test(`${mood}.wav contains a complete, audible 16-second PCM soundtrack`, async () => {
    const bytes = await readFile(new URL(`../public/music/${mood}.wav`, import.meta.url));
    const chunks = waveChunks(bytes);
    const format = chunks.get('fmt ');
    const data = chunks.get('data');
    assert.ok(format && format.length >= 16, 'Missing or incomplete format chunk');
    assert.ok(data && data.length > 0, 'Missing or empty audio data');

    const codec = format.readUInt16LE(0);
    const channels = format.readUInt16LE(2);
    const sampleRate = format.readUInt32LE(4);
    const byteRate = format.readUInt32LE(8);
    const blockAlign = format.readUInt16LE(12);
    const bitDepth = format.readUInt16LE(14);
    assert.equal(codec, 1, 'Use uncompressed integer PCM for browser/editor compatibility');
    assert.equal(channels, 1);
    assert.equal(sampleRate, 22050);
    assert.equal(bitDepth, 16);
    assert.equal(blockAlign, channels * bitDepth / 8);
    assert.equal(byteRate, sampleRate * blockAlign);
    assert.equal(data.length % blockAlign, 0, 'Audio must contain whole frames');
    const frames = data.length / blockAlign;
    assert.equal(frames, 352800, 'The complete 16-second loop must be present');
    assert.equal(frames / sampleRate, 16);

    let squaredSum = 0;
    let peak = 0;
    for (let offset = 0; offset < data.length; offset += 2) {
      const sample = data.readInt16LE(offset) / 32768;
      squaredSum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(squaredSum / frames);
    assert.ok(rms > 0.005, `Audio is silent or nearly silent (RMS ${rms})`);
    assert.ok(peak < 0.99, `Audio must retain headroom without clipping (peak ${peak})`);
  });
}

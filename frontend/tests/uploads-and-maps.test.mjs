import test from 'node:test';
import assert from 'node:assert/strict';
import { validDocument, MAX_UPLOAD_BYTES } from '../lib/upload-validation.ts';
import { mapLinks } from '../lib/map-links.ts';

test('rejects disguised executables, empty and oversized documents', () => {
  assert.equal(validDocument(new Uint8Array([77,90,0,0]), 'application/pdf'), false);
  assert.equal(validDocument(new Uint8Array(), 'image/png'), false);
  assert.equal(validDocument(new Uint8Array(MAX_UPLOAD_BYTES + 1), 'application/pdf'), false);
  assert.equal(validDocument(new Uint8Array([37,80,68,70,45]), 'text/html'), false);
});
test('recognizes supported document signatures', () => {
  assert.equal(validDocument(new Uint8Array([37,80,68,70,45]), 'application/pdf'), true);
  assert.equal(validDocument(new Uint8Array([255,216,255]), 'image/jpeg'), true);
  assert.equal(validDocument(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), true);
  assert.equal(validDocument(new Uint8Array([137,80,78,71,13,10,26,0]), 'image/png'), false);
});
test('map names are encoded and cannot inject URL options', () => {
  const links = mapLinks('Markaz', 'Toshkent, Arnasoy 17 & api=9');
  const search = new URL(links.search);
  assert.equal(search.origin, 'https://www.google.com');
  assert.equal(search.searchParams.get('api'), '1');
  assert.ok(search.searchParams.get('query').includes('Markaz'));
  assert.ok(search.searchParams.get('query').includes('Arnasoy 17 & api=9'));
  assert.equal(new URL(links.directions).searchParams.get('origin'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectAuthReturn, cleanAuthReturn, authDestination, authRedirectUrl } from '../lib/auth-redirect.ts';

test('recognizes an OAuth return on the landing page without reading a user token', () => {
  assert.deepEqual(inspectAuthReturn('https://www.inhayat.uz/#access_token=test-only&refresh_token=test-only&type=bearer'), {
    present: true, recovery: false, hasCode: false, hasError: false, pathname: '/',
  });
});
test('removes the entire credential fragment and retains ordinary query parameters', () => {
  assert.equal(cleanAuthReturn('https://www.inhayat.uz/?lang=uz#access_token=test-only&provider_token=test-only&refresh_token=test-only'), '/?lang=uz');
});
test('ordinary section links are not treated as logins', () => {
  assert.equal(inspectAuthReturn('https://www.inhayat.uz/#centres').present, false);
  assert.equal(cleanAuthReturn('https://www.inhayat.uz/#centres'), '/#centres');
});
test('callback errors and PKCE codes are recognized and stripped', () => {
  assert.equal(inspectAuthReturn('https://www.inhayat.uz/?code=test-only').hasCode, true);
  assert.equal(cleanAuthReturn('https://www.inhayat.uz/?code=test-only&lang=uz'), '/?lang=uz');
  assert.equal(inspectAuthReturn('https://www.inhayat.uz/#error=access_denied&error_description=test-only').hasError, true);
});
test('only cabinet, admin and recovery destinations are allowed', () => {
  assert.equal(authDestination(null), '/cabinet');
  assert.equal(authDestination('/admin'), '/admin');
  assert.equal(authDestination('https://untrusted.example'), '/cabinet');
  assert.equal(authDestination('//untrusted.example'), '/cabinet');
  assert.equal(authDestination('/admin', true), '/reset-password');
});
test('uses the current origin for both local development and deployed environments', () => {
  assert.equal(authRedirectUrl('https://www.inhayat.uz', '/cabinet'), 'https://www.inhayat.uz/cabinet');
  assert.equal(authRedirectUrl('https://www.inhayat.uz', '/cabinet'), 'https://www.inhayat.uz/cabinet');
  assert.equal(authRedirectUrl('https://preview.example', '/admin'), 'https://preview.example/admin');
  assert.equal(authRedirectUrl('https://www.inhayat.uz', '/reset-password'), 'https://www.inhayat.uz/reset-password');
});

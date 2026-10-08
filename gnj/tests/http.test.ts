import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSameOrigin, HttpError } from '../src/lib/server/http';

test('accepts the real browser origin when Next listens on a wildcard address', () => {
  const request = new Request('http://0.0.0.0:3100/api/enquiries', { headers: { host: 'localhost:3100', origin: 'http://localhost:3100' } });
  assert.doesNotThrow(() => assertSameOrigin(request));
});

test('rejects an unrelated browser origin even when the destination host is allowed', () => {
  const request = new Request('http://0.0.0.0:3100/api/enquiries', { headers: { host: 'localhost:3100', origin: 'https://untrusted.example' } });
  assert.throws(() => assertSameOrigin(request), (error: unknown) => error instanceof HttpError && error.status === 403);
});

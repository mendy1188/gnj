import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createUUID } from '../src/lib/uuid';
import { comparisonSchema } from '../src/lib/validation';

test('uses native UUID generation when it is available', (context) => {
  const expected = '12345678-1234-4234-8234-123456789abc';
  const randomUUID = context.mock.fn(() => expected);
  context.mock.getter(globalThis, 'crypto', () => ({ randomUUID }) as unknown as Crypto);

  assert.equal(createUUID(), expected);
  assert.equal(randomUUID.mock.callCount(), 1);
});

test('generates distinct valid comparison IDs without crypto.randomUUID', (context) => {
  context.mock.getter(globalThis, 'crypto', () => ({
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  }) as Crypto);

  const ids = Array.from({ length: 100 }, () => createUUID());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(comparisonSchema.safeParse({ id, before_id: ids[0], after_id: ids[1] }).success, true);
  }
});

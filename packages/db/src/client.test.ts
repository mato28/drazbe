import { describe, expect, it } from 'vitest';
import { createDb } from './client';

describe('createDb', () => {
  it('creates a handle without connecting eagerly', async () => {
    const handle = createDb('postgres://user:pass@127.0.0.1:1/none');
    expect(handle.db).toBeDefined();
    await expect(handle.close()).resolves.toBeUndefined();
  });
});

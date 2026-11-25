import { describe, expect, it } from 'vitest';
import { AREAS, canAccessArea, homeAreaFor, isRole, ROLES } from './roles';

describe('canAccessArea', () => {
  it.each([
    ['ADMIN', 'admin', true],
    ['ADMIN', 'trustee', false],
    ['ADMIN', 'bidder', false],
    ['TRUSTEE', 'trustee', true],
    ['TRUSTEE', 'admin', false],
    ['TRUSTEE', 'bidder', false],
    ['BIDDER', 'bidder', true],
    ['BIDDER', 'trustee', false],
    ['BIDDER', 'admin', false],
  ] as const)('%s -> %s = %s', (role, area, expected) => {
    expect(canAccessArea(role, area)).toBe(expected);
  });

  it('denies anonymous users everywhere', () => {
    for (const area of AREAS) {
      expect(canAccessArea(null, area)).toBe(false);
      expect(canAccessArea(undefined, area)).toBe(false);
    }
  });

  it('every role can access its own home area', () => {
    for (const role of ROLES) expect(canAccessArea(role, homeAreaFor(role))).toBe(true);
  });
});

describe('isRole', () => {
  it('accepts only known roles', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

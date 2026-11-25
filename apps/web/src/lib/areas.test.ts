import { describe, expect, it } from 'vitest';
import { areaForPath, safeNextPath } from './areas';

describe('areaForPath', () => {
  it('maps prefixes to areas', () => {
    expect(areaForPath('/admin')).toBe('admin');
    expect(areaForPath('/admin/uporabniki')).toBe('admin');
    expect(areaForPath('/upravitelj')).toBe('trustee');
    expect(areaForPath('/drazitelj/prijave')).toBe('bidder');
  });

  it('does not match look-alike paths', () => {
    expect(areaForPath('/administracija')).toBeNull();
    expect(areaForPath('/')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('allows relative paths only', () => {
    expect(safeNextPath('/upravitelj')).toBe('/upravitelj');
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

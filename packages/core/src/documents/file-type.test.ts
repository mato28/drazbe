import { describe, expect, it } from 'vitest';
import { detectFileType, sanitizeFilename } from './file-type';

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('detectFileType', () => {
  it('recognizes PDF, JPEG, PNG and WEBP by content', () => {
    expect(detectFileType(new TextEncoder().encode('%PDF-1.7\n'))?.mime).toBe('application/pdf');
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe(
      'image/png',
    );
    expect(
      detectFileType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))
        ?.mime,
    ).toBe('image/webp');
  });

  it('rejects everything else, whatever it claims to be', () => {
    expect(detectFileType(new TextEncoder().encode('<html><script>'))).toBeNull();
    expect(detectFileType(new TextEncoder().encode('MZ\u0090\u0000'))).toBeNull(); // .exe
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips directories and unsafe characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\cenitev "končna".pdf')).toBe('cenitev končna.pdf');
    expect(sanitizeFilename('a\r\nb.pdf')).toBe('ab.pdf');
  });

  it('falls back for empty names and limits the length', () => {
    expect(sanitizeFilename('')).toBe('datoteka');
    expect(sanitizeFilename('..')).toBe('datoteka');
    expect(sanitizeFilename('x'.repeat(500))).toHaveLength(200);
  });
});

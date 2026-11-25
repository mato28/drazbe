export interface DetectedFileType {
  mime: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'pdf' | 'jpg' | 'png' | 'webp';
  isImage: boolean;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((b, i) => bytes[offset + i] === b);

/**
 * Detects the real file type from its leading bytes. The browser-declared MIME type and the
 * file extension are never trusted. Returns null for anything we do not accept.
 */
export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mime: 'application/pdf', extension: 'pdf', isImage: false }; // %PDF-
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', extension: 'jpg', isImage: true };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', extension: 'png', isImage: true };
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { mime: 'image/webp', extension: 'webp', isImage: true }; // RIFF....WEBP
  }
  return null;
}

/** Keeps only the base name and removes characters that are unsafe in headers / paths. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (cleaned === '' || /^\.+$/.test(cleaned) ? 'datoteka' : cleaned).slice(0, 200);
}

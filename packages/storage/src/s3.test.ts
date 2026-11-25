import { describe, expect, it } from 'vitest';
import { contentDisposition, createS3Storage } from './s3';

describe('contentDisposition', () => {
  it('encodes non-ASCII filenames per RFC 5987 with an ASCII fallback', () => {
    expect(contentDisposition('cenitev končna.pdf', true)).toBe(
      `inline; filename="cenitev kon_na.pdf"; filename*=UTF-8''cenitev%20kon%C4%8Dna.pdf`,
    );
  });

  it('cannot be broken out of with quotes', () => {
    expect(contentDisposition('a"; evil="1.pdf', false)).toBe(
      `attachment; filename="a_; evil=_1.pdf"; filename*=UTF-8''a%22%3B%20evil%3D%221.pdf`,
    );
  });
});

describe('createS3Storage', () => {
  it('signs a short-lived download URL without calling the network', async () => {
    const storage = createS3Storage({
      endpoint: 'http://localhost:9000',
      region: 'eu-central',
      bucket: 'domik',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    });
    const url = new URL(
      await storage.getDownloadUrl('lots/1/a.pdf', {
        filename: 'a.pdf',
        contentType: 'application/pdf',
        inline: true,
        expiresInSec: 120,
      }),
    );
    expect(url.origin + url.pathname).toBe('http://localhost:9000/domik/lots/1/a.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});

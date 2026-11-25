import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { decodeLatin2, encodeLatin2, isLatin2 } from './iso-8859-2';
import {
  buildUpnQrPayload,
  parseUpnQrPayload,
  qrMatrixToSvg,
  type UpnPayment,
  upnQrFields,
  upnQrMatrix,
} from './upn-qr';

const payment: UpnPayment = {
  amountCents: 2_400_000n,
  purposeCode: 'OTHR',
  purpose: 'Varščina za dražbo št. 1042, St 1234/2026',
  dueDate: new Date('2026-12-03T09:00:00Z'),
  payeeIban: 'SI56 0510 0801 2340 041',
  payeeReference: 'SI00 1042-7',
  payeeName: 'Gradbeništvo Primer d.o.o. - v stečaju',
  payeeAddress: 'Šmartinska cesta 152',
  payeeCity: '1000 Ljubljana',
};

describe('ISO 8859-2', () => {
  it('encodes Slovenian characters to single bytes and back', () => {
    const text = 'Čuček Šiška Žalec đ ć';
    const bytes = encodeLatin2(text);
    expect(bytes).toHaveLength(text.length);
    expect([...encodeLatin2('čšžČŠŽ')]).toEqual([0xe8, 0xb9, 0xbe, 0xc8, 0xa9, 0xae]);
    expect(decodeLatin2(bytes)).toBe(text);
  });

  it('replaces characters outside the set', () => {
    expect(isLatin2('Varščina')).toBe(true);
    expect(isLatin2('€ 😀')).toBe(false);
    expect(decodeLatin2(encodeLatin2('a€b'))).toBe('a?b');
  });
});

describe('UPN QR payload', () => {
  it('has the 19 fields of the standard, in order', () => {
    expect(upnQrFields(payment)).toEqual([
      'UPNQR',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '00002400000',
      '',
      '',
      'OTHR',
      'Varščina za dražbo št. 1042, St 1234/2026',
      '03.12.2026',
      'SI56051008012340041',
      'SI001042-7',
      'Gradbeništvo Primer d.o.o. - v st',
      'Šmartinska cesta 152',
      '1000 Ljubljana',
    ]);
  });

  it('ends with a control sum equal to the length of the fields incl. line feeds', () => {
    const payload = buildUpnQrPayload(payment);
    const lines = payload.split('\n');
    const body = lines.slice(0, 19).join('\n') + '\n';
    expect(lines[19]).toBe(String(body.length).padStart(3, '0'));
    expect(payload.endsWith('\n')).toBe(true);
    expect(payload.length).toBeLessThanOrEqual(411);
  });

  it('round-trips through the strict parser', () => {
    expect(parseUpnQrPayload(buildUpnQrPayload(payment))).toEqual({
      amountCents: 2_400_000n,
      purposeCode: 'OTHR',
      purpose: 'Varščina za dražbo št. 1042, St 1234/2026',
      dueDate: '03.12.2026',
      payeeIban: 'SI56051008012340041',
      payeeReference: 'SI001042-7',
      payeeName: 'Gradbeništvo Primer d.o.o. - v st',
      payeeAddress: 'Šmartinska cesta 152',
      payeeCity: '1000 Ljubljana',
    });
  });

  it('truncates long text fields and never leaks a line break into the format', () => {
    const payload = buildUpnQrPayload({
      ...payment,
      purpose: `Varščina\nza dražbo ${'x'.repeat(80)}`,
      payeeName: `  ${'A'.repeat(60)}  `,
    });
    const parsed = parseUpnQrPayload(payload);
    expect(parsed.purpose).toHaveLength(42);
    expect(parsed.purpose.startsWith('Varščina za dražbo')).toBe(true);
    expect(parsed.payeeName).toBe('A'.repeat(33));
  });

  it('refuses invalid input instead of producing an unpayable code', () => {
    expect(() => buildUpnQrPayload({ ...payment, amountCents: 0n })).toThrow(/amount/);
    expect(() => buildUpnQrPayload({ ...payment, amountCents: 100_000_000_000n })).toThrow(
      /amount/,
    );
    expect(() => buildUpnQrPayload({ ...payment, payeeReference: 'SI00 abc' })).toThrow(
      /reference/,
    );
    expect(() => buildUpnQrPayload({ ...payment, purposeCode: 'xx' })).toThrow(/purpose code/);
    expect(() => buildUpnQrPayload({ ...payment, payeeName: '  ' })).toThrow(/payee name/);
  });

  it('the parser rejects a tampered control sum or a missing field', () => {
    const payload = buildUpnQrPayload(payment);
    expect(() => parseUpnQrPayload(payload.replace('00002400000', '00002400001x'))).toThrow();
    expect(() => parseUpnQrPayload(payload.replace('OTHR\n', ''))).toThrow();
  });
});

describe('UPN QR symbol', () => {
  /** Rasterizes the matrix (4 px per module + quiet zone) for the decoder. */
  function raster(modules: boolean[][], scale = 4, quiet = 4) {
    const size = (modules.length + quiet * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (!dark) return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
        }
      });
    });
    return { data, size };
  }

  it('is version 15 (77 x 77 modules)', () => {
    expect(upnQrMatrix(buildUpnQrPayload(payment)).size).toBe(77);
  });

  it('decodes back to exactly the ISO 8859-2 payload', () => {
    const payload = buildUpnQrPayload(payment);
    const { data, size } = raster(upnQrMatrix(payload).modules);
    const decoded = jsQR(data, size, size);

    expect(decoded).not.toBeNull();
    expect(decoded?.version).toBe(15);
    const bytes = new Uint8Array(decoded?.binaryData ?? []);
    expect(decodeLatin2(bytes)).toBe(payload);
    // … and what a banking app would read is a valid UPN QR with our data.
    expect(parseUpnQrPayload(decodeLatin2(bytes))).toMatchObject({
      amountCents: 2_400_000n,
      payeeIban: 'SI56051008012340041',
      payeeReference: 'SI001042-7',
    });
    // The ECI designator announces ISO 8859-2.
    expect(decoded?.chunks.some((c) => 'assignmentNumber' in c && c.assignmentNumber === 4)).toBe(
      true,
    );
  });

  it('renders an SVG with a quiet zone', () => {
    const svg = qrMatrixToSvg(upnQrMatrix(buildUpnQrPayload(payment)));
    expect(svg).toContain('viewBox="0 0 85 85"');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});

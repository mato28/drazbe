import { describe, expect, it } from 'vitest';
import { parseViesAddress, ViesVatRegistry, viesRecord } from './registry';

describe('parseViesAddress', () => {
  it('splits street and post', () => {
    expect(parseViesAddress('ŠMARJEŠKA CESTA 6, 8501 NOVO MESTO')).toEqual({
      street: 'ŠMARJEŠKA CESTA 6',
      postalCity: '8501 NOVO MESTO',
    });
  });

  it('drops the settlement in the middle and zero padding of the house number', () => {
    expect(parseViesAddress('DUNAJSKA CESTA 050, LJUBLJANA, 1000 LJUBLJANA')).toEqual({
      street: 'DUNAJSKA CESTA 50',
      postalCity: '1000 LJUBLJANA',
    });
  });

  it('keeps zero-padded house numbers with letters', () => {
    expect(parseViesAddress('ULICA 007A, 2000 MARIBOR').street).toBe('ULICA 7A');
  });

  it('handles an address without a postal code', () => {
    expect(parseViesAddress('NEKJE 1')).toEqual({ street: 'NEKJE 1', postalCity: '' });
  });
});

describe('viesRecord', () => {
  it('maps a valid response', () => {
    expect(
      viesRecord({
        isValid: true,
        userError: 'VALID',
        name: 'MERCATOR D.O.O.',
        address: 'DUNAJSKA CESTA 107, 1000 LJUBLJANA',
      }),
    ).toEqual({
      status: 'FOUND',
      record: {
        name: 'MERCATOR D.O.O.',
        street: 'DUNAJSKA CESTA 107',
        postalCity: '1000 LJUBLJANA',
        address: 'DUNAJSKA CESTA 107, 1000 LJUBLJANA',
      },
    });
  });

  it('treats undisclosed fields as empty', () => {
    expect(viesRecord({ isValid: true, name: '---', address: '---' })).toEqual({
      status: 'FOUND',
      record: { name: '', street: '', postalCity: '', address: '' },
    });
  });

  it('distinguishes "not registered" from "registry down"', () => {
    expect(viesRecord({ isValid: false, userError: 'INVALID' })).toEqual({ status: 'NOT_FOUND' });
    expect(viesRecord({ isValid: false, userError: 'MS_UNAVAILABLE' })).toEqual({
      status: 'UNAVAILABLE',
    });
    expect(viesRecord(null)).toEqual({ status: 'UNAVAILABLE' });
  });
});

describe('ViesVatRegistry', () => {
  it('calls the SI endpoint and maps the answer', async () => {
    const urls: string[] = [];
    const registry = new ViesVatRegistry({
      fetch: (url) => {
        urls.push(url instanceof Request ? url.url : url.toString());
        return Promise.resolve(Response.json({ isValid: false, userError: 'INVALID' }));
      },
    });
    expect(await registry.lookup('12345679')).toEqual({ status: 'NOT_FOUND' });
    expect(urls).toEqual([
      'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SI/vat/12345679',
    ]);
  });

  it('reports network errors and HTTP errors as unavailable', async () => {
    const failing = new ViesVatRegistry({ fetch: () => Promise.reject(new Error('down')) });
    expect(await failing.lookup('12345679')).toEqual({ status: 'UNAVAILABLE' });
    const http500 = new ViesVatRegistry({
      fetch: () => Promise.resolve(new Response('oops', { status: 500 })),
    });
    expect(await http500.lookup('12345679')).toEqual({ status: 'UNAVAILABLE' });
  });
});

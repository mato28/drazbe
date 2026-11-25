import { describe, expect, it } from 'vitest';
import { SALE_CONTRACT_TEMPLATE } from '../../templates/sale-contract';
import { fillContractTemplate, fillText, TemplateError, templatePlaceholders } from './contract';

describe('contract template', () => {
  it('fills placeholders and refuses unknown or empty values', () => {
    expect(fillText('Kupec {{a}}, {{b}}', { a: 'X', b: 'Y' })).toBe('Kupec X, Y');
    expect(() => fillText('{{missing}}', {})).toThrow(TemplateError);
    expect(() => fillText('{{a}}', { a: '  ' })).toThrow(TemplateError);
  });

  it('every placeholder of the template can be filled, leaving no gaps', () => {
    const names = templatePlaceholders(SALE_CONTRACT_TEMPLATE);
    expect(names.size).toBeGreaterThan(20);
    const values = Object.fromEntries([...names].map((n) => [n, `<${n}>`]));
    const out = JSON.stringify(fillContractTemplate(SALE_CONTRACT_TEMPLATE, values));
    expect(out).not.toContain('{{');
    expect(out).toContain('<price>');
    expect(out).toContain(SALE_CONTRACT_TEMPLATE.version.length > 0 ? '<templateVersion>' : '');
  });
});

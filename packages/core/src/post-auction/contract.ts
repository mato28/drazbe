import type { ContractTemplate } from '../../templates/sale-contract';
import { type DocumentContent } from '../registrations/statement';

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export class TemplateError extends Error {}

/** Fills `{{name}}`. Unknown or empty values throw: a contract must never contain a gap. */
export function fillText(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new TemplateError(`unknown placeholder {{${name}}}`);
    if (value.trim() === '') throw new TemplateError(`empty value for {{${name}}}`);
    return value;
  });
}

/** All placeholder names used by a template. */
export function templatePlaceholders(t: ContractTemplate): Set<string> {
  const names = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(PLACEHOLDER)) names.add(m[1] ?? '');
  };
  scan(t.title);
  scan(t.subtitle);
  scan(t.footer);
  scan(t.signature.left);
  scan(t.signature.right);
  for (const section of t.sections) {
    scan(section.heading);
    for (const [label, value] of section.rows ?? []) {
      scan(label);
      scan(value);
    }
    for (const p of section.paragraphs ?? []) scan(p);
  }
  return names;
}

export function fillContractTemplate(
  t: ContractTemplate,
  values: Record<string, string>,
): DocumentContent {
  const f = (s: string) => fillText(s, values);
  return {
    title: f(t.title),
    subtitle: f(t.subtitle),
    sections: t.sections.map((s) => ({
      heading: f(s.heading),
      ...(s.rows ? { rows: s.rows.map(([l, v]) => [f(l), f(v)] as [string, string]) } : {}),
      ...(s.paragraphs ? { paragraphs: s.paragraphs.map(f) } : {}),
    })),
    signature: { placeAndDate: f(t.signature.left), signer: f(t.signature.right) },
    footer: f(t.footer),
  };
}

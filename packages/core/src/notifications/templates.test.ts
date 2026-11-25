import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates';

describe('renderEmail auth.otp', () => {
  it('renders a Slovenian verification email containing the code', () => {
    const email = renderEmail('auth.otp', {
      otp: '123456',
      type: 'email-verification',
      expiresInMinutes: 5,
    });
    expect(email.subject).toBe('Potrditev e-poštnega naslova – Domik');
    expect(email.text).toContain('123456');
    expect(email.text).toContain('Koda velja 5 min.');
    expect(email.html).toContain('lang="sl"');
    expect(email.html).toContain('123456');
  });

  it('does not put the code in the subject', () => {
    const email = renderEmail('auth.otp', { otp: '987654', type: 'sign-in', expiresInMinutes: 5 });
    expect(email.subject).not.toContain('987654');
  });

  it('rejects unknown templates and invalid payloads', () => {
    expect(() => renderEmail('nope', {})).toThrow(/Unknown email template/);
    expect(() =>
      renderEmail('auth.otp', { otp: '<script>', type: 'sign-in', expiresInMinutes: 5 }),
    ).toThrow();
  });
});

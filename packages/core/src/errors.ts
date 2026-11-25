export type DomainErrorCode = 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';

/** Field name -> user-facing (Slovenian) message. */
export type FieldErrors = Record<string, string>;

/**
 * An expected business failure. `message` is user-facing (Slovenian UI language);
 * callers map `code` to a transport status (HTTP 422/403/404/409).
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fields: FieldErrors | undefined;

  constructor(code: DomainErrorCode, message: string, fields?: FieldErrors) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = (what: string): DomainError =>
  new DomainError('NOT_FOUND', `${what} ne obstaja ali do njega nimate dostopa.`);

export const validationError = (fields: FieldErrors): DomainError =>
  new DomainError('VALIDATION', 'Podatki niso veljavni. Preverite označena polja.', fields);

export function hasErrors(fields: FieldErrors): boolean {
  return Object.keys(fields).length > 0;
}

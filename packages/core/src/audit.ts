/**
 * Converts a row into a JSON-safe snapshot for audit_log.before/after:
 * bigint -> decimal string (cents stay exact), Date -> ISO 8601 UTC.
 */
export function auditSnapshot(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(auditSnapshot);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, auditSnapshot(v)] as const),
    );
  }
  return value;
}

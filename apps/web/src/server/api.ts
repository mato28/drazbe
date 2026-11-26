import 'server-only';
import { type Actor, DomainError, type DomainErrorCode, type Role } from '@domik/core';
import { type ApiError } from '@domik/shared';
import { z } from 'zod';
import { serverConfig } from './config';
import { getSessionUser } from './session';

const STATUS: Record<DomainErrorCode, number> = {
  VALIDATION: 422,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

function errorJson(
  status: number,
  code: ApiError['error']['code'],
  message: string,
  fields?: Record<string, string>,
  headers?: HeadersInit,
): Response {
  const body: ApiError = { error: { code, message, ...(fields ? { fields } : {}) } };
  return Response.json(body, { status, ...(headers ? { headers } : {}) });
}

/** Thrown by the helpers below; turned into a response by `handle`. */
class ApiFailure extends Error {
  constructor(readonly response: Response) {
    super('api failure');
  }
}

const slovenian = z.locales.sl().localeError;

/** Parses `data` with a zod schema; issues become a 422 with per-field Slovenian messages. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data, { error: slovenian });
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new ApiFailure(
    errorJson(422, 'VALIDATION', 'Podatki niso veljavni. Preverite označena polja.', fields),
  );
}

export async function jsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    throw new ApiFailure(errorJson(400, 'VALIDATION', 'Zahteva ne vsebuje veljavnega JSON.'));
  }
  return parse(schema, data);
}

/** Route params are untrusted: a malformed id is simply "not found". */
export async function idParam<K extends string>(
  params: Promise<Record<K, string>>,
  name: K,
): Promise<string> {
  const value = (await params)[name];
  if (!z.uuid().safeParse(value).success) {
    throw new ApiFailure(errorJson(404, 'NOT_FOUND', 'Zapis ne obstaja.'));
  }
  return value;
}

export function apiFailure(
  status: number,
  code: ApiError['error']['code'],
  message: string,
  fields?: Record<string, string>,
  headers?: HeadersInit,
): ApiFailure {
  return new ApiFailure(errorJson(status, code, message, fields, headers));
}

/** State-changing requests must come from our own origin (defence in depth next to SameSite). */
function assertSameOrigin(request: Request): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(serverConfig().APP_URL).origin) {
    throw new ApiFailure(errorJson(403, 'FORBIDDEN', 'Zahteva z drugega izvora ni dovoljena.'));
  }
}

/**
 * Shared wrapper for route handlers: authenticates, checks the role, runs `fn`, and maps
 * domain errors to JSON error responses. Keeps the handlers themselves thin.
 */
export async function handle(
  request: Request,
  roles: readonly Role[],
  fn: (actor: Actor) => Promise<Response | object>,
  successStatus = 200,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser(request.headers);
    if (!user) return errorJson(401, 'UNAUTHENTICATED', 'Za to dejanje se morate prijaviti.');
    if (!roles.includes(user.role)) {
      return errorJson(403, 'FORBIDDEN', 'Za to dejanje nimate pravic.');
    }
    const result = await fn({ userId: user.id, role: user.role });
    return result instanceof Response ? result : Response.json(result, { status: successStatus });
  } catch (e) {
    if (e instanceof ApiFailure) return e.response;
    if (e instanceof DomainError) return errorJson(STATUS[e.code], e.code, e.message, e.fields);
    console.error('[api] unexpected error', e);
    return errorJson(500, 'INTERNAL', 'Prišlo je do nepričakovane napake. Poskusite znova.');
  }
}

/** The signed-in user as an Actor, or null for anonymous visitors (public endpoints). */
export async function optionalActor(request: Request): Promise<Actor | null> {
  const user = await getSessionUser(request.headers);
  return user ? { userId: user.id, role: user.role } : null;
}

/** Wrapper for endpoints that need no sign-in. Same error mapping as `handle`. */
export async function handlePublic(fn: () => Promise<Response | object>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (e) {
    if (e instanceof ApiFailure) return e.response;
    if (e instanceof DomainError) return errorJson(STATUS[e.code], e.code, e.message, e.fields);
    console.error('[api] unexpected error', e);
    return errorJson(500, 'INTERNAL', 'Prišlo je do nepričakovane napake. Poskusite znova.');
  }
}

export const TRUSTEE = ['TRUSTEE'] as const satisfies readonly Role[];
export const BIDDER = ['BIDDER'] as const satisfies readonly Role[];
export const TRUSTEE_OR_BIDDER = ['TRUSTEE', 'BIDDER'] as const satisfies readonly Role[];

/** Reads the `file` part of a multipart upload, enforcing the size limit before buffering. */
export async function uploadedFile(
  request: Request,
  maxBytes: number,
): Promise<{ filename: string; bytes: Uint8Array; form: FormData }> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) {
    throw apiFailure(422, 'VALIDATION', 'Izberite datoteko.', { file: 'Izberite datoteko.' });
  }
  if (file.size > maxBytes) {
    const message = `Datoteka je prevelika (največ ${Math.round(maxBytes / 1024 / 1024)} MB).`;
    throw apiFailure(422, 'VALIDATION', message, { file: message });
  }
  return { filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), form };
}

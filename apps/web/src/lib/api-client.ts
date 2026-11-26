import { apiErrorSchema } from '@domik/shared';

export interface ApiFailure {
  ok: false;
  message: string;
  fields: Record<string, string>;
}
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const GENERIC = 'Prišlo je do napake. Poskusite znova.';

async function toResult<T>(response: Response): Promise<ApiResult<T>> {
  if (response.ok) {
    const data = response.status === 204 ? undefined : ((await response.json()) as unknown);
    return { ok: true, data: data as T };
  }
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { ok: false, message: GENERIC, fields: {} };
  return { ok: false, message: parsed.data.error.message, fields: parsed.data.error.fields ?? {} };
}

/** Calls one of our REST endpoints with a JSON body. Never throws. */
export async function apiJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    return await toResult<T>(
      await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
    );
  } catch {
    return { ok: false, message: 'Povezava s strežnikom ni uspela.', fields: {} };
  }
}

/** multipart/form-data upload. Never throws. */
export async function apiUpload<T>(url: string, form: FormData): Promise<ApiResult<T>> {
  try {
    return await toResult<T>(await fetch(url, { method: 'POST', body: form }));
  } catch {
    return { ok: false, message: 'Povezava s strežnikom ni uspela.', fields: {} };
  }
}

/** GET one of our REST endpoints. Never throws. */
export async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    return await toResult<T>(await fetch(url, { headers: { Accept: 'application/json' } }));
  } catch {
    return { ok: false, message: 'Povezava s strežnikom ni uspela.', fields: {} };
  }
}

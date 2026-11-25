'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ApiResult } from '@/lib/api-client';

export interface ActionError {
  message: string;
  fields: Record<string, string>;
}

/** Runs an API call, tracks pending/error and refreshes the server components on success. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);

  async function run<T>(call: () => Promise<ApiResult<T>>): Promise<T | null> {
    setPending(true);
    setError(null);
    const result = await call();
    setPending(false);
    if (!result.ok) {
      setError({ message: result.message, fields: result.fields });
      return null;
    }
    router.refresh();
    return result.data;
  }

  return { pending, error, setError, run };
}

/** The most specific message of an error (field message if there is exactly one). */
export function errorText(e: ActionError): string {
  const fields = Object.values(e.fields);
  return fields.length > 0 ? fields.join(' ') : e.message;
}

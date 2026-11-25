import 'server-only';
import { type Actor, DomainError } from '@domik/core';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from './session';

/** The signed-in trustee as a core Actor (redirects if not signed in / not a trustee). */
export async function trusteeActor(): Promise<Actor> {
  const user = await requireArea('trustee', '/upravitelj');
  return { userId: user.id, role: user.role };
}

/** The signed-in bidder as a core Actor (redirects if not signed in / not a bidder). */
export async function bidderActor(): Promise<Actor> {
  const user = await requireArea('bidder', '/drazitelj');
  return { userId: user.id, role: user.role };
}

/** Route param -> uuid, or the 404 page. */
export async function pageId<K extends string>(
  params: Promise<Record<K, string>>,
  name: K,
): Promise<string> {
  const value = (await params)[name];
  if (!z.uuid().safeParse(value).success) notFound();
  return value;
}

/** Runs a core query; "not found / not yours" becomes the 404 page. */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
}

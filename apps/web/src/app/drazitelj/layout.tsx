import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AreaShell } from '@/components/area-shell';
import { requireArea } from '@/server/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireArea('bidder', '/drazitelj');
  return <AreaShell user={user}>{children}</AreaShell>;
}

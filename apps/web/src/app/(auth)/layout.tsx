import { Gavel } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 text-muted-foreground">
        <Gavel className="size-5" aria-hidden />
        <span className="text-sm font-medium tracking-wide uppercase">Domik</span>
      </Link>
      {children}
    </main>
  );
}

import { Gavel } from 'lucide-react';
import Link from 'next/link';
import { PUBLIC_NAV, SITE_NAME } from '@/lib/site';
import { AccountLink } from './account-link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Gavel className="size-5" aria-hidden />
          {SITE_NAME}
        </Link>
        <nav aria-label="Glavna navigacija" className="flex items-center gap-1 sm:gap-2">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:px-3"
            >
              {item.label}
            </Link>
          ))}
          <AccountLink />
        </nav>
      </div>
    </header>
  );
}

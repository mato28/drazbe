import { Gavel } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { type SessionUser } from '@/server/session';

const NAV: Record<SessionUser['role'], { href: string; label: string }[]> = {
  ADMIN: [],
  TRUSTEE: [
    { href: '/upravitelj', label: 'Postopki in dražbe' },
    { href: '/upravitelj/placila', label: 'Uvoz izpiska' },
  ],
  BIDDER: [
    { href: '/drazitelj', label: 'Moje prijave' },
    { href: '/drazitelj/profil', label: 'Moji podatki' },
    { href: '/drazbe', label: 'Dražbe' },
  ],
};

const ROLE_LABEL: Record<SessionUser['role'], string> = {
  ADMIN: 'Administrator',
  TRUSTEE: 'Stečajni upravitelj',
  BIDDER: 'Dražitelj',
};

export function AreaShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-1 sm:gap-4">
            <Link href="/" className="flex items-center gap-2 font-medium">
              <Gavel className="size-5" aria-hidden />
              Domik
            </Link>
            <nav aria-label="Navigacija" className="flex items-center">
              {NAV[user.role].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}

import Link from 'next/link';
import { LEGAL_NAV, PUBLIC_NAV, SITE_NAME } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-12">
        <div>
          <div className="font-semibold">{SITE_NAME}</div>
          <p className="mt-1 max-w-sm text-muted-foreground">
            Spletna platforma za javne dražbe premoženja v stečajnih postopkih.
          </p>
        </div>
        <nav aria-label="Platforma" className="grid content-start gap-1.5">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/registracija" className="text-muted-foreground hover:text-foreground">
            Registracija dražitelja
          </Link>
        </nav>
        <nav aria-label="Pravno" className="grid content-start gap-1.5">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

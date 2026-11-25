import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AuctionNotFound() {
  return (
    <main className="mx-auto grid max-w-6xl justify-items-start gap-3 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Dražba ne obstaja</h1>
      <p className="text-muted-foreground">Iskana dražba ne obstaja ali ni javno objavljena.</p>
      <Button asChild variant="outline">
        <Link href="/drazbe">Vse dražbe</Link>
      </Button>
    </main>
  );
}

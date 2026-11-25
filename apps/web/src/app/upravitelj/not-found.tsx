import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="grid justify-items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Zapis ne obstaja</h1>
      <p className="text-muted-foreground">Iskani zapis ne obstaja ali do njega nimate dostopa.</p>
      <Button asChild variant="outline">
        <Link href="/upravitelj">Nazaj na postopke</Link>
      </Button>
    </div>
  );
}

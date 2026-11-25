import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Administracija' };

export default function Page() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Administracija</h1>
      <p className="text-muted-foreground">Upravljanje uporabnikov, upraviteljev in platforme.</p>
    </div>
  );
}

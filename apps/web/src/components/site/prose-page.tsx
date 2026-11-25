import type { ReactNode } from 'react';

/** Layout for text pages (Kako deluje, legal pages). */
export function ProsePage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      {lead && <p className="mt-3 text-lg text-muted-foreground">{lead}</p>}
      <div className="mt-8 grid gap-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:ml-5 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-2 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2">
        {children}
      </div>
    </main>
  );
}

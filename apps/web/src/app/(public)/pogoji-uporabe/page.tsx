import type { Metadata } from 'next';
import { ProsePage } from '@/components/site/prose-page';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Pogoji uporabe',
  description: 'Splošni pogoji uporabe platforme Domik.',
  alternates: { canonical: '/pogoji-uporabe' },
  // Placeholder text: keep it out of search results until the real document is published.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <ProsePage title="Pogoji uporabe">
      <Alert variant="warning">
        Besedilo je v pripravi. Končna različica bo objavljena pred začetkom delovanja platforme.
      </Alert>
      <p>Splošni pogoji uporabe platforme Domik.</p>
    </ProsePage>
  );
}

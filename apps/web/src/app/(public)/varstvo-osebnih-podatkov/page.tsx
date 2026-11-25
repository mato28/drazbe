import type { Metadata } from 'next';
import { ProsePage } from '@/components/site/prose-page';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Varstvo osebnih podatkov',
  description: 'Kako platforma Domik obdeluje in varuje osebne podatke.',
  alternates: { canonical: '/varstvo-osebnih-podatkov' },
  // Placeholder text: keep it out of search results until the real document is published.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <ProsePage title="Varstvo osebnih podatkov">
      <Alert variant="warning">
        Besedilo je v pripravi. Končna različica bo objavljena pred začetkom delovanja platforme.
      </Alert>
      <p>Kako platforma Domik obdeluje in varuje osebne podatke.</p>
    </ProsePage>
  );
}

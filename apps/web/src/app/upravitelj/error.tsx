'use client';

import { Button } from '@/components/ui/button';

export default function TrusteeError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid justify-items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Prišlo je do napake</h1>
      <p className="text-muted-foreground">
        Strani ni bilo mogoče prikazati. Poskusite znova; če se napaka ponavlja, se obrnite na
        administratorja.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          reset();
        }}
      >
        Poskusi znova
      </Button>
    </div>
  );
}

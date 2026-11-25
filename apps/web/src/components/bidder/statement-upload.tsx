'use client';

import { MAX_DOCUMENT_BYTES } from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUpload } from '@/lib/api-client';

export function StatementUpload({
  registrationId,
  replace,
}: {
  registrationId: string;
  replace: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Izberite datoteko.');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(`Datoteka je prevelika (največ ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setPending(true);
    const result = await apiUpload(`/api/registrations/${registrationId}/statement`, form);
    setPending(false);
    if (!result.ok) {
      setError(result.fields.file ?? result.message);
      return;
    }
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="file"
          type="file"
          aria-label="Podpisana izjava"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          className="max-w-xs"
        />
        <Button type="submit" variant={replace ? 'outline' : 'default'} disabled={pending}>
          {pending ? 'Nalaganje …' : replace ? 'Zamenjaj izjavo' : 'Naloži podpisano izjavo'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
    </form>
  );
}

'use client';

import { type DocumentDto, formatDateTime, MAX_DOCUMENT_BYTES } from '@domik/shared';
import { FileText, ImageIcon, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useRef, useState } from 'react';
import { Field } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { apiJson, apiUpload } from '@/lib/api-client';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export interface DocumentKindOption {
  value: string;
  label: string;
}

/**
 * Upload / list / delete for a set of documents. Used for lot documents (trustee) and for the
 * bidder's identity documents. The server validates the file and computes its sha256.
 */
export function DocumentManager({
  uploadUrl,
  kinds,
  documents,
  locked,
  note,
}: {
  /** POST multipart endpoint that accepts `file` + `kind`. */
  uploadUrl: string;
  kinds: DocumentKindOption[];
  documents: DocumentDto[];
  locked: boolean;
  /** Shown under the upload form (e.g. who will be able to see the files). */
  note?: string;
}) {
  const kindLabel = (kind: string): string => kinds.find((k) => k.value === kind)?.label ?? kind;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onUpload(e: SubmitEvent<HTMLFormElement>) {
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
    const result = await apiUpload<DocumentDto>(uploadUrl, form);
    setPending(false);
    if (!result.ok) {
      setError(result.fields.file ?? result.fields._ ?? result.message);
      return;
    }
    formRef.current?.reset();
    router.refresh();
  }

  async function onDelete(doc: DocumentDto) {
    if (!window.confirm(`Izbrišem dokument »${doc.filename}«?`)) return;
    setError(null);
    const result = await apiJson('DELETE', `/api/documents/${doc.id}`);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ni naloženih dokumentov.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start gap-3 px-3 py-2.5">
              {doc.mime.startsWith('image/') ? (
                <ImageIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/documents/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium break-all underline-offset-4 hover:underline"
                >
                  {doc.filename}
                </a>
                <div className="text-xs text-muted-foreground">
                  {kindLabel(doc.kind)} · {formatSize(doc.sizeBytes)} ·{' '}
                  {formatDateTime(doc.createdAt)}
                </div>
                <div className="font-mono text-[11px] break-all text-muted-foreground">
                  SHA-256: {doc.sha256}
                </div>
              </div>
              {!locked && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Izbriši ${doc.filename}`}
                  onClick={() => void onDelete(doc)}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <form
          ref={formRef}
          onSubmit={(e) => void onUpload(e)}
          className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
        >
          <Field id="kind" label="Vrsta dokumenta">
            <NativeSelect id="kind" name="kind" defaultValue={kinds[0]?.value}>
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="file" label="Datoteka (PDF, JPG, PNG, WEBP; največ 25 MB)">
            <Input
              id="file"
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Nalaganje …' : 'Naloži'}
          </Button>
        </form>
      )}
      {!locked && note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}

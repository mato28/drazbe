import type { UnitOfWork } from '@domik/db';
import { type Role } from './auth/roles';
import { type Clock } from './clock';
import { type IdentityProvider } from './identity/provider';
import { type DocumentContent } from './registrations/statement';
import { type SignaturePolicy } from './signatures/policy';
import { type SignatureValidator } from './signatures/validator';

/** Who is performing an operation. */
export interface Actor {
  userId: string;
  role: Role;
}

/** File storage port (S3 in production). */
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Short-lived URL the browser can download the object from. */
  getDownloadUrl(
    key: string,
    options: { filename: string; contentType: string; inline: boolean; expiresInSec: number },
  ): Promise<string>;
}

/** Renders documents built in core to PDF (implementation: @domik/pdf). */
export interface PdfRenderer {
  render(content: DocumentContent): Promise<Uint8Array>;
}

/** Everything a core service needs from the outside world. */
export interface ServiceContext {
  uow: UnitOfWork;
  clock: Clock;
  storage: ObjectStorage;
  identity: IdentityProvider;
  /** Public base URL of the web app, for links in emails and documents. */
  appUrl: string;
  pdf: PdfRenderer;
  signatures: SignatureValidator;
  signaturePolicy: SignaturePolicy;
}

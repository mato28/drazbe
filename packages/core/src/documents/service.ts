import { createHash, randomUUID } from 'node:crypto';
import type { DocumentRow, Repositories } from '@domik/db';
import { type LotDocumentKind, MAX_DOCUMENT_BYTES } from '@domik/shared';
import { auditSnapshot } from '../audit';
import { type Actor, type ServiceContext } from '../context';
import { DomainError, notFound, validationError } from '../errors';
import { assertLotEditable } from '../lots/service';
import { requireOwnLot, requireTrustee } from '../trustee/access';
import { detectFileType, sanitizeFilename } from './file-type';

export interface UploadLotDocumentInput {
  lotId: string;
  kind: LotDocumentKind;
  filename: string;
  bytes: Uint8Array;
}

const DOWNLOAD_URL_TTL_SEC = 120;

type DocumentOwnerType = DocumentRow['ownerType'];
type DocumentKind = DocumentRow['kind'];

export interface StoreDocumentInput {
  ownerType: DocumentOwnerType;
  ownerId: string;
  kind: DocumentKind;
  filename: string;
  bytes: Uint8Array;
  /** Folder in the bucket, e.g. `lots/<id>`. */
  keyPrefix: string;
  /** Reject anything that is not an image (used for photos). */
  imagesOnly?: boolean;
}

/**
 * Validates a file, stores it and records it — shared by every upload in the system.
 * The caller is responsible for authorization. Runs `afterInsert` in the same transaction
 * as the document row (e.g. to link the document somewhere).
 */
export async function storeDocument(
  ctx: ServiceContext,
  actor: Actor,
  input: StoreDocumentInput,
  afterInsert?: (repos: Repositories, doc: DocumentRow) => Promise<void>,
): Promise<DocumentRow> {
  if (input.bytes.byteLength === 0) {
    throw validationError({ file: 'Datoteka je prazna.' });
  }
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw validationError({
      file: `Datoteka je prevelika (največ ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB).`,
    });
  }
  const type = detectFileType(input.bytes);
  if (!type) {
    throw validationError({ file: 'Dovoljene so samo datoteke PDF, JPG, PNG in WEBP.' });
  }
  if (input.imagesOnly && !type.isImage) {
    throw validationError({ file: 'Fotografija mora biti slika (JPG, PNG ali WEBP).' });
  }

  return persistDocument(
    ctx,
    actor.userId,
    { ...input, mime: type.mime, extension: type.extension },
    afterInsert,
  );
}

export interface GeneratedDocumentInput extends Omit<StoreDocumentInput, 'imagesOnly'> {
  mime: string;
  extension: string;
}

/**
 * Stores a document the system produced itself (reports, contracts, payment orders): no
 * content sniffing, and the actor may be the system (null).
 */
export function storeGeneratedDocument(
  ctx: Pick<ServiceContext, 'uow' | 'storage' | 'clock'>,
  actorId: string | null,
  input: GeneratedDocumentInput,
  afterInsert?: (repos: Repositories, doc: DocumentRow) => Promise<void>,
): Promise<DocumentRow> {
  return persistDocument(ctx, actorId, input, afterInsert);
}

async function persistDocument(
  ctx: Pick<ServiceContext, 'uow' | 'storage' | 'clock'>,
  actorId: string | null,
  input: GeneratedDocumentInput,
  afterInsert?: (repos: Repositories, doc: DocumentRow) => Promise<void>,
): Promise<DocumentRow> {
  // Computed on the server from the exact bytes that are stored.
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const s3Key = `${input.keyPrefix}/${randomUUID()}.${input.extension}`;

  await ctx.storage.put(s3Key, input.bytes, input.mime);
  try {
    return await ctx.uow.transaction(async (repos) => {
      const row = await repos.documents.create({
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        kind: input.kind,
        s3Key,
        filename: sanitizeFilename(input.filename),
        mime: input.mime,
        sizeBytes: input.bytes.byteLength,
        sha256,
        uploadedBy: actorId,
      });
      await repos.auditLog.append({
        actorId,
        entity: 'document',
        entityId: row.id,
        action: 'document.uploaded',
        after: auditSnapshot(row),
        at: ctx.clock.now(),
      });
      await afterInsert?.(repos, row);
      return row;
    });
  } catch (e) {
    // Do not leave an orphaned object behind if the DB write failed.
    await ctx.storage.delete(s3Key).catch(() => undefined);
    throw e;
  }
}

/** Removes a document row (with an audit entry keeping its hash) and then the stored object. */
export async function removeDocument(
  ctx: ServiceContext,
  actor: Actor,
  doc: DocumentRow,
  beforeDelete?: (repos: Repositories) => Promise<void>,
): Promise<void> {
  await ctx.uow.transaction(async (repos) => {
    await beforeDelete?.(repos);
    await repos.documents.delete(doc.id);
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'document',
      entityId: doc.id,
      action: 'document.deleted',
      before: auditSnapshot(doc),
      at: ctx.clock.now(),
    });
  });
  await ctx.storage.delete(doc.s3Key).catch(() => undefined);
}

export async function uploadLotDocument(
  ctx: ServiceContext,
  actor: Actor,
  input: UploadLotDocumentInput,
): Promise<DocumentRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  await requireOwnLot(ctx.uow.repos, trustee, input.lotId);
  await assertLotEditable(ctx.uow.repos, input.lotId);
  return storeDocument(ctx, actor, {
    ownerType: 'LOT',
    ownerId: input.lotId,
    kind: input.kind,
    filename: input.filename,
    bytes: input.bytes,
    keyPrefix: `lots/${input.lotId}`,
    imagesOnly: input.kind === 'PHOTO',
  });
}

async function requireOwnLotDocument(ctx: ServiceContext, actor: Actor, documentId: string) {
  const { repos } = ctx.uow;
  const trustee = await requireTrustee(repos, actor);
  const doc = await repos.documents.findById(documentId);
  if (doc?.ownerType !== 'LOT') throw notFound('Dokument');
  try {
    await requireOwnLot(repos, trustee, doc.ownerId);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') throw notFound('Dokument');
    throw e;
  }
  return doc;
}

export async function deleteLotDocument(
  ctx: ServiceContext,
  actor: Actor,
  documentId: string,
): Promise<void> {
  const doc = await requireOwnLotDocument(ctx, actor, documentId);
  await assertLotEditable(ctx.uow.repos, doc.ownerId);

  await removeDocument(ctx, actor, doc);
}

/** May `actor` read this document? Lot docs: owning trustee. Bidder docs: the bidder, or a trustee reviewing them. */
async function canRead(ctx: ServiceContext, actor: Actor, doc: DocumentRow): Promise<boolean> {
  const { repos } = ctx.uow;
  if (actor.role === 'TRUSTEE') {
    const trustee = await repos.trustees.findByUserId(actor.userId);
    if (!trustee) return false;
    switch (doc.ownerType) {
      case 'LOT':
        return (await repos.lots.findWithCase(doc.ownerId))?.case.trusteeId === trustee.id;
      case 'BIDDER_PROFILE':
        // Personal documents: only while the bidder has a registration in this trustee's auction.
        return repos.auctionRegistrations.bidderHasRegistrationWithTrustee(doc.ownerId, trustee.id);
      case 'AUCTION_REGISTRATION':
        return (
          (await repos.auctionRegistrations.findDetailed(doc.ownerId))?.case.trusteeId ===
          trustee.id
        );
      case 'AUCTION':
        return (
          (await repos.auctions.findWithLotAndCase(doc.ownerId))?.lot.case.trusteeId === trustee.id
        );
      case 'SALE':
        return (await repos.sales.findDetailed(doc.ownerId))?.trustee.id === trustee.id;
      default:
        return false;
    }
  }
  if (actor.role === 'BIDDER') {
    const profile = await repos.bidderProfiles.findByUserId(actor.userId);
    if (!profile) return false;
    switch (doc.ownerType) {
      case 'BIDDER_PROFILE':
        return doc.ownerId === profile.id;
      case 'AUCTION_REGISTRATION':
        return (await repos.auctionRegistrations.findById(doc.ownerId))?.bidderId === profile.id;
      case 'SALE':
        // The buyer sees the contract documents of their own purchase.
        return (await repos.sales.findDetailed(doc.ownerId))?.buyer.id === profile.id;
      case 'AUCTION':
        // Only the anonymised report (the full one carries other bidders' identities).
        return doc.kind === 'AUCTION_REPORT_PUBLIC';
      default:
        return false;
    }
  }
  return false;
}

/** A short-lived download URL for a private document the actor is allowed to read. */
export async function getDocumentDownloadUrl(
  ctx: ServiceContext,
  actor: Actor,
  documentId: string,
): Promise<string> {
  const doc = await ctx.uow.repos.documents.findById(documentId);
  if (!doc || !(await canRead(ctx, actor, doc))) throw notFound('Dokument');
  return ctx.storage.getDownloadUrl(doc.s3Key, {
    filename: doc.filename,
    contentType: doc.mime,
    inline: true,
    expiresInSec: DOWNLOAD_URL_TTL_SEC,
  });
}

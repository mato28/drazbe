import type { BidderProfileRow, DocumentRow, Repositories } from '@domik/db';
import { type BidderDocumentKind, type BidderProfileInput } from '@domik/shared';
import { auditSnapshot } from '../audit';
import { type Actor, type ServiceContext } from '../context';
import { removeDocument, storeDocument } from '../documents/service';
import { DomainError, type FieldErrors, hasErrors, notFound, validationError } from '../errors';
import { normalizePhone } from '../validation/phone';
import { isValidSlovenianTaxId, normalizeTaxId } from '../validation/tax-id';

function requireBidderRole(actor: Actor): void {
  if (actor.role !== 'BIDDER') {
    throw new DomainError('FORBIDDEN', 'To dejanje lahko izvede samo dražitelj.');
  }
}

/** Business validation of the profile (shape is validated by the zod schema). */
export function validateBidderProfile(input: BidderProfileInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidSlovenianTaxId(normalizeTaxId(input.taxId))) {
    errors.taxId = 'Davčna številka ni veljavna (8 številk s kontrolno številko).';
  }
  if (normalizePhone(input.phone) === null) {
    errors.phone = 'Vnesite telefonsko številko, npr. 041 123 456.';
  }
  if (input.type === 'COMPANY') {
    if (!input.companyName) errors.companyName = 'Vnesite naziv pravne osebe.';
    if (!input.companyRegNo) errors.companyRegNo = 'Vnesite matično številko.';
    else if (!/^\d{7}(\d{3})?$/.test(input.companyRegNo.replace(/\s/g, ''))) {
      errors.companyRegNo = 'Matična številka ima 7 ali 10 številk.';
    }
    if (!input.representativeName) {
      errors.representativeName = 'Vnesite zakonitega zastopnika.';
    }
  }
  return errors;
}

/** What is still missing before the bidder can register for an auction. */
export function missingOnboardingSteps(
  profile: BidderProfileRow | undefined,
  documents: Pick<DocumentRow, 'kind'>[],
): string[] {
  if (!profile) return ['Izpolnite podatke dražitelja.'];
  // A verified identity needs nothing more — however it was verified (documents are what a
  // human reviewer needs; a provider like SI-PASS verifies without any upload).
  if (profile.status === 'VERIFIED') return [];
  const missing: string[] = [];
  const has = (kind: string) => documents.some((d) => d.kind === kind);
  if (!has('ID_DOCUMENT')) missing.push('Naložite osebni dokument.');
  if (
    profile.type === 'COMPANY' &&
    !profile.actsAsLegalRepresentative &&
    !has('POWER_OF_ATTORNEY')
  ) {
    missing.push('Naložite pooblastilo zakonitega zastopnika.');
  }
  return missing;
}

export interface BidderOnboarding {
  profile: BidderProfileRow | null;
  phone: string | null;
  documents: DocumentRow[];
  /** Human-readable list of what is still missing; empty = ready to register for auctions. */
  missing: string[];
}

export async function getOnboarding(ctx: ServiceContext, actor: Actor): Promise<BidderOnboarding> {
  requireBidderRole(actor);
  const { repos } = ctx.uow;
  const [profile, user] = await Promise.all([
    repos.bidderProfiles.findByUserId(actor.userId),
    repos.users.findById(actor.userId),
  ]);
  const documents = profile ? await repos.documents.listByOwner('BIDDER_PROFILE', profile.id) : [];
  return {
    profile: profile ?? null,
    phone: user?.phone ?? null,
    documents,
    missing: missingOnboardingSteps(profile, documents),
  };
}

const LOCKED = new DomainError(
  'CONFLICT',
  'Vaša identiteta je že potrjena, zato podatkov ni več mogoče spreminjati. Za spremembo se obrnite na skrbnika platforme.',
);

/** Creates the profile, or updates it while it is not yet verified. */
export async function saveProfile(
  ctx: ServiceContext,
  actor: Actor,
  input: BidderProfileInput,
): Promise<BidderProfileRow> {
  requireBidderRole(actor);
  const errors = validateBidderProfile(input);
  if (hasErrors(errors)) throw validationError(errors);

  const existing = await ctx.uow.repos.bidderProfiles.findByUserId(actor.userId);
  if (existing?.status === 'VERIFIED') throw LOCKED;

  const isCompany = input.type === 'COMPANY';
  const values = {
    type: input.type,
    fullName: input.fullName,
    taxId: normalizeTaxId(input.taxId),
    address: input.address,
    companyName: isCompany ? input.companyName : null,
    companyRegNo: isCompany ? (input.companyRegNo?.replace(/\s/g, '') ?? null) : null,
    representativeName: isCompany ? input.representativeName : null,
    actsAsLegalRepresentative: isCompany ? input.actsAsLegalRepresentative : true,
  };
  const phone = normalizePhone(input.phone) ?? input.phone;

  return ctx.uow.transaction(async (repos) => {
    let row: BidderProfileRow;
    if (existing) {
      const updated = await repos.bidderProfiles.update(existing.id, values);
      if (!updated) throw notFound('Profil dražitelja');
      row = updated;
    } else {
      row = await repos.bidderProfiles.create({ userId: actor.userId, ...values });
    }

    // A new or corrected profile goes (back) to the identity provider.
    const verification = await ctx.identity.startVerification({
      profileId: row.id,
      type: row.type,
      fullName: row.fullName,
      taxId: row.taxId,
    });
    const final = await repos.bidderProfiles.update(row.id, {
      identityProvider: ctx.identity.id,
      status: verification.status,
      rejectionReason: verification.status === 'REJECTED' ? (verification.reason ?? null) : null,
      verifiedAt: verification.status === 'VERIFIED' ? ctx.clock.now() : null,
      verifiedBy: null,
    });
    await repos.users.setPhone(actor.userId, phone);
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'bidder_profile',
      entityId: row.id,
      action: existing ? 'bidder_profile.updated' : 'bidder_profile.created',
      ...(existing ? { before: auditSnapshot(existing) } : {}),
      after: auditSnapshot(final ?? row),
      at: ctx.clock.now(),
    });
    return final ?? row;
  });
}

async function requireOwnProfile(repos: Repositories, actor: Actor): Promise<BidderProfileRow> {
  requireBidderRole(actor);
  const profile = await repos.bidderProfiles.findByUserId(actor.userId);
  if (!profile) {
    throw new DomainError('CONFLICT', 'Najprej izpolnite podatke dražitelja.');
  }
  return profile;
}

// LEGAL-REVIEW: legal basis and retention for copies of ID documents — see docs/legal-review.md
export async function uploadDocument(
  ctx: ServiceContext,
  actor: Actor,
  input: { kind: BidderDocumentKind; filename: string; bytes: Uint8Array },
): Promise<DocumentRow> {
  const profile = await requireOwnProfile(ctx.uow.repos, actor);
  if (profile.status === 'VERIFIED') throw LOCKED;
  return storeDocument(ctx, actor, {
    ownerType: 'BIDDER_PROFILE',
    ownerId: profile.id,
    kind: input.kind,
    filename: input.filename,
    bytes: input.bytes,
    keyPrefix: `bidders/${profile.id}`,
  });
}

export async function deleteDocument(
  ctx: ServiceContext,
  actor: Actor,
  documentId: string,
): Promise<void> {
  const profile = await requireOwnProfile(ctx.uow.repos, actor);
  const doc = await ctx.uow.repos.documents.findById(documentId);
  if (doc?.ownerType !== 'BIDDER_PROFILE' || doc.ownerId !== profile.id) throw notFound('Dokument');
  if (profile.status === 'VERIFIED') throw LOCKED;
  await removeDocument(ctx, actor, doc);
}

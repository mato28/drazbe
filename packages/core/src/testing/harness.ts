import { randomUUID } from 'node:crypto';
import { createDb, createUnitOfWork, type DbHandle, schema } from '@domik/db';
import { type AuctionInput, type CaseInput, type LotInput } from '@domik/shared';
import { FixedClock } from '../clock';
import { type Actor, type ObjectStorage, type PdfRenderer, type ServiceContext } from '../context';
import { type DocumentContent } from '../registrations/statement';
import { type SignatureValidationReport, type SignatureValidator } from '../signatures/validator';
import { DomainError } from '../errors';
import { ManualIdentityProvider } from '../identity/provider';

export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
  getDownloadUrl(key: string): Promise<string> {
    return Promise.resolve(`memory://${key}`);
  }
}

/** Stand-in for @domik/pdf (core cannot depend on it): a tiny "PDF" carrying the content as JSON. */
export class FakePdfRenderer implements PdfRenderer {
  readonly rendered: DocumentContent[] = [];
  render(content: DocumentContent): Promise<Uint8Array> {
    this.rendered.push(content);
    return Promise.resolve(new TextEncoder().encode(`%PDF-1.7\n${JSON.stringify(content)}\n%%EOF`));
  }
}

/** Signature validator returning whatever report the test sets (default: no signatures). */
export class FakeSignatureValidator implements SignatureValidator {
  report: SignatureValidationReport = { signatures: [] };
  readonly calls: string[] = [];
  validate(file: { bytes: Uint8Array; filename: string }): Promise<SignatureValidationReport> {
    this.calls.push(file.filename);
    return Promise.resolve(this.report);
  }
}

export const NOW = new Date('2030-01-02T08:00:00Z');

export interface Harness {
  handle: DbHandle;
  ctx: ServiceContext;
  clock: FixedClock;
  storage: MemoryStorage;
  pdf: FakePdfRenderer;
  signatures: FakeSignatureValidator;
  /** Creates a user with a trustee profile and returns an Actor for it. */
  trustee: (options?: { verified?: boolean }) => Promise<Actor>;
  bidder: () => Promise<Actor>;
  close: () => Promise<void>;
}

export function createHarness(databaseUrl: string): Harness {
  const handle = createDb(databaseUrl, { max: 4 });
  const clock = new FixedClock(NOW);
  const storage = new MemoryStorage();
  const pdf = new FakePdfRenderer();
  const signatures = new FakeSignatureValidator();
  const ctx: ServiceContext = {
    uow: createUnitOfWork(handle.db),
    clock,
    storage,
    identity: new ManualIdentityProvider(),
    appUrl: 'https://domik.test',
    pdf,
    signatures,
    signaturePolicy: { requireQualified: true },
  };

  const user = async (role: 'TRUSTEE' | 'BIDDER') => {
    const [row] = await handle.db
      .insert(schema.users)
      .values({
        name: role,
        email: `${role}-${randomUUID()}@test.local`,
        role,
        emailVerified: true,
      })
      .returning();
    return row!;
  };

  return {
    handle,
    ctx,
    clock,
    storage,
    pdf,
    signatures,
    trustee: async ({ verified = true } = {}) => {
      const u = await user('TRUSTEE');
      await ctx.uow.repos.trustees.create({
        userId: u.id,
        name: 'Test Upravitelj',
        licenseNumber: `LIC-${randomUUID()}`,
        verifiedAt: verified ? NOW : null,
      });
      return { userId: u.id, role: 'TRUSTEE' };
    },
    bidder: async () => ({ userId: (await user('BIDDER')).id, role: 'BIDDER' }),
    close: () => handle.close(),
  };
}

export const caseInput = (over: Partial<CaseInput> = {}): CaseInput => ({
  court: 'Okrožno sodišče v Ljubljani',
  caseNumber: `St ${randomUUID().slice(0, 8)}/2030`,
  debtorName: 'Dolžnik d.o.o. - v stečaju',
  debtorTaxId: '12345679',
  debtorAddress: 'Šmartinska cesta 152',
  debtorCity: '1000 Ljubljana',
  estateIban: 'SI56 0510 0801 2340 041',
  estateBank: 'Primer banka d.d.',
  ...over,
});

export const lotInput = (over: Partial<LotInput> = {}): LotInput => ({
  title: 'Dvosobno stanovanje',
  propertyKind: 'APARTMENT',
  municipality: 'Ljubljana',
  description: null,
  cadastralMunicipality: '1736 Bežigrad',
  parcelNumber: null,
  buildingId: '678',
  partId: '12',
  idZnak: '1736-678-12',
  areaM2: '58.40',
  address: 'Primerna ulica 10, 1000 Ljubljana',
  encumbrancesText: null,
  appraisalValueCents: 18_500_000n,
  landUse: null,
  isAgricultural: false,
  ...over,
});

export const ascendingInput = (over: Partial<AuctionInput> = {}): AuctionInput => ({
  type: 'ASCENDING',
  startingPriceCents: 10_000_000n,
  bidIncrementCents: 100_000n,
  priceDecrementCents: null,
  floorPriceCents: null,
  stepDurationSec: null,
  switchToAscendingOnAccept: false,
  startsAt: new Date('2030-01-10T09:00:00Z'),
  endsAt: new Date('2030-01-10T10:00:00Z'),
  extensionWindowSec: 120,
  extensionSec: 120,
  registrationDeadline: new Date('2030-01-08T09:00:00Z'),
  depositCents: 1_000_000n,
  preemptionEnabled: false,
  preemptionWindowSec: 600,
  courtApprovalRef: 'St 1234/2030, sklep z dne 20. 12. 2029',
  ...over,
});

export const descendingInput = (over: Partial<AuctionInput> = {}): AuctionInput =>
  ascendingInput({
    type: 'DESCENDING',
    bidIncrementCents: null,
    priceDecrementCents: 500_000n,
    floorPriceCents: 7_000_000n,
    stepDurationSec: 60,
    endsAt: null,
    ...over,
  });

/** Awaits a rejection and returns it as a DomainError (fails the test otherwise). */
export async function domainError(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError, but the call succeeded');
}

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%test document\n');
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

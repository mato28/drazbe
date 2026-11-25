/**
 * Development seed: 1 admin, 1 trustee (+ case, 1 unpublished lot, 2 lots with published
 * auctions so the public pages have content), 2 verified bidders.
 * All data is fictitious. Idempotent: does nothing if the admin user already exists.
 *
 *   pnpm db:seed            # seed
 *   pnpm db:reset           # drop everything, migrate, seed (dev only)
 */
import { hashPassword } from 'better-auth/crypto';
import { createDb, type Transaction } from './client';
import { createRepositories } from './repositories';
import { one } from './repositories/_util';
import { accounts, users } from './schema';

export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Domik-geslo-2026';

export const SEED_USERS = {
  admin: { email: 'admin@domik.local', name: 'Ana Administratorka', role: 'ADMIN' },
  trustee: { email: 'upravitelj@domik.local', name: 'Tomaž Upravitelj', role: 'TRUSTEE' },
  bidderPerson: { email: 'drazitelj1@domik.local', name: 'Janez Novak', role: 'BIDDER' },
  bidderCompany: { email: 'drazitelj2@domik.local', name: 'Maja Kovač', role: 'BIDDER' },
} as const;

async function createUser(
  tx: Transaction,
  u: (typeof SEED_USERS)[keyof typeof SEED_USERS],
  passwordHash: string,
) {
  const user = one(
    await tx
      .insert(users)
      .values({ email: u.email, name: u.name, role: u.role, emailVerified: true })
      .returning(),
  );
  // Better Auth stores email+password credentials as an account with providerId "credential".
  await tx.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    password: passwordHash,
  });
  return user;
}

export async function seed(url: string): Promise<'seeded' | 'skipped'> {
  const handle = createDb(url, { max: 1 });
  try {
    const existing = await createRepositories(handle.db).users.findByEmail(SEED_USERS.admin.email);
    if (existing) return 'skipped';

    const passwordHash = await hashPassword(SEED_PASSWORD);
    await handle.db.transaction(async (tx) => {
      const repos = createRepositories(tx);
      const now = new Date();

      const admin = await createUser(tx, SEED_USERS.admin, passwordHash);
      const trusteeUser = await createUser(tx, SEED_USERS.trustee, passwordHash);
      const bidder1User = await createUser(tx, SEED_USERS.bidderPerson, passwordHash);
      const bidder2User = await createUser(tx, SEED_USERS.bidderCompany, passwordHash);

      const trustee = await repos.trustees.create({
        userId: trusteeUser.id,
        name: 'Tomaž Upravitelj',
        licenseNumber: 'SU-0001/2015',
        licenseIssuedOn: '2015-03-02',
        firmName: 'Upravitelj, svetovanje d.o.o.',
        firmRegistrationNumber: '1234567000',
        taxId: 'SI12345679',
        address: 'Dunajska cesta 1, 1000 Ljubljana',
        verifiedAt: now,
      });

      const insolvencyCase = await repos.insolvencyCases.create({
        trusteeId: trustee.id,
        court: 'Okrožno sodišče v Ljubljani',
        caseNumber: 'St 1234/2026',
        debtorName: 'Gradbeništvo Primer d.o.o. - v stečaju',
        debtorTaxId: '87654326',
        debtorAddress: 'Šmartinska cesta 152',
        debtorCity: '1000 Ljubljana',
        estateIban: 'SI56051008012340041',
        estateBank: 'Primer banka d.d.',
      });

      await repos.lots.create({
        caseId: insolvencyCase.id,
        type: 'REAL_ESTATE',
        propertyKind: 'APARTMENT',
        municipality: 'Ljubljana',
        title: 'Dvosobno stanovanje, Ljubljana – Bežigrad',
        description:
          'Dvosobno stanovanje v 3. nadstropju večstanovanjske stavbe z balkonom in kletnim prostorom.',
        cadastralMunicipality: '1736 Bežigrad',
        parcelNumber: '1234/5',
        buildingId: '678',
        partId: '12',
        idZnak: '1736-678-12',
        areaM2: '58.40',
        address: 'Primerna ulica 10, 1000 Ljubljana',
        encumbrancesText:
          'Hipoteka v korist Primer banke d.d. (preneha s prodajo v stečajnem postopku).',
        appraisalValueCents: 18_500_000n,
        landUse: 'Območje stanovanj (SS)',
        isAgricultural: false,
      });

      // Two published auctions for the public pages (dates are relative to the seed time).
      const day = 24 * 3600 * 1000;
      const atHour = (daysAhead: number): Date => {
        const d = new Date(now.getTime() + daysAhead * day);
        d.setUTCHours(9, 0, 0, 0);
        return d;
      };

      const office = await repos.lots.create({
        caseId: insolvencyCase.id,
        type: 'REAL_ESTATE',
        propertyKind: 'COMMERCIAL',
        municipality: 'Maribor',
        title: 'Poslovni prostor v pritličju, Maribor – center',
        description:
          'Poslovni prostor z izložbo v pritličju poslovno-stanovanjske stavbe, primeren za trgovino ali pisarno.',
        cadastralMunicipality: '657 Maribor-Grad',
        buildingId: '1201',
        partId: '3',
        idZnak: '657-1201-3',
        areaM2: '124.00',
        address: 'Primerna cesta 4, 2000 Maribor',
        encumbrancesText:
          'Brez najemnih razmerij. Hipoteka preneha s prodajo v stečajnem postopku.',
        appraisalValueCents: 24_000_000n,
        landUse: 'Osrednja območja centralnih dejavnosti (CU)',
      });
      const officeStart = atHour(21);
      await repos.auctions.create({
        lotId: office.id,
        type: 'ASCENDING',
        status: 'PUBLISHED',
        startingPriceCents: 24_000_000n,
        bidIncrementCents: 200_000n,
        startsAt: officeStart,
        endsAt: new Date(officeStart.getTime() + 3600 * 1000),
        registrationDeadline: new Date(officeStart.getTime() - 4 * day),
        depositCents: 2_400_000n,
        publishedAt: now,
        courtApprovalRef: 'St 1234/2026, sklep o soglasju k prodaji',
      });

      const land = await repos.lots.create({
        caseId: insolvencyCase.id,
        type: 'REAL_ESTATE',
        propertyKind: 'LAND',
        municipality: 'Koper',
        title: 'Stavbno zemljišče, Koper – Bertoki',
        description:
          'Nezazidano stavbno zemljišče pravilne oblike z urejenim dostopom z javne ceste.',
        cadastralMunicipality: '2604 Bertoki',
        parcelNumber: '987/2',
        idZnak: '2604-987/2-0',
        areaM2: '860.00',
        address: 'Bertoki, 6000 Koper',
        appraisalValueCents: 13_000_000n,
        landUse: 'Stanovanjske površine (SS)',
      });
      const landStart = atHour(35);
      await repos.auctions.create({
        lotId: land.id,
        type: 'DESCENDING',
        status: 'PUBLISHED',
        startingPriceCents: 13_000_000n,
        priceDecrementCents: 500_000n,
        floorPriceCents: 9_000_000n,
        stepDurationSec: 120,
        startsAt: landStart,
        registrationDeadline: new Date(landStart.getTime() - 4 * day),
        depositCents: 1_300_000n,
        preemptionEnabled: true,
        publishedAt: now,
        courtApprovalRef: 'St 1234/2026, sklep o soglasju k prodaji',
      });

      await repos.bidderProfiles.create({
        userId: bidder1User.id,
        type: 'PERSON',
        fullName: 'Janez Novak',
        taxId: '11111119',
        emso: '0101990500006',
        address: 'Slovenska cesta 1, 1000 Ljubljana',
        status: 'VERIFIED',
        verifiedBy: admin.id,
        verifiedAt: now,
      });

      await repos.bidderProfiles.create({
        userId: bidder2User.id,
        type: 'COMPANY',
        fullName: 'Maja Kovač',
        taxId: '22222227',
        address: 'Tržaška cesta 2, 2000 Maribor',
        companyName: 'Nepremičnine Kovač d.o.o.',
        companyRegNo: '7654321000',
        representativeName: 'Maja Kovač',
        status: 'VERIFIED',
        verifiedBy: admin.id,
        verifiedAt: now,
      });

      await repos.auditLog.append({
        actorId: null,
        entity: 'system',
        entityId: 'seed',
        action: 'seed.completed',
        after: { users: Object.values(SEED_USERS).map((u) => u.email) },
      });
    });
    return 'seeded';
  } finally {
    await handle.close();
  }
}

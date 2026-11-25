# Domik

Online public auction platform for Slovenian bankruptcy trustees (ZFPPIPP).
See [`CLAUDE.md`](./CLAUDE.md) for the domain, architecture rules and auction rules.

## Repository layout

| Path               | What                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `apps/web`         | Next.js (App Router): UI, REST route handlers, SSE                  |
| `apps/worker`      | Long-running Node process: auction clock, price drops, emails, jobs |
| `packages/core`    | All business logic (pure TS, no framework imports)                  |
| `packages/db`      | Drizzle schema, migrations, repositories (PostgreSQL 16)            |
| `packages/storage` | S3 implementation of core's `ObjectStorage` port (Hetzner / RustFS) |
| `packages/pdf`     | Renders documents built in core to PDF                              |
| `packages/dss`     | EU DSS client (`SignatureValidator` port) + dev test-signing        |
| `packages/shared`  | zod schemas (API contract), constants, env config (`/config`)       |
| `docs/`            | Project docs, incl. [`legal-review.md`](./docs/legal-review.md)     |

Workspace packages ship TypeScript source (no build step). Next.js transpiles them; the worker
is bundled into a single file with tsup for production.

## Requirements

- Node.js 24 (`.nvmrc`)
- pnpm 9 (`corepack enable`)
- Docker (for Postgres, RustFS, Mailpit)

## Getting started

```sh
corepack enable
pnpm install
cp .env.example .env
pnpm services:up        # postgres, rustfs (+ bucket), mailpit
pnpm db:migrate         # create tables
pnpm db:seed            # demo users + data (see below)
pnpm dev                # web on http://localhost:3000 + worker
```

### Seed users

All seed users share the password `Domik-geslo-2026` (override with `SEED_PASSWORD`).

| Role    | Email                    | Lands on      |
| ------- | ------------------------ | ------------- |
| ADMIN   | `admin@domik.local`      | `/admin`      |
| TRUSTEE | `upravitelj@domik.local` | `/upravitelj` |
| BIDDER  | `drazitelj1@domik.local` | `/drazitelj`  |
| BIDDER  | `drazitelj2@domik.local` | `/drazitelj`  |

The seed also creates one insolvency case with one real-estate lot for the trustee.
New bidders can self-register at `/registracija`; the email OTP arrives in Mailpit
(http://localhost:8025), delivered by the worker from the `notifications_outbox`.

## Commands

| Command                              | What it does                                        |
| ------------------------------------ | --------------------------------------------------- |
| `pnpm dev`                           | Run web + worker in watch mode                      |
| `pnpm build`                         | Production build (Next standalone + bundled worker) |
| `pnpm test`                          | Vitest in every package                             |
| `pnpm lint`                          | ESLint (type-aware, zero warnings allowed)          |
| `pnpm typecheck`                     | `tsc --noEmit` in every package                     |
| `pnpm format` / `pnpm format:check`  | Prettier                                            |
| `pnpm db:generate`                   | Generate a migration from the Drizzle schema        |
| `pnpm db:migrate`                    | Apply migrations                                    |
| `pnpm db:studio`                     | Drizzle Studio                                      |
| `pnpm services:up` / `services:down` | Start / stop dev services (data is kept in volumes) |
| `pnpm verify-auction <id>`           | Re-verify an auction's bid hash chain               |
| `pnpm demo-auction <kind>`           | Dev only: auction starting in ~1 min, bidders ready |
| `pnpm dss:up`                        | Build + start EU DSS (signature validation, :8089)  |
| `pnpm sign-test-pdf <in> <out> <name>` | Dev only: sign a PDF with a test certificate      |

Run a task for a single package with a filter, e.g. `pnpm --filter @domik/core test`.

## Dev services

| Service    | URL                                             | Credentials                 |
| ---------- | ----------------------------------------------- | --------------------------- |
| PostgreSQL | `postgres://domik:domik@localhost:5432/domik`   | `domik` / `domik`           |
| RustFS S3  | http://localhost:9000 (console :9001)           | `domik` / `domik-s3-secret` |
| Mailpit    | SMTP `localhost:1025`, UI http://localhost:8025 | –                           |

## Public site

| Path                                                           | What                                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                            | Homepage with the next auctions                                                                                                                       |
| `/drazbe`                                                      | List of announced / running auctions. Filters via query string: `vrsta` (property kind), `kraj`, `stanje`, `nacin`, `cenaOd`, `cenaDo` (EUR), `stran` |
| `/drazbe/:id`                                                  | Auction detail: photos, data, documents, prices, dates, countdown, rules, case + trustee                                                              |
| `/kako-deluje`, `/pogoji-uporabe`, `/varstvo-osebnih-podatkov` | Static pages (the two legal pages are placeholders, `noindex`)                                                                                        |
| `/sitemap.xml`, `/robots.txt`                                  | Generated; private areas and `/api/` are disallowed                                                                                                   |
| `GET /api/public/documents/:id`                                | Redirect to a short-lived signed URL for a public lot document / photo                                                                                |

What is public is decided in `packages/core/src/public/service.ts`:

- **Never public:** drafts, and auctions cancelled before they were ever published
  (also their documents). Estate IBAN, tax ids and storage keys are never in the public view.
- **Listed:** `PUBLISHED`, `REGISTRATION_CLOSED`, `LIVE`, `PREEMPTION`.
- **Detail page only:** `ENDED`, `UNSUCCESSFUL`, `CANCELLED` stay reachable with their outcome.
- All documents and photos of a lot become public when its auction is published.

The "rules" text on the detail page is generated from the auction parameters
(`packages/core/src/public/rules.ts`). The countdown runs on server time.

## Trustee area (`/upravitelj`)

A signed-in trustee manages their own insolvency cases, lots, documents and auctions
(other trustees' data is reported as "not found").

- **Rules live in `packages/core`**: `caseService`, `lotService`, `documentService`,
  `auctionService`, `validateAuctionConfig` (all user-facing messages are Slovenian).
- **REST endpoints** (thin handlers in `apps/web/src/app/api`, schemas in `packages/shared/src/api`):

  | Endpoint                                                                        | What                                                |
  | ------------------------------------------------------------------------------- | --------------------------------------------------- |
  | `GET/POST /api/cases`, `GET/PUT /api/cases/:id`                                 | insolvency cases (IBAN + tax id validated)          |
  | `POST /api/cases/:id/lots`, `GET/PUT /api/lots/:id`                             | real-estate lots                                    |
  | `POST /api/lots/:id/documents` (multipart), `GET/DELETE /api/documents/:id`     | documents; sha256 is computed server-side           |
  | `POST /api/lots/:id/auctions`, `GET /api/auctions`, `GET/PUT /api/auctions/:id` | auction drafts                                      |
  | `POST /api/auctions/:id/publish` \| `cancel` \| `stop`                          | lifecycle; `cancel`/`stop` need `{ "reason": "…" }` |

  Errors are `{ "error": { "code", "message", "fields"? } }` with HTTP 401/403/404/409/422.

- Money on the wire is integer cents as a string; instants are ISO 8601 UTC.
- Every create/update/lifecycle action writes `audit_log`.
- A lot (and its case) is frozen once an auction for it is published; a lot can have only one
  open auction at a time; lots flagged as agricultural cannot be published.

## Bidder onboarding and registration

1. **Sign up** at `/registracija` (email OTP + phone), then fill in the profile at
   `/drazitelj/profil` (person or company) and upload an ID document (plus a power of attorney
   if a company is not represented by its legal representative).
2. **Register for an auction** from its public page (`/drazitelj/drazbe/:auctionId`), until
   `registration_deadline`. The bidder gets a pseudonym (`Dražitelj N`) and a deposit sklic
   `SI00 <auction number>-<N>`.
3. **Statement**: download the pre-filled PDF, sign it, upload the signed file.
4. **Deposit**: paid to the debtor's estate IBAN using the shown UPN QR code / payment data.
5. **Trustee review** (`/upravitelj/prijave/:id`, linked from the auction page): verify identity,
   mark the deposit paid, optionally mark a pre-emption holder + rank, approve or reject.
   `/upravitelj/placila` imports a bank statement (camt.053 XML or CSV) and proposes matches by
   sklic + amount + payer name; the trustee confirms them.
6. Emails (registration received / deposit confirmed / approved / rejected) go through
   `notifications_outbox` and are sent by the worker.

Where things live:

| What                                                                          | Where                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Identity verification port (`ManualIdentityProvider`)                         | `packages/core/src/identity/provider.ts`                      |
| Sklic (SI00), UPN QR payload + symbol (version 15, ECC M, ISO 8859-2 / ECI 4) | `packages/core/src/payments/`                                 |
| camt.053 / CSV parsing and deposit matching                                   | `packages/core/src/payments/bank-statement.ts`, `matching.ts` |
| Registration, review, statement content                                       | `packages/core/src/registrations/`                            |
| Gate for bidding endpoints (`requireBiddingAccess`)                           | `packages/core/src/bidding/eligibility.ts`                    |

Bidding endpoints (`GET /api/auctions/:id/bidding-access`, `POST /api/auctions/:id/bids`) return
403 unless the caller's registration for that auction is APPROVED (see "Live bidding" below).

Sample bank statements for trying the import: `packages/core/src/payments/fixtures/`.

## Live bidding

Engine: `packages/core/src/bidding/` (rules are pure functions in `rules.ts`; tests in
`packages/core/src/bidding-engine.test.ts` run against real Postgres).

- **Bids** (`placeBid`, `acceptCurrentPrice`, `matchAsPreemptionHolder`) run in ONE transaction:
  `SELECT … FOR UPDATE` on the auction row → eligibility (APPROVED + PAID + VERIFIED) → state,
  amount and time checks on SERVER time → append to the hash chain → anti-sniping → update the
  price/leader → `audit_log` → `NOTIFY auction_events` (delivered on commit).
- **Idempotency**: every submit carries a client-generated `idempotencyKey` (unique per
  registration); a retry returns the original bid instead of bidding twice.
- **Worker clock** (`apps/worker`, every `WORKER_AUCTION_TICK_MS`, default 1 s): closes
  registration, starts auctions, executes descending price steps, ends the main phase, opens/closes
  PREEMPTION and records the winner or UNSUCCESSFUL. A transaction-scoped advisory lock per auction
  makes several worker instances safe. A trustee stop sets CANCELLED and the clock ignores it.
- **Live page** `/drazbe/:id/v-zivo`: SSE stream `GET /api/auctions/:id/stream` (one Postgres
  LISTEN per web process; every notification reloads the state, plus a resync every 10 s),
  countdown corrected by the server clock offset (`GET /api/time`), confirm dialog, "Vodite"
  indicator. Bidders appear only as pseudonyms.
- REST: `POST /api/auctions/:id/bids` `{ amountCents, idempotencyKey }`,
  `POST …/accept` and `POST …/preemption-match` `{ expectedPriceCents, idempotencyKey }`,
  `GET …/live`.

Try it in two browsers (after `pnpm db:seed`, with `pnpm dev` running):

```sh
pnpm demo-auction asc 180     # starts in ~1 min, both seed bidders already approved
pnpm demo-auction desc        # also: desc-switch, preemption
```

Log in as `drazitelj1@domik.local` in one browser and `drazitelj2@domik.local` in another
(private window) and open the printed live page.

Verify an auction's bid log (exit code 0 = intact, 1 = tampered):

```sh
pnpm verify-auction <auctionId>
# production container: docker compose exec worker node dist/cli/verify-auction.js <auctionId>
```

## After the auction

Code: `packages/core/src/post-auction/` (tests: `packages/core/src/post-auction.test.ts`).

- **Settlement** (`settlement.ts`): runs in the same transaction as the close (ENDED, UNSUCCESSFUL,
  or a trustee stop/cancel). The winner's deposit is set to APPLIED (credited to the price) and
  every other paid deposit to REFUND_PENDING. For ENDED, a `sales` row is created with the contract
  deadline. Emails go to the winner, the other bidders and the trustee.
- **Auction report / zapisnik** (`report.ts`): the worker renders two PDFs, each stored with
  its sha256. The full version (`AUCTION_REPORT`) maps pseudonyms to identities and is for the
  trustee only. The public version (`AUCTION_REPORT_PUBLIC`) is linked on the public auction page
  and the bidder page. Both contain case, lot, parameters, the event log (phase changes,
  extensions), every bid with server time (ms), all hashes, the final hash, the chain verification
  and the outcome.
- **Sale contract**: filled from `packages/core/templates/sale-contract.ts` (a strict filler; an
  unknown or empty placeholder throws). The trustee can change the down payment and the deadlines
  before the buyer signs.
- **Signing**: the buyer downloads the contract, signs it with a QES and uploads it. EU DSS
  (`packages/dss`, REST `validateSignature`) checks three things: the signature is valid, it is
  qualified, and the signer's name matches the buyer (diacritics and case are ignored). The
  trustee then uploads the counter-signed PDF, and both signatures are checked. Fallback: "signed
  on paper" plus a scan and the signing date. Payment deadlines run from the signing date.
- **Tracker**: AWAITING_CONTRACT → CONTRACT_SIGNED → DOWN_PAYMENT_PAID → PRICE_PAID →
  TRANSFER_PROPOSED → TRANSFER_ORDER_ISSUED (sklep o izročitvi no.) → REGISTERED (ZK Dn no.).
  The worker sends the buyer a reminder 3 days before each deadline. After a deadline passes it
  sends an "overdue" email to both the buyer and the trustee. The trustee can then declare a
  default: the sale becomes DEFAULTED and the buyer's deposit FORFEITED.
- **Refunds**: the refund IBAN is entered by the bidder (or by the trustee from the bank
  statement). "Pripravi nalog SEPA" generates a `pain.001.001.03` XML. The debtor in it is the
  estate account, the EndToEndId is the deposit sklic, and the file validates against the official
  ISO 20022 XSD (`packages/core/src/payments/fixtures/`). The trustee uploads it to their e-bank
  and then marks the deposits as refunded.

| Endpoint                                                  | Who     | What                                          |
| --------------------------------------------------------- | ------- | --------------------------------------------- |
| `POST /api/auctions/:id/contract`                         | trustee | generate the contract (optional terms)        |
| `POST /api/auctions/:id/contract/buyer-signed`            | buyer   | upload the signed PDF (multipart; DSS check)  |
| `POST /api/auctions/:id/contract/signed`                  | trustee | upload the counter-signed PDF (both checked)  |
| `POST /api/auctions/:id/contract/paper`                   | trustee | paper fallback: `file` + `signedAt`           |
| `POST /api/auctions/:id/sale/steps` \| `sale/default`     | trustee | next tracker step / declare default           |
| `PUT /api/registrations/:id/refund-iban`                  | both    | refund account                                |
| `POST /api/auctions/:id/refund-orders` \| `refunds`       | trustee | SEPA pain.001 / mark deposits refunded        |

### EU DSS (signature validation)

There is no official DSS image. `docker-compose.yml` builds one from the official
`esig/dss-demonstrations` repository at a pinned tag (profile `dss`, port 8089):

```sh
pnpm dss:up                                    # first build takes several minutes
pnpm --filter @domik/dss test                  # integration tests run once DSS answers
```

`SIGNATURE_REQUIRE_QUALIFIED=false` (development only) also accepts signatures made with test
certificates. DSS reports these as `INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND`. Production keeps
the default `true`, so only a QES on the EU trusted lists is accepted. To test-sign a contract
by hand:

```sh
pnpm sign-test-pdf pogodba.pdf pogodba-kupec.pdf "Ime Priimek"           # buyer
pnpm sign-test-pdf pogodba-kupec.pdf pogodba-podpisana.pdf "Upravitelj"  # counter-signature
```

## Auth and roles

- Better Auth (email + password, email OTP verification). Config: `apps/web/src/server/auth.ts`.
- Roles `ADMIN | TRUSTEE | BIDDER` live on `users.role`; self-registration always creates a BIDDER
  (the field is not client-settable). Admins/trustees are created by an admin (or the seed).
- Area access policy: `packages/core/src/auth/roles.ts`. `apps/web/src/proxy.ts` does optimistic
  cookie-based redirects; the authoritative check is `requireArea()` in each area layout and
  `requireApiRole()` in route handlers.

## Data integrity

- `bids` and `audit_log` are append-only, enforced by triggers
  (`packages/db/drizzle/0001_append_only_triggers.sql`). The only allowed update is setting
  `bids.tsa_token` once. Bid inserts must continue the per-auction `seq` / `prev_hash` chain.
- `bids.hash = sha256(prevHash|auctionId|pseudonym|amountCents|serverTimeISO|seq)`, genesis
  `sha256(auctionId)`; `pnpm verify-auction <id>` recomputes it.
- DB tests (`pnpm --filter @domik/db test`) start a throwaway Postgres 16 with testcontainers
  (needs Docker), or use `TEST_DATABASE_URL` pointing at an empty database.

## Configuration

All env vars are validated with zod in `packages/shared/src/config` (`loadServerConfig`,
`loadWorkerConfig`). There is one `.env` at the repo root; the web app, the worker and
drizzle-kit all read it in development. In production, pass env vars via the container.
The web server validates its config on startup (`src/instrumentation.ts`), the worker on boot.

## Docker images

Build from the repo root:

```sh
docker build -f apps/web/Dockerfile -t domik-web .
docker build -f apps/worker/Dockerfile -t domik-worker .
```

Both use `turbo prune` + multi-stage builds and run as a non-root user. The web image serves
the Next.js standalone output on port 3000 with a healthcheck on `/api/health`; the worker
image contains only the bundled `dist/index.js`.

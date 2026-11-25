# CLAUDE.md — Domik (working name)

Online public auction platform for Slovenian bankruptcy trustees (stečajni upravitelji) to sell
bankruptcy-estate assets (MVP: real estate) under ZFPPIPP. Multiple trustees use one platform.
UI language: **Slovenian**. Code, comments, commits: **English**.

## Stack

- Monorepo: pnpm workspaces + Turborepo
- `apps/web` — Next.js (App Router) + TypeScript: UI, REST route handlers, SSE stream
- `apps/worker` — Node.js long-running process: auction clock, price drops, closing, emails, jobs
- `packages/core` — ALL business logic (pure TS, no framework imports)
- `packages/db` — Drizzle ORM schema, migrations, repositories (PostgreSQL 16)
- `packages/shared` — zod schemas (API contract), types, constants
- `packages/storage` — S3 implementation of the `ObjectStorage` port defined in core
- `packages/pdf` — renders documents built in core (e.g. bidder statement) to PDF
- Postgres `LISTEN/NOTIFY` for web <-> worker events (no Redis)
- Tailwind + shadcn/ui; auth with Better Auth (email + password + email OTP)
- Files: S3-compatible storage (Hetzner Object Storage; RustFS locally)
- Email: Brevo (SMTP); dev uses Mailpit
- Deploy: Docker Compose on Hetzner (EU). Services: web, worker, postgres, rustfs(dev), mailpit(dev)

## Architecture rules (non-negotiable — they keep a future separate backend a move, not a rewrite)

1. Business logic ONLY in `packages/core`. Never in React components, Server Actions or route handlers.
2. Route handlers are thin: parse with zod -> call core service -> return JSON. ~5–15 lines.
3. No Server Actions for important operations (bids, deposit confirmation, auction state changes).
   Use explicit REST endpoints, e.g. `POST /api/auctions/:id/bids`.
4. DB access only via `packages/db` repositories. No ad-hoc Drizzle queries in apps.
5. Every API input/output has a zod schema in `packages/shared`.
6. All money as integer cents (`bigint`), never floats. Currency EUR.
7. All times stored UTC (`timestamptz`); display in Europe/Ljubljana.
8. Server time is the only source of truth for auction timing. Never trust client time.

## Domain glossary (SL -> code)

| Slovenian             | Code name                         | Meaning                                                   |
| --------------------- | --------------------------------- | --------------------------------------------------------- |
| stečajni upravitelj   | `trustee`                         | runs the sale, publishes auctions                         |
| stečajni postopek     | `insolvencyCase`                  | court case: court, case number (opravilna št.), debtor    |
| stečajni dolžnik      | `debtor`                          | bankrupt entity; owns the estate bank account             |
| dražba                | `auction`                         | one sale event (can contain one lot)                      |
| predmet prodaje       | `lot`                             | the asset being sold (MVP: real estate)                   |
| dražitelj             | `bidder`                          | verified person/company allowed to bid                    |
| izklicna cena         | `startingPrice`                   |                                                           |
| najnižja cena         | `floorPrice`                      | lowest price in descending auction                        |
| korak draženja        | `bidIncrement` / `priceDecrement` |                                                           |
| varščina              | `deposit`                         | paid to debtor's estate account, NOT to us                |
| sklic                 | `paymentReference`                | unique per bidder+auction (SI00 model)                    |
| predkupni upravičenec | `preemptionHolder`                | may match the highest bid after main phase                |
| zapisnik o dražbi     | `auctionReport`                   | sealed PDF of the full bid log                            |
| domik                 | `award`                           | declaring the winner                                      |
| sklep o izročitvi     | `transferOrder`                   | court order transferring ownership (we only track status) |

## Auction rules (implement exactly; configurable per auction)

### Ascending (`type = 'ASCENDING'`)

- Bids must be >= current price + bidIncrement (first bid >= startingPrice).
- Bids are binding and irrevocable.
- Anti-sniping: if a valid bid arrives < `extensionWindowSec` (default 120) before `endsAt`,
  set `endsAt = now + extensionSec` (default 120). Repeats without limit.
- Winner = highest valid bid when the clock ends.
- No bids -> auction UNSUCCESSFUL.

### Descending (`type = 'DESCENDING'`)

- Price starts at startingPrice and drops by `priceDecrement` every `stepDurationSec`,
  never below `floorPrice`. Price drops are executed by the WORKER on server time.
- First bidder to accept the current step price wins (`acceptCurrentPrice`).
- Option `switchToAscendingOnAccept` (default false): after the first acceptance, the auction
  continues as ASCENDING from the accepted price (other bidders may outbid; anti-sniping applies).
  Reason: Slovenian case law allows this mixed mode. Trustee chooses per auction.
- Floor reached and last step expired with no acceptance -> UNSUCCESSFUL.
- Trustee may stop the auction (logged with reason).

### Pre-emption phase (`preemptionEnabled`)

- After the main phase ends with a winner, if there are registered preemption holders who paid
  the deposit, open phase PREEMPTION for `preemptionWindowSec` (default 600).
- A holder may only MATCH the highest bid (not exceed). If matched, holder becomes winner.
- Multiple holders: order defined by trustee (`preemptionRank`). Flag as LEGAL-REVIEW item.

### Eligibility

- Only bidders with status APPROVED for that auction (trustee approved identity + deposit paid) can bid.
- Registration closes `registrationDeadline` (default 2 working days before start).
- Every bidder signs a statement that they are not an excluded person (debtor's management/supervisory
  board members or procurators in last 2 years, the trustee, the judge, >10% shareholders, related persons).
- Bidders are anonymous to each other: show only a pseudonym (e.g. "Dražitelj 3").

## Integrity (court evidence)

- `bids` table is append-only (DB trigger blocks UPDATE/DELETE).
- Each bid stores `hash = sha256(prevHash | auctionId | bidderPseudonym | amountCents | serverTimeISO | seq)`.
  Genesis prevHash = sha256(auctionId). Any gap/tamper is detectable by re-verification.
- `audit_log` for every state change (actor, action, before/after, timestamp). Append-only.
- Bid placement runs in ONE transaction with `SELECT ... FOR UPDATE` on the auction row.
- Timestamping (qualified TSA) is an async worker job behind an interface `TimestampProvider`
  (impl: `NoopProvider`, `Rfc3161Provider` for dev with FreeTSA, later `SiTsaProvider`/`RekonoProvider`).
- Auth providers behind interface `IdentityProvider` (MVP: manual verification; later SI-PASS, cert login).

## Money flow

- We NEVER hold client money. Deposits and purchase price go to the debtor's estate IBAN.
- Platform generates UPN QR + unique sklic; trustee confirms payments (manual or bank statement import).
- Deposit refunds: platform generates SEPA pain.001 XML for the trustee to upload to their bank.

## Conventions

- Tests: Vitest. `packages/core` must have high coverage, especially the bidding engine
  (concurrency tests against real Postgres via testcontainers or docker compose).
- Lint/format: ESLint + Prettier. Strict TS.
- Migrations via drizzle-kit; never edit applied migrations.
- Env via `.env` + zod-validated config in `packages/shared/config`.
- Commit small, conventional commits.
- When a legal rule is uncertain, add `// LEGAL-REVIEW:` comment and list it in `docs/legal-review.md`.

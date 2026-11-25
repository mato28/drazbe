# DESIGN.md — Domik design system

Design direction: **"Calm institutional"** — serious and trustworthy like a bank or court,
modern and clear like a good property portal. The opposite of the bureaucratic state portals.

Claude Code: read this file before building ANY UI. Follow tokens and patterns exactly.
If something is not covered here, choose the calmest, simplest option and note it in
`docs/design-decisions.md`.

---

## 1. Principles

1. **Trust first.** Every screen shows who stands behind the sale: court, case number, trustee.
2. **Calm, not hype.** The countdown is real (legal close) — show it clearly, but never add fake
   urgency: no "X people are watching" pop-ups, no flashing, no confetti, no sounds.
3. **Plain language.** Every legal term gets a short explanation (tooltip / "i" icon). Sentences
   short. Slovenian UI, formal "vi" form.
4. **No surprises about money.** Starting price, bid step, deposit, buyer costs and taxes are
   always visible before any action.
5. **One primary action per screen.** Bid, register, pay deposit — never two competing CTAs.
6. **Mobile first.** Most bidders will open links from email/SMS on a phone.
7. **Accessible by default.** WCAG 2.2 AA (European Accessibility Act applies to e-commerce).

---

## 2. Design tokens

Implement as CSS variables in `apps/web/app/globals.css` and map them in `tailwind.config.ts`.
shadcn/ui theme must use these variables.

### Colors

| Token             | Hex       | Use                                                     |
| ----------------- | --------- | ------------------------------------------------------- |
| `--bg`            | `#F7F6F2` | page background (warm off-white)                        |
| `--surface`       | `#FFFFFF` | cards, panels                                           |
| `--surface-muted` | `#EFEDE7` | table headers, subtle blocks                            |
| `--border`        | `#E2DFD7` | 1px borders, dividers                                   |
| `--ink`           | `#0F1E3A` | primary text, primary buttons, header (navy)            |
| `--ink-2`         | `#3A4660` | secondary text                                          |
| `--ink-3`         | `#6B7385` | meta text, labels                                       |
| `--primary`       | `#0F1E3A` | primary buttons, links                                  |
| `--primary-hover` | `#1C2F55` |                                                         |
| `--accent`        | `#F59E0B` | ONLY for LIVE status + live countdown highlight (amber) |
| `--accent-soft`   | `#FEF3C7` | background of LIVE badge                                |
| `--success`       | `#15803D` | "Vodite" (you are leading), deposit paid                |
| `--success-soft`  | `#DCFCE7` |                                                         |
| `--danger`        | `#B91C1C` | "Preglasovani ste" (outbid), errors                     |
| `--danger-soft`   | `#FEE2E2` |                                                         |
| `--info`          | `#1D4ED8` | info notes, links in text                               |
| `--info-soft`     | `#DBEAFE` |                                                         |

Rules:

- Amber is never used for buttons or decoration — only live state.
- Never communicate state with color alone: always icon + text.
- Text contrast ≥ 4.5:1 (all ink colors on bg/surface pass).

### Typography

- **Headings (H1–H2 only):** `Source Serif 4` (serif, full Slovenian diacritics), weight 600.
- **Everything else:** `Inter`, weights 400/500/600.
- Load via `next/font/google` with `subsets: ['latin', 'latin-ext']` (č, š, ž).
- **All prices, countdowns, bid amounts, dates in tables:** `font-variant-numeric: tabular-nums`
  (Tailwind `tabular-nums`) so digits don't jump.

| Style    | Font              | Size / line-height        | Use                        |
| -------- | ----------------- | ------------------------- | -------------------------- |
| display  | Serif 600         | 48/56 (mobile 34/40)      | homepage hero only         |
| h1       | Serif 600         | 36/44 (mobile 28/34)      | page titles                |
| h2       | Serif 600         | 24/32                     | section titles             |
| h3       | Inter 600         | 18/26                     | card titles, panel titles  |
| body     | Inter 400         | 16/24                     | default                    |
| small    | Inter 400         | 14/20                     | meta, helper text          |
| caption  | Inter 500         | 12/16, uppercase, +0.04em | labels ("TRENUTNA CENA")   |
| price-xl | Inter 600 tabular | 40/44                     | current price in bid panel |
| price-lg | Inter 600 tabular | 24/32                     | prices on cards            |

Money format: `30.326,40 €` (Slovenian locale `sl-SI`, `Intl.NumberFormat`).
Dates: `08. 12. 2026 ob 11:00`. Always show timezone note "(po slovenskem času)" on auction pages.

### Spacing, radius, shadow

- Spacing scale: Tailwind default (4px base). Section vertical padding 64px desktop / 40px mobile.
- Max content width: 1280px. Gutter 24px desktop / 16px mobile.
- Radius: `--radius: 12px` cards/panels, 8px buttons/inputs, 999px badges.
- Shadow: one soft shadow only for floating panels: `0 1px 2px rgba(15,30,58,.06), 0 8px 24px rgba(15,30,58,.06)`.
- Borders preferred over shadows for cards.

### Motion

- Transitions 150–200ms ease-out. Price change: number crossfade + brief soft highlight
  (`--success-soft` if you lead, `--surface-muted` otherwise) for 1s.
- Respect `prefers-reduced-motion` (no highlight animation, instant updates).

---

## 3. Core components (build in `apps/web/components/ui` on top of shadcn/ui)

| Component      | Notes                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`       | variants: primary (navy), secondary (outline navy), ghost, danger. Min height 44px (touch).                                                                                                  |
| `StatusBadge`  | auction status: Objavljeno · Prijave zaprte · **V ŽIVO** (amber, pulsing dot only if reduced-motion off) · Predkupna faza · Zaključeno · Neuspešno · Preklicano                              |
| `Countdown`    | segmented D / UR / MIN / SEK, tabular nums, synced to server time offset. Below it always the exact end time "Konec: 08. 12. 2026 ob 11:00". Shows "+2 min podaljšano" note after extension. |
| `Price`        | formatted money, sizes xl/lg/md                                                                                                                                                              |
| `TermTooltip`  | dotted underline + "i" icon; explains legal terms (see glossary §6)                                                                                                                          |
| `TrustBar`     | court · opravilna št. · upravitelj (+ "Preverjen upravitelj" badge) · link to case                                                                                                           |
| `AuctionCard`  | see §4.2                                                                                                                                                                                     |
| `BidPanel`     | see §4.3 — most important component                                                                                                                                                          |
| `BidHistory`   | pseudonym · amount · relative time ("pred 2 min") · exact time on hover; newest first                                                                                                        |
| `DocumentList` | icon by type, name, size, download; sha256 shown in details for trustee                                                                                                                      |
| `Stepper`      | registration steps (Profil → Dokumenti → Varščina → Potrditev)                                                                                                                               |
| `EmptyState`   | calm illustration-free: icon + one sentence + one action                                                                                                                                     |
| `Alert`        | info / success / warning / danger with icon + text                                                                                                                                           |

---

## 4. Screens

### 4.1 Homepage `/`

1. **Header:** logo left; nav: Dražbe · Kako deluje · Za upravitelje; right: Prijava / Moj račun.
2. **Hero:** serif headline (e.g. "Pregledna spletna prodaja premoženja iz stečajnih postopkov"),
   one sentence subline, search field (lokacija, vrsta nepremičnine) + primary CTA "Preglej dražbe".
   Trust numbers row: število prodaj · skupna vrednost · število upraviteljev (hide until real data).
3. **"Kmalu se zaključi"** — 4–8 AuctionCards, horizontal scroll on mobile.
4. **Kako deluje** — 3 steps with icons: 1) Registrirajte se in potrdite identiteto 2) Plačajte varščino na račun stečajnega dolžnika 3) Dražite na spletu.
5. **Za upravitelje** — short block + CTA "Objavite dražbo".
6. **Footer:** legal pages, contact, company data (firma, matična, davčna).

### 4.2 Auction listing `/drazbe`

- Desktop: filters left (260px) · results middle · **map right (toggle "Seznam / Zemljevid")**.
  Mobile: filters in bottom sheet, list/map toggle.
- Sort tabs: **Kmalu se zaključi · Nove · Najnižja izklicna cena · Najbližje** (needs location).
- Filters: vrsta (stanovanje, hiša, poslovni prostor, zemljišče), regija/občina, izklicna cena od–do,
  status, način dražbe (zviševanje / zniževanje), samo celote (brez deležev).

**AuctionCard**

- 4:3 photo; on photo bottom-left a dark translucent chip (`rgba(15,30,58,.8)`, white text):
  countdown or start date + StatusBadge.
- Below: title ("Stanovanje, 62 m², Ljubljana – Šiška"), key facts row with icons (m², sobe,
  leto gradnje, delež), **Izklicna cena** (price-lg) + "Varščina 3.032,64 €" (small).
- Chips for special cases: "Delež 1/2", "Predkupni upravičenec", "Ponovljena dražba (5.)".
- Whole card clickable; heart icon "Spremljaj" top-right.

### 4.3 Auction detail / live bidding `/drazbe/[id]` — MOST IMPORTANT

Desktop grid: **left meta column (240px) · gallery + content (fluid) · BidPanel (380px, sticky)**.
Mobile: gallery → BidPanel summary → content; **sticky bottom bar** with current price +
"Oddaj ponudbo" button that opens the BidPanel as a sheet.

**Top:** breadcrumb, title (h1 serif), address, StatusBadge, share + spremljaj, TrustBar.

**Gallery:** 2×2 grid + "Vse fotografije (N)" → fullscreen lightbox with keyboard nav.
Floor plan as first item after photos if available.

**Left meta column:** Lokacija · Vrsta · Površina · ID znak · Delež · Opravilna št. · Sodišče ·
Upravitelj · Ogled (date + address + "Dodaj v koledar").

**BidPanel (states):**

1. _Before start, not registered:_ start date + countdown to start, izklicna cena, korak, varščina,
   registration deadline, CTA **"Prijava na dražbo"**.
2. _Registered, pending approval / deposit unpaid:_ stepper with current step, UPN QR + sklic +
   IBAN copy buttons, note "Varščino plačajte z računa, ki se glasi na vaše ime."
3. _Approved, waiting for start:_ "Prijava potrjena. Dražite kot **Dražitelj 3**." + countdown.
4. _LIVE ascending:_ caption "TRENUTNA CENA", price-xl, Countdown, status line
   (✓ "Vodite" green / ✕ "Preglasovani ste" red / neutral "Še niste oddali ponudbe"),
   **3 quick-bid buttons** (min next, +2 steps, +5 steps), custom input with placeholder
   "30.326,40 € ali več", primary button **"Oddaj ponudbo"** → confirm dialog with amount in
   words and "Ponudba je zavezujoča in je ni mogoče preklicati." Below: BidHistory (last 5 +
   "Vse ponudbe").
5. _LIVE descending:_ caption "TRENUTNA CENA KORAKA", price-xl, step indicator
   "Korak 4 od 12", time to next price drop, next price preview, floor price,
   primary button **"Sprejmem ceno 27.000,00 €"** → confirm dialog.
6. _Preemption phase:_ explanation banner; only preemption holders see "Izenačim najvišjo ponudbo".
7. _Ended:_ result (prodano / neuspešno), final price, link to public auction report + hash.
   Winner sees next steps checklist (pogodba, ara, kupnina) with deadlines.

Always visible under the panel: "Kako poteka dražba?" link + deposit and costs summary.

**Content tabs:** Opis · Dokumenti · **Stroški in davki** (davek na promet nepremičnin/DDV,
overitve, vknjižba — plain language) · Pravila dražbe · Podatki o postopku · Zemljevid.

**Live updates:** SSE; on reconnect show small "Povezava ponovno vzpostavljena" toast.
If connection lost > 5s: amber inline warning in BidPanel "Povezava prekinjena — ponovno
vzpostavljamo…" and disable bid button until reconnected.

### 4.4 Registration & bidder account `/racun`

- Stepper flow, one question group per screen, autosave.
- "Moje dražbe": tabs Prijavljene · V teku · Zaključene; each row shows status + next action.
- Document upload: drag & drop, accepted types listed, progress, clear errors.

### 4.5 Trustee dashboard `/upravitelj`

- Calm data-dense layout: left sidebar nav (Pregled · Postopki · Dražbe · Prijave dražiteljev ·
  Plačila · Poročila), top bar with search.
- **Pregled:** cards "Za potrditev" (pending registrations, unmatched payments), upcoming auctions,
  live auctions with current price.
- Tables: sticky header, tabular nums, row actions on the right, filters above.
- Auction form: sections with left labels + helper text; live preview of the public card on the right.
- Live auction monitor: same BidPanel data read-only + full identity mapping + "Ustavi dražbo"
  (danger, requires reason).

---

## 5. Content & tone (Slovenian)

- Formal "vi". Short sentences. Active voice. No legal jargon without TermTooltip.
- Buttons are verbs: "Oddaj ponudbo", "Prijava na dražbo", "Prenesi zapisnik".
- Errors say what happened + what to do: "Ponudba je nižja od najnižje dovoljene (31.326,40 €).
  Vnesite višji znesek."
- Never "Kupi zdaj", "Ne zamudi!", exclamation marks, or emojis.

---

## 6. Glossary for TermTooltip (initial)

| Term                      | Tooltip text                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Varščina                  | Znesek, ki ga plačate pred dražbo na račun stečajnega dolžnika. Če ne zmagate, vam ga vrnemo. Če zmagate, se upošteva pri kupnini. |
| Izklicna cena             | Najnižja cena, od katere se začne draženje.                                                                                        |
| Korak draženja            | Najmanjši znesek, za katerega morate zvišati ponudbo.                                                                              |
| Dražba z zniževanjem cene | Cena se v korakih znižuje. Zmaga, kdor prvi sprejme ceno.                                                                          |
| Predkupni upravičenec     | Oseba, ki ima po zakonu ali pogodbi pravico kupiti nepremičnino po najvišji ponujeni ceni.                                         |
| Domik                     | Razglasitev najboljšega ponudnika ob koncu dražbe.                                                                                 |
| Sklep o izročitvi         | Sklep sodišča, s katerim lastninska pravica preide na kupca.                                                                       |
| Delež                     | Prodaja se samo del (npr. 1/2) lastninske pravice na nepremičnini.                                                                 |
| Podaljšanje               | Če je ponudba oddana v zadnjih 2 minutah, se dražba podaljša za 2 minuti.                                                          |

---

## 7. Accessibility checklist (must pass)

- Keyboard: everything reachable; visible focus ring (2px `--info` outline + offset).
- Bid confirm dialog traps focus; Esc cancels.
- Live price/time updates announced via `aria-live="polite"`; outbid via `aria-live="assertive"`.
- Countdown has text alternative updating at most every 10s for screen readers.
- Touch targets ≥ 44×44px. Text resizable to 200% without breaking.
- Form fields have labels (no placeholder-only labels), errors linked via `aria-describedby`.

---

## 8. Do / Don't

| Do                                        | Don't                                 |
| ----------------------------------------- | ------------------------------------- |
| Large real photos, floor plans            | Stock photos of gavels and handshakes |
| Exact end time next to countdown          | Countdown alone                       |
| Pseudonyms in bid history ("Dražitelj 3") | Real names or initials of bidders     |
| Costs explained before bidding            | Fees revealed after winning           |
| Calm amber dot for LIVE                   | Red flashing, sounds, confetti        |
| Court + case number visible               | Hiding that it's a bankruptcy sale    |

---

## 9. References (patterns taken from)

- Catawiki — sticky bid panel, segmented countdown + exact time, quick-bid buttons, pseudonymous bid history.
- Troostwijk Auctions — 3-column lot page, meta column, viewing date/address, numbered bidders.
- Cars & Bids — card with overlay chip (time + price), sort tabs.
- iamsold — property-portal facts row, status chips, "Fees and charges explained" tab.
- GOV.UK Design System — plain language, accessibility, one thing per page in forms.

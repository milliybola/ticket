# Sayohat Tickets — architecture

Universal ticketing platform (concerts, theatre, cinema, museums, sport, events) with a storefront in the
iticket.uz style. Built from the PRD and the 43 user stories in `../PRD Sayohat Tickets — MVP.pdf` and
`../User stories Sayohat Tickets — MVP.pdf`; `../ticketingsystem.html` is the clickable prototype the business
rules were ported from.

Stack: React 19, TypeScript, Vite 8, React Router 8 (data router), TanStack Query 5, Zustand 5, Tailwind CSS 4,
`qrcode` (QR generation), `jsqr` (QR scanning), `lucide-react` (icons).

```
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Data: one source for every role

The catalogue of **iticket.uz** (public API, no token, `src/api/iticket.ts`) is imported into the local backend,
so the storefront, the organizer cabinet, the box office and the moderator work with the same data
(`src/sync/iticket.ts`):

- On first start and after the daily reset, `syncCatalog()` imports organizers (iticket "ou", named after the
  venue they sell most at), venues, ~150 events with names in uz/ru/en and their upcoming sessions.
  `SyncGate` shows the progress.
- The seating plan of a session is loaded when someone first needs it (`ensurePlan`, `PlanLoader`): the SVG
  plan with sectors and seats, price categories / ticket types and the seats still free on iticket. Seats sold
  on iticket stay taken here. Nothing is ever written to iticket.
- Purchases happen here (checkout, box office, entry check) and are stored in the browser's `localStorage`.
- **Local data lives one day** (`LOCAL_TTL`): after 24 h orders and the other local keys are cleared (the
  interface language stays) and the catalogue is imported again.

The local backend is `src/store/db.ts`: one object in `localStorage`, shared by all tabs (the storefront in one
tab and the box office in another sell from one stock). Writes go through `tx(d => …)`; components read with
`useDb()`. Replace this module with HTTP calls to move to a real server.

## Layout

```
src/lib/        i18n (uz/ru/en), Tashkent time, money/phones, small utils
src/domain/     types.ts (the model), scheme.ts (seat generation, geometry, SVG import),
                rules.ts (all business rules), seed.ts (demo data), storefront.ts (category mapping)
src/store/      db.ts (local backend), auth.ts (who is signed in)
src/api/        iticket.ts (API client + React Query hooks)
src/components/ ui/ (Button, Field, Input, Select, Modal, toast, Tabs, Table, …), layout/, scheme/SchemeView,
                common.tsx (Logo, Poster, Qr), tickets.tsx (TicketView, ReceiptView, printOrder)
src/pages/      public/ (storefront), org/ (organizer cabinet), box/ (box office, entry), mod/ (moderator)
```

## Conventions

- **Text**: every visible string is trilingual, inline: `t3('Uzbek', 'Русский', 'English')` — order is
  **uz, ru, en**. Stored multilingual values are `L10n` objects (`{uz, ru, en}`), shown with `tl(obj)`.
  Every component that renders text calls `useI18n()` at the top (it re-renders on language change).
- **Time**: always Tashkent (UTC+5): `now()`, `tkMs(date, time)`, `dateKey(ms)`, `fmtDate`, `fmtDT`, `hhmm`.
  Never `new Date().getHours()`.
- **Money**: `sum(n)` → "150 000 soʻm"; `usd(n)` → "≈ $12" hint for tourists.
- **Writes**: only via `tx()` or the functions in `domain/rules.ts`. Log notable actions with `logAct()`;
  "send" SMS/email with `send()` (they land in the moderator's outbox).
- **Styling**: Tailwind utility classes with the theme tokens from `index.css` (`bg-brand`, `text-ink-3`,
  `bg-page`, `border-line`, `rounded-[var(--radius-card)]`, …). Reuse `components/ui` first.
- **Seat plans**: render with `<SchemeView scheme mode occ sel price onSeat onElement />`; never hand-draw seats.

## Roles and entry points

- Buyer (guest or account): `/`, `/events/:category`, `/events/:cat/:slug` (iticket event),
  `/e/:eventId` (Sayohat event), `/checkout/:holdId`, `/order/:orderId`, `/find-ticket`, `/account`.
- Organizer: `/org/login` (any imported organizer, password `demo1234`), `/org/register`, `/org/*`,
  box office `/org/box`, entry check `/org/entry`, reports `/org/reports`.
- Moderator: `/mod/login` (demo: `malika@sayohat.uz` / `demo1234`), `/mod/*`.
- Demo tools: `/demo` (reset data, time travel, switch services off).

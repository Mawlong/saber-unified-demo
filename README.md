# Unified transaction API

Saber prototype. Standalone Next.js app. Shows one transaction API surface on the offramp
(crypto → fiat) direction: quote a locked rate, then create the transaction from that quote.
Every step shows the real request/response (engineering) beside the product view (business).

```bash
npm install
npm run dev        # http://localhost:3000
```

## The sequence

1. **Quote** — client passes `client_id` + a sell amount (USDT) or a fixed receive amount
   (INR). `POST /v1/quotes` returns a `quote_id`, the locked rate, a spread breakdown, and a
   60s TTL.
2. **Create** — pass the `quote_id` + beneficiary to `POST /v1/transactions`. The locked rate
   carries over. If the quote expired, the call returns `quote_expired` → re-quote.
3. **Result** — the transaction polls created → processing → settled.

## Things to try

| Action | What it shows |
|---|---|
| Switch client (Mudrex / Frex) | Per-client pricing source + spread. Frex is static OTC (price pinned). |
| Set "Client fixes" to receive amount | `price_lock_spread` kicks in (lock-window risk). |
| Wait 60s on the quote, then create | `quote_expired` error and the re-quote path. |

## Where things go

- `CONTEXT.md` — what this simulates, wiki sources, assumptions. Read first.
- `app/page.tsx` — the flow (split API + product view).
- `app/api/quotes`, `app/api/transactions` — mock endpoints.
- `lib/transactions.ts` — pricing + quote + transaction logic (the wiki formula lives here).
- `components/api-view.tsx` — the JSON / Split view, local to this demo.

See `../CLAUDE.md` for the working agreement.

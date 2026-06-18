# Context: Unified transaction demo

The first thing to read before building or reviewing this prototype.

## What this is

A **visual, guided demo** of the redesigned quote and create-transaction, built to present to
business, the CEO, and then engineering. Visual first; the underlying request/response JSON sits
behind a collapsible "Engineering view" on each step.

## The flow (six steps)

1. **Config** — pick a client. Shows the client-partner mapping, routing rule, NRE-enabled, pricing,
   and the $0.30 platform fee. This is the configuration the quote and routing read from.
2. **Quote input** — sell amount (USDT), transaction type (C2C/C2B/B2C/B2B), `is_nri`. Defaults filled.
3. **Quote loader** — animated, step by step: fetching the quote for the client, resolving the
   available partners (RPFS, D9) and config, applying pricing, issuing a quote with a 30s lock.
4. **Quote** — easy-to-read. Up to two prices under one `quote_id` (D9 / traditional and RPFS / stables),
   each showing the rate, what the user receives, the $0.30 platform fee, and the tax (TDS). Conditions
   shown as chips.
5. **Create** — one fat call. No user or bank exists yet; both are created here. Sender (Travel Rule
   originator) and receiver + bank (Travel Rule beneficiary) inline. `quote_id` auto-passed. Defaults filled.
6. **Process** — animated in three phases: (1) routing, showing how the bank account picks the price,
   partner, and tax; (2) KYC / AML (user created inline, screened, limits); (3) lifecycle CREATED →
   PROCESSING → COMPLETED. Then a settlement summary.

## Grounded in

- PRD "Quote and Transaction Redesign" (Confluence 2411364431): simplified quote (rate + platform fee +
  tax only), two prices, fat create-transaction with no prerequisites, RPFS vs D9 routing across
  first/third party + NRI, $0.30 platform fee.
- 2026-06-16 product discussion MoM.
- wiki/30 Pricing/Pricing Overview; Saber live docs (get-sell-quote, create-pool-sell-transaction).

## Model assumptions (illustrative, not live)

- Two partner types: RPFS (stables, onshore, 1% TDS when recipient is resident) and D9 (traditional,
  offshore, never TDS). TDS = `partner == RPFS AND is_nri == false`.
- Routing rules per client: `BY_ACCOUNT_TYPE` (NRE → D9, else RPFS), `ALL_D9`, `BEST_RATE` (higher net wins).
- Pricing: `final = clamp(source * (1 + client_spread), min, max)`. Demo numbers: RPFS 86.00, D9 86.43.
- Platform fee: flat $0.30 per transaction, shown in INR at the rail rate.
- Everything is computed client-side (pure functions in `lib/transactions.ts`); no server round-trips,
  so the demo is robust on stage. The "Engineering view" shows the request/response objects.

## Open questions (carried from the PRD)

- Third-party: whose residency drives TDS (recipient's, to confirm with finance).
- Minimum identity to create-and-transact a user in one call (Risk).
- Purpose / source-of-income / relationship enumerations per corridor.
- Quote lifecycle (real TTL, re-quote, single-use), and async / webhook status contract.

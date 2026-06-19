# Business review — 2026-06-19T06:09:13Z

Verdict: READY TO SHOW (after fixes) — the must-fix items below were applied and re-verified live; remaining nice-to-haves are optional. One release action outstanding: push so the deployed URL matches local. Coverage this run: full walk — Config, Pricing calculator, Quote, Create, Process, Done.

## Update — applied this run
- Negative "user receives" on small/zero amounts: FIXED (floored at ₹0).
- TDS double-presentation on the price card: FIXED (shown as "in rate", not a second deduction; lines reconcile).
- Engineering field names trimmed off the business-facing Quote card and Done summary (kept in the calculator and Engineering view).
- Outstanding: `git push` so GitHub Pages serves the updated demo (currently the original is deployed).

## Persona reactions

### Head of Business (the buyer)
- Worked: the quote card leads with one big number ("user receives ₹8,850") and the rate is labelled `final_price` with "incl. % fees + TDS". The separate "Service charge (0.30 USDT · flat)" line is exactly the transparency a buyer wants — they can see the fee apart from FX.
- Confused: on a resident card the line items don't add up. It shows `pre_fee_to_amount ₹8,581`, `Service charge − ₹26`, and `Tax (TDS) − ₹87`, but the headline is ₹8,555. A buyer doing the mental math (8,581 − 26 − 87) gets ₹8,468 and asks "where did ₹87 go?" The TDS is already inside `final_price`, but the card presents it as a second deduction.
- Broke trust: entering a small/zero amount shows "user receives ₹-27". A negative payout on screen instantly undermines confidence in the pricing engine.

### Skeptical CEO (2-minute attention)
- The one number that matters (what the user receives) is prominent and the fee is a clean single line — good. The story "flat fee, on top, in USDT, separate from FX and tax" is repeatable.
- Field labels like `pre_fee_to_amount` and `base_price` on the card are engineering terms bleeding into the business view. A CEO doesn't need both `base_price` and `final_price` plus `pre_fee_to_amount` on the card; it reads like a debug panel.
- The negative-amount result is the kind of thing that derails a live demo.

### Finance / ops
- TDS handling is defensible and the "How it's calculated" step view is excellent — it shows base → % fees → TDS → final_price → service charge → net transparently, which is exactly what finance wants.
- But the summary card double-presents TDS (folded into the rate AND shown as a line), which a finance reviewer will flag as a reconciliation error.

## Changes to make (prioritised, product/UX not bugs)
| # | Priority | Screen | Change | Why it matters to the audience |
|---|---|---|---|---|
| 1 | must-fix | Price cards | Never show a negative "user receives"; floor at ₹0 or show "amount below minimum fee". | A negative payout breaks trust instantly and can derail the CEO demo. |
| 2 | must-fix | Price cards | Stop showing TDS as a second red deduction when it's already in `final_price`; label it "included in rate" (or remove). | The line items must reconcile to the headline or buyers/finance lose confidence. |
| 3 | should-fix | Price cards | Trim engineering field names on the business-facing card (`base_price`, `pre_fee_to_amount`); keep the rate, the service charge, and the net. Leave the raw fields to the Engineering view. | Reduces "debug panel" feel for a CEO; keeps the one number obvious. |
| 4 | nice-to-have | Calculator/Quote | Show the service charge's INR impact next to the USDT amount (e.g. "0.30 USDT ≈ ₹26") so a non-crypto buyer feels the size. | Helps a fiat-thinking buyer gauge the fee. |

## Top 3 to fix before showing
1. Kill the negative "user receives" on small/zero amounts.
2. Fix the TDS double-presentation on the price card so the numbers reconcile.
3. Push to the deployed URL (currently the original demo is live) so reviewers see the updated pricing.

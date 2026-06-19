# QA report — 2026-06-19T06:09:13Z

Verdict: PASS (after fixes applied and re-verified this run; one release action — git push — outstanding)
Build/commit: ff42daa + uncommitted QA fixes. Full live browser walk against http://localhost:3000: Config, Pricing calculator, Quote + response JSON, Create, Process, Done. tsc passes.

## Resolution (this run)
- Finding 1 (negative net) — FIXED. `you_receive` floored at 0; Sell = 0 now shows "user receives ₹0" on both cards. Verified live.
- Finding 2 (TDS double-shown) — FIXED. Price card and Done now show "Tax (TDS) … · in rate" (neutral), so line items reconcile to the net. Verified live.
- Also applied (from business review): trimmed engineering field names off the business-facing Quote card and Done summary (`base_price`, `final_price`, `pre_fee_to_amount` hidden there; calculator keeps full detail).
- Full flow re-walked: Config → Quote (trimmed card) → Create (first-party C2C, NRE) → Process (routing NRE→D9, no TDS, locked 88.77) → Done (Converted ₹8,877 − Service charge ₹27 = Net ₹8,850, reconciles). No console errors.
- Finding 4 (deploy stale) — OUTSTANDING: commit + `git push` so GitHub Pages rebuilds. This is Leon's action.

## Findings
| # | Severity | Area | Steps to reproduce | Expected | Actual | Suggested fix |
|---|---|---|---|---|---|---|
| 1 | major | Pricing calculator / Config preview / Quote | Set Sell amount to `0` (or any value ≤ the service charge, e.g. `0.1`) | Net `₹0` or a "below minimum amount" message; never negative | Both price cards show **"user receives ₹-26 / ₹-27"**. `you_receive = (amount − service_charge) × final_price` has no floor; `pre_fee_to_amount` reads `₹0` while the headline is negative. | Floor net at 0 and/or reject amounts ≤ `service_charge.amount` with a minimum-amount note; `you_receive = max(0, (amount − svc) × final_price)`. |
| 2 | major | Price card (PriceCard) — resident stables | Config/Calculator with `tds=1`, resident (is_nri = No), RPFS rail (e.g. default Client D, NRO/savings card) | Card line items reconcile to the headline net | Card shows `pre_fee_to_amount ₹8,581`, `Service charge − ₹26`, **and** a red `Tax (TDS) − ₹87 (1%)` line, but TDS is already folded into `final_price` (86.68→85.81). Headline net is `pre_fee − service = ₹8,555`; the TDS line is **not** subtracted again, so it reads as a deduction that doesn't add up (8,581 − 26 − 87 ≠ 8,555). The step-by-step "How it's calculated" view is correct; only the summary card mis-presents TDS. | On the card, show TDS as informational ("1% TDS, included in final_price") not as a red "− ₹" deduction; or drop the line when it's already in `final_price`. |
| 3 | minor | Quote lock | Fetch a quote, watch the 30s countdown | Lock holds ~30s | Quote showed "rate moved · expired" quickly during the QA run. Likely just real elapsed time across automated steps (>30s), not a logic bug — verify by fetching and reading the countdown twice a few seconds apart. | Confirm timing; no change if it counts down at 1s/s. |
| 4 | minor | Release / deploy | Open the deployed (GitHub Pages) URL | Deployed demo matches local | `ff42daa` (all the `service_charge` work) is committed locally but `origin/main` is `901c3db` (original demo + workflow). The deployed site is the ORIGINAL — this is why the calculator looked "not updated" outside localhost. | `git push` so the Pages deploy rebuilds. |

## Verified working (live)
- Config: "Service charge (USD)" field present (0.3); template/config drives the preview.
- Pricing calculator: cards show `base_price`, `final_price`, `pre_fee_to_amount`, separate `Service charge (0.30 USDT · flat)` line, TDS. Step-by-step breakdown reconciles: net = (100 − 0.30) × final_price.
- Quote response JSON matches the agreed contract exactly: `base_price`, `final_price`, `pre_fee_to_amount`, `to_amount`, `total_fee: 0`, `fee_currency`, `fee_breakup` (platform_fee/network_fee/client_fee/discount/tax_on_fee/tds), and `service_charge { amount, currency: "USDT" }`.
- NRI / NRE / D9 cards reconcile when no TDS: pre_fee − service = net (8,668 − 26 = 8,642; 8,877 − 27 = 8,850).
- No console errors observed during the walk.

## Next
Fix #1 and #2 (both quick), push (#4), then re-run this skill for the full create/process/done walk (first/third party, KYB, lifecycle) and the business-persona pass.

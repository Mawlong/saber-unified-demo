# Business review — 2026-06-18 (dry run, by business-persona)

Verdict: NEEDS WORK (light) — the flow is solid and the story mostly lands; a few polish items before it faces a CEO.

Walked Config -> Quote -> Result -> Create -> Process -> Done and the Pricing calculator, on the running demo. The QA blocker (quote lock expiring early) was fixed first, so the full flow now completes.

## Persona reactions

### Head of Business (the buyer)
- Worked: the two prices are labelled by what I understand ("NRE accounts" vs "NRO / savings"), not by internal partner names. Each price card leads with the big "user receives" number and shows gross, the $0.30 platform fee, and tax with nothing hidden. The 30s locked-rate countdown reads as trustworthy. The Done screen shows the full breakdown to my beneficiary.
- Confused / trust: the Config screen is Saber's internal pricing setup (spread, min/max band, source price, traditional rail, GST). As a client I do not set these, so seeing them first made me wonder whose view this is. Internal partner names (RPFS, D9) leak on the routing and Done screens; the price cards handle this better by hiding them.
- Jargon a client would not know without help: RPFS, D9, "traditional rail", is_nri, party_scope, pool_sell, purpose code IR001.

### Skeptical CEO (2 minutes)
- The stage tracker (Config -> Quote -> Result -> Create -> Process -> Done) is a clean story spine, and the hero numbers (₹8,850 net) are obvious.
- But the demo opens on a wall of pricing inputs. A cold viewer's first screen should be the outcome or a one-line orientation, not Saber's internal knobs. I want the "so what" in five seconds.
- Good: "internal - not production" is set; the engineering JSON is tucked away and never required to follow the screen.
- "Payout partner D9 (D9)" on the Done screen looks like a bug to me (the label repeats).

### Finance / ops
- Strong: TDS is transparent everywhere. The Processing -> Routing steps spell out "Settles offshore - no TDS" vs the resident-on-stables 1% case, and compensate_tds shows "absorbed by Saber". That is defensible.
- The Pricing calculator (source -> spread -> clamp -> gross -> fee -> TDS -> net) is exactly what I need to validate the math.
- Open question: GST (tax_on_fee) appears in the config but never in the price breakdown. I would want to see where it lands, even if it is zero.

## Changes to make (prioritised, product/UX not bugs)

| # | Priority | Screen | Change | Why it matters |
|---|---|---|---|---|
| 1 | should-fix | Done, Routing | "Payout partner D9 (D9)" repeats the name. Show the partner once, with a plain rail descriptor (e.g. "D9 (traditional)", "Transxt (stables)"). | Looks like a glitch to a CEO. |
| 2 | should-fix | Config | Frame this as Saber's internal setup view, not what the client sees (a short subtitle or an "internal view" tag). | Removes the "whose screen is this" confusion for a buyer/CEO. |
| 3 | nice-to-have | Top of flow | Add a one-line orientation ("how a client is configured, quoted, and paid out") so a cold opener gets the arc instantly. | Helps the 2-minute CEO. |
| 4 | nice-to-have | Any client-facing screen | Keep the price-card discipline of labelling by account type, not partner name; avoid leaking RPFS/D9 where the framing is client-facing. | Reduces jargon for outside audiences. |
| 5 | nice-to-have | Price breakdown | Surface GST on the fee (or note it is zero) so finance is not left wondering. | Closes a finance question. |

## Top 3 to fix before showing
1. The "D9 (D9)" label redundancy (item 1).
2. Frame the Config screen as the internal setup view (item 2).
3. A one-line orientation at the top for a cold opener (item 3).

No must-fix blockers from the business lens (the one blocker, the quote-lock timer, was a QA item and is fixed). These are polish to make it client- and CEO-ready.

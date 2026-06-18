# QA report — 2026-06-18 (dry run, by qa-localhost)

Verdict: PASS (after one fix applied this run)
Build/commit: uncommitted, localhost:3000

This is the first QA pass, run live in the browser against the dev server. One blocker was found and fixed during the run; the flow was then re-verified.

## Findings

| # | Severity | Area | Steps to reproduce | Expected | Actual | Fix |
|---|---|---|---|---|---|---|
| 1 | blocker | Quote result · lock timer | Fetch a quote, watch the "locked · Ns" pill, then try to click "Create transaction". | The 30s lock counts down ~1/sec, giving ~30s to click Create. | The lock expired within a few seconds; the CTA flipped to "Re-quote", so clicking "Create transaction" re-issued the quote and never advanced to Create. The flow was stuck on the Result step. | Fixed. Root cause: the countdown `useEffect` depended on `[left]`, recreating the `setInterval` every tick; under React Strict Mode (dev) the intervals stacked and burned the timer down several seconds per second. Reworked the countdown to derive from the quote's `expires_at` timestamp (accurate to wall-clock regardless of interval count), with a separate `forced` flag for "simulate rate move". Re-verified: lock now holds (26s, then 17s over the wait) and Create is reachable. |

No other blockers or majors found.

## Verified this run (working)

- App loads cleanly. Logo + wordmark render. No console errors or React warnings on any screen visited.
- Config is fully editable. Default (Client D) prices preview computes correctly and matches by hand: resident RPFS rate 86.68 -> gross ₹8,668 − ₹26 fee − ₹87 TDS = ₹8,555; D9 rate 88.77 -> gross ₹8,877 − ₹27, no TDS = ₹8,850. NRE on shows the editable D9 (traditional) fields and the second price.
- Quote shows two price cards for the NRE-enabled config, with `quote_id`, the lock pill, and the "simulate rate move" control. NRI input correctly drops TDS on the RPFS card (₹8,642).
- The identity gross − platform fee − TDS = net holds on every card checked.
- Backward navigation: Config and Quote chips show done/green and are clickable to return; forward stages are disabled.

## Not exercised this run (re-check next pass)

- Create -> Process -> Done end to end in the browser (blocked earlier by finding #1; logic is unit-tested, visual pass recommended now that the timer is fixed).
- B2B / KYB path, third-party receiver fields, the Calculator tab edits propagating to the flow, and the engineering-view JSON shapes on screen.

## Harness notes (for the next run)

- The dev server uses Fast Refresh: editing the app reloads the page and resets the flow to step 0. After any code change, re-drive from the top.
- Pixel-coordinate clicks were unreliable because the captured viewport size changed between actions; prefer `find` + click by element ref, and fix the window size first.
- Time-based behavior (the quote lock) must be watched over several real seconds, not judged from a single screenshot.

# Review loop

Two skills review every build of this demo and feed their findings back into it:

- **qa-localhost** — a QA engineer that drives the app at `localhost:3000`, hunts bugs and number errors, and writes `reviews/qa-report.md` with a PASS / CHANGES NEEDED verdict.
- **business-persona** — business stakeholders (Head of Business, CEO, finance/ops) who judge clarity, trust, and story, and write `reviews/business-review.md` with a READY TO SHOW / NEEDS WORK verdict.

## The loop

1. Build / change the demo.
2. Make sure the dev server is running: `npm install && npm run dev` (the user's machine, default `http://localhost:3000`).
3. Invoke `qa-localhost` and `business-persona`. Each drives the running app in the browser and writes its report here.
4. The build agent reads both reports and applies the fixes: every QA **blocker/major** and every business **must-fix/should-fix**.
5. Rebuild and go to step 3.
6. Stop when `qa-report.md` is **PASS** and `business-review.md` is **READY TO SHOW** (or only minors / nice-to-haves remain that Leon has said he will review himself). Then hand to Leon.

## Reports in this folder

- `qa-report.md` — overwritten each QA run.
- `business-review.md` — overwritten each business-persona run.

These are point-in-time and regenerated, not hand-edited. Both skills live in `2Brain/skills/` (`qa-localhost`, `business-persona`).

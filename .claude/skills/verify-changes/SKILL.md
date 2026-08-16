---
name: verify-changes
description: Run this repo's standard verification (backend tests + frontend build) after making backend or frontend code changes, before telling the user the work is done. Use whenever you've edited files under backend/ or frontend/ and are about to wrap up, and whenever the user asks to "verify", "test", or "check" the current changes.
---

# Verify changes (net-desk)

This repo has no CI. `npm test` (backend) and `npm run build` (frontend) are
the substitute — run whichever side(s) you touched before considering a
change finished.

## Backend

```
cd backend && npm test
```

- Runs all vitest integration/unit tests against the **real local dev
  MariaDB** (not mocks) — this is deliberate, see `CLAUDE.md`.
- **Known flaky baseline**: `tests/integration/notifications.service.test.js`
  has 3 pre-existing failures unrelated to most changes. If you see exactly
  those 3 (and nothing else new), that's the known baseline, not a
  regression — don't try to fix them unless the task is specifically about
  that file. Compare the failure count/names against this baseline before
  concluding a change broke something.
- To run just the file(s) relevant to your change instead of the whole
  suite while iterating:
  ```
  npx vitest run tests/integration/<file>.test.js
  npx vitest run tests/integration/<file>.test.js -t "test name"
  ```

## Frontend

```
cd frontend && npm run build
```

- There's no separate typecheck script — the Vite build is the closest
  thing to one (plain JS, not TypeScript).
- Run `npx vitest run tests/unit/<file>.test.js` for any frontend unit tests
  relevant to the change (composables, utils).

## After both

Report the actual pass/fail counts (e.g. "433/436, same 3 pre-existing
failures") rather than just "tests pass" — this repo's users care about
seeing the baseline hasn't shifted, not just a boolean.

# tools

Scripts that check the built site rather than build it.

| File | What it does |
|---|---|
| `audit.mjs` | Loads every page at three widths and reports overflow, unreadably small text, unexplained disabled controls, clipped text, failed requests, JS errors and undersized tap targets. `BASE=https://… node tools/audit.mjs` audits a deployment; `PAGES=name:/path,…` narrows it to named pages. |
| `diag.mjs` | Prints computed styles and bounding boxes for named selectors, for chasing a layout bug. |

They drive a real browser through `playwright-core` and are deliberately not
tests: they report, they do not assert. The one that gates work is `audit.mjs`.

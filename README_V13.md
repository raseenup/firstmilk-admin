# First Milk Venture v13 — admin portal

Deploy the coordinated backend and all portal assets, including the new `polish.css`.
The connected Supabase database has already been secured; see the backend
`UPGRADE_V13.md` and its two versioned migrations for the repair and verification.

Everyday prices use ₹. Unnecessary INR wording and the single-currency selector
are hidden/removed; ISO INR remains in payment/API payloads and financial exports.
Money input labels use ₹ where the unit is needed. Original modules and business
functions remain available.

Mint, gold, blue and lilac accents, paired light/dark inks, short brand quotes,
keyboard focus outlines and readable mobile input sizes extend the existing design.
Scripts defer in their original order and the HTML starts locked until the saved
session is validated. No new framework, third-party script or paid service is added.

Visible, online portals check for updates every second. Hidden/offline polling
pauses; failures back off to 30 seconds. Unchanged markup preserves focus and local
input. Identical reads coalesce by session, mutation generation, path and normalized
headers, preventing reuse of a read started before a mutation. All API session and
ownership checks remain. Hosting latency and free-host cold starts still apply.

Validation: six isolated core tests for this portal, JavaScript syntax checks and
browser inspection of the loaded dashboard in light and dark mode. Backend checks:
121 tests and 144 live database client-denial checks passed. Real phone keyboards,
live payments and production load were not exercised.

For core tests, install jsdom 27.2.0 in a disposable directory, set NODE_PATH to its
node_modules, and run `node --test tests/portal-core.test.cjs` with Node 22+.

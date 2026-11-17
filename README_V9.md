# First Milk Venture v9 — Administrator portal

The welcome screen now includes **Accept administrator invitation**. Super Admins
manage staff from **Invitations**, including designation of content editors.
**Ads & offers** contains campaign uploads, one-action publishing, scheduling and
company information pages. Operations staff can mark orders shipped or out for
delivery; customer email is queued by the backend.

Deploy [dairy-backend](https://github.com/raseenup/dairy-backend) v9 first. Its
`UPGRADE_V9.md` contains full deployment and email configuration instructions.
Publish all changed files together and keep `config.js` pointed at the backend.

Validation: JavaScript syntax checks and isolated DOM/API smoke checks passed.
A browser preview was blocked by the environment URL policy; actual mobile
rendering was not visually verified.

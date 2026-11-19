# Design QA — Company Dashboard version 2

## Reference and scope

Reference: user-selected version 2 image, `C:\Users\dyslu\AppData\Local\Temp\codex-clipboard-f07597c4-9f98-48bb-9de4-c88831c8d604.png`.

Apply the selected dashboard to subsidiary portals while preserving the top breadcrumb (`Aspect Companies / [company]`). The dashboard title and “Today at a glance” subtitle appear below the breadcrumb.

## Implemented layout

- Greeting and local company date.
- Four company-scoped metric cards.
- Today’s priorities and this week’s agenda side by side on desktop.
- Recent activity across the full width beneath those panels; it remains portal-admin-only.
- Narrow layouts stack the work panels and reduce the metric grid.

The shared company portal renderer serves the dashboard across sub-companies. CSS asset version `20261016-company-cockpit-4` is live.

## Deployment checks

- HTML and CSS assets returned HTTP 200 and contain the version 4 cache reference and dashboard corrections.
- Portal API returned HTTP 200; the Docker container is healthy.
- Existing persistent data volume `aspect-portal-data:/data` remains mounted.
- Fresh safety snapshot: `20261016T200419643Z-09442eb3-cac8-4d61-a678-818f76a02b95` (5 documents, 940,505 bytes).
- No release ZIP was created.

## Live visual verification

**Blocked for a fresh authenticated screenshot.** After the container rebuild, the two existing portal tabs displayed the sign-in screen. I did not submit their autofilled credentials. The selected layout and fixes are present in the served CSS, but an authenticated visual comparison should be made after signing in.

## Result

Implementation and deployment completed; authenticated visual QA is blocked until a user signs in.

## Aspect Companies portfolio overview — mockup 2 correction

### Changes

- Replaced the operational count cards with four financial KPI cards from the selected mockup: Revenue ($1.28M), Profit ($320K), Profit margin (25%), and Revenue change (+12%). All sample figures are labeled illustrative.
- Added a working period selector for this quarter, last quarter, and year to date. Each selection updates the illustrative figures locally.
- Changed the parent portfolio navigation to the black and gold style and retained the Need a hand? card and signed-in profile at the bottom.
- Reshaped the company cards and opportunity/contract sections to the mockup’s two-column layout. Opportunity and contract records remain sourced from the live portal; the contract panel shows the true empty state when none are categorized as contracts.

### Deployment and visual review

- CSS asset reference: `20261016-portfolio-overview-3`.
- Pre-deploy portal snapshot created October 16, 2026 at 5:34 PM: 5 documents, 918 KB.
- Rebuilt the live Docker Compose service without replacing `.env` or the `aspect-portal-data` volume. API health returned HTTP 200 and the container is healthy.
- Visually reviewed the authenticated overview at desktop width. Confirmed the KPI values, green trend text, period selector, company cards, table panels, black navigation, help card, and profile render. Tested switching the period and restored the default quarter.
- Release archives were kept in LocalAppData Temp rather than Downloads and removed after deployment.

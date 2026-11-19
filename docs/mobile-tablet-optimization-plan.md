# Mobile and Tablet Optimization Plan and Tracker

**Status:** In progress — local phone/tablet implementation and simulator checks are complete for the main flows; physical-device, accessibility, realistic-data, company-portal, and network acceptance remains  
**Updated:** 2026-10-14
**Purpose:** This is the single source of truth for the mobile/tablet audit, decisions, implementation backlog, acceptance checks, and remaining release work. Update each item here as work progresses so findings are not split across separate planning notes.

## How to use this tracker

- Keep decisions, risks, and implementation tasks in this document; link supporting screenshots or measurements from here.
- Update status and evidence when an item changes. **Done** means its acceptance check has evidence, not merely that code was written.
- Use **Blocked** only with a named dependency or missing access/device. Record the next action needed to unblock it.
- Code implementation owner: **Codex**. Real-device and role-based acceptance owner: **Portal team** unless reassigned.
- Work can proceed on independent items, but M3 is the shared layout dependency for M4, M6, and M7. M1's current measured snapshot is required before claiming a later performance improvement in M9; it is not a pre-change comparison.

## Current execution snapshot

| Area | Current state | Next action |
|---|---|---|
| Local implementation | Responsive Projects, Tasks, Calendar, and shared phone/tablet controls are in place. Authenticated form controls and searchable picker triggers, search fields, and options now use at least 16 px text and 44 px minimum targets through 1024 px, including in dialogs. Shared option-search fields also use 16 px text and 44 px targets, with readable result counts. The accessible organization-portal sections pass the eight-size viewport matrix. A 73-width local sweep around responsive breakpoints found and fixed a narrow project-owner filter overflow and a Calendar toolbar overflow; Projects, its About dialog, Tasks, and Calendar Agenda now fit across the checked widths. Discussion retries are safe, and an open project catches up missed posts after resume or live-stream reconnect. | Keep the implementation as the candidate for device acceptance; address any P0/P1 issues found in the field. |
| VPS deployment | Released 2026-10-14 to `https://aspect-portal.srv1633240.hstgr.cloud`. Live health returned HTTP 200 (`buildId` `c37de8d7c15c629a`); live HTML serves stylesheet token `20261014-mobile-tablet-optimization-1`, whose CSS contains the 16 px text and 44 px tap-target rules through 1024 px. The container is healthy, the `aspect-portal-data:/data` volume remains mounted, the private `.env` is preserved, and the previous deployment directory is retained at `/opt/aspect-portal-rollback-20261014-132233`. A pre-release snapshot was created at 1:18 PM with 5 documents (882 KB). | Continue field acceptance; the VPS release does not replace physical-device or assistive-technology review. |
| Test coverage | Six tests pass: four integration tests and two focused upload-context unit tests. Two authenticated browser sessions at a 390×844 phone viewport verified project and global Collaboration revocation. An isolated local two-account browser check confirmed live discussion toasts and catch-up after the event stream was unavailable. A local browser check verified keyboard focus containment and restoration for project, work-item, and PDF dialogs. The latest size-aware contrast review found no failing text in the accessible organization views sampled at desktop width or in phone Tasks and Calendar Agenda. Projects navigation was unavailable to the synthetic review account, so this is not a complete portal contrast audit. A synthetic mobile portal check found company tabs did not restore company content after returning to Overview; the navigation was fixed and Overview → Clients was verified locally. Form text, searchable dropdowns, and calendar modal controls were checked at 320, 360, 390, 640, 768, 820, 821, 1024, and 1280 px; device/browser lifecycle, keyboard/safe areas, 200% text, screen-reader accessibility, realistic data volume, and weak-network cancellation remain unverified. | Physical devices, creator/participant test accounts, and assigned live company-workspace access are not available yet. A synthetic local pilot is available for implementation checks, but it does not substitute for field acceptance. Resume field checks when actual devices, accounts, and company access are assigned; repeat creator/participant/revoked-participant checks under M2 and M4. |
| Project access | Project and global Collaboration revocation send targeted live events. In the local phone browser, project removal closed the open project, removed it from the project list, and showed a notice; global removal returned the teammate to Overview and removed Projects navigation. | Local API/SSE and browser behavior are covered; verify the same flows on physical devices and check real-world stale notification use. |
| Measurements | Source-size before/after is recorded. The latest local server response totals 145,682 bytes for first-party HTML, CSS, and seven scripts with Brotli/identity encoding. A 390×844 simulator reference was captured: 211 ms median across three reload-to-accessibility-tree checks. Neither is a physical-device or controlled cold/warm network measure. Timed phone/tablet task measurements were not captured before the responsive changes. | Capture browser network totals, API payloads, and reproducible load/task timings on assigned devices and portal access; do not present local values as field results or as pre-change comparisons. |
| Remaining build and acceptance | Safe post/upload retry and authorized discussion catch-up after a tab resumes or the live connection reconnects are covered by integration tests and an isolated browser check. Project dialogs now contain keyboard focus, restore it on close, clear nested previews when the project closes, and use higher-contrast text for guidance and metadata. Targeted small-text samples in synthetic organization views were corrected; company-module navigation now restores the matching company content after a return to Overview. Full visual/accessibility acceptance remains open. Physical-device checks, realistic-data checks, live company-workspace review, separate-role/notification checks, in-browser cancellation and weak-network lifecycle checks, upload-size/memory checks, and field measurements remain open. | Continue local work where evidence permits. Resume field acceptance after devices, test accounts, and assigned live company-workspace access are available; finish the M10 release review afterward. |

### Execution order

1. **M2:** agree on device, browser, viewport, portal, and role coverage so field results are reproducible.
2. **M1:** capture current-device load and collaboration-task measurements; note that the pre-change timing baseline is unavailable.
3. **M3:** validate the shared shell and dialogs on those devices; fix issues that would block the Projects journey.
4. **M4:** validate the local active-session access-revocation fix, then complete project access, discussion, reply, file, and notification checks with creator, participant, and removed-participant accounts.
5. **M5:** exercise interrupted requests, upload cancellation, retries, and duplicate prevention under constrained networking.
6. **M6 and M7:** validate Tasks & Requests and Calendar on the agreed devices after the P0 collaboration journey; run these lower-priority checks in parallel where device/account availability allows.
7. **M8:** use the organization-page audit as a baseline; review the company workspace with a valid assigned test session and prioritize further work from actual usage or team feedback.
8. **M9:** make performance changes only where M1 measurements show a problem; compare against the current measured snapshot.
9. **M10:** repeat the agreed device, role, portal, and desktop checks; record unresolved issues and release status.

## Goal

Make common portal tasks comfortable on touch screens and narrow viewports while preserving the desktop experience. Optimize for collaboration: teammates should be able to find the right project, understand current work, communicate, and follow up without fighting the layout.

## Scope and working assumptions

- Cover phones and tablets, including portrait and landscape where layouts materially change.
- Start with the Projects collaboration workflow, then apply proven patterns to Tasks & Requests and Calendar.
- Adapt company, client, and portal-administration screens according to usage after the main team flows are stable.
- Keep the portal online-first. Handle weak connections and retries clearly; offline editing is not part of this plan.
- Discussion updates and notifications go to active participants of that project, not every organization or company user; the author is excluded. A clickable toast appears while the portal tab is foregrounded. If the tab is backgrounded or closed, the update remains in the in-app notification list when the user returns; operating-system push is not included unless separately requested.
- Measure performance before deciding to split scripts, replace upload transport, or make broad CSS changes.
- Keep the desktop layout usable and regression-check it during each phase.

### Field access status

As of 2026-10-14, the user confirmed that physical phone/tablet models, creator/participant test accounts, and assigned live company-workspace access are not available yet. These dependencies hold up field acceptance, not local implementation. A synthetic company portal is available for local layout review only; do not treat it or viewport simulation as field acceptance. Record the actual device, browser, role, portal, and realistic data sizes once a field test set is assigned.

## Consolidated audit findings

These findings combine the plan review and the follow-up bottleneck/missing-risk audit.

| Finding | Why it matters | Planned response |
|---|---|---|
| The portal has many overlapping responsive CSS breakpoints. | A page may work at one phone width and break just above or below it; late override blocks can also conflict. | Record the agreed viewport matrix, consolidate styles only as each component is touched, and check boundaries plus desktop. |
| The core collaboration flow spans navigation, project access, discussion, files, and notifications. | A layout-only pass can appear responsive while leaving a user unable to complete an end-to-end task. | Exercise the full creator and invited-participant journeys, including access-denied and retry states. |
| Project conversation and files depend on network requests and uploads. | Weak or interrupted connections can create uncertainty, duplicate posts, or lost work. | Show progress/status, allow upload cancellation, make retries idempotent, and test interrupted requests. |
| Project files are converted to Base64 and sent in a JSON request. | Base64 adds about one third to the payload, and preparing plus serializing a file can temporarily hold multiple copies in a phone browser. | Measure small, typical, and maximum-size uploads on representative devices, including time, failures, and available memory evidence; change transport only if measurements show a real problem and idempotent retries can be preserved. |
| Mobile browsers can suspend background tabs or drop live connections during network changes. | A teammate may miss a live update or receive a duplicate after returning to the project. | In M4/M5, background and resume the tab, switch networks or briefly disconnect, confirm the live stream reconnects, and verify missed updates remain available without duplicate notifications. |
| Fixed UI can collide with the mobile browser chrome and keyboard. | Toasts, dialog actions, and inputs can become hidden on a phone. | Use safe-area/dynamic viewport handling and check keyboard-open plus portrait/landscape states. |
| Mobile accessibility has not been checked with text enlargement or a screen reader. | Touch-sized controls alone do not ensure that people who enlarge text or use VoiceOver/TalkBack can follow project tabs, upload progress, and live discussion updates. | Add a short accessibility pass: enlarge text to 200%, check contrast, visible focus, and reduced motion, navigate dialogs/tabs by keyboard where available, and confirm screen-reader announcements and focus for dialogs, uploads, and new-message notifications. |
| Current UI checks used small synthetic datasets. | Longer names, more teammates, many work items, and longer discussions can change wrapping, scroll length, and load behavior. | Record typical and largest expected project/team sizes in M1/M2; repeat representative phone/tablet checks with realistic counts before field acceptance. |
| Calendar month/week grids are dense on phones and narrow tablet screens. | People may not be able to scan dates or activate event controls comfortably. | Default phones, narrow tablets, and short landscape screens to Agenda; keep Month/Week/Day selectable and make month actions touch-sized. |
| Account role and portal context change what people can see. | Administrator-only QA can conceal participant access bugs or incorrect navigation. | Include administrator, creator, and invited participant in the matrix; test organization and company contexts that are available. |
| Supporting text and small labels had low contrast on light portal surfaces. | Helper text, timestamps, filters, and status labels can be difficult to read even when the layout fits a phone. | Darken dialog guidance and targeted organization-page labels; sample their computed contrast locally, and keep full visual-accessibility and device checks open. |
| Mobile form fields and searchable dropdowns used small text and short tap targets. | Small text is harder to read, can cause automatic zoom when focusing fields in some mobile browsers, and makes compact dropdown choices difficult to tap. | Set authenticated form controls and searchable picker text to at least 16 px, dropdown triggers and searchable rows to at least 44 px, and result counts to 14 px through 1024 px. Verify locally, then confirm behavior on iOS and Android devices. |
| Active-session access revocation previously left a loaded project view stale. | Access checks protect later server requests, but cached discussion and file metadata could stay visible after access was revoked. | Local server events and client invalidation now close the revoked view and clear project access; confirm behavior on physical devices and verify stale notifications and direct routes remain denied. |
| Project dialogs did not keep keyboard focus contained, and nested previews could outlive their project dialog. | Keyboard users could tab behind an open project/work dialog, lose their place on close, or leave a loaded file visible after the project closed. | Keep focus within the topmost project, work-item, or file-preview dialog, return it to the opener when possible, and clear the PDF frame when the project closes. Verify with keyboard and screen-reader checks on agreed devices. |
| Large scripts and CSS are not proof of a performance bottleneck. | Premature splitting or upload rewrites add risk without demonstrated benefit. | Measure before changing architecture; compare before/after transfer and interaction measures. |
| Real phones, tablets, and representative role accounts may not be available in this workspace. | Local syntax checks cannot prove touch behavior, browser viewport behavior, or access boundaries. | Keep device/role acceptance explicit and unfinished until the portal team records real-device evidence. |

## Decisions and non-goals

- **In scope:** responsive layout and navigation, touch usability, collaboration project flows, Tasks & Requests, Calendar, safe-area/keyboard behavior, weak-network feedback, and measured performance improvements.
- **In-app notifications:** remain the target unless the product owner separately chooses background/browser push. This plan only makes the in-app notification usable on mobile.
- **Calendar default:** use Agenda for viewports up to 820 px wide and short landscape viewports up to 1024 px wide; keep Month, Week, and Day available. The Week timeline still pans horizontally on a 768 px tablet viewport.
- **Offline editing:** out of scope; communicate request failure and preserve safe retry where supported.
- **Performance architecture:** no blanket script splitting, upload transport replacement, or CSS rewrite without baseline evidence.
- **Content/access changes:** responsive work must preserve the existing project participant permissions and company portal access rules.
- **Release target:** define after M1 captures the actual baseline and the portal team confirms devices, browsers, roles, and portals for acceptance.

## Evidence and validation limits

- `public/index.html` uses `viewport-fit=cover`; the shared CSS and viewport script account for dynamic height, safe areas, touch targets, and discussion-toast positioning. A real on-screen keyboard and hardware safe areas were not available in the local browser simulator.
- A local, isolated pilot was checked at 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×900, 844×390, and 932×430. Overview, Clients, Reception Intake, Collaborative Team, Tasks, Activity, Calendar, Portal settings, and Projects had no page-level horizontal overflow at these sizes. At phone and tablet widths, all visible non-checkbox controls in those sections measured at least 44 px after the shared touch-target fix. Project tabs and narrow month/week calendars retain contained horizontal scrolling where their content requires it.
- In the local pilot, the project discussion accepted an update and reply; a two-step checklist moved Planned → In progress → Complete; project upload completed at 100%; a synthetic calendar event appeared in Agenda; and task status updates worked on phone and tablet viewports. These checks used one platform-admin account and synthetic records only.
- The Calendar now defaults to Agenda on phones, narrow tablets up to 820 px, and short landscape viewports up to 1024 px wide. Month, Week, and Day remain selectable. The month grid fits tablet portrait width and its visible actions meet the 44 px touch target floor.
- Phone and tablet checks found and fixed a project-progress row overflow, undersized project actions, undersized calendar filters/date controls, and undersized shared-header, search, reception-filter, contact, and calendar-navigation controls. Discussion errors now explain when delivery could not be confirmed and that retrying is safe. Integration tests simulate response loss after a post or file upload commits and confirm same-ID retry creates one record while a changed payload is rejected. Two focused unit tests verify upload project pinning across delayed file preparation and that cancellation prevents sending. The automated suite passes 6 tests; JavaScript syntax checks pass.
- A follow-up two-account integration test verifies live project-access grants and revocations, global Collaboration revocation, stale file-link denial, and notification filtering. A separate local browser run at 390×844 confirmed project revocation closes the open view, removes the project from the list, and shows a notice; global Collaboration removal returns the user to Overview, removes Projects navigation, and shows a notice. These checks used synthetic accounts in a local simulation; repeat them on physical devices with representative team accounts.
- A local browser check verified that project and work-item dialogs contain Tab and Shift+Tab, Escape closes the top dialog, and focus returns to the project launch button, Add priority/item button, or file Preview button. The PDF viewer kept focus inside its frame during repeated Tab navigation; Shift+Tab returned to the close control. Closing the preview reset its iframe to `about:blank`. `closeProject()` also closes nested work-item and PDF dialogs before hiding the project; repeat the revocation-with-preview-open case on an agreed device. This is browser-simulator evidence only, not a screen-reader acceptance result.
- A local DOM contrast sample corrected low-contrast labels in Overview (activity range, metric labels, inquiry and contract statuses), Clients and Collaborative Team company filters, Reception Intake date filters, summary labels and empty state, Activity timestamps, Tasks metadata and status/priority chips, Calendar filters and phone Agenda empty state, and out-of-month calendar dates. The latest size-aware pass found no sampled text below WCAG AA thresholds (4.5:1 for normal text and 3:1 for large text) across accessible organization views at desktop width and phone Tasks/Calendar Agenda. Keyboard focus on the mobile search control displayed a 3 px outline. Projects was not exposed to this synthetic administrator; this is not a full manual audit of every portal surface, text-size setting, or screen reader.
- The local simulator does not replace iOS Safari, Android Chrome, a physical tablet, keyboard-open/safe-area checks, separate creator/participant accounts, or upload cancellation and progress under a real constrained connection. The original unauthenticated company-portal route redirected to sign-in. An isolated synthetic pilot admin session later reached Aspect Accounting and allowed local review of Dashboard, Tasks, Clients, Marketing Overview, Calendar, User Management, and Reception Intake at 320 px; User Management was also checked at 768 px. This is synthetic layout evidence only and does not replace review with assigned company users, realistic records, actual usage priorities, physical devices, or field acceptance.
- Additional local responsive checks swept 73 distinct viewport widths from 320 to 1501 px, covering each CSS breakpoint and adjacent widths. Projects overview, the project About dialog, Tasks & Requests, and Calendar Agenda had no page-level overflow; Discussion, Shared work, Project Files, and History had no page or dialog overflow at 320, 360, 390, 640, 768, 1024, and 1500 px. The 73-width sweep exposed and verified fixes for the project owner filter and Calendar toolbar. This is local browser simulation, not device acceptance.
- Three reloads at a simulated 390×844 viewport took 211, 195, and 211 ms until the accessibility tree was usable (median 211 ms). This used a synthetic participant on localhost; cache state and network conditions were uncontrolled. It is a local reference only, not a cold/warm load measurement and not comparable to a physical-device result.
- The local pilot server returned 145,682 bytes across its first-party HTML, CSS, and seven JavaScript resources when requested with Brotli support (the 968-byte upload helper was below the compression threshold and served without compression). This is a server-response measurement for static resources only; runtime API responses, browser transfer overhead, and field-network conditions are excluded.
- After extending the form and searchable-picker sizing through 1024 px, a local tablet-landscape sweep of Overview, Clients, Reception Intake, Collaborative Team, Tasks, Activity, Calendar, and Portal settings found no document-width overflow; all visible native inputs, selects, and textareas measured 16 px. The meeting-type picker stayed within the viewport at 821 and 1024 px with 16 px text, 44 px search/option targets, and a 14 px result count. At 1280 px, desktop picker sizing returned and remained within the viewport. The Projects route was unavailable to this pilot account, and physical-device behavior remains unverified.
- A static stylesheet audit confirms the global `prefers-reduced-motion: reduce` rule disables smooth scrolling, reduces animation and transition timing, and removes transition delays; additional rules cover the intake modal, calendar, project notification highlight/toast, task/work status feedback, and mobile navigation. The local browser session could not emulate the operating-system preference, so behavior with that setting enabled remains unverified.
- The stylesheet is served with long-lived immutable caching when its URL has a version token. The current `public/index.html` references `/styles.css?v=20261014-calendar-invite-status-1`; this cache-busted stylesheet includes the tablet-width searchable-control sizing adjustment.

### Baseline captured before the first responsive code changes

These are local source-file sizes, not browser timing or device measurements. The server supports Brotli and gzip, so source size is not the same as transferred bytes.

| Asset | Bytes before changes |
|---|---:|
| `public/styles.css` | 268,255 |
| `public/app.js` | 131,699 |
| `public/foundation.js` | 101,153 |
| `public/calendar.js` | 74,448 |
| `public/system-development.js` | 50,965 |

The logged-in overview page was inspected at a desktop-sized browser viewport. A timed phone/tablet page-load and task-time baseline was not captured before the responsive changes and cannot be reconstructed reliably now. Capture a labeled current snapshot during the device pass; use it as the comparison point for any later performance changes. Do not claim a before/after improvement without a valid pre-change measurement.

### Current source size after local responsive implementation

| Asset | Baseline bytes | Current bytes | Change | Current gzip bytes |
|---|---:|---:|---:|---:|
| `public/styles.css` | 268,255 | 284,426 | +16,171 | 52,976 |
| `public/app.js` | 131,699 | 135,023 | +3,324 | 34,988 |
| `public/foundation.js` | 101,153 | 101,423 | +270 | 23,448 |
| `public/calendar.js` | 74,448 | 78,789 | +4,341 | 19,747 |
| `public/system-development.js` | 50,965 | 63,610 | +12,645 | 14,076 |
| `public/project-document-upload.js` | — | 968 | New | 468 |

Gzip sizes are local compression estimates from Node's zlib; they are not browser network measurements and exclude HTML, fonts, icons, and other assets. The portal also supports Brotli, so M9 should use the browser's actual transferred-size column.

### Measurement sheet

Record three runs per device/viewport under the same network conditions. Use the median for before/after comparisons and note browser version, portal context, account role, and whether the browser cache was warm or cold.

| Measure | Baseline | Follow-up | How to capture |
|---|---|---|---|
| Initial page usable (seconds) | Not captured before responsive changes | Local simulator reference: 0.211 s median (three reloads to usable accessibility tree); field measurement pending | The local check used localhost, synthetic participant data, and uncontrolled cache/network conditions. On assigned devices, time navigation until the primary action works and record cold and warm loads separately. |
| Compressed transfer size (KB) | Not captured before responsive changes | Local first-party static response: 145,682 bytes (Brotli/identity across HTML, CSS, and seven scripts); field browser total pending | Browser network panel on an assigned device, same route and cache state; include API responses and distinguish transferred from uncompressed resource size. |
| Common task duration (seconds / taps) | Not captured before responsive changes | Manual flow passed locally; not timed | Time opening a project, posting/replying, uploading a file, updating a task, and creating a calendar item. |
| Horizontal overflow / clipped primary controls | Not captured before changes; cannot be reconstructed reliably | Pass locally across 73 widths for Projects overview, About, Tasks, and Calendar Agenda; seven key widths for the other project tabs | Inspect each agreed physical viewport, including widths just above and below key breakpoints; local simulation is the current code reference, not device acceptance. |
| Keyboard and safe-area obstruction | Pending | Pending | Focus a form field, open the on-screen keyboard, and verify save/close actions and notifications stay reachable. |

### Issue log

Add one row per reproducible issue. Severity: **P0** blocks a core task or exposes data; **P1** makes a core task unreliable or difficult; **P2** is a visual or efficiency improvement.

| ID | Page / task | Device and viewport | Severity | Reproduction and impact | Owner | Status / evidence |
|---|---|---|---|---|---|---|
| M3-01 | Projects team overview | Local phone simulation, 390×844 | P1 | A long project title plus the Open project action widened the progress row beyond the page. | Codex | Resolved locally: grid track is constrained; document width now matches the 375 px layout viewport. |
| M3-02 | Project board and work-item controls | Local phone/tablet simulations | P1 | Project card actions, checklist actions, and the Add priority/item control were below a comfortable touch size. | Codex | Resolved locally: visible primary project actions now measure at least 44 px in checked states at 390 and 768 px widths. |
| M3-03 | Projects team overview owner filter | Local browser simulation, 320–390 px | P1 | The owner select kept an intrinsic minimum width, pushing the project progress panel and page wider than a narrow phone viewport. | Codex | Resolved locally by allowing the select to fill its container and shrink; Projects overview and project About dialog now pass a 73-width sweep from 320–1501 px, including breakpoint edges. |
| M3-04 | Responsive stylesheet cache after breakpoint fixes | Local static-asset review and live VPS check | P1 | Reusing an unchanged version token can let browsers keep an immutable cached stylesheet after its contents change. | Codex | Resolved and verified on production 2026-10-14: live HTML serves the newly advanced `20261014-mobile-tablet-optimization-1` token; the live CSS contains 16 px searchable-control text and 44 px tap targets through 1024 px. Health returned HTTP 200 with build ID `c37de8d7c15c629a`. |
| M3-05 | Mobile form and searchable dropdown accessibility | Local synthetic browser at 320, 360, 390, 640, 768, 820, 821, 1024, and 1280 px; calendar modal at 320 and 390 px | P1 | Native controls, searchable select triggers, and dropdown options used 10–13 px text, while option rows were only 34 px high. | Codex | Resolved locally: authenticated form and searchable picker controls use at least 16 px; dropdown triggers, search fields, and options measure at least 44 px through 1024 px; result counts are 14 px. The meeting-type dropdown opened, filtered, and selected correctly on phone, stayed within the viewport across the tablet breakpoint, and desktop sizing remained unchanged at 1280 px. Eight accessible organization sections showed no horizontal overflow and visible native fields stayed at 16 px at 1024 px. Verify focus zoom and readability on iOS/Android devices. |
| M7-01 | Calendar filters and month grid | Local tablet simulation, 768×1024 | P1 | Native filters were 38 px and month day buttons were 28 px; these were difficult to tap. | Codex | Resolved locally: filters and month actions now meet the 44 px target; month grid fits its 705 px container without document overflow. |
| M7-02 | Calendar Week view | Local tablet simulation, 768×1024 | P2 | The seven-day Week timeline is 916 px wide and requires horizontal panning inside the calendar panel. | Codex + Portal team | Known layout behavior; narrow tablets default to Agenda. Confirm whether horizontal panning remains acceptable on a physical tablet. |
| M7-03 | Calendar Agenda toolbar | Local browser simulation, 1049–1150 px | P1 | The toolbar's minimum content width exceeded the page area left beside the navigation at these viewport widths, causing document-level horizontal overflow. | Codex | Resolved locally by keeping the stacked toolbar layout through 1200 px; Calendar Agenda passes the 73-width sweep from 320–1501 px after transitions settle. |
| M8-01 | Shared controls across organization pages | Local phone/tablet simulations, 360–1024 px | P1 | Several header icons, search fields, reception filters, profile links, and calendar arrows were below the 44 px touch target. | Codex | Resolved locally: shared controls now meet 44 px; nine organization sections pass the eight-size overflow sweep. Synthetic company-portal routes also received a narrow-phone review; live company acceptance and physical-device checks remain open. |
| M8-02 | Company User Management add-member form | Local synthetic company portal, 320×800 and 768×1024 | P1 | At 320 px, Name and Work email were arranged in two columns, leaving the email field too narrow to read and use comfortably. | Codex | Resolved locally by stacking the member fields at phone widths; screenshot review confirms stacked fields at 320 px and a side-by-side layout at 768 px. Repeat with realistic company data and a field device. |
| M4-01 | Project participant removal while a project is open | Two-account API integration and local phone browser, 390×844; physical-device confirmation pending | P1 | Previously loaded project content could remain visible after participant removal because the session was not notified. | Codex | Resolved locally: revocation event closes the open project view, removes it from the list, and displays a notice. Integration coverage confirms the event, denied file link, and notification filtering. Repeat on an agreed physical phone/tablet. |
| M4-02 | Project dialog focus and nested file preview after close | Local browser dialog check; phone/tablet and screen-reader confirmation pending | P1 | Keyboard focus could leave an open dialog; closing a project while a work-item dialog or PDF preview was open could leave the nested layer or document visible. | Codex | Resolved locally: project, work-item, and PDF dialogs trap Tab/Shift+Tab; Escape closes the top dialog; close restores focus to its opener; project close hides nested dialogs and clears the PDF iframe. Local browser verified focus wrap, return focus, and preview reset. Test revocation while preview is open on a physical device. |
| M5-01 | Project Files upload while closing or changing projects | Code review plus focused unit tests; browser confirmation pending | P1 | File preparation was asynchronous, but the upload URL read the mutable current project ID afterward; closing or changing projects could continue the upload in the wrong project. | Codex | Resolved locally: capture the project ID before file preparation, abort on close/project change, and clear stale selection when opening another project. Two unit tests cover project pinning and pre-send cancellation; syntax checks and all six tests pass. Browser lifecycle validation remains open. |
| M5-02 | Project discussion misses posts after a mobile tab sleeps or disconnects | Isolated two-account browser check and authenticated integration checks; physical-device lifecycle check pending | P1 | A suspended browser can miss live discussion events and leave an already-open project showing stale posts after the connection resumes. | Codex + Portal team | Resolved locally: added an access-checked discussion catch-up endpoint; the open project fetches posts since its newest displayed update on visibility resume and live-stream reconnect, merges by post ID, and preserves reply text, cursor, and modal scroll. On an isolated local portal, the event stream stayed unavailable through retry attempts; a participant posted before it reconnected, then the creator’s open Discussion showed the missed post and refreshed unread count without an event replay. A separate live-message check confirmed the bottom-right toast. Integration coverage checks incremental replies, invalid cursors, sign-in, project-member denial, and global Collaboration denial. Confirm on iOS Safari and Android Chrome when devices/accounts are available. |
| M10-01 | Device, keyboard, and role acceptance | iOS Safari, Android Chrome, tablet; invited participant | P0 | Local viewport simulation cannot verify physical touch, browser chrome, keyboard/safe area, participant permissions, or notification routing. | Portal team | Open; record device/browser, role, and result in this tracker. |
| M10-02 | Text enlargement, visual accessibility, and assistive technology | Representative phone/tablet; screen-reader user or tester | P1 | Text scaling, contrast, reduced-motion behavior, screen-reader announcements, and physical-device focus behavior need review. | Portal team | Partially checked locally: project/work-item/PDF dialog keyboard containment, Escape, focus return, and PDF-frame cleanup pass in the browser simulator. A project-dialog color audit found supporting text at 2.76–3.74:1; targeted colors now bring all visible text in the checked synthetic dialog view to at least 4.5:1 on its light backgrounds. The decorative file icon measures 4.16:1 (above the 3:1 non-text threshold). The latest size-aware contrast review found no sampled text below WCAG AA thresholds in accessible organization views at desktop width or phone Tasks/Calendar Agenda. Projects was not exposed in this account, and this is not a full-portal audit. Keyboard focus on the mobile search control showed a 3 px outline. Static stylesheet audit confirms global and component-specific reduced-motion rules; the local browser session could not emulate the OS preference. Still open: 200% text, full-portal contrast review, testing the motion preference enabled, screen-reader announcements, upload progress, notification focus, and physical-device checks; record device/OS/browser. |
| M10-03 | Small-text contrast in organization pages | Local synthetic browser, desktop width and 390 px phone Tasks/Calendar Agenda | P1 | Small labels in filters, status chips, activity timestamps, and empty states were difficult to read on light backgrounds. | Codex | Resolved for the sampled states: shared theme overrides darken targeted labels. The latest size-aware DOM sampler found no text below WCAG AA thresholds in the accessible organization pages checked at desktop width or in phone Tasks/Calendar Agenda. The Projects route was unavailable to this review account; repeat a full-portal contrast review with an assigned account, then complete text enlargement, screen-reader, and physical-device checks under M10-02. |
| M10-04 | Company-portal module navigation after returning to Overview | Local synthetic company portal, 390 px; assigned company-account validation pending | P1 | Returning to Overview left the mobile company tabs showing a selected module while the company content was hidden; choosing a tab did not restore the company workspace. | Codex | Resolved locally: selecting a company module now returns to `companyWorkspace` and pins the selected company ID for child portals. Bumped the foundation script cache key. A 390 px synthetic admin browser check verified Overview → Clients displays the company Clients panel and selects Clients. Repeat with an assigned non-admin company account and on physical devices. |

## Work tracker

Track local implementation separately from field acceptance. **Done locally** means the code or local simulator check is complete; **Accepted** requires the evidence in that row's acceptance note. Use **Not started**, **In progress**, **Blocked**, or **Done** for each state. Name the person who will perform a pending team action.

| ID | Priority | Work item | Local implementation | Field acceptance | Owner / dependency / evidence still needed |
|---|---|---|---|---|---|
| M1 | P0 | Measure current mobile/tablet load and common collaboration tasks; retain the known layout findings. | Source-size comparison done; local static transfer recorded; 390×844 simulator reload-to-usable-AX-tree reference is 211 ms median across three runs | Blocked | Codex + Portal team; physical devices and assigned live company-workspace access are unavailable. The local timing has uncontrolled cache/network conditions and is not a field measure. Pre-change browser timings and overflow evidence cannot be reconstructed; capture a clearly labeled current-device snapshot when available. |
| M2 | P0 | Agree on representative device, viewport, browser, role, and portal coverage. | Proposed matrix documented | Blocked | Physical devices, creator/participant test accounts, and assigned live company-workspace access are not available yet; confirm actual models, browsers, roles, company context, and realistic data sizes when provided. |
| M3 | P0 | Adapt shared navigation, page shell, touch targets, and responsive dialogs. | Done locally; 8-size matrix plus 73-width breakpoint sweep for Projects overview/About, Tasks, and Calendar Agenda passes; other project tabs pass seven key widths | Blocked | Physical device matrix is unavailable; check iOS/Android/tablet behavior, keyboard, safe areas, rotation, and desktop regression when devices are provided. |
| M4 | P0 | Complete the Projects mobile journey: browse/open, create, set participants, update work/checklists, discuss/reply, add files, open discussion from notification, and revoke access safely. | Main flows and project/global access revocation pass with synthetic data, two authenticated accounts, integration checks, and a local 390×844 browser run. Project dialog focus, nested-preview cleanup, and opener focus pass in a local browser check. | Blocked | Creator, participant, and removed-participant accounts plus physical devices are not available yet; repeat the journey and verify denied routes, notification routing, and revocation while a file preview is open when assigned. |
| M5 | P0 | Make project-file upload and discussion resilient on weak connections. | Upload UI reports file preparation and transfer progress, supports cancellation in either phase, retains the selected file and request ID for same-session retry, and pins the request to its original project. Discussion retries are idempotent; an access-checked catch-up endpoint retrieves missed posts after visibility resume or live-stream reconnect while preserving an in-progress reply draft. Unit, integration, and isolated two-account browser checks exercise these safeguards. | Blocked | Real phones/tablets and a constrained network are unavailable; verify cancel/close/project-switch behavior, reconnect catch-up, size-boundary and memory behavior, and slow/interrupted transfers when available. |
| M6 | P1 | Apply the tested responsive patterns to Tasks & Requests. | Done locally; list/detail/status update checked on phone and tablet viewports | Blocked | Physical device and role matrix is unavailable; confirm on agreed devices and roles. |
| M7 | P1 | Adapt Calendar for phone and tablet, prioritizing a readable agenda/list experience on phones. | Done locally; Agenda default, date actions, event creation, and 73-width Agenda overflow sweep checked | Blocked | Physical device matrix is unavailable; validate devices and decide whether 916 px Week timeline panning is acceptable on tablet. |
| M8 | P2 | Review company, client, and administration screens and prioritize mobile changes by actual use. | Organization portal: nine main sections pass the eight-size overflow/touch sweep. Synthetic local review covered company Dashboard, Tasks, Clients, Marketing Overview, Calendar, User Management, and Reception Intake at 320 px; User Management was checked at 768 px and its narrow form was fixed. | Blocked | Field acceptance remains blocked because assigned live company access, representative records, and actual usage priorities are unavailable; the synthetic pilot is only implementation evidence. Collect usage feedback before expanding scope. |
| M9 | P1 | Consolidate responsive CSS and address measured loading/performance issues. | Local source sizes and a 145,682-byte first-party static response snapshot recorded; no structural optimization is justified by the available local evidence | Blocked | Current-device load/task measurements and complete browser network totals are unavailable; use M1 field evidence to identify a demonstrated bottleneck before changing architecture. |
| M10 | P0 | Run final cross-device, role, accessibility, portal, and desktop regression review; record remaining limitations. | Project dialog focus, a visible focus outline, and targeted contrast corrections are implemented and locally checked; physical accessibility and acceptance work remains open. | Blocked | Field resources are unavailable; close after M2–M7 evidence, active-session access revocation, and M10-02 accessibility checks are recorded and P0/P1 findings are resolved or explicitly accepted. |

### Implementation checklist

- [x] Consolidate the mobile audit findings, assumptions, and risks in this tracker.
- [x] Capture pre-change source-file size baseline.
- [ ] Record a current real-device load/task snapshot and screenshots or issue notes (pre-change timing baseline unavailable).
- [ ] Confirm device/browser/role/portal matrix with the portal team.
- [x] Implement the shared mobile shell, responsive project dialogs, upload feedback, and discussion UI updates.
- [x] Exercise the local project update/reply, checklist, upload, task update, and calendar-event flows using synthetic pilot data.
- [x] Check Overview, Projects, Tasks, and Calendar at eight phone/tablet/desktop and landscape viewport sizes.
- [x] Check Overview, Clients, Reception Intake, Collaborative Team, Tasks, Activity, Calendar, Portal settings, and Projects at the same eight viewport sizes.
- [x] Review synthetic company Dashboard, Tasks, Clients, Marketing Overview, Calendar, User Management, and Reception Intake at 320 px; verify the User Management form stacks at 320 px and remains two columns at 768 px.
- [x] Sweep 73 widths from 320–1501 px around every responsive CSS breakpoint; verify Projects overview/About, Tasks, and Calendar Agenda, then check all project tabs at seven key widths.
- [x] Fix the narrow Projects owner-filter overflow and Calendar Agenda toolbar overflow found in breakpoint sweeps; re-run the affected local sweeps.
- [x] Record a three-run 390×844 local simulator timing reference and label its uncontrolled cache/network conditions; retain physical-device timing as pending.
- [x] Verify that the local server serves the advanced stylesheet cache key and record compressed first-party HTML/CSS/JavaScript response bytes; keep field network totals pending.
- [x] Raise the shared organization-page header, form, action, profile-link, and calendar navigation targets to at least 44 px at phone/tablet widths.
- [x] Add and pass response-loss retry regression coverage for discussion posts and project-file uploads.
- [x] Add access-checked project discussion catch-up after mobile tab resume or live-stream reconnect; merge missed posts without losing reply text, cursor position, or scroll position.
- [x] In an isolated two-account browser preview, interrupt the event stream through retry attempts, post while the creator is disconnected, then confirm the open Discussion recovers the missed update and unread notification after reconnect. Verify a foreground live post still produces the clickable toast.
- [ ] Confirm discussion catch-up and notification behavior after background/resume and brief disconnect on physical iOS and Android devices.
- [x] Keep the upload request tied to its starting project; abort on modal close and clear stale selected-file state when opening a different project.
- [x] Keep the project-file upload help and selected-file text readable at 14 px within the project dialog.
- [x] Explain safe retry when a discussion post/reply delivery cannot be confirmed.
- [x] Cover participant access, project/global revocation events, stale file-link denial, and notification filtering with two authenticated accounts in integration tests.
- [x] In two local browser sessions at 390×844, remove a participant while the project is open; confirm the view closes, the project disappears, and a notice appears. Integration checks confirm stale file-link denial and notification filtering.
- [x] Keep focus inside project, work-item, and PDF preview dialogs; return focus on close and clear the PDF frame when its preview closes. Confirm Tab/Shift+Tab wrap, Escape, and opener focus in the local browser.
- [x] Audit and improve text contrast in the project dialog; checked visible text in the local synthetic dialog view at 4.5:1 or greater on light surfaces.
- [x] Improve and sample text contrast in accessible local synthetic organization views; the latest size-aware checks found no text below WCAG AA thresholds at desktop width or in phone Tasks/Calendar Agenda. Projects is unavailable to this account, and full manual/field contrast review remains open.
- [x] Restore company workspace navigation when a mobile company-portal user selects a company module after returning to Overview; synthetic 390 px admin browser check confirmed the selected tab and company-specific panel match.
- [x] Verify a keyboard-triggered 3 px focus outline on the mobile search control in the local browser.
- [x] Set authenticated mobile/tablet form controls and searchable picker text to at least 16 px; make dropdown triggers, search fields, options, and shared option-search controls at least 44 px, and result counts at least 14 px through 1024 px; confirm text sizing and no page overflow at 320, 360, 390, 640, 768, 820, 821, and 1024 px, check calendar dialogs at 320 and 390 px, and verify desktop sizing remains unchanged at 1280 px. Physical iOS/Android focus behavior remains pending.
- [x] Recheck Overview, Clients, Reception Intake, Collaborative Team, Tasks, Activity, Calendar, and Portal settings at 1024 px after the form-size breakpoint extension; verify visible native field text is 16 px and no section causes horizontal overflow. Projects remains unavailable to the synthetic pilot account.
- [x] Audit the stylesheet's reduced-motion rules for global animations, transitions, and scroll behavior; physical setting verification remains pending.
- [ ] Repeat project and global Collaboration revocation on physical phones/tablets, including use of a previously received notification after access is removed.
- [ ] Repeat revocation while a PDF preview is open on a physical device; check 200% text, contrast, reduced motion, screen-reader updates, upload progress, and notification focus.
- [ ] Exercise interrupted posts/uploads, cancellation, retry safety, and duplicate prevention under a weak network.
- [x] Add the mobile Calendar agenda, switcher, chronological ordering, and date-specific Add event actions.
- [x] Improve mobile Tasks & Requests text size and filter touch targets.
- [x] Create a synthetic calendar event on a phone-sized viewport and inspect the tablet event form.
- [x] Verify a sample task status update from phone and tablet viewport simulations.
- [ ] Check keyboard-open and safe-area behavior on physical phones and tablets.
- [x] Complete local project-dialog contrast, keyboard focus containment/restoration, and static reduced-motion stylesheet audits; physical focus and OS-setting checks remain pending.
- [ ] Check 200% text enlargement, full-portal contrast, enabled OS reduced-motion behavior, and screen-reader announcements for uploads and new discussion notifications on assigned devices.
- [ ] Complete M8 review using actual team usage or feedback; synthetic company-page layout review is complete but does not establish usage priority.
- [x] Use the current local static-transfer snapshot to assess M9 scope; no structural optimization is justified by local evidence.
- [ ] Reassess M9 with current-device and browser-network measurements before release.
- [ ] Complete M10 release review and capture known limitations.

## Phases and completion checks

### Phase 1 — Baseline and test matrix (M1–M2; field work remains)

- Capture initial load time, page weight, and the time/steps needed for common collaboration tasks on a phone and tablet.
- Record current horizontal overflow, clipped controls, difficult forms, and modal/tab behavior.
- Start with representative viewport widths of 360, 390, and 430 px for phones, and 768 and 1024 px for tablets; include portrait and landscape where applicable.
- Add a local width sweep immediately below and above each responsive CSS breakpoint; the named device sizes alone may miss a layout failure at a transition.
- Check iOS Safari and Android Chrome on phones, plus a tablet browser. Add desktop Chrome as a regression check.
- Include a platform administrator, project creator, and invited project participant; check both organization and company portal contexts when the account can access them.
- Record a typical and largest expected team/project size (participants, projects, work items, discussion messages, and files); include representative data in layout and performance checks.
- Confirm that current notifications are in-app only and agree whether that satisfies the mobile requirement.

#### Device and viewport coverage

Confirm the actual device models and browser versions with the team; these are coverage targets, not claims that every model has already been tested.

| Target | Viewport | Browser target | Main coverage |
|---|---:|---|---|
| Small phone | 360×800 | iOS Safari or Android Chrome | Narrow navigation, forms, project tabs, upload actions, and no horizontal page overflow. |
| Common phone | 390×844 | iOS Safari | Project discussion/reply, bottom notification, file flow, keyboard, and safe areas. |
| Large phone | 430×932 | Android Chrome | Projects, tasks, calendar agenda, filters, and orientation change. |
| Tablet portrait | 768×1024 | Safari on iPad or Chrome on Android tablet | Project board, filters, dialogs, calendar Agenda and Month, and touch targets. |
| Tablet landscape | 1024×768 | Browser supported by the team | Navigation, calendar, project views, and dialog fit after rotation. |
| Short landscape | 844×390 and 932×430 | iOS Safari and Android Chrome where available | Agenda default, header actions, scroll position, and keyboard behavior. |
| Desktop regression | 1280×900 | Desktop Chrome | Confirm the mobile changes preserve the current desktop layout and actions. |

#### Role and portal coverage

| Role | Verify |
|---|---|
| Platform administrator | Organization navigation, company portal entry, project access controls, and administration pages. |
| Project creator | Create/open a project, select participants, update shared work, post/reply, share a file, and receive teammate discussion updates. |
| Invited participant | Open only assigned projects, read/post/reply, see shared files/work, and open the correct discussion from a notification. |
| Teammate without project access | Project and file routes remain unavailable, including when opened from a stale or copied notification link. |
| Removed project participant | An already-open project view clears promptly after access is removed; stale notifications and copied project/file links cannot restore access. If the person owns work, confirm the UI requires reassignment or clearly explains what will happen before removal. |

Run the project journey in the organization portal and, where the account is authorized, one company portal. Exercise Tasks & Requests and Calendar with the roles that can access those areas. Do not use production data for test posts or uploads.

#### Network and evidence capture

- Repeat the discussion post and reply, plus project-file upload, on a normal connection and a throttled connection. Include a disconnect after request submission, restore the connection, and retry with the same request.
- For uploads, verify progress, cancellation during file preparation and transfer, selected-file retention after cancel/failure, and no duplicate on retry.
- Exercise small, typical, 10 MB maximum-size, and over-limit files; record preparation/transfer time, failures, and memory behavior where device tools expose it. Confirm the 10 MB cap and server request-size limit agree.
- For notifications, use two signed-in accounts in separate sessions; confirm an active project participant sees a toast while the portal is foregrounded, clicks through to the correct discussion, and cannot use it to bypass project access. Also background the recipient tab, post an update, then return and confirm the unread in-app notification is available without relying on an OS push alert.
- After backgrounding or briefly disconnecting a mobile session, verify the discussion connection resumes and subsequent messages arrive; check that updates missed while suspended are discoverable in the in-app notification list and do not appear twice.
- Record each result as: date; device model; OS/browser version; viewport/orientation; portal and account role; network/cache state; task; expected and actual result; screenshot or issue ID.
- Measure three cold and three warm page loads per selected device with a representative typical dataset; record dataset size, median, transferred bytes, and duration/taps for the same tasks. The missing pre-change timings remain unavailable; label these as the current reference for future comparisons.

**Complete when:** the current device measurements and known issues are recorded, and the device/role/portal matrix is agreed before field acceptance. Pre-change timing and overflow measurements are explicitly marked unavailable because they were not captured before implementation.

### Phase 2 — Shared mobile foundation (M3)

- Make primary navigation discoverable and usable without consuming too much screen space.
- Ensure controls have comfortable touch targets and forms remain usable with the on-screen keyboard open.
- Adapt dialogs to phone viewports; check tab labels and navigation, scroll behavior, close/save actions, and return to the correct page.
- Account for safe-area insets and dynamic viewport height for fixed elements and bottom notifications.
- Check both portrait and landscape layouts on the representative devices.

**Complete when:** shared navigation and dialogs work without unintended horizontal scrolling, clipped actions, or keyboard/safe-area overlap at the agreed viewports and breakpoint boundaries; rotation preserves unsaved form input and usable scroll position; desktop regression check passes.

### Phase 3 — Projects collaboration journey (M4–M5)

- Browse the project list and open the intended project.
- Create a project and select the teammates who can access it.
- Remove a participant while they have the project open; ensure their view clears and stale notifications/links do not restore access.
- Review and update shared work, status, and checklists.
- Read the discussion, post an update, and reply.
- Upload, preview, and access project files.
- Open a discussion from its in-app notification.
- Exercise loading, empty, error, and access-denied states.
- Test weak-connection behavior for posts and uploads, including retry safety and duplicate prevention.

**Complete when:** a creator and an invited participant can complete the relevant journey on phone and tablet; project access boundaries remain enforced; interactions give clear feedback; no duplicate post/upload is created by retrying.

### Phase 4 — Tasks, Requests, and Calendar (M6–M7)

- Apply the shared layout patterns to task/request browsing, details, forms, and status updates.
- Make calendar browsing practical on phones, with an agenda/list layout where a full grid is too dense.
- Keep event creation and editing clear, and preserve company access rules.

**Complete when:** the common read and update tasks work at the agreed phone/tablet widths and roles, with no horizontal overflow or loss of essential controls.

### Phase 5 — Broader portal review and measured optimization (M8–M9)

- Review company, client, and administration pages with usage data or user feedback to prioritize remaining work.
- Consolidate repeated or conflicting responsive rules as components are touched.
- Re-measure page weight and load/interaction times against Phase 1.
- Only introduce code splitting, a new upload transport, or other structural performance changes when measurements show a benefit.

**Complete when:** the highest-use remaining pages have an agreed mobile behavior, and any performance change has before/after measurements plus desktop regression review.

### Phase 6 — Release review (M10)

- Repeat the representative viewport, browser, role, and portal checks.
- Verify navigation, forms, dialogs, project access, discussion/replies, notifications, file uploads, task updates, and calendar basics.
- Record unresolved issues, known limitations, and any work deliberately deferred.

**Complete when:** no critical mobile workflow is blocked, project access rules are verified, desktop behavior remains acceptable, and remaining issues are documented with priority.

## Cross-phase acceptance criteria

- No unintended horizontal scrolling at the agreed viewport sizes.
- Primary actions and form controls are usable by touch and remain visible with the on-screen keyboard open.
- Text enlargement does not hide essential actions, and key dynamic states can be reached and understood with keyboard and screen-reader navigation.
- Text and controls remain distinguishable with contrast and focus indicators, and reduced-motion preferences are respected.
- Dialogs, tabs, notifications, and fixed controls respect safe areas and do not cover one another.
- Loading, empty, error, and permission states explain what the user can do next.
- Posting, replying, task updates, and uploads provide clear success/failure feedback; retries do not silently duplicate work.
- A notification opens the intended project discussion for a user who has access; users without access cannot use it to bypass project permissions.
- Performance changes are based on recorded measurements, and every phase includes a desktop regression check.

## Decisions to revisit

- Whether in-app notifications are sufficient on mobile, or whether browser/OS push notifications need a separate project.
- Whether upload progress, cancellation, and safe retries are sufficient, or measured evidence justifies changing the upload transport.
- Whether the Week view's contained horizontal panning is acceptable on a portrait tablet after the team tries it on-device.
- Final device/browser coverage based on the team’s actual devices and usage.
- Performance budgets after Phase 1 establishes a baseline.


# Aspect Accounting Reception Intake Adaptation Plan

**Plan status:** First Accounting Reception framework is live. This document separates verified live behavior from the remaining work needed for a complete accounting intake-to-setup workflow.  
**Last audited:** 2026-10-14 against the current portal source and live Aspect Accounting Reception page.  
**Source workflow:** Signature Exteriors company portal → Marketing → Reception Intake.  
**Target workflow:** Aspect Accounting company portal → Reception / Client setup intake.

## Decisions and current delivery state

The goal is to carry over the **Reception workflow and recognizable UI** from Signature Exteriors while replacing pool/design questions with questions that help Aspect Accounting judge whether the requested work is realistic for current team workload. This is a company-specific adaptation, not a pool-design workflow with accounting labels.

The user supplied screenshots as the visual reference. The intended queue composition is the Signature Reception layout: a single Reception workspace heading and prominent inquiry action, a horizontal phase rail with counts/arrows and “View this phase,” a dedicated search/filter panel with quick filters, and compact inquiry cards. The Accounting queue follows that hierarchy. Each inquiry is a compact row with the client, service, status/progress, and next follow-up. Clicking a row opens the inquiry form directly; it does not expand a narrative underneath the row. The Accounting form is split into **Client**, **Scope**, **Review**, and **History** tabs. Common questions use select menus or clickable options; saved legacy free-text values remain available as saved choices/disclosures. History, contact logging, closure/reopen, follow-up and task actions remain accessible in the form. Larger text, tabs, and compact choice controls keep the workflow scannable. The reference is about page hierarchy, layout, card treatment, and interactions; all questions and labels remain accounting-specific.

The live first-release framework includes organization/contact/service capture; accounting scope and complexity questions; internal workload fit and decision fields; company-configured status labels/order and service choices; the Signature-style workflow rail, search/filters, quick follow-up actions, record history, closure, task handoff, and responsive layout. Internal workload fit is a **human review** against current commitments, deadlines, effort, and staffing. The software does not calculate utilization or guarantee a start date.

The live defaults are `New`, `In review`, `Discovery scheduled`, `Awaiting information` (stable ID `Follow-up`), `Ready for setup` (stable ID `Qualified`), `Setup in progress`, and `Closed`. Administrators can tune Accounting status labels/order after the framework is live; they do not need to finalize wording before using the first release. The current configuration editor manages statuses and service choices; it does not yet expose every configurable field listed in the broader design target.

**Not included in the current release:** client-directory create/link, structured engagement/setup milestones, automatic workload-capacity calculation, configurable form schema/required-field rules, and retention policy enforcement. These are future work below. The live public intake form does not collect files, credentials, bank account numbers, or tax identifiers.

### User decisions to preserve

- Build on the Signature Exteriors Reception experience, including a similar UI, not just similar data fields.
- Replace pool/design questions with accounting questions that help determine whether requested scope, timing, complexity, and effort fit actual company workload.
- Status names/order can be adjusted after the first framework is live; the initial statuses are defaults, not a prerequisite sign-off.
- Make the page more readable and less overwhelming with larger text and progressive disclosure while keeping secondary features accessible.

## Objective

Carry the complete Reception Intake experience used by Signature Exteriors into Aspect Accounting, while replacing the pool/design lead context with a clear accounting inquiry and client-setup workflow. Keep records private to Aspect Accounting, retain the queue's follow-up and audit capabilities, and keep company-specific language and rules from changing Signature Exteriors or other portals.

## Source baseline and current Accounting state

**Signature Exteriors source baseline:** The company workspace exposes **Marketing** with an overview and a Reception Intake tab. Its generic intake supports recording/editing an inquiry, the standard status list, contact/source/request details, owner and next-step assignment, due-date tracking, closure outcomes, contact logging, chronological history, search/filters, queue counts, task handoff, and due-follow-up actions. The source baseline remains company-specific only where explicitly described below; Accounting behavior must not change Signature's vocabulary, statuses, or source data.

**Accounting current state:** `aspect-ventures` is identified in code as the Accounting company. It has a Reception label, distinct default statuses/services, organization name, accounting detail JSON, and workload-review JSON. Opening Reception goes directly to the intake queue; there is no separate Reception overview section. The queue includes accounting questions, status/service configuration, workflow-phase filters, workload-fit filtering, quick filters, search, expandable queue summary, and compact inquiry rows with Signature-style status/progress/next-step cues. Clicking a row opens its inquiry form directly, organized in Client, Scope, Review, and History tabs; selection questions use dropdowns or clickable choices while existing custom values are retained. History, contact logging, and lifecycle/task actions remain in the form. The shared database/API still serves other company intake, so every Accounting branch must stay company-scoped.

**Source-content boundary:** The Signature intake source available in this workspace is generic. It contains no explicit swimming-pool/design questionnaire, pool dimensions, site survey, materials, renderings, or design approval fields. The screenshots establish the requested visual pattern, while pool/design context is a user-stated concept rather than a verified source-field inventory. Do not invent pool questions as a dependency. If a separate Design Portal later becomes an authoritative source for fields, inventory it separately before expanding this plan.

The complete workflow still needs a deliberate audit of dashboard metrics, navigation badge, global/advanced search, notification text/deep links, activity history, central administrator overview, Reception feature setting, and database snapshot/restore as Accounting fields and client links evolve.

## Signature Exteriors source blueprint

Use this as the baseline for a faithful Accounting version. It records what the current Signature Exteriors implementation actually does, beyond the shorter feature matrix below.

### Screen flow

1. A user opens the Signature Exteriors company portal and selects **Marketing** from the company module navigation. In the workspace version, the Marketing module contains an **Overview** and a **Reception Intake** subtab. The company portal route uses compact portal navigation and hides the separate in-workspace company picker.
2. Marketing Overview shows four metrics (all inquiries, open leads, qualified, follow-ups due), up to five recent inquiries, and an action into Reception Intake.
3. Reception Intake opens a queue with a **New inquiry** button, clickable status-count cards, due/overdue reminder banner, queue metrics, personal due-follow-up shortcut, search/filter toolbar, and compact inquiry rows.
4. Selecting **New inquiry** or **Edit** opens a centered modal. It captures contact, source, request type, summary, status, follow-up owner/date/next step, and (when closing) closure outcome/notes. Create starts in **New**; edits preserve existing values and append history when something changes.
5. Each row can expand its contact log and chronological activity timeline. Actions allow editing, closing/reopening, completing/reopening the follow-up, handing an eligible follow-up to Tasks & Requests, or opening its linked task.

### Current form and row fields

- **Form:** contact name (required), source, email, phone, free-text request type, status, required request summary, follow-up owner, follow-up date, next step, closure outcome when status is Closed, and optional closure notes.
- **Source choices:** Phone, Email, Website, Referral, Walk-in, Other.
- **Closure choices:** Resolved, Referred, Not proceeding, Unable to reach, Duplicate, Other.
- **Contact log choices:** Call, Email, Text, Meeting, Note; each entry has required free-text detail.
- **Row preview:** source and request type; contact name; email and phone; summary; owner; next step; follow-up due state/date; status; created date and creator. Closed rows also show outcome, closure note, and closure date.
- **Queue filters:** free-text search; status; owner/unassigned; source; request type; follow-up date-from/date-through; follow-up state (due/overdue/upcoming/task handoff/completed/no date); clear filters. The central view also has a company filter.

### Current workflow rules and state transitions

| Current behavior | Source implementation rule |
| --- | --- |
| Create | Creates in `New`; requires contact name and request summary; validates email, source, field lengths, due date, and any selected company owner. |
| Normal statuses | `New`, `In review`, `Follow-up`, `Qualified`, `Closed`. |
| Close | Selecting `Closed` requires a closure outcome and allows optional closure notes; stores closed time and actor. |
| Reopen | Explicit action clears closure fields and returns the record to `In review`; the current UI/API does not ask for a reopen reason. |
| Follow-up due state | Closed records are closed; linked tasks follow task status; completed follow-ups are complete; otherwise a next step/date is classified as overdue, due today, upcoming, or none using company-local date. |
| Complete follow-up | Requires a nonempty next step. It records actor/time and prevents further completion while closed. Reopening is supported. |
| Change follow-up plan | Changing next-step text or date clears any previous completion and logs the reset. |
| Task handoff | Platform administrator only; open and incomplete follow-ups only; creates one linked company task with owner/date defaults; linked task suppresses duplicate intake reminders; task completion counts as follow-up completion. |
| Row ordering | Open before closed, incomplete before completed, dated before undated, earliest follow-up first, then recently updated. |

### Current access and side effects

- Company intake APIs require direct access to the intake's company. Members can create intake records and edit records they created or own; platform administrators can manage the full company queue and assign another eligible company user.
- The central Reception view is available only to a platform administrator in the Aspect Companies root portal. In current code it aggregates authorized company records with full row details and links into the company queue; it is not aggregate-only yet.
- Create, contact log, status/owner/follow-up changes, closure/reopen, and task handoff create intake history/activity entries. Intake update notifications currently include the contact name and update detail for the creator/assignee (actor excluded).
- The intake is included in global/advanced search and its notifications deep-link to the company intake. Dashboard metrics include total/open intake and follow-ups due; company navigation displays the due count. The Reception feature can be disabled through the organization-wide portal setting.
- Intake and history data are SQLite-backed and included with the database snapshot/restore path. The separate private document system exists, but Reception Intake has no file-upload flow of its own.

### Code map and endpoint contract

| Concern | Current source location |
| --- | --- |
| Company navigation labels and Marketing overview/Reception subtab | `public/foundation.js`: `companyModulesForCurrentUser`, `renderCompanyMarketing`, `renderCompanyWorkspace` |
| Queue, filters, modal, rows, due-state, closure summary, timeline | `public/foundation.js`: `renderIntakeQueue`, `intakeDueState` |
| Modal lifecycle, focus trap/return, save, log, action handlers | `public/foundation.js`: `openIntakeEditor`, `closeIntakeEditor`, event handlers for `#companyWorkspacePanel` and `#centralReceptionPanel` |
| Layout, warm company theme, queue rows, filters, responsive modal | `public/styles.css`: Reception Intake rules and company Marketing component styles |
| Shared schema and constraints | `server.js`: `reception_intakes`, `reception_intake_events`, `INTAKE_STATUSES`, `INTAKE_SOURCES`, `INTAKE_CLOSURE_OUTCOMES`, `INTAKE_CONTACT_TYPES` |
| Read/create company queue | `GET`/`POST /api/companies/:id/reception-intakes` |
| Central queue | `GET /api/reception-intakes` |
| Edit and lifecycle actions | `PATCH /api/reception-intakes/:id`; `POST /api/reception-intakes/:id/events`, `/follow-up/complete`, `/follow-up/reopen`, `/reopen`, `/create-task` |
| Setting | `public/settings.js`: `workspaceReception` |

## Accounting translation map

This map preserves the existing flow while making the company-specific lifecycle changes explicit.

| Signature Exteriors source concept | Accounting adaptation |
| --- | --- |
| Marketing / new lead | Reception / new accounting inquiry |
| Contact | Primary client contact plus organization/client name |
| Request type | Accounting service category |
| Request summary | Client objective, requested scope, volume/complexity signals, timing, current setup, and blockers |
| Qualified | Ready for setup after scope review, workload-fit decision, and engagement acceptance |
| Follow-up | Awaiting information or another dated next step needed to assess fit |
| Intake closure | Not proceeding, referred, unable to reach, duplicate, other; successful engagement progresses into setup instead of closing as a lost inquiry |
| Contact timeline | Calls/messages plus discovery, engagement, record-request, access-readiness, and setup milestones |
| Follow-up task | Accounting-specific setup task with non-sensitive intake context and a link back to the record |
| Recent lead | Recent organization/service inquiry |

Keep this mapping company-scoped. Accounting uses stable status IDs with company-specific labels in `company_reception_configs`; do not add Accounting stages to the global Signature Exteriors status defaults.

## Feature-by-feature adaptation and delivery state

| Capability | Current state | Accounting target / remaining work |
| --- | --- | --- |
| Navigation and overview | **Live, Accounting-specific.** Reception appears in company navigation. Overview shows inquiry, fit-review, ready-for-setup, and follow-up metrics, recent records, and entry into the queue. | Keep Accounting wording and metric definitions company-scoped. Leave Signature Exteriors Marketing navigation and copy unchanged. |
| Reception queue UI | **Live, Signature-inspired.** Single workspace heading, blue new-inquiry action, four-phase rail, search/filter panel, quick filters, compact records, and expandable queue summary. Text is larger; lower-priority card details are collapsed. | Keep this screenshot-derived hierarchy and readable sizing as the visual contract. Do not reintroduce the old duplicate Accounting/Reception header, the design/pool questionnaire, or the dense all-fields-first card. |
| New/edit inquiry form | **Live, Accounting-specific, but broad.** The accessible modal captures contact, source, service, summary, accounting scope/readiness, internal review for administrators, status, and follow-up plan. | Simplify first contact: show the minimum needed to qualify; put discovery-only scope and capacity questions in clearly named expandable groups. Preserve edit values and validation behavior. |
| Contact identity and methods | **Live.** Organization/business name and primary contact, email, and phone are recorded. | Confirm whether at least one contact method must be required; do not add multiple-contact management until the team validates the need. Capture a separate legal name only if setup requires it. |
| Source | **Live.** Uses the current standard source choices. | Source options are not yet editable in the Accounting configuration screen. Add that only if the team needs company-specific choices; do not change Signature's options. |
| Accounting service | **Live defaults and service configuration.** The first-release service list is Monthly bookkeeping, Catch-up / cleanup, Tax preparation, Tax planning, Payroll, Sales tax, Financial reporting, Controller / CFO support, and Other. | Tune labels/categories after use. Add a short Other explanation if reception needs it; keep the controlled service value filterable. |
| Accounting scope and readiness | **Live first-release fields.** Entity type/jurisdictions, entity and location counts, monthly transactions, account count, employees/payroll, software/providers, books-current month, catch-up months, desired start, hard deadline, sales-tax jurisdictions, records readiness, prior accountant, client response time, other systems, and complexity flags. | Validate which questions are first-contact versus discovery-only. Use “Unknown / not sure” distinctly from “No.” Keep sensitive records, credentials, tax IDs, and account numbers out of Reception. |
| Workload-fit qualification | **Live first release.** Staff can set fit, estimated hours, confidence, capacity window/period, rationale, and decision. | Reviewer availability, current client workload, seasonality, and deadline conflicts are not computed. Keep the assessment human-reviewed until a separately scoped capacity model exists. |
| Status lifecycle | **Live Accounting defaults and tuning.** Stable IDs: New, In review, Discovery scheduled, Follow-up (displayed as Awaiting information), Qualified (displayed as Ready for setup), Setup in progress, Closed. Status labels/order and adding/retiring stages are configurable; New/Closed are anchors and in-use stages cannot be removed/disabled. | The first-release statuses are deliberately adjustable after launch. Final status language and any transition guidance can be tuned in the Accounting config without changing Signature's defaults. Add lifecycle rules only after the team defines ownership/meaning of each stage. |
| Workload-fit labels | **Live defaults:** Likely fit, Needs scoping, Capacity constrained, Outside services. | Keep independent from workflow status. Do not imply a fit label automatically approves work. |
| Owner and follow-up | **Live.** Eligible owner, next step/date, due-state logic, completion/reopen, My due follow-ups, and linked-task state are supported. | Validate Accounting examples and ownership expectations with the team. Follow-up dates remain requirements/reminders, not promised service dates. |
| Queue metrics and reminders | **Live with progressive disclosure.** Active count remains by search; follow-up/completion/attention metrics and “My due follow-ups” are under “Follow-up and queue summary.” Due/overdue alert appears when relevant. | Keep urgent due/overdue reminders visible; avoid duplicating counts in the primary view. |
| Search and filters | **Live first release.** Search, exact status, workload fit, all/mine/due-today/overdue shortcuts, and advanced owner/source/service/date/follow-up filters are present. | Keep private setup fields out of global search; the local intake search behavior should be reviewed for sensitive scope fields before indexing additional data. |
| Inquiry card | **Live, compact.** One collapsed Signature-style row shows organization/contact, service, status, core-intake progress, and next follow-up. Opening it reveals contact methods, source/owner, request summary, scope/fit tags, actions, closure details, contact logging, and timeline. | Keep the collapsed row brief and readable at every width. Preserve all existing actions/history in the expanded details and keep confidential accounting detail out of collapsed previews. |
| Edit, contact log, and timeline | **Live baseline.** Record edits, closure/follow-up/task actions, contact notes, and chronological history are available. | Typed setup milestones (discovery held, engagement sent/signed, records requested/received, access verified, setup started/completed) are not implemented. Add only after lifecycle definitions are agreed; always retain actor/time/detail. |
| Close and reopen | **Live baseline.** Closure outcome/notes and reopen action are supported. Accounting defaults include Referred, Not proceeding, Unable to reach, Duplicate, Outside services, Other. | Reopen reason and an onboarded/completed handoff outcome are not currently modeled. Define the transition from Reception to Client Setup so an accepted client is not mislabeled as a lost/closed inquiry. |
| Tasks & Requests handoff | **Live.** Eligible follow-up can become a linked Accounting task with owner/date defaults; linked tasks prevent duplicate reminders and task completion updates follow-up state. | Review default task title/description and the minimum safe context included. Avoid copying full accounting scope/review fields into general task notifications. |
| Client directory handoff | **Not implemented.** No intake-to-client relationship is established. | Add “Create or link client” after engagement acceptance, deduplicate against existing clients, keep the intake link, and transfer only approved non-sensitive setup context. |
| Dashboard and navigation count | **Live baseline.** Accounting overview and Reception navigation are company-specific; due-item navigation badges are supported. | Validate counting rules after stage labels are tuned. Keep links to the correct filtered queue. |
| Global/Advanced Search | **Partially integrated.** Core intake fields are searchable under existing permission checks. | Audit every field in the search index and result preview before adding accounting scope data. Never index credentials, bank details, tax IDs, or document contents. |
| Notifications and activity | **Live baseline.** Intake activity and direct notification/deep-link behavior exist; Accounting wording is generic. | Review each notification for contact/scope disclosure and access checks; maintain actor exclusion and company scoping. |
| Central administrator view | **Partially protected.** Accounting scope/workload JSON is stripped from the central intake response; standard contact/request fields may still be visible to platform administrators. | Decide whether portfolio oversight should remain detailed for platform administrators or become aggregate-only. Document the authorized oversight model; do not describe the current view as aggregate-only. |
| Permissions and company scope | **Live server-side checks.** Intake access/assignment is company-scoped; Accounting-only internal workload review is restricted to platform administrators in the current role model. | Verify member/owner/admin cases, direct API access, search, notification deep links, and task context. Do not rely on hidden UI controls as enforcement. |
| Feature setting, retention, and backups | **Partially implemented.** The shared Reception feature setting and database snapshot/restore path exist; accounting JSON fields/config are included in current mapping. | Define retention/deletion and private-file onboarding rules before document collection. Verify restore behavior after any future schema/config expansion. |
| Loading, error, empty, accessibility | **Live baseline; audit required.** Existing loading/error/empty, modal focus behavior, responsive styles, and reduced-motion rules are reused. | Verify keyboard and screen-reader operation for the new phase buttons/expanders, form groups and errors, plus phone/tablet layouts at the supported breakpoints. | 

## UI parity specification

The Accounting page should be immediately recognizable as the Signature Exteriors Reception workflow from the user's screenshots. Reuse the portal's existing shell and component language, then apply the reference's screen hierarchy. The target is visual and interaction parity—not pool/design content. The page uses one compact Reception header, a horizontal phase rail, a search/filter area, compact inquiry rows, readable type, and expandable secondary details. The Accounting first view should stay quiet: show phase names/counts, primary search and quick filters, then the inquiries. Keep workflow explanations, duplicate counts, detailed filters, and queue metrics behind concise disclosures.

### Queue hierarchy and first view

1. **Portal shell:** Keep Aspect Accounting identity and Reception navigation active. Avoid stacking a duplicate “Aspect Accounting · Reception / Reception” module header and tabs above the intake. The intake itself begins with the small “Reception workspace” eyebrow, “Reception Intake” heading, one short accounting-focused explanation, and the primary blue **New accounting inquiry** action.
2. **Workflow rail:** Show four horizontally ordered accounting phases with counts, arrows on wide screens, and a short “View phase” action: initial contact/review, scope/discovery, capacity review, and engagement setup. Omit per-phase descriptions and duplicate instructions. Phase selection filters records. Custom stages go to an additional phase rather than disappearing. At narrow widths, horizontally scroll/snap the cards rather than shrinking text until it is hard to read.
3. **Search/filter panel:** Place search, exact status, workload fit, and the All inquiries / My inquiries / Due today / Overdue shortcuts in one clear panel below the phase rail. Keep owner/source/service/date/follow-up filters inside **More filters**. Nest the queue metrics and “My due” action as a concise **Queue summary** disclosure inside More filters so it does not add another row to the first view. Avoid repeating the active count or adding a long alert paragraph; the due/overdue quick filters and summary keep those items accessible.
4. **Inquiry cards:** Match the compact Signature row: organization/contact and requested service; a status pill; a short core-intake progress bar; the next action and follow-up state/date; and a right-side disclosure arrow. Do not show email/phone, full request summary, owner, fit/decision tags, created metadata, closure information, action buttons, contact log, or timeline in the collapsed row. Opening the row reveals those details and existing actions/history without losing the compact scan-first list.
5. **Secondary controls:** Keep status/service configuration below the records in a collapsed control for administrators. Keep More filters, queue summary, Scope & capacity, contact log, Timeline, closure details, and configuration collapsed until requested. Do not remove features to reduce visual density.

### Typography, spacing, and readability

- Treat the attached Signature screenshot as the desktop composition reference, but size type for readable use in the actual portal viewport. Body and form/filter text should generally be at least 14–16 px; supporting labels should not be reduced to tiny metadata. Keep organization names and next-step text visually prominent.
- Use white cards, subtle borders, clear section spacing, blue primary action/links, stage cards with counts, and a distinct selected-filter state. Retain company identity, existing icon set, and responsive shell.
- Use short headings and concise helper text. Avoid repeating the same active count or follow-up metric in multiple sections. Keep only the most actionable information expanded by default.
- Let long accounting names, contacts, and next steps wrap at tablet/mobile widths. Avoid clipping with ellipses when the truncated text is needed to decide what to do next.

### Form interaction and responsive behavior

- Keep the accessible centered, scrollable modal, backdrop, close control, validation feedback, save/cancel actions, edit-state preservation, Escape behavior, focus start/trap/return, and reduced-motion behavior.
- Keep first-contact fields short. Group additional accounting scope into progressive-disclosure sections (scope/volume; complexity/systems; records/timing; internal capacity review). A reception user should be able to create a useful inquiry without completing every discovery question.
- On tablet, wrap controls and reflow cards; on phone, use readable one-column form and inquiry layout, stack filter controls, retain horizontal workflow scrolling, and use sufficiently large touch targets. No page-level horizontal overflow.
- Keep semantic headings/labels, keyboard-operable phase buttons and disclosures, visible focus, selected/pressed states, inline live errors, save/action feedback, and distinct due/overdue/completed/closed states.

### UI content changes

Replace design/pool vocabulary, project/property questions, and generic lead prompts with organization, requested accounting scope, approximate volume and complexity, close/fiscal-year deadlines, current books/systems, records readiness, workload-fit assessment, and next-step prompts. Preserve the source's concise helper-copy style and avoid overwhelming first-contact reception with the full discovery questionnaire. Collect only what the team needs to assess fit; move document collection and detailed onboarding to a later secure step.

## Accounting qualification and workload-fit model

Separate **first-contact capture**, **discovery scoping**, and **internal acceptance review**. The current live form makes organization, contact name, a contact method, service, and short request summary required. Detailed scope fields and desired/deadline dates are currently optional. The longer discovery list below is the target question bank, not a requirement to make every answer mandatory at first contact.

### First-contact questions

- **Required today:** Organization/client name, primary contact name, at least one contact method, source, accounting service, and a brief description of the need.
- **Ask if readily known:** Desired start date and any external deadline. Label these as the client's requested timing; do not present them as an Aspect Accounting commitment.
- **Leave unknown answers blank:** Do not force a reception user to estimate transaction counts, cleanup duration, staff effort, or client readiness during the initial conversation.

### Workload-fit questions for discovery

- **What work do you need, and what is in scope?** Identify one-time cleanup, ongoing monthly close/bookkeeping, tax preparation or planning, payroll, sales tax, reporting, controller/CFO support, or another service. Ask which deliverables and periods matter first.
- **How much work is involved?** Ask how many legal entities and locations are in scope; approximate monthly transaction volume; approximate number of bank, credit-card, and loan accounts; number of employees/pay groups if payroll is requested; and number of sales-tax jurisdictions/filings if sales tax is requested. Allow “not sure” as an answer.
- **How complex is the accounting?** Ask whether the work includes inventory, job/project costing, multiple currencies, intercompany activity, restricted/grant funds, trusts, or other specialized accounting needs. Treat these as scoping flags for review, not automatic rejection criteria.
- **How current and complete are the books?** Ask for the last reconciled month/period, whether prior periods are behind, approximate catch-up months, availability of prior statements/reconciliations, and whether the previous bookkeeper/CPA is still involved.
- **Which systems are involved?** Ask accounting software, payroll provider, bill-pay/expense tools, POS/e-commerce tools, and whether the client can invite the accountant. Record product names and access readiness only; never collect passwords or security codes.
- **What timing is required?** Ask the desired start date, next close/reporting deadline, filing/payroll/sales-tax dates relevant to the requested work, and flexibility if current capacity cannot meet that date. Record dates as client requirements, not staff commitments.
- **What records and people are available?** Ask whether source records and opening balances are organized, who can answer questions, who approves the engagement, and expected client response time.
- **What effort estimate is already known?** If a prospect or referring professional has an estimate, record it with its source and assumptions as unverified. Do not treat client guesses as a capacity commitment.
- Follow-up owner, next action, and date for unresolved scoping questions.

Use branching by requested service where practical: payroll-specific headcount/pay frequency, sales-tax jurisdictions/filings, catch-up period for cleanup, and reporting/close deadlines for bookkeeping/controller work. Avoid displaying every service's questions to every prospect.

### Staff workload-fit assessment

After intake/discovery, the authorized Accounting reviewer should record:

- **Fit:** Likely fit, Needs scoping, Capacity constrained, or Outside services.
- **Rationale:** Scope/complexity/capacity summary and unresolved questions.
- **Capacity window:** Requested start date, earliest feasible start window, close/payroll/tax-calendar impact, and relevant owner/reviewer availability.
- **Internal effort estimate:** Rough hours or effort band by service/period, confidence in the estimate, and whether specialist/reviewer time is needed. Keep this internal; it is not a client quote or deadline commitment.
- **Capacity check:** Which team member/manager checked the current workload, what period was checked, and whether existing client deadlines or seasonality constrain the work.
- **Decision:** Proceed to engagement, request more information, schedule a later start, refer out, or decline; record who decided and when.
- **Next action, owner, and date:** Keep undecided inquiries visible in follow-up.

The live first release stores fit, decision, estimate, confidence, capacity window/period, rationale, and decision notes. It records the reviewing administrator and timestamp when a workload assessment is submitted. It does **not** currently record staffing capacity automatically or persist a dedicated “earliest feasible start” separate from the free-text capacity window.

Fit should be a human-reviewed outcome, not an automated capacity score or a promise of service or timing. A readiness indicator can help triage; acceptance depends on current staffing, deadlines, scope, and internal review. Distinguish **unknown** from **no** in scoping answers. Sensitive values and credentials must never be collected in Reception Intake. Engagement letters, tax returns, bank statements, payroll exports, and other client documents should be collected only through an authorized private-document/onboarding path after access and engagement are established. Keep first-contact questions brief and progressively reveal detailed scoping questions during discovery.

**Capacity-data dependency:** The current portal tracks inquiries, tasks, people, and calendar events, but it does not calculate team utilization, available hours, service capacity, or deadline conflicts. The first release addresses this with a human capacity-review step and fields for reviewer, checked period, effort estimate, rationale, and decision. An automatic fit result requires the separate capacity-planning model in the roadmap.

## Remaining implementation roadmap

The base framework is live. The work below completes the intake-to-accounting-setup operating flow; it is not a prerequisite for using the current capture, follow-up, configuration, and workload-review features.

| Priority | Work package | Concrete scope | Exit evidence |
| --- | --- | --- | --- |
| P1 | Tune the live operating labels | Use the Accounting Reception configuration screen to adjust status labels/order and services after staff have tried the live framework. Preserve stable IDs; document the meaning and entry/exit rule for each status. Keep `New`/`Closed` as required anchors unless a later migration explicitly changes terminal behavior. | Approved status/service list is saved in the Accounting config; Signature Exteriors config and records remain unchanged. |
| P1 | Reduce first-contact burden | Refactor the inquiry modal into short required first-contact fields plus expandable discovery groups. Keep organization, contact, contact method, source, service, and short summary required. Keep volume, books readiness, deadlines, complexity, and systems optional until discovery; show service-specific prompts only when useful. | A reception user can save a realistic initial inquiry without completing detailed discovery; existing saved values survive edits and validation errors. |
| P1 | Define accepted-client transition | Decide when “Ready for setup” advances to client onboarding and which party owns that handoff. Add a create/link-client action with duplicate detection and an intake↔client relationship only after acceptance. | Repeated handoffs do not create duplicates; permissions and history record the handoff; user can navigate both directions. |
| P2 | Add setup milestones | After the transition is defined, add typed events or an accounting setup checklist for engagement sent/signed, records requested/received, access verified, setup started/completed. Keep event actor, time, and readable detail. | Milestones append to the intake history and only appear for Accounting; they do not alter Signature's generic timeline. |
| P2 | Complete privacy/search/oversight review | Audit global/advanced search, notifications, central reception, task handoff, activity, and access-denied paths. Decide which platform-administrator views may show contact/request summary versus aggregate-only counts. Keep internal fit details and sensitive content out of broad surfaces. | Role-based checks demonstrate correct access through direct APIs, search, notifications, and tasks; approved central-view policy is documented. |
| P2 | Define retention and record lifecycle | Set the retention period and archive/delete behavior for open, closed, duplicate, and referred inquiries. Define authorized private-document collection only for post-acceptance onboarding. | Written retention rule, operational restore test, and approved secure file path before any intake upload feature is added. |
| P3 | Consider capacity planning integration | Only if the team wants a computed capacity result: model service skills, staff availability, current client workload, review constraints, seasonal deadlines, and effort estimates. Keep the current manual review until the model is validated. | A separate approved capacity model has explainable inputs and validation against real staffing/work estimates; no capacity promise is made from intake alone. |
| Release gate | Regression and usability review | Use synthetic Accounting inquiries only. Test member, assigned owner, unassigned member, and platform administrator; test desktop/tablet/phone, keyboard focus, filter behavior, edit/save, due/overdue, close/reopen, linked task, and Signature isolation. | Required test cases pass; no production test inquiries are created; final visual review is checked against the user-supplied Signature screenshot. |

### Capacity is a process dependency, not an intake calculation

The current portal tracks inquiries, tasks, people, and calendar events, but it does not calculate team utilization, available hours, service capacity, or deadline conflicts. The intake answers estimate demand; they cannot prove that Aspect Accounting can accept the engagement. The first release uses a human reviewer and records fit, rationale, rough hours/confidence, capacity window, and checked period. If an automatic or live fit result is desired later, it requires a separate capacity-planning model with staff skills/availability, existing client commitments, seasonal deadlines, and effort estimates.

## Architecture touchpoints

| Concern | Source of truth | Current state / invariant |
| --- | --- | --- |
| Company navigation and overview/queue rendering | `public/foundation.js`: company workspace rendering, `renderCompanyMarketing`, `renderIntakeQueue` | Accounting is detected by company ID `aspect-ventures`; preserve Signature's Marketing behavior. |
| Accounting form, filters, rows, modal, actions | `public/foundation.js`: `renderIntakeQueue`, intake editor and delegated company-workspace handlers | Accounting scope/workload fields are conditional; preserve modal focus/validation and expanders. |
| Queue and modal visual system | `public/styles.css`: Reception styles and Accounting-specific responsive rules | Keep the screenshot-matched hierarchy, larger text, readable controls, and progressive disclosure scoped to Accounting. |
| Storage and data mapping | `server.js`: `reception_intakes`, `reception_intake_events`, accounting JSON columns, `mapReceptionIntake`, snapshot/restore mapping | Accounting details/review remain company-specific fields; migrations/restores need safe defaults for older snapshots. |
| Status/service configuration | `server.js`: `company_reception_configs`, `defaultReceptionConfig`, `getReceptionConfig`; `public/foundation.js`: configuration editor | Stable status IDs are separate from display labels; config is per-company; Signature defaults remain independent. |
| Company queue and central queue APIs | `server.js`: `GET/POST /api/companies/:id/reception-intakes`, `GET /api/reception-intakes` | Company access enforced server-side. Central response currently removes accountingDetails/workloadReview but includes ordinary intake fields; do not claim aggregate-only visibility. |
| Update/lifecycle actions | `server.js`: `PATCH /api/reception-intakes/:id`, `/events`, `/follow-up/complete`, `/follow-up/reopen`, `/reopen`, `/create-task` | Preserve history, access checks, follow-up/task semantics, and company identity. |
| Global search | `server.js`: global/advanced search record builder | Core contact/service/request fields are included; accounting scope/review data should not be added without an explicit privacy review. |
| Reception availability setting | `public/settings.js`: `workspaceReception` | Existing organization setting continues to govern Reception availability. |
| Design/privacy source | `docs/portal-design-tracker.md`, “Reception intake” | Coordinate any broader changes to configuration, privacy, retention, or central oversight. |

**Architecture invariant:** Intake endpoints, enums, and much of the interface are shared. Any Accounting-specific fields, labels, statuses, services, filters, notifications, or policies must branch on the Accounting company/configuration and must not change Signature Exteriors defaults or existing records. Validate at the API boundary; hidden controls are not access control. Preserve stable status IDs and map older backup/database versions to safe empty Accounting JSON fields during restore.

## Completion criteria

Use these two checklists separately. The first establishes what the live framework already delivers; the second defines the remaining end state for the complete intake-to-client-setup plan.

### First-release framework (live)

- [x] Aspect Accounting opens directly to its Reception intake queue, with no extra Reception overview section, and has its own intake language, statuses/services, and workload-fit fields.
- [x] The live Reception queue follows the Signature screenshot hierarchy: single header/action, horizontal accounting workflow phases, search/quick filters, and compact inquiry rows. Clicking an inquiry opens its form directly.
- [x] The Accounting inquiry form is organized into Client, Scope, Review, and History tabs; questions use quick selections where practical, and history, contact logging, and record actions remain accessible.
- [x] Accounting-specific questions capture organization/contact, service, scope/volume, complexity, systems, books/readiness, and requested timing; internal staff can record a human workload review.
- [x] Core intake features remain: create/edit, owner and follow-up, search/filter, due/overdue actions, history/contact log, closure/reopen, task linking, configuration, overview/navigation integration, and responsive shell.
- [x] Current Accounting status labels/order and service choices can be tuned without changing Signature's status/service defaults.
- [x] The UI text and filter controls were increased and secondary card/metric content is progressively disclosed.
- [x] Trim the first-view copy further: remove repeated explanations, keep only phase names/counts and short actions, shorten the page heading/search labels, and move queue metrics into the collapsed More filters area while preserving filters and actions.

### Complete intake-to-setup workflow (remaining target)

- [ ] Reception and discovery forms are phased so first contact stays short; only necessary fields are required at each stage, and answers can remain unknown until discovered.
- [ ] Service-specific discovery prompts help estimate effort and deadline pressure without asking every prospect every question.
- [ ] Statuses have agreed entry/exit meanings, terminal/reopen behavior, and a documented transition when an engagement is accepted.
- [ ] The accepted engagement can create or link one deduplicated Aspect Accounting client and preserve a secure intake/client relationship.
- [ ] Typed discovery/engagement/records/access/setup milestones are available and recorded with actor/time/history.
- [ ] Search, notification, central oversight, activity, task, and direct-API paths pass a documented role/privacy review; central visibility policy is explicit.
- [ ] Retention, archival/deletion, backup/restore, and secure document handoff are defined before any intake document upload is introduced.
- [ ] Responsive, keyboard, screen-reader, role/access, lifecycle, and Accounting-vs-Signature regression cases pass using synthetic records only.
- [ ] Any later computed capacity-fit decision has a separately approved capacity data model and is validated against actual staffing/workload, not intake assumptions alone.

## Source references

- Shared intake UI and Accounting/Signature workspace: `public/foundation.js` (`renderIntakeQueue`, `renderCompanyMarketing`, company workspace rendering and delegated intake handlers).
- Shared schema, validation, company configuration, access control, lifecycle actions, search, notifications, and backup/restore: `server.js` (`reception_intakes`, `company_reception_configs`, `defaultReceptionConfig`, `mapReceptionIntake`, and `/api/.../reception-intakes` handlers).
- Reception setting: `public/settings.js` (`workspaceReception`).
- Shared component and mobile styles: `public/styles.css`.
- Company-specific intake configuration, privacy, and retention direction: `docs/portal-design-tracker.md`, section “Reception intake.”
- UI direction: the Signature Exteriors Reception screenshot supplied by the user; it establishes visual hierarchy and interaction patterns, not accounting questions or unverified pool-design fields.

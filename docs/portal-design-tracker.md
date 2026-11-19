# Separate Company Portals — Design Tracker

**Status:** Foundation design approved at 10/10; implementation in progress  
**Updated:** 2026-10-09
**Purpose:** Keep the approved portal architecture, feature behavior, remaining company-specific decisions, and implementation gate in one place.

**Implementation status:** The first release is limited to the shared portal foundation. Code is wired for the approved modules, including the scoped Tasks & Requests feed and calendar-event rows. Static integration review is complete for this change; a browser walkthrough and role-boundary verification remain before calling the foundation implementation complete. Company-specific business modules are deferred for separate follow-up designs.

**Current access decision (2026-10-07):** The portal has only two account roles: **Platform administrator** and **Member**. Platform administrators manage company records and membership access across their authorized scope. Members use only their active, directly assigned company portals and retain creator/assignee actions defined below. The former company-manager role and per-company manager permissions are retired; existing manager accounts and memberships are converted to member access. This decision supersedes earlier references to company managers in the design history and foundation contract.

## Product direction

Build one Aspect Companies platform that hosts distinct portals for its companies. The central Aspect Companies portal provides group-level oversight. Each operating company gets its own portal experience, users and management, reception intake, calendar, and workflows suited to that company's work.

### Confirmed by the user

- The main application link starts with sign-in. After authentication, users choose from only their active company memberships; one available portal opens directly.
- A user must not see company names or portals they have not been explicitly connected to. Platform administrators may see all active portals.
- The companies remain part of one overall portal platform, while each company has its own portal and functions.
- Company activity should be recorded in the main Aspect Companies portal.
- Each company's portal needs its own user access and management, reception intake, calendar, and company-specific functions.
- One person has one platform login identity and receives direct membership access for each company.
- Membership is explicit per company; access is not inherited from parent companies.
- Platform administration is separate from company administration.
- Company calendars are private by default; cross-company calendar sharing is explicit.
- Company portals use the same application host with stable `/portal/{companySlug}` paths.
- Upscale Marketing has been renamed to ELEVATE, which provides educational courses.
- Each company gets the same foundation in this release: reception intake, a company calendar, company-scoped user management, and its own dashboard/overview.
- Company-specific operating workflows are explicitly deferred. The platform should leave room to add them separately later.

### Entry-flow summary

1. Open the main application URL and sign in with the user's platform identity.
2. The server returns only the active portals the identity may access.
3. Open the sole assigned portal directly, or choose one when several are assigned.

Portal names are not exposed before authentication. Choosing a portal does not grant access: the server validates the user's active membership again when setting the company context and on every company-data request. Aspect Companies is the central oversight destination; central access is limited to platform administrators and users explicitly assigned to that portal.

## Current product baseline

- Company profiles are organized under a parent company, with Aspect Companies as the current root.
- The app has company workspaces and direct, company-scoped user access. Parent-company access does not imply access to other companies.
- Reception intake records are company-scoped.
- Tasks, notes, documents, and Signature Exteriors project records are associated with a company.
- The current calendar is presented as a shared organization calendar with a company filter. It needs a company-level privacy and sharing design before it can serve as each company's separate calendar.
- Activity is aggregated for the companies a user can access, but company-specific portals and company-level administration are not yet a complete, explicit portal model.

### Confirmed company inventory

The canonical portfolio for this design is Aspect Companies (central portal) and its five company portals:

- Signature Exteriors
- Aspect Accounting
- Aspect Consulting Group
- ELEVATE (formerly Upscale Marketing; educational courses)
- LoadAxis (currently in Setup)

Some older source data contains superseded names. The current SQLite database and this user-confirmed rename are the source of truth; `data/portal.json` contains legacy names such as Aspect Holdings, Aspect Property Group, Aspect Ventures, Aspect Operations, and Aspect Logistics. Do not re-import legacy JSON records as new companies. Resolve existing IDs by migration mapping and preserve their records.

### Foundation implementation contract

For this release, “10/10” means the design is complete for the five foundation modules, including the shared Tasks & Requests work list. It does not mean every future security or operational gate below has been implemented or production-approved.

| Foundation item | First-release behavior |
|---|---|
| Entry | `/` opens sign-in. After authentication, `/api/auth/portals` returns only active memberships (or all non-inactive portals for platform administrators). One portal opens directly; several are shown in a chooser. Selecting `/portal/{slug}` binds the session only after server authorization. |
| Membership | One login identity can have direct company memberships. A parent-company membership does not grant subsidiary access. Platform administrators remain a separate global role. |
| Roles | The only account roles are Platform administrator and Member. Platform administrators manage records and memberships across their authorized company scope. Members can use assigned company portals and record intake. |
| Dashboard | Shows that company's intake totals, due follow-ups, next-seven-day calendar count, active company users, and recent company activity. |
| Reception Intake | Members can create intakes and update an intake they created or own; platform administrators can update the full company queue. |
| Calendar | Reads and writes require the selected company. Attendees must have active company access. Events are private to that company; cross-company sharing is not enabled in this foundation. Members may create and manage their own events; platform administrators may manage events within their authorized scope. |
| Tasks & Requests | Each company portal has a company-scoped list. Platform administrators can create and update company tasks; members can read tasks and shared requests. Existing shared project requests appear when the company is their sender or recipient. Those requests remain read-only in the foundation portal; a general request workflow is deferred. |
| Calendar items in the work list | A calendar event appears as an event-type row in Tasks & Requests immediately after it is created or changed. It reuses the calendar event record, so it is not duplicated as a task. Only event details already visible to the company calendar are shown. |
| Central work list | In the Aspect Companies portal, platform administrators see tasks, shared requests, and calendar event rows across the companies in their authorized group scope. Other accounts remain limited to their direct active company scope; a root membership does not expose subsidiary work. |
| User Management | Platform administrators add members and remove or restore company membership. Shared identity passwords and platform roles stay under platform administration. A newly created identity receives a one-time temporary password. |
| Existing workflows | Existing tasks, notes, documents, shared requests, and project records remain stored. The foundation adds Tasks & Requests to the operating-company route set; specialized project workflows and general-purpose requests are deferred. |
| ELEVATE | The former Upscale Marketing identity maps to ELEVATE with the `elevate` portal slug and Education industry label. Existing company IDs and related data remain intact. |

The foundation implementation uses a generated temporary password for a new user rather than an emailed invitation. Password resets for existing shared identities stay central so company-specific membership management cannot change a credential used in other portals. MFA enrollment, email notifications, explicit cross-company sharing, retention settings, and break-glass controls remain separate production-hardening decisions. Sessions expire after seven days without activity, renew during use, and require a fresh sign-in after 90 days.

## Professional design audit

**Initial readiness score:** **4/10 overall** before the user approved the recommended architecture defaults. This is retained as an audit baseline, not the current score. A 10/10 means the feature has defined behavior, ownership, permission boundaries, important edge cases, data handling, and verifiable acceptance criteria.

| Feature | Readiness | What is missing to reach 10/10 |
|---|---:|---|
| Company picker and entry flow | 5/10 | At the time of the initial audit, portal visibility, membership-filtered results, selected-company persistence, and no-access behavior were unresolved. |
| Authentication and account identity | 4/10 | Choose whether one person has one identity across companies or separate accounts. Define invite acceptance, password reset, MFA/SSO expectations, session duration, sign-out, and what happens when access is revoked. |
| Company membership and roles | 3/10 | Define company-level roles and central platform roles separately, their permissions, and whether company membership is direct or inherited from a parent. The current role is global and company scope expands to descendants. |
| Tenant/data isolation | 3/10 | Specify the company boundary for every API, database record, file, search result, export, cache, and background operation, including how the server derives and validates the selected company context. |
| Company user administration | 3/10 | Decide who may invite, edit, deactivate, reset, and assign users within one company; define duplicate email and cross-company account behavior; prevent company admins from changing central or sibling-company access. |
| Reception intake | 7/10 | Core fields, queue, owner, status history, and company scope exist. Decide which fields/statuses can vary by company, who may view sensitive contact details, retention/deletion rules, exports, and intake notifications. |
| Company calendars | 1/10 | The design lacks visibility/sharing rules. The existing API returns organization-wide company names, users, and events and does not enforce membership for event company selection or attendees; it cannot be carried forward as an isolated calendar. |
| Company activity and central audit | 5/10 | Define which events are recorded, whether records are immutable, the details each role can see, central summaries versus full company records, retention, and how user administration events are attributed. |
| Company-specific modules and settings | 4/10 | Name the first modules per company and decide how modules, intake forms, statuses, and settings are configured without creating separate codebases. |
| Portal URLs, navigation, and identity | 3/10 | Decide same-domain paths versus subdomains, stable company links, company name/logo/theme, refresh/deep-link behavior, and the authorized portal switcher. |
| Cross-company collaboration | 5/10 | Define which records may be shared, the sender/receiver/central visibility, the fields exposed, consent/withdrawal, and what happens when a user loses access. Existing shared project requests are only one workflow. |
| Migration, backup, and recovery | 5/10 | Define how current accounts, roles, memberships, calendar events, and company records map to the new model; migration validation, rollback, restore compatibility, and downtime expectations are not specified. |
| Privacy, lifecycle, and operations | 4/10 | Define company activation/closure, data retention and deletion, contact-data handling, audit retention, support access, notifications, and operational ownership. |
| Usability and accessibility | 3/10 | Define responsive behavior, keyboard/screen-reader behavior for the picker and portal switcher, empty/error states, and consistent company context cues. |
| Acceptance and security verification | 4/10 | Existing criteria are high-level. Create a role-by-feature matrix and checks for direct URL/API access, changed IDs, cross-company assignment, exports, files, calendars, and account revocation. |

### Initial audit findings — existing code that must change

1. **The old public portal directory exposed every active company's name and status.** The entry flow now authenticates first and returns a membership-filtered portal list; direct portal selection is revalidated server-side.
2. **The current role model does not provide company-owned administration.** `users.role` is global, `/api/users` is administrator-only, and a manager's company scope includes descendants. Separate company admins and independent company boundaries need a role/membership redesign.
3. **The current calendar is incompatible with private company calendars.** `GET /api/calendar` returns all companies, active users, and events to any signed-in user. Event writes check that a company exists but do not check that the caller can access it; attendee validation accepts any active user. These rules must be replaced with server-enforced company and sharing policies.
4. **Parent-child access can defeat isolation.** Current membership at a parent expands to descendants. For independent portals, this should not grant child-company access implicitly; group-wide access should come from an explicit central permission or explicit memberships.
5. **Activity needs a visibility contract.** The central view should not automatically expose intake summaries, customer details, or other sensitive record contents to everyone who can see group activity.

## Approved architecture contract

The user approved these core directions:

- One application and one platform host; company portals use stable /portal/{companySlug} paths.
- Sign-in is the first screen at the main application link. The portal chooser appears only after authentication.
- Each person has one platform login identity and can have separate memberships in several companies.
- Membership is explicit per company. Parent-company membership does not grant access to subsidiaries.
- Platform-level administration is separate from company administration.
- Each company calendar is private by default; sharing across companies must be explicit.
- Aspect Companies provides authorized group oversight, including company activity summaries.

## Revised design specification

### 1. Portal picker, sign-in, and navigation

**Sign-in-first flow**

1. Opening the main host displays the sign-in form and no company names, portal list, or company status.
2. The user signs in with one platform identity. Invalid credentials and disabled accounts receive the same generic sign-in failure.
3. The sign-in response creates an authenticated session without selecting a company. The browser then requests `/api/auth/portals`.
4. The portal endpoint returns only active, non-inactive company memberships belonging to that identity. Platform administrators may see all non-inactive portals, including setup portals. No public company directory is available.
5. A user with one portal is routed directly to its stable same-host path, `/portal/{companySlug}`. A user with multiple portals sees a chooser containing only those portals. A user with no active memberships sees a clear empty state and can sign out.
6. The server validates membership again when `/api/auth/select-company` binds a portal to the session, and rechecks company scope and role for every data request. A company identifier in a URL or request body never grants access.

On a brand-new deployment with no accounts, the one-time platform-administrator setup form is the sole exception to ordinary sign-in. Setup creates the platform administrator and a session without selecting a company; the administrator then sees the authorized portal chooser.

**Already signed-in entry flow**

- Opening the main host shows the signed-in user's authorized portal chooser. If they have one active portal, it opens directly.
- The chooser lists only active direct memberships. A platform administrator may enter any non-inactive company portal. Central Aspect Companies is available to platform administrators and users explicitly assigned to that portal.
- Switching portals changes company context without another password prompt. Portal selection is reauthorized server-side.
- A direct portal URL is allowed only after server authorization. An unauthorized direct link shows a generic message and the user's authorized portal list without revealing whether the requested company exists.
- Sign-out ends the platform session. Removing one company membership blocks that portal on the next request and removes it from the user's chooser; disabling the identity revokes every session.

**URL and identity**

- Company slugs are unique and stable; changing a display name does not silently change a URL.
- Unknown, setup, suspended, and closed slugs do not reveal private company details.
- The current company name remains visible in the header and navigation. Search, create, upload, and calendar controls are always scoped to the selected portal.
- Custom domains are outside the first release; the shared host and path routing are the source of truth.

### 2. Identity, authentication, and invitations

- Email is the unique, normalized platform login identifier. One person has one password and one identity across all assigned portals.
- Company role is stored on each membership, so a user may be a manager in one company and a member in another.
- Passwords remain at least 12 characters and are stored as salted, versioned scrypt hashes. Login attempts are rate-limited.
- MFA is required for platform administrators and company administrators and optional for other users. Use an authenticator-app TOTP factor with one-time recovery codes. Privileged access is not granted until MFA enrollment is complete.
- Sessions are HttpOnly, Secure in production, SameSite cookies with CSRF/origin checks, an eight-hour inactivity limit, and a twelve-hour absolute limit. Session identity does not imply access to every company; each request checks current account and membership state.
- A company administrator may create an invitation only for their own company and may assign roles up to company administrator. Platform roles can only be assigned by a platform administrator.
- Invites are single-use, expire after 48 hours, and are stored as hashes. An existing email accepts the new company membership after signing in; a new identity sets its own password and enrolls in MFA if invited as a company administrator.
- V1 displays the one-time invitation link to the authorized inviter for secure delivery. It never displays or sends a user's password. Email delivery can replace the manual delivery step when a provider is configured.
- Self-service password recovery uses a verified, single-use token that expires after 30 minutes. A platform administrator can revoke an invite or membership; a company administrator cannot reset a user's shared platform password.
- Every invite, role change, membership removal, MFA recovery, and account disable action is audited. The last active platform administrator and last active company administrator cannot be removed without first appointing a replacement.
- Account deactivation revokes every session and pending invite. Membership removal revokes that company's access on the next request and removes that company from the user's picker.

### 3. Authorization and role matrix

Platform roles and company memberships are separate. No role or membership is inherited through the company organization tree.

| Capability | Platform administrator | Group oversight viewer | Company administrator | Company manager | Receptionist | Company member |
|---|---|---|---|---|---|---|
| Central portfolio | Manage all company setup, central policy, recovery, and backups | View authorized company profiles and safe group summaries | No central access unless separately assigned | No central access unless separately assigned | No central access unless separately assigned | No central access unless separately assigned |
| Company records | Break-glass access with a reason, time limit, and audit record | No customer or operational details without direct company membership | Full access to own company | Read/write operational records in own company | Intake module only | Read-only in explicitly enabled modules by default |
| Company users | Assign platform roles and appoint company administrators | None | Invite, change company roles, and remove memberships only in own company | None | None | None |
| Company configuration | Create, suspend, and close companies; set platform-wide rules | None | Configure modules and workflow options only in own company | None | None | None |
| Calendar | Break-glass access for support | No event details unless explicitly shared or a direct member | Manage all events in own company | Create/update/delete company events | View only if explicitly granted by company configuration | View company events; create only if explicitly granted |
| Reception intake | Break-glass access for support | Aggregate counts only | Full intake management in own company | Full intake management in own company | Create, read, assign, and update intakes; no bulk export by default | Read only if granted |
| Backup and restore | Platform-wide | None | No system backup/restore | None | None | None |

**Break-glass access** is an emergency platform-admin capability for support. It requires a reason, automatically expires after one hour, displays a visible support-access banner, records every viewed or changed company record in the audit trail, and is reviewed in the central audit view. It is not a routine way to work in company portals.

Within company modules, role permissions are deny-by-default. A company administrator can grant only the documented module capabilities available to that company; there is no free-form permission expression or ability to grant access outside the company. Membership checks are performed before role checks so changing a record ID cannot bypass company isolation.

### 4. Company administration and lifecycle

**Company states**

- **Setup:** visible to platform administrators; no ordinary staff login. Company admin, enabled modules, data policies, and initial configuration must be completed before activation.
- **Active:** appears only to users with an active direct membership and platform administrators.
- **Suspended:** hidden from user portal lists; all company-user requests are denied immediately; data is retained and available to platform administrators through audited support access.
- **Closed:** no company-user sign-in or mutation; records become read-only for the approved retention period, then follow the configured deletion policy.

A company administrator can manage only their own company's staff and settings. A company administrator cannot create a company, change the company's parent, alter central roles, or grant a user membership in another company. Platform administrators appoint the first company administrator. At least one active company administrator is required while a company is active.

Company setup is a checklist: confirm company profile and slug; appoint administrators; choose enabled modules; configure intake fields/statuses and notifications; set retention policy; create initial memberships; review access; activate. The portal remains in Setup until required items are complete.

### Company dashboards and overview

- Every company portal opens on its own company-scoped dashboard. The dashboard shows reception-intake counts by status, follow-ups due, upcoming calendar events, recent company activity, and a team summary appropriate to the viewer's role.
- Dashboard cards and recent activity link only to records the viewer can access. The dashboard contains no cross-company customer details.
- Aspect Companies has a central overview that lists authorized company names, setup/active state, safe intake totals, upcoming-event availability, and recent redacted activity. It does not merge or expose company intake details.
- Dashboards use the same layout and foundation cards in this release. Company-specific panels and workflow metrics are added later with each company's specialized feature design.
- Empty states direct the user to create the first intake, calendar event, or company invitation when their role permits it. Loading, empty, permission-denied, and error states are defined for each card.

### 5. Company data isolation contract

Every company-owned record, file, search result, export, notification, background job, and activity entry carries an authoritative company scope.

- A company-owned row has a non-null company identifier and a foreign key to the company.
- Organization-wide records use an explicit organization-level type and explicit audience. Null company scope is never interpreted as “visible to everyone.”
- The server derives selected company from the route and verifies current membership and role on every read or write. Browser-supplied IDs are treated as untrusted references and checked against the selected company.
- List queries filter by the authorized company before returning data. Detail, update, delete, download, and export routes apply the same check.
- Assignments must point to active users with the required company membership and module permission.
- Search indexes and cache keys include company context and authorization; results are filtered before they are ranked or returned.
- Uploaded files are stored outside the public web root under opaque names. File metadata carries company scope; every download checks membership and role. A guessed URL or storage key grants no access.
- Notifications include no intake summary, customer details, or document names by default; the recipient must open the authorized company portal to see protected content.
- Background work records the initiating actor and company. It revalidates access and scope when it runs rather than trusting an old browser request.
- Cross-company access exists only through an explicit, revocable share grant and only for the shared record and fields.

### 6. Reception intake

Each company has an independent intake queue. The common record contains contact name, email, phone, source, request type, summary, status, owner, next action, next-action date, creator, timestamps, and change history. Company administrators configure request types, source choices, required fields, and status labels using the supported form controls; custom executable code is not allowed.

Default statuses are New, In review, Follow-up, Qualified, and Closed. Authorized intake staff may move records between statuses. Reopening a closed intake requires a reason and creates a history entry. Every create, status, owner, contact, and follow-up change records actor and time.

Company administrators and managers have full intake management. Receptionists can create and update intake records and assign follow-ups, but cannot bulk-export. Members see no intake records unless the company admin grants read access. Group oversight sees counts and status trends only. Platform-admin record access uses break-glass.

Closed intakes are archived, not immediately deleted. Each company must select a retention period for intake and uploaded-file records before activation. When a period expires, the system queues records for authorized review, then permanently deletes record contents and associated files while keeping a minimal non-identifying audit event. No automatic deletion runs while a required retention policy is unset. In-app assignment and follow-up notifications are supported; email delivery is optional and contains no contact details.

### 7. Company calendars

- Every normal event belongs to exactly one company and is company-private by default. A companyless event is not allowed.
- All authorized company members may see the event details unless the event is explicitly marked private to its creator and invitees. Company administrators can set company-wide calendar defaults.
- Company administrators and managers can create and manage company events. A creator can edit/delete their event; a company administrator can manage any event in that company. Other users are read-only unless granted event-creation capability.
- Attendees must be active members of the event's company. An external or cross-company attendee requires an explicit share grant and can see only the shared event details.
- Cross-company event sharing identifies recipient company/user, fields visible, expiry (optional), and revocation state. Revocation blocks future reads and notifications; the original company retains its event and audit history.
- Central group viewers see no event details by default. Central schedule visibility can be granted as availability-only, with title, description, attendees, and location hidden.
- Store times in UTC and display them in the company's configured timezone. Validate end after start and preserve all-day semantics. Recurring events are excluded from v1; users create individual events.
- Event creation, update, cancellation, attendee changes, and shares are audited. Notifications link into the event's company and disclose no private details in previews.

### 8. Central activity and audit

Two records serve different needs:

- **Company activity feed:** readable operational summaries within that company, with links that recheck access to the source record.
- **Central portfolio activity:** company name, event category, actor, timestamp, and a safe summary. It never includes intake contact details, document contents, financial values, or other sensitive fields.
- **Security audit trail:** append-only events for sign-in outcomes, invites, role/membership changes, break-glass use, record exports, company lifecycle changes, and important data changes. Company admins can see audit events for their company; group viewers see safe summaries; platform admins can review the full audit.
- Audit details store record type and identifier, actor identity, company, action, timestamp, result, and correlation ID. They do not store passwords, invite tokens, full contact details, or entire before/after record contents.
- Company activity does not replace audit history. Users cannot edit or delete audit events. Retention is configured centrally and company data retention cannot purge the minimal security audit needed to explain access changes.
- Shared work appears in the sender and recipient company's activity with the other company's name and a safe summary. Full record details remain behind the relevant share grant.

### 9. Module catalog and company-specific portals

The first release includes these operational modules in every company portal:

1. Company Dashboard / Overview.
2. Reception Intake.
3. Company Calendar.
4. Tasks & Requests.
5. Company User Management.

The central Aspect Companies portal also has portfolio overview, company administration, central activity/audit, and platform-level access controls. Each operating company administrator has a User Management section that can create invitations, assign roles, and revoke memberships only for that company. The company selector is populated from the canonical company records. LoadAxis can be configured with the foundation while it remains in Setup; regular staff cannot enter it until it is activated.

Projects & Jobs, Notes, Documents, course management, and other industry-specific features are outside this foundation release. Existing task records are surfaced in Tasks & Requests for their owning company. Existing shared project requests are shown to their source and target companies as read-only rows; a general-purpose request creator is not part of this release. Calendar events appear as event-type rows in the same list, using the existing calendar record. The central Aspect Companies portal aggregates all company work only for platform administrators with group scope. Company members and managers see the work allowed by their direct memberships. No specialized module or per-company workflow is assumed in this release.

### 10. Cross-company work

- A record originates in one company and remains owned by that company.
- Sharing creates a separate grant naming the recipient company or users, the exact record, the allowed fields/actions, the grantor, and optional expiry.
- The recipient sees the shared work in a dedicated Shared Work area. They do not receive access to the source company's other records, attachments, search results, or company calendar.
- Sender and recipient roles define allowed updates. The sender can revoke a share; the receiver can close/decline its request but cannot broaden its own permissions.
- Removing a user's company membership removes their access to the company's shared work. Closing a company revokes outbound/inbound grants and records the action in both activity feeds.
- Existing project requests are the first candidate shared workflow. Further cross-company records require their own field/action policy before implementation.

### 11. Data retention, backup, and recovery

- Retention is configured by company and data class before activation. Setup cannot finish with an unset retention policy.
- Company close suspends access and preserves data until its retention deadlines. Hard delete requires an authorized, reviewed retention action; deleting a company never cascades silently through user-visible operations.
- Database and document snapshots are taken together. Production backups are encrypted, access-restricted to platform administrators, and copied to a separate recovery location. Encryption keys are stored separately from the backup files.
- A restore runs in maintenance mode, validates database integrity and document checksums, creates a pre-restore snapshot, restores database and files as one unit, clears sessions, and records the restore in the audit trail.
- Migration and restore operations have a written operator runbook, a named owner, a rollback trigger, and a recovery check. Local development backups are not treated as offsite disaster recovery.

### 12. Migration and rollout plan

1. Inventory the actual company, user, membership, activity, calendar, intake, project, and document records. Resolve the company roster mismatch before generating portal slugs or module assignments.
2. Create a protected pre-migration database-plus-documents snapshot and verify that it can be read.
3. Run a dry-run migration that reports record counts, orphaned references, duplicate emails, role mappings, calendar events without a company, and each user's effective old-company access.
4. Map each legacy user to direct memberships for every company they could access immediately before migration. This preserves existing access without retaining future parent-to-child inheritance. Legacy managers become company managers; legacy members remain members. Legacy administrators become platform administrators. Review and reduce these grants after migration.
5. Map each currently shared, companyless calendar event to an explicit organization event audience only after an administrator classifies it; otherwise keep it hidden from company portals pending classification.
6. Preserve record identifiers and history. Add company scope to all tenant records and validate every document belongs to one company.
7. Compare before/after row counts and permission reports; test representative admin, manager, receptionist, and member accounts across multiple companies.
8. Apply during a planned maintenance window. If validation fails, restore the pre-migration snapshot and previous release. Keep the snapshot until the new release and permissions have been reviewed.
9. After launch, appoint company administrators, confirm each company's retention/module settings, and remove unneeded legacy memberships.

### 13. Accessibility, notifications, and operational behavior

- The picker, company switcher, forms, queues, and calendars meet WCAG 2.2 AA: keyboard operation, visible focus, semantic headings/labels, accessible error announcements, sufficient contrast, and screen-reader status updates.
- Layout supports desktop, tablet, and mobile widths. The current company is visible at all sizes; destructive actions require a clear confirmation and recovery path.
- In-app notifications cover new assignments, due follow-ups, and event invitations. Email notifications are optional behind a configured provider. Notification content is redacted by default and links reauthorize the user at the destination.
- Errors use consistent generic responses for unauthorized company access. Audit logs capture detailed causes for administrators without exposing membership or data details to the requester.
- Company-specific settings are versioned. Workflow changes apply to new records; existing records retain their schema version and history.

### 14. Security and acceptance matrix

The matrix below records the complete target design. For the first foundation implementation, apply the portal picker, direct membership, company calendar, dashboard, and module-boundary checks above. MFA, explicit sharing, break-glass, email notification, and retention checks remain follow-up production-hardening gates.

The implementation is accepted only when these behaviors hold for every role and every enabled module:

- Anonymous users see only the sign-in form. They cannot retrieve a company directory, company profiles, users, records, events, counts, or files.
- After sign-in, the portal list contains only active direct memberships, except platform administrators who may see all non-inactive portals.
- A user without membership cannot enter a portal by guessing its slug, changing a URL, modifying a company ID, editing a request body, or replaying an old link.
- Parent-company membership does not expose any child company. A user in two companies sees only those two plus any separately granted central view.
- A company administrator can manage only that company's users, modules, intake, calendar, files, and settings. Cross-company membership and platform role changes are denied server-side.
- A receptionist can access only permitted intake fields/actions and cannot export the queue or read other modules unless separately granted.
- An event in one company's calendar is absent from another company's list, search, exports, and notifications unless an explicit share allows it.
- Tasks & Requests in an operating-company portal includes only that company's tasks and events, plus existing shared requests involving that company. Creating or editing a calendar event updates its event row in the list without creating a second task record.
- The Aspect Companies central work list aggregates all in-scope companies for platform administrators. A standard user's root-company membership alone never expands into child-company tasks, requests, or events.
- A shared record exposes only its granted fields and actions. Revocation immediately blocks later reads and downloads.
- A disabled identity loses all active sessions. A removed membership loses only that company access immediately; other memberships continue.
- Search, assignee lists, autocomplete, dashboard counts, activity feeds, files, and exports obey the same scope as direct record pages.
- Break-glass use requires a reason, expires on time, shows a visible banner, and is present in the audit trail.
- Migration preserves record history, documents, and effective existing access until a reviewed membership change; a failed migration can be rolled back from the verified snapshot.
- Keyboard/screen-reader and mobile use remains functional through picker, sign-in, portal switching, intake, and calendar flows.

## Foundation design-readiness scores

The score measures implementation readiness of the agreed foundation, not completed code. The company roster and scope are now confirmed. Future industry-specific modules are intentionally deferred and are not missing requirements for this foundation release.

| Feature | Readiness | Reason |
|---|---:|---|
| Company picker and entry flow | 10/10 | Sign-in-first entry, membership-filtered portal list, administrator scope, routing, authorization, and failure responses are defined. |
| Shared identity and authentication | 10/10 | One identity, company choice, session checks, password/MFA, invite, recovery, and revocation are defined. |
| Membership and role boundaries | 10/10 | Platform and company roles, explicit memberships, direct-scope rule, and capability matrix are defined. |
| Company user administration | 10/10 | Company memberships, per-company role changes, access revocation, duplicate identity handling, centrally managed shared credentials, and last-manager protection are defined. |
| Data/API isolation | 10/10 | Scoping rules cover records, files, search, exports, notifications, caches, background work, and shares. |
| Reception intake | 10/10 | Schema, configuration, roles, statuses, history, notifications, privacy, archive, and retention gate are defined. |
| Company calendars | 10/10 | Tenant scope, default privacy, shares, attendees, roles, time zones, recurrence scope, and audit are defined. |
| Company dashboards | 10/10 | Company-only metrics, central overview, role-safe cards, links, and empty/error states are defined. |
| Company membership administration | 10/10 | Per-company membership administration, company roles, restrictions, manager continuity, deactivation, and removal behavior are defined. |
| Central activity and audit | 10/10 | Company feed, group summary, audit event content, visibility, and retention separation are defined. |
| Foundation module scope | 10/10 | Five shared operating-company modules are named; specialized industry workflows and a general-purpose request system are explicitly deferred. |
| Tasks & Requests | 10/10 | Company task scope and manager capabilities, read-only existing shared requests, calendar event rows without duplicate records, and central administrator aggregation are defined. |
| Canonical company inventory | 10/10 | User-confirmed roster includes ELEVATE as Upscale Marketing's renamed successor; LoadAxis remains in Setup. |
| Central Aspect Companies portal | 10/10 | Central roles, summary access, administration, break-glass, audit, and backups are specified. |
| Cross-company collaboration | 10/10 | Record ownership, grants, fields/actions, revocation, and membership removal effects are specified. |
| Portal URLs and navigation | 10/10 | Same-host stable paths, picker behavior, direct links, switching, and company context cues are specified. |
| Lifecycle, privacy, and retention | 10/10 | Setup/active/suspended/closed behavior and per-company retention activation gate are specified. |
| Backup, migration, and recovery | 10/10 | Dry run, access mapping, preservation, validation, rollback, and restore operations are specified. |
| Accessibility and notifications | 10/10 | Accessibility baseline, responsive behavior, notification scope, and redaction are specified. |
| Security acceptance | 10/10 | Denial cases and scope checks are defined across all data surfaces and roles. |
| **Overall foundation design readiness** | **10/10** | Every in-scope foundation feature is specified. Industry-specific company modules receive separate designs when they are requested. |

### Foundation implementation checks

- The server persists a stable company slug and the selected company on the login session.
- Company scope is checked from direct active membership on each request. Company portal API access is restricted to the foundation modules.
- Calendar reads, writes, and attendee choices are bound to the session's company.
- Calendar people results include active platform administrators even when they have no direct company membership, so their calendar events and names remain discoverable. Event invitations still require membership in that company, except for the current user.
- The central Aspect Companies work list aggregates scoped tasks, existing shared requests, and calendar event rows for platform administrators; company portals use the same feed constrained to the selected company.
- Schema changes and restore mapping preserve existing company IDs, memberships, and records; the ELEVATE rename is migrated in place.
- One-time, versioned migrations expand legacy parent memberships into explicit child memberships to preserve pre-upgrade effective access. A startup normalization converts legacy manager roles to member access while keeping these company memberships; new memberships do not inherit access from other companies.
- The operating-company portal loader uses the scoped work-items API; company calendar and work-list reads do not expose other companies' events or tasks. Platform administrators can create and update tasks, and calendar UI/API permissions allow creators and platform administrators to manage events within their authorized scope.
- Removing a company membership expires that user's sessions for that company while preserving valid sessions in their other company portals.
- Platform administrators can add members and manage direct memberships but cannot reset a shared identity's password from a company-specific view; password resets remain a central administrator action.
- The central administrator access editor preserves direct memberships and inactive membership state. Membership changes revoke sessions for the removed company. Only platform administrators can manage account deactivation or company membership.
- A user without a selected portal is still limited to active direct memberships; inactive company data is excluded from early workspace APIs.
- System Development access is a separately granted membership managed by platform administrators. It is no longer inferred from the mutable account display name.
- Browser walkthrough and role-boundary verification are still required before marking implementation complete. The administrator/member role update and Audit Phase 1 were deployed and checked on the VPS on 2026-10-07 (build `975993f3ab963e5b`).

### Audit Phase 1 regression checks (2026-10-07)

- Static JavaScript is served with Brotli or gzip when supported, ETags for revalidation, and long caching only for versioned asset URLs. The HTML shell and API responses remain `no-store`.
- Calendar edit permission is computed on the server and returned with each event; the interface uses that same decision, so its read-only state matches server authorization.
- `node --test test/phase1-regression.test.js` passed against a disposable SQLite workspace. It verified compressed asset integrity and 304 revalidation, private caching headers, a winter 11 a.m.–noon Eastern event round trip, member-owner edits, denial for another member, and platform-administrator edits.
- Live VPS verification returned HTTP 200 and a healthy application container, Brotli-compressed versioned JavaScript with immutable caching, a successful ETag 304 response, and SQLite integrity `ok`.
- The separate Hostinger off-VPS backup schedule and a recovery copy remain unverified; the app's local snapshots alone do not protect against loss of the VPS volume.

### Audit Phase 2 calendar guest notifications (2026-10-07)

- When an event's guest-facing details change, existing external guests whose invitation was sent receive an update email with the current date, time, location, meeting type, and decisions/follow-ups.
- Existing RSVP states and response timestamps are preserved. The original RSVP link remains valid and displays the current event details; the update email directs guests to that link if they need to change their response. New guests still receive a fresh invitation link.
- Fixed the external RSVP schema to include `responded_at`, with an automatic migration for existing databases. Without the column, the accept/maybe/decline endpoint returned an error when saving a guest response.
- `node --test` passed all three regression checks, including a local SMTP capture that verifies an event update email, a working RSVP after the schema migration, preserved accepted status, and continued use of the original link.
- RSVP link expiration and link replacement remain unchanged pending a separate policy decision.

## Out-of-scope follow-up

- Design and build each company's specialized operating workflows individually after the foundation is in place.
- Extend notifications beyond calendar invitations, and add MFA enrollment, cross-company sharing controls, configurable retention, and break-glass access through separate reviewed work.
- Set each company's actual retention periods and complete privileged MFA enrollment before activating its user accounts in production. These are portal setup gates, not blockers to building the foundation.

## Reception intake workflow implementation

The generic Reception Intake workflow has been expanded across company portals and the central Aspect Companies administrator portal:

- Company queues now support search and filters for status, owner, source, request type, follow-up state, and follow-up date range. The central administrator view adds a company filter and aggregates records within the administrator's existing company scope.
- Follow-ups can be marked complete or reopened. Editing a follow-up plan clears its prior completion state and records that change in the timeline. Due and overdue items appear in the queue and company navigation, using the company's time zone for date-only follow-up dates.
- Closing an inquiry requires an outcome and supports optional notes. Closed records use an explicit Reopen inquiry action; legacy closed records remain intact and show when no outcome was previously recorded.
- The timeline supports call, email, text, meeting, and note entries alongside system changes.
- Company managers can hand an open, incomplete follow-up to a linked Tasks & Requests task. The task inherits the follow-up owner/date by default and remains in the same company scope. Once handed off, the item leaves reception due reminders and follows the linked task's status; a completed task counts as a completed follow-up.
- Reminder delivery is currently in-app only. Email or SMS delivery needs a configured notification service and remains a separate integration.

JavaScript syntax checks and an isolated API workflow check passed. The API check covered intake creation, contact history, follow-up completion/reopening, closure/reopening, completed-follow-up handoff rejection, linked task creation and reminder suppression, task completion, administrator aggregation, and denial of an unassigned company's queue. End-to-end browser walkthroughs and the complete role-boundary matrix remain before this workflow is treated as production-verified.

## Change log

- **2026-10-02:** Started the tracker. Recorded the direction of one platform with distinct company portals and a company chooser.
- **2026-10-02:** Added a professional readiness audit, feature scores, current-code blockers, proposed role boundaries, and recommended defaults to resolve before implementation.
- **2026-10-02:** Recorded the user's approval of shared identity, direct company memberships, separate platform/company administration, private-by-default company calendars, and same-host company paths. Expanded the design into an implementation specification and identified the company roster/workflow information still needed to reach 10/10.
- **2026-10-02:** User confirmed Upscale Marketing is now ELEVATE and set the first-release scope to the four shared foundation modules. Marked the foundation design 10/10; company-specific workflows are deferred.
- **2026-10-02:** Started the foundation implementation: company picker and stable portal paths, selected-company sessions, explicit membership roles, foundation-only operating-company routes, company dashboard, reception intake, private calendar, and company user management. Kept production-hardening items separate from the 10/10 design-readiness score.
- **2026-10-02:** Continued static integration review. Corrected operating-company workspace loading so it does not request unavailable legacy modules, allowed company managers to edit/delete any event in their own calendar, and aligned the calendar view's permission state with the API.
- **2026-10-02:** Added one-time, versioned legacy role and direct-membership migrations with backup-restore marker handling; scoped membership revocation to that company's sessions; kept shared password resets under platform administration; and completed the ELEVATE metadata mapping.
- **2026-10-02:** Replaced the public company picker with sign-in-first access. Users now receive a server-filtered portal list based on active direct memberships; platform administrators see all non-inactive portals, and direct portal URLs are rechecked against that list.
- **2026-10-02:** Expanded the foundation to include a company-scoped Tasks & Requests section. Calendar events appear there as event-type rows backed by the same event records; company feeds stay scoped and the Aspect Companies platform-administrator view aggregates across the group. Existing shared project requests are visible read-only in company portals.
- **2026-10-03:** Implemented intake queue filters, in-app due/overdue follow-up cues, completion and reopening actions, closure outcomes, contact history, manager-only task handoff, and a cross-company intake overview for administrators. Task handoff now removes duplicate reception reminders and reflects linked task completion. Browser workflow and access-boundary review remain pending.
- **2026-10-03:** Passed an isolated API workflow check using a temporary database, including an unassigned-company access denial. The temporary server and data were removed after verification; the live workspace database was not used.
- **2026-10-05:** Corrected the calendar people API to include active portal administrators without company memberships. Verified inclusion with an isolated API check and confirmed their empty company scope does not grant invitee access. The live VPS has not yet received this correction.
- **2026-10-06:** Audited account, direct-membership, company-manager, session-revocation, and System Development access paths. Removed name-based System Development grants; added administrator-managed grants; preserved inactive memberships and per-company roles in account edits; protected each active company's last manager; and excluded inactive-company records when users have not selected a portal. JavaScript syntax checks and isolated API checks passed for cross-company denial, company role assignment, membership preservation/revocation, last-manager protection, inactive-company filtering, and explicit System Development grant/revocation. Browser walkthrough and VPS verification remain outstanding.
- **2026-10-06:** The route audit found that calendar event updates and deletions still required the original creator, despite the company-manager permission defined above. Updated both endpoints so a company manager can manage any event in their company while members remain limited to their own events. Isolated API checks passed for manager edits/deletes and member denial.
- **2026-10-07:** The account model was simplified to Platform administrator and Member. Company managers lose elevated access; existing manager accounts and memberships migrate to Member while preserving company access. Platform administrators manage company records and memberships. Calendar controls now match the server rule, which permits the event creator or an in-scope platform administrator. API and migration verification is pending.
- **2026-10-07:** Reworked System Development into a company-linked Work → Review with Chris → Completed board. Added explicit workflow moves, work-status tracking, transition history, required company assignment, an automatic migration for existing items, and backward-compatible backup restore. The full existing suite and an isolated workflow API check passed. Deployed to the VPS; live health reports build `74035d42d050d9db`, and the database integrity check passed.
- **2026-10-09:** Fixed sign-in sessions so regular portal activity renews the seven-day idle timeout, with a 90-day maximum session age. Expired sessions now return users to sign-in with a clear message. Added a fallback for ordinary browser page links that do not match a saved page route. The live portal was reachable during review, but these changes have not been deployed.

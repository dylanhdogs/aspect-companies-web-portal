# Aspect Companies Portal

A local workspace foundation for Aspect Companies and its related businesses. Company profiles are stored in SQLite with explicit parent-company links. Users sign in with individual accounts and receive access according to their role and company scope.

## Run locally

Requires Node.js 22.13 or newer (the built-in `node:sqlite` module is used; no package installation is required). Double-click **Start Aspect Portal.bat** to launch the server and open it in your browser. The launcher maps a UNC-hosted project share to a temporary drive and starts Node directly, so it also works when this folder is on a network share. It checks the Node.js version and SQLite support before starting. If the server code has changed since the current process started, the launcher asks you to stop the old terminal with Ctrl+C before reopening it.

Open [http://localhost:3000](http://localhost:3000) if the launcher did not open a browser. Sign in first; the portal chooser then shows only the active companies assigned to your account. If you have one portal, it opens directly. The first local visit prompts you to create the initial platform administrator, who can then choose from the available portals. Use a private password of at least 12 characters. Production setup also requires a one-time code configured by the VPS operator; see the Hostinger deployment guide. No account or password is preconfigured.

## Regression checks

With Node.js 22.13 or newer, run `node --test test/phase1-regression.test.js`. The checks start a temporary isolated portal, verify compressed and revalidated static files, and exercise calendar time-zone conversion and edit permissions. They do not use the local workspace database or production records.

## Company access pilot

Double-click **Start Aspect Portal Pilot.bat** to open an isolated pilot workspace at [http://localhost:3001](http://localhost:3001). The pilot stores its database, documents, and snapshots in `%LOCALAPPDATA%\AspectCompaniesPortalPilot`; the regular launcher continues to use `data/` on port 3000. The pilot data stays on the computer that starts it and is separate from the project share. On the first pilot visit, create a separate administrator account with a private password.

The pilot database starts with synthetic tasks and notes marked **[PILOT SAMPLE]** in Signature Exteriors and Aspect Accounting. Sign in first; each user sees only portals granted through active memberships. Platform administrators can use **Manage access** from the central Aspect Companies portal to create accounts and assign company access. The portal has two roles: platform administrator and member. Administrators manage company records and memberships; members use only their assigned portals and can update records they created or own. Calendar events also appear as event rows in Tasks & Requests. Members can manage events they create; platform administrators can manage events in their company scope. Use only synthetic information while reviewing the pilot.

The sample records are added when the initial administrator account is created. Restarting the pilot server keeps its current pilot data; use **Ctrl+C** in its terminal to stop it. The pilot and regular portal do not share users, database records, sessions, or documents.

If you forget the pilot administrator password, use **Recover Aspect Portal Pilot Admin Access.bat**. Do not use the regular portal’s recovery utility for the pilot account.

## Data and access model

- SQLite database: `data/portal.sqlite` (created on first launch).
- Private company documents: `data/documents/` (not served as static web files; access is checked through the authenticated API).
- Local recovery snapshots: `data/backups/` (each snapshot contains one SQLite database copy, its related company documents, and a manifest).
- Existing `data/portal.json` sample companies and activity are imported once when the database is empty. The JSON file is not used as the live data store after import.
- Company records have a nullable `parent_id`; Aspect Companies is the root. New profiles choose a parent company.
- The starter organization uses Aspect Companies as the parent of Signature Exteriors, Aspect Accounting, Aspect Consulting Group, ELEVATE, and LoadAxis. ELEVATE provides educational courses. LoadAxis is in setup.
- The main application link shows sign-in first, followed by a portal chooser limited to the user's active memberships. Platform administrators can choose any non-inactive company. Each portal also has a stable `/portal/{companySlug}` path. The operating-company portal foundation contains its own dashboard, Tasks & Requests, Reception Intake, private Calendar, and company-scoped User Management. Tasks & Requests shows that company's tasks and calendar events, plus existing shared project requests involving the company. Calendar events use their existing records and are not duplicated as tasks. In the Aspect Companies central portal, platform administrators can view the consolidated work list across the group; other users remain within their company memberships. Company-specific business modules are deferred for individual designs.
- Company notes are scoped to a company. Platform administrators can create, edit, and delete notes; members can read them. Notes are stored in SQLite and included in local database snapshots.
- Each company portal has a Reception Intake queue for recording inquiries, contact details, request context, source, owner, and next follow-up. Members can record inquiries and update their own or assigned intake; platform administrators can manage the full company queue. Status and follow-up changes keep a dated history, and intake records are included in SQLite snapshots.
- LoadAxis starts in setup with its industry, location, owner, and team size left unspecified until those details are confirmed.
- Platform administrators can mark a company profile reviewed after verifying its name, legal name, industry, location, owner, and team size. Editing one of those facts clears the review flag unless the editor confirms the changed details in the same save.
- **Platform administrator:** central platform access; can choose any company portal and administer platform accounts and companies.
- **Member:** uses assigned company portals and can record reception intake. Membership grants access only to that company; it does not grant access to parent, subsidiary, or sibling companies.
- Company memberships grant portal access only; there is no manager role within a company. Platform administrators assign or remove memberships. Platform administrators can grant or remove Collaboration access explicitly in **Manage access**.
- Collaboration is limited to its authorized team. Teammates create ongoing shared projects for a topic or goal, post updates and replies, and organize follow-up work and shared files. Company links and related meeting dates are optional context; projects move through Active, Needs review, and Resolved.
- Signed-in users can open account settings to review their account and change their own password. The Help center and Data & privacy panel explain the portal’s workflows and current data handling.
- A person uses one login identity with separate membership and role assignments for each company. Platform administrators add company users; a person with an existing account can be given another company's membership without creating a duplicate identity. New accounts receive a temporary password that must be replaced at first sign-in.
- On upgrade, existing parent-based access is captured as explicit memberships for the companies the user could previously access. Legacy manager roles are converted to member access while preserving those company memberships. New memberships never inherit access from parent or child companies.
- Only platform administrators can change company membership or account status. Shared account passwords and platform roles remain centrally managed. Removing a membership ends sessions for that company while preserving the user's access to other company portals. Platform administrators can edit and delete events in their company scope; members can edit and delete events they created.
- Company profiles include an access-controlled document area with categories, notes, file downloads, and deletion.
- The Client directory stores a company, client name, contact name, email, phone, location, and notes. Platform administrators can import `.xlsx` or `.csv` lists with a downloadable Excel template; preview marks invalid rows and duplicates before import, and duplicate records are skipped rather than overwritten.
- Tasks are company-scoped and appear in Tasks & Requests for users with access to their company. The Aspect Companies central portal aggregates tasks, requests, and event rows across the group for platform administrators. Existing shared project requests appear as read-only list entries in company portals; project-specific workflows remain in the Signature Exteriors module and general-purpose requests are deferred. Company notes, documents, and Signature Exteriors project data remain available in their existing workflows for future company-specific designs.
- In-app notifications are stored per user. Task and intake owners, project owners and milestone assignees, collaboration teammates, and calendar invitees receive relevant changes; the actor is excluded. The top-bar bell shows the recipient's unread count, and each person can mark one or all messages read. The server rechecks company membership or explicit Collaboration access when listing or updating notifications. The browser refreshes the count every 30 seconds while active.
- Signature Exteriors projects track job numbers, customers, sites, overall status, lifecycle stage, an assigned owner, dates, estimated value, and notes. The default board groups jobs into Lead, Estimating, Approved, Scheduled, In progress, and Punch list; platform administrators can move a job between stages, with changes recorded in its activity history. Search and overall-status filters apply to both the board and list view. These starter stages can be tailored to the company’s actual process. Platform administrators can add assigned milestones with due dates and attach job documents. Project documents use the same private storage and access checks as company documents and are included in backups. Platform administrators can send shared requests to other companies; staff in either company can view them, while platform administrators in the sending or receiving company can update them.
- Administrators can create, restore, and remove local database-plus-document snapshots from the dashboard.
- Global search and Advanced Search cover companies, Signature Exteriors jobs, tasks and shared requests, calendar events, reception inquiries, document names and notes, and people attached to the signed-in user’s accessible companies. Search results are permission-scoped by the server. Advanced Search adds company, status, owner, update-date, category, sort, layout, and pagination controls; saved searches are stored in that browser. Document contents are not indexed. The Activity page shows the latest updates permitted by the user’s company access, including company note creation, edits, and deletion.

## API foundation

- `GET /api/health` — service and database status
- `GET /api/auth/status`, `POST /api/auth/setup`, `POST /api/auth/login`, `GET /api/auth/portals`, `POST /api/auth/select-company`, `POST /api/auth/logout` — initial setup, membership-filtered portal list, company selection, and sessions
- `POST /api/auth/password` — change password
- `GET /api/company-dashboard` — overview metrics and recent activity for the selected company portal
- `GET /api/company-users`, `POST /api/company-users`, `PATCH /api/company-users/:id` — selected-company membership administration
- `GET /api/calendar?from=...&to=...`, `POST /api/calendar/events`, `PATCH /api/calendar/events/:id`, `DELETE /api/calendar/events/:id` — private calendar events for the selected company
- `GET /api/companies`, `GET /api/companies/:id`, `POST /api/companies`, `PATCH /api/companies/:id` — scoped portfolio data, company profiles, and updates
- `GET /api/companies/directory` — company names and status for shared-work routing
- `GET /api/clients`, `POST /api/clients`, `PATCH /api/clients/:id` — company-scoped client directory records
- `GET /api/clients/import-template`, `POST /api/clients/import/preview`, `POST /api/clients/import` — download the Excel template, preview a spreadsheet, and import validated client rows
- `GET /api/companies/:id/documents`, `POST /api/companies/:id/documents` — list and upload company documents
- `GET /api/companies/:id/notes`, `POST /api/companies/:id/notes`, `PATCH /api/company-notes/:id`, `DELETE /api/company-notes/:id` — company-scoped notes
- `GET /api/companies/:id/reception-intakes`, `POST /api/companies/:id/reception-intakes`, `PATCH /api/reception-intakes/:id` — company-scoped reception inquiries with change history
- `GET /api/documents/:id/download`, `DELETE /api/documents/:id` — access-controlled download and delete
- `GET /api/activities` — workspace activity
- `GET /api/notifications`, `PATCH /api/notifications/:id`, `PATCH /api/notifications/read-all` — user-scoped notification feed, unread counts, and read state
- `GET /api/tasks`, `GET /api/tasks/:id`, `GET /api/tasks/assignees?companyId=...` — company-scoped work and eligible assignees
- `GET /api/work-items` — company-scoped tasks, existing shared project requests, and calendar event rows; platform administrators at the Aspect Companies root receive the authorized group-wide feed
- `POST /api/tasks`, `PATCH /api/tasks/:id` — create and update tasks with event history
- `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects`, `PATCH /api/projects/:id` — Signature Exteriors project and job tracking
- `GET /api/projects/assignees?companyId=...` — eligible project owners and milestone assignees
- `GET /api/projects/:id/milestones`, `POST /api/projects/:id/milestones`, `PATCH /api/project-milestones/:id` — assigned job milestones and due dates
- `GET /api/projects/:id/documents`, `POST /api/projects/:id/documents`, `GET /api/project-documents/:id/download`, `DELETE /api/project-documents/:id` — private job documents
- `GET /api/project-requests`, `GET /api/project-requests/:id`, `PATCH /api/project-requests/:id` — cross-company project requests
- `POST /api/projects/:id/requests`, `GET /api/project-requests/assignees?companyId=...` — send requests and choose eligible receiving-company assignees
- `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` — administrator account management
- `GET /api/admin/system-development-members`, `PATCH /api/admin/system-development-members/:id` — platform-administrator-only Collaboration access management
- `GET /api/system-development`, `POST /api/system-development/projects`, `PATCH /api/system-development/projects/:id` — private collaboration projects with shared purpose, discussion, files, and status
- `POST /api/system-development/projects/:id/posts` — team updates and replies inside a collaboration project
- `POST /api/system-development/projects/:id/items`, `PATCH /api/system-development/items/:id` — shared work items, status, owner, optional target date, and priority markers
- `GET /api/system-development/projects/:id/documents`, `POST /api/system-development/projects/:id/documents`, `GET /api/system-development/documents/:id/download`, `DELETE /api/system-development/documents/:id` — private shared files and document notes for collaboration projects
- `POST /api/users/:id/reset-password` — issue a one-time password and revoke the user's sessions
- `GET /api/backups`, `POST /api/backups`, `POST /api/backups/:id/restore`, `DELETE /api/backups/:id` — administer local snapshots

Passwords are stored as salted scrypt hashes. Login sessions use random tokens stored as hashes in SQLite and are sent in HttpOnly, SameSite cookies. Active use extends the seven-day idle timeout; all sessions require a fresh sign-in after 90 days. The server binds to localhost by default.

Document uploads currently allow PDF, PNG, JPG, TXT, CSV, DOCX, XLSX, and PPTX files up to 10 MB each. Platform administrators can upload or delete documents within their company scope; members can view and download. The actual file bytes stay under `data/documents/`, outside the public static directory.

Backups are stored as timestamped folders under `data/backups/`. A restore validates the database and document files, creates a safety snapshot of the current workspace, then restores the database and files together. Restoring signs all users out; sign in with credentials that existed in the selected backup. Backups contain company data and password hashes, so protect the folder and copy it to a separate secure drive for disaster recovery. Keep at least one snapshot; the portal will not delete the last one.

## Publish on a Hostinger VPS

This project includes a code-only release packager and a Hostinger VPS deployment bundle. For a Docker Manager VPS, the guide includes a separate Compose app routed through Traefik with its own persistent data volume. A systemd/Nginx alternative is also documented for an Ubuntu/Debian VPS. See [`deploy/hostinger/README.md`](deploy/hostinger/README.md) for the setup guide. Build the ZIP with `node scripts/package-release.js`; it excludes the local `data/` directory, databases, documents, backups, and environment files. Never copy the local `data/portal.sqlite` into the code release.

The server includes login rate limiting, same-origin checks for production mutations, secure production cookies, and graceful shutdown. Employee password resets are issued by an administrator from **Manage access**; the server-side recovery utility can reset an administrator if all admin accounts are inaccessible. Keep the SQLite data directory backed up and maintain encrypted copies outside the VPS. Do not delete `portal.sqlite` to reset a workspace that contains real data.

### Recover the local administrator account

On the sign-in page, open **Forgot your password?** for instructions. Double-click **Recover Aspect Admin Access.bat**, enter the email for an active administrator account, and type `RESET` when asked. The terminal displays a one-time password; it is not saved to disk. Sign in with it and choose a new password. The recovery tool revokes existing sessions for that administrator. Run this utility only on the computer that hosts this local workspace.

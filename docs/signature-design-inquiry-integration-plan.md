# Signature Design ↔ Aspect Companies Signature Inquiry Sync

**Status:** Phase 1 inquiry creation and Phase 2 bidirectional structured inquiry sync are live and production-accepted. Plan completeness score for the approved scope: 10/10.  
**Plan audited against both live portals; synthetic Phase 1 and Phase 2 acceptance completed:** 2026-10-17.  
**Source:** Signature Exteriors Design portal (`\\100.77.209.82\RemoteFiles\System Application\Signature Exteriors\design-client-portal`; production URL: <https://app.srv1633240.hstgr.cloud>)  
**Target:** Signature Exteriors company portal in the Aspect Companies Web Portal (`\\100.77.209.82\RemoteFiles\System Application\Aspect Companies Web Portal`), Reception at <https://aspect-portal.srv1633240.hstgr.cloud/portal/signature-exteriors>.

## Objective

When a new inquiry is submitted through the Signature Exteriors Design portal, create one corresponding **New** Reception Intake in the Signature Exteriors company portal in Aspect Companies. Keep shared contact, channel, project, and property details synchronized both ways as authorized users edit them. Mirror Design's structured workflow and related inquiry records into Aspect for visibility; keep their source of truth in Design. Signature Reception status, owner, follow-up, files, and activity/history stay local to their respective portals. This includes inquiries entered by staff on behalf of a prospect and those submitted by a client.

The two portals have separate applications, authentication, and databases. The Design portal uses Express, Prisma, and SQLite and represents an inquiry through `Inquiry`, `Client`, and optional `Property` records. The Aspect Companies portal uses a separate SQLite database and already has company-scoped Reception Intake records. At the initial audit there was no cross-portal API authentication or integration route; the deployed Phase 1 and Phase 2 releases now provide signed delivery and revision-checked writeback.

## Live audit findings

- The Design portal Reception form creates an inquiry from Lead and ownership, Property, and Project vision sections. It captures contact methods, incoming channel, next action, optional property location, project vision, objectives, preliminary scope, budget, and timing. It supports staff-entered and client-submitted inquiries.
- Signature Exteriors Reception accepts pool and outdoor work. New Design inquiries map to status New and the closest allowed pool service. The receiving inquiry is created in the Signature Exteriors company scope, with an origin badge and source receipt event.
- The imported service and complete project summary are visible in the target Scope tab; the History tab shows Design origin, source inquiry ID, source creation and receipt times, mapping version, and the system receipt event.
- New imported inquiries are unassigned in the shared Signature Exteriors Reception queue. The target sends a generic in-app notification to every active platform administrator and every active user with Signature Exteriors access. It does not copy the source owner across systems.
- The source outbox dispatches promptly after create, retry, or approved backfill enqueue, with a 15-second worker poll as recovery. An open target Reception view receives company-scoped live updates; a 60-second refresh recovers missed events.
- Historical transfer remains a separate reviewed dry-run/backfill flow. No historical backfill was run during deployment or acceptance.

## Phase 1: inquiry creation (deployed)

- Send an allowlisted inquiry snapshot after a Design inquiry is committed, whether created by staff or submitted by a client. Do not wait for Design qualification or project conversion.
- Deliver from the Design backend to the Aspect Companies backend over HTTPS. Keep integration credentials out of the browser and avoid direct database connections between portals.
- Create one New Reception intake in the fixed Signature Exteriors company scope, with the mapped service and a stable source identity.
- Keep the target intake unassigned in the shared queue. Notify all active platform administrators and active members with access to Signature Exteriors; never translate a Design user ID into the separate target user directory.
- Phase 1 delivered an initial snapshot on inquiry creation. Phase 2 below adds bidirectional edits to the explicitly shared fields.
- Require a dry-run preview and separate operator approval for any historical backfill. Exclude declined, converted, deleted, and duplicate records; never merge on contact or property fields.
- Do not create or merge a target client, project, or task, and do not copy documents or attachments in this release.
- Retain manual intake for inquiries originating outside the Design portal and for delivery exceptions.

## Field mapping

| Design portal value | Aspect Companies Signature value | Rule |
| --- | --- | --- |
| `Inquiry.id`, `createdAt`, and stable source key | Structured origin metadata | Store `sourceSystem`, source inquiry ID, source creation time, target receipt time, schema/mapping version, and optional source link. Enforce uniqueness by `(company_id, source_system, source_record_id)`. |
| `Client.name` | `contact_name` | Required. |
| `Client.email`, `Client.phone` | `email`, `phone` | Preserve available methods. The source form requires at least one contact method for a new internal lead; do not invent missing values. |
| `Client.company` when present | Labeled line in `summary` | The Signature target form/API does not map `organization_name` for this company; do not send it as a field the target silently discards. |
| `Inquiry.source` | `source` | Map `PHONE` → Phone, `SMS` → Phone, `EMAIL` → Email, `WEBSITE` → Website, `REFERRAL` → Referral, `WALK_IN` → Walk-in, `OTHER` → Other. Preserve the original code in origin metadata. Unknown or blank legacy values become Other. |
| `Inquiry.description` when it exactly matches a Design staff project-vision option | Required `request_type` | Map New pool → New pool construction; Pool remodel → Pool renovation or resurfacing; Outdoor living area → Outdoor living; Pool and outdoor living → Outdoor living, with both parts retained in the summary; Spa addition, Water feature, Landscape project, Repair or renovation, and Other / needs discussion → Other. Preserve the exact structured choice as Project vision. |
| `Inquiry.description` when it is client-entered free text or does not match a project-vision option | Labeled **Project details** in `summary`; required `request_type` becomes Other | The Design client form stores free text in this same field. Preserve the text under Project details instead of misclassifying it as a project-vision choice; use Other for the target service until staff review it. |
| `Property.address`, city, state, postal code, when supplied | Labeled **Property** section in `summary` | Include the exact address because the receiving form explicitly asks staff to capture it and uses it to review pool-service feasibility. Keep it inside Signature Exteriors' existing company access scope. Omit unknown parts. |
| `Inquiry.objectives`, `preliminaryScope` | Labeled **Goals** and **Requested scope** sections in `summary` | Preserve source wording and selected scope values; omit blank sections. Do not infer pool condition when the source has not recorded it. |
| `Inquiry.budgetExpectation`, `desiredTiming` | Labeled **Budget expectation** and **Desired timing** sections in `summary` | Include when provided; these are captured in the source intake and help the receiving team triage. |
| `Inquiry.referralName` | Labeled **Referral** line in `summary` | Include only when present. |
| Source `ownerId`, internal next action and due date | Not copied | Do not map user IDs or internal next actions across systems. Keep the imported target intake unassigned; a Signature Exteriors user chooses its follow-up owner and date. |
| Structured Design workflow and related inquiry data (schema v4) | Revisioned allowlisted `sourceRecord` snapshot, editable in Aspect and written back to Design | Includes qualification and disposition, discovery and site/compliance assessments, proposal/ROM and agreement, handoff, meetings, work items, criteria, saved compliance research, and linked project phases/checklist items. System-owned IDs and protected timestamps/actor metadata are guarded. Files, evidence/file links, activity/history, audit trails, criterion-change history, handoff-review history, and generated status-report history stay local. Private storage paths and URL query tokens are stripped. |

The source payload remains backward-compatible with earlier schema versions. Schema v4 includes the allowlisted structured snapshot and supports signed Aspect-to-Design workflow edits. Design's 15-second recovery poll detects source-side updates; Aspect receives company-scoped live updates and uses its 60-second recovery refresh if an event is missed.

Build a deterministic summary within the target's 4,000-character limit. Keep contact and property identification first; cap each source section before composing so a long note cannot remove the service or address. The Design record remains available as the detailed source.

## Integration contract

### Source delivery

Add an integration outbox to the Design portal database. In the same transaction that creates a client- or staff-created inquiry, persist an immutable version-1 payload and a unique delivery row. A worker sends pending rows and records delivery state, attempt count, last attempt, next retry time, target intake ID, and a sanitized last error. This prevents a temporary target outage from losing a submitted inquiry or making the client resubmit it. Do not enqueue existing database rows during deployment; use the separate backfill preview described below.

Retry transient network failures and target `5xx` responses with bounded exponential backoff. Mark validation/authentication `4xx` responses as needing operator attention; expose delivery state and a safe manual retry in the internal inquiry view. Never put secrets or full inquiry payloads in logs. Keep the target's source record ID on the source outbox row after success.

### Target API

Add a versioned, create-only integration route, for example `POST /api/integrations/v1/signature-design/inquiries`. The existing `POST /api/companies/:id/reception-intakes` route is intended for an authenticated portal user and requires an internal user identity; it should not be called with a shared employee password or a browser cookie.

Authenticate the Design portal as a dedicated integration principal using a rotated server-side secret and a signed request (key ID, timestamp, and body digest/signature). Enforce a short replay window, constant-time signature comparison, HTTPS, request-size limits, and rate limits. The principal may create Signature Exteriors Reception Intake records only; it cannot list, read, edit, or delete company records.

The endpoint resolves the target company from the server's Signature Exteriors configuration. It validates a strict versioned schema and current allowed pool service, creates the intake, origin record, audit/history event, and notification in one transaction, and attributes the write to a non-interactive integration identity named **Signature Exteriors Design Portal** with create-only company scope. Do not give the integration an ordinary platform-administrator account or interactive login. Keep new intakes unassigned and notify every active platform administrator and every active user with Signature Exteriors access.

The current `reception_intakes.created_by` and history actor fields reference `users`. Represent the integration audit actor as a dedicated, disabled/non-interactive system user with no usable login credential; the signed integration route sets that actor server-side. Keep it out of ordinary account lists and never use its identity for authorization. The HMAC principal and the target audit actor are separate concepts.

Example request:

```json
{
  "schemaVersion": 1,
  "sourceSystem": "signature-exteriors-design",
  "sourceInquiryId": "<stable source inquiry id>",
  "sourceCreatedAt": "<ISO-8601 timestamp>",
  "contact": {
    "name": "<required>",
    "email": "<optional>",
    "phone": "<optional>"
  },
  "inquiry": {
    "sourceChannel": "WEBSITE",
    "referralName": null,
    "projectVision": "New pool",
    "property": {
      "address": "<optional>",
      "city": "<optional>",
      "state": "<optional>",
      "postalCode": "<optional>"
    },
    "description": "<optional>",
    "objectives": "<optional>",
    "preliminaryScope": "<optional>",
    "budgetExpectation": "<optional>",
    "desiredTiming": "<optional>",
    "clientCompany": "<optional>"
  }
}
```

Return `201` for a new intake and `200` with the existing intake for a retry of the same source record and payload. Use a unique target key on `(company_id, source_system, source_record_id)` (or an equivalent origin table) so duplicate requests cannot create duplicate inquiries. Return `409` if a reused source ID carries a different immutable payload. The target response includes intake ID, company slug, and origin key for source-side delivery tracking.

## Target portal experience

- Display the Design origin and source identity on the imported inquiry and write a system-authored receipt event in History.
- Display the mapped pool service and complete labeled project summary in Scope. Keep the Client tab for contact details and channel; preserve property and project facts without inventing missing values.
- Leave the inquiry unassigned in the shared Signature Exteriors Reception queue. Send a generic in-app notification to every active platform administrator and every active Signature Exteriors member. Do not put contact details in notifications.
- Refresh the open Signature Reception queue through company-scoped server-sent events. A 60-second automatic recovery refresh runs if an event is missed; the queue also refreshes after reconnect or when a blocked intake editor closes.
- Keep imported inquiries in the existing company-scoped search and pipeline. Existing access checks govern who can view the queue and details.

## Phase 2: bidirectional shared-detail edits

### Fields and ownership

The two-way allowlist is contact name, company, email, phone, source channel, referral name, project vision, project description (for free-text/Other projects), property address and location, objectives, preliminary scope, design inspirations, budget expectation, and desired timing. Clearing the property is supported. Each accepted edit updates the source record and the mirrored target summary/origin snapshot together.

Schema v4 makes the allowlisted Design workflow snapshot editable in both portals, including qualification and disposition, discovery, site/compliance assessments, proposal/ROM and agreement, handoff, consultations, work items, criteria, saved compliance research, and linked project phases/checklists. Design remains the authoritative record and returns a new revision after a signed Aspect writeback. Protected IDs, revision/timestamp fields, and actor metadata cannot be changed through Aspect. Aspect Reception status, assignee, follow-up, closure, files, and local activity/history remain target-local. Design file records, evidence/file links, activity logs, audit trails, criterion-change history, handoff-review history, and generated status-report history are not copied.

### Change delivery and conflict handling

- Aspect sends edits to a fixed Design HTTPS origin using the shared HMAC identity and a strict PATCH allowlist. The source checks the linked target intake and the expected source revision before saving.
- Design edits are detected by the source delivery worker, which compares the current allowlisted snapshot and dispatches a new revision. The worker polls every 15 seconds as recovery; source edits therefore appear near real time, not synchronously.
- Both directions use monotonically increasing revisions. A stale write returns the latest snapshot as a conflict; the receiving portal refreshes its copy and asks the editor to review and reapply. There is no automatic field-level merge.
- A source update resets a saved ROM preview because shared project details changed. Target history records the sync direction and revision. Live events carry inquiry IDs and revisions only, never contact or project data.
- A successful Aspect save first confirms the Design write, then saves Aspect-only workflow fields. If the second step fails, the UI reports that Design saved and Aspect workflow fields did not, so the user can retry without silently losing either result.
- The target queue remains unassigned and is visible through existing Signature Exteriors access rules. Imported inquiries notify every active platform administrator and every active user with Signature Exteriors access; edits do not change queue ownership.

### Runtime gates and secrets

Design uses `SIGNATURE_DESIGN_INQUIRY_SYNC_ENABLED` for source delivery and the signed update route. Aspect uses `SIGNATURE_DESIGN_INTEGRATION_ENABLED` for incoming inquiry creation and `SIGNATURE_DESIGN_WRITEBACK_ENABLED` for edits sent to Design. Aspect's `SIGNATURE_DESIGN_WRITEBACK_BASE_URL` is explicit in local/staging environments; production uses the fixed Design origin. Both servers must use the same protected key ID and HMAC secret. Keep writeback disabled until both matching releases are deployed and synthetic acceptance passes; either portal can pause its side independently.

### Phase 2 acceptance criteria

- An edit to every allowlisted shared field in either portal is visible in the other portal, with a higher revision and no duplicate inquiry.
- Changes to the v4 structured workflow snapshot can be edited in Aspect and accepted by Design, then appear in the refreshed Aspect mirror on the new source revision without creating another intake. Covered categories include qualification, site assessment, consultations, work items, criteria, compliance results/links, and linked project phases/checklists.
- A stale or concurrent edit returns a conflict, refreshes the receiving copy, and preserves the latest committed source details.
- Identical retries are idempotent. Invalid signatures, unsupported fields, bad revisions, and unauthorized target users cannot change either record.
- Shared inquiry and allowlisted Design workflow fields are editable in both portals. System-owned Design metadata and Aspect-only workflow fields remain protected/local; attachments and activity/history remain local to each portal.
- Live events contain only the inquiry ID and revision; the target remains in the shared Signature queue and notifications contain no customer details.
- Synthetic end-to-end tests cover both edit directions, idempotency, stale revisions, queue privacy, and recovery without creating or modifying real inquiries.

## Delivery and privacy safeguards

- Configure the fixed target base URL `https://aspect-portal.srv1633240.hstgr.cloud` and integration key through protected deployment secrets; never commit production values or store them in frontend environment variables.
- Allow only the named source system and fixed Signature Exteriors destination. Reject arbitrary company IDs, source IDs with invalid length, unexpected fields, oversized text, and unsupported schema versions.
- Store origin identity as structured data and redact it appropriately in logs. Keep integration request bodies out of general activity summaries.
- Send only the documented contact, property, source channel, project vision, requested scope, objectives, budget, timing, and referral fields. The property address and contact methods are sensitive customer data; the destination is the Signature Exteriors company Reception queue, visible only through the existing direct-membership/company permission checks and platform-admin scope.
- Do not send passwords, authentication tokens, client portal invitations, document bytes, design-reference URLs, detailed site survey/discovery JSON, compliance research, later ROM/proposal data, or client disposition in version 1.
- Do not deduplicate or merge on email or phone. A household can have more than one property or project; only the stable source inquiry ID controls retry deduplication.
- Preserve the source inquiry if target delivery fails. Do not show the client a false submission failure after the Design database has safely committed; show internal delivery status to authorized staff.
- Add feature flags on both systems so operators can pause sending or reject inbound integration writes independently.

## Implementation sequence

1. Configure the shared HMAC identity and verify the target's eligible recipient set: active platform administrators plus active Signature Exteriors members.
2. Deploy the target receiver with fixed company routing, structured origin metadata, idempotency, Scope/History mapping, generic recipient notifications, and company-scoped live updates.
3. Deploy the Design transactional outbox, immediate dispatch after create/retry/backfill enqueue, bounded retry, operator status, and reviewed backfill preview.
4. Validate source-to-target mapping, auth rejection, idempotency, unassigned queue behavior, notification fanout, and live updates using synthetic records.
5. Keep historical records out of the live outbox unless an operator separately reviews and approves the dry-run preview. No backfill is part of the automatic release.
6. For Phase 2, back up both databases, deploy matching source and target builds plus the additive source revision migration, and keep Aspect writeback disabled until both services are healthy.
7. Enable target writeback, run one clearly synthetic inquiry through edits in both portals, verify monotonic revisions, SSE refresh, notification privacy, idempotent retry, and stale-edit conflict handling, then mark or remove only those synthetic records using the portals' supported workflow.
8. If any acceptance check fails, turn off `SIGNATURE_DESIGN_WRITEBACK_ENABLED` first. Restore the previous application release and database only through the documented rollback procedure. Never queue a historical backfill as part of this Phase 2 rollout.

## Acceptance criteria

- A new eligible Design inquiry creates exactly one New intake for Signature Exteriors. New imported records remain unassigned in the shared Reception queue.
- The target notifies every active platform administrator and active Signature Exteriors member; notification content contains no contact details.
- Contact, channel, service, property, objectives, requested scope, budget, timing, and origin metadata follow the documented mapping. Scope and History visibly contain the mapped project details and source receipt information.
- The target row appears automatically in an already-open Reception queue through SSE; the 60-second recovery refresh handles missed events.
- Retrying an identical delivery returns the same target intake ID. Reusing a source ID with a changed payload is rejected, and no duplicate intake is created.
- A temporary target outage leaves a durable delivery and retries safely. Permanent validation/auth errors are visible to Design administrators for operator review and manual retry.
- The integration identity can create only in Signature Exteriors and cannot authenticate interactively or use list/read/update/delete integration routes.
- Historical backfill is previewed, reviewed by source ID, and separately approved. Deploying or enabling the sender does not replay historical inquiries.
- Existing manual Reception intake, client, and project workflows continue to work.

## Code locations reviewed

**Design portal:** `backend/prisma/schema.prisma` (`Client`, `Inquiry`, `Property`); `backend/src/routes/inquiries.ts` (client and staff inquiry creation, intake updates, qualification, conversion); `backend/src/middleware/auth.ts` (JWT and `ADMIN`/`CLIENT` authorization); `frontend/src/pages/Inquiries.tsx` (live Reception form and project-vision/service choices); `DEPLOYMENT_STATUS.md` (production release record).

**Aspect Companies portal:** `server.js` (`reception_intakes`, `reception_intake_events`, service choices, company-scoped Reception endpoints, Signature company routing, and source-user authorization); `public/foundation.js` (Signature Reception form and queue); `README.md` (Reception API and company access model).

## Plan completeness score

**10/10 for plan completeness against the reviewed portal flows and the approved bidirectional scope.** Each area is scored out of 2:

| Area | Score | Evidence |
| --- | ---: | --- |
| Trigger and lifecycle boundary | 2/2 | Covers staff-created and client-submitted inquiries, shared-field and structured Design-workflow edits both ways, target-local Reception ownership/status/follow-up, and a separate reviewed historical backfill. |
| Field mapping | 2/2 | Maps source channels and project vision to the target's actual enums, includes the target-required project/property summary, handles unsupported services explicitly, and respects the 4,000-character limit. |
| Reliability and recovery | 2/2 | Uses a transactional outbox, stable origin key, revisions, idempotent writes, bounded retry, stale-write conflict refresh, and a backfill preview. |
| Security and data scope | 2/2 | Uses backend-only signed auth, fixed portal origins, current user/company permissions, strict shared-field and workflow allowlists, and explicit exclusions for file bytes, attachments, evidence links, and activity/history. |
| Rollout and acceptance | 2/2 | Includes independent feature flags, isolated two-way end-to-end validation, notification and UI checks, reviewed backfill, operational pause, and specific acceptance criteria. |

The 10/10 score reflects complete coverage of the approved scope, and the Phase 2 production acceptance below confirms the live implementation on synthetic records.

## Production implementation and acceptance - 2026-10-17

- **Production releases:** Design 1.5.1 / `20261017-v4-bidirectional`; Aspect `aspect-portal:20261017-v4-bidirectional-asset1`, build ID `f244029348d7212b`. The Aspect asset1 hotfix changes the `foundation.js` and `styles.css` cache keys so existing browser sessions load the current v4 editor. Both services are healthy; the source readiness endpoint returns `ready` and the target health endpoint returns `ok`.
- **Migration and runtime gates:** Design migration `20261017040000_signature_inquiry_bidirectional_sync` is applied. Design inquiry sync, Aspect integration, and Aspect writeback are enabled in protected production environments with matching HMAC credentials. No secret values are recorded here.
- **Live synthetic roundtrip:** Design-to-Aspect synchronized the marker `SYNTHETIC SYNC CHECK DESIGN-TO-ASPECT 20261017-V4`. Aspect-to-Design changed the synthetic objective from `Relaxation` to `Exercise and wellness`, then wrote back the synthetic site-assessment marker `SYNTHETIC WORKFLOW WRITEBACK CHECK 20261017-V4`. Design confirmed both writes; the returned Aspect mirror reached source revision 5. No real inquiry was edited.
- **Near-real-time behavior:** Design dispatches on change and polls every 15 seconds for recovery. Aspect updates an open Reception queue by SSE and uses a 60-second recovery refresh. Aspect writes display a confirmation only after Design accepts the signed revisioned update.
- **Focused verification:** Design v4 integration/writeback and worker tests passed 12/12. Aspect receiver tests passed 6/6 in the exact Node 22 release image. The production Aspect image built successfully; health/readiness checks and protected runtime flags were verified after the hotfix.
- **Access and data scope:** Imported inquiries stay unassigned and are available through active Signature Exteriors membership. Files, attachments, activity/history, audit rows, and evidence remain local. No historical backfill was run.
- **Recovery points:** Source encrypted pre-deployment backup `/srv/signature-portal-production/backups/portal-2026-10-17T23-26-00-170Z-6a99fcd9.backup.json` (6,270,976-byte database; 18 uploaded files, 6,909,465 bytes). Aspect pre-deployment snapshot `20261017T231434661Z-03a25806-b201-4082-ab07-a9c86873b32e` (5 documents, 981,465 bytes). Earlier release images and Compose bundles remain available for rollback.
- **Build notices:** The existing frontend bundle size and dependency audit notices remain separate maintenance items; they were not changed by this integration release.

## Implementation defaults

- Automatically deliver a new inquiry once, regardless of whether staff or a client created it. Synchronize the approved shared details and allowlisted Design workflow snapshot in both directions; keep status transitions, owner, follow-up, attachments, files, and activity/history local to their owning portal.
- Keep new target records unassigned in the shared Signature Exteriors queue. Notify every active platform administrator and every active user with access to Signature Exteriors; do not use a single configured assignee.
- Dispatch promptly from the source outbox, retaining the 15-second sender poll as recovery. Refresh the target queue by SSE with a 60-second missed-event/reconnect fallback.
- Backfill only reviewed open/qualified/nurtured records through a dry-run preview and separate operator approval. Declined, converted, deleted, and duplicate source records remain out of scope. No backfill has run.
- Send only documented structured inquiry and workflow data. Do not send attachments, file bytes, activity/history, credentials, or private storage paths.
- Use the verified production portal origins at the top of this plan. The deployment operator owns HMAC secret creation and rotation; never copy a key into a browser, document, or source file.
- The target Scope tab displays the mapped pool service and project summary; History preserves source origin and receipt metadata.


const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, createHmac } = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const { execFile } = require('node:child_process');
const { Readable } = require('node:stream');
const zlib = require('node:zlib');
const ExcelJS = require('exceljs');
const scryptAsync = promisify(scrypt);
const DUMMY_PASSWORD_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

const ROOT = __dirname;
const BUILD_ID = createHash('sha256').update(fsSync.readFileSync(__filename)).digest('hex').slice(0,16);
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_DATA_DIR = path.join(ROOT, 'data');
const PILOT_MODE = process.env.ASPECT_PILOT_MODE === '1';
const PRODUCTION_MODE = process.env.NODE_ENV === 'production';
const SETUP_TOKEN = String(process.env.ASPECT_SETUP_TOKEN || '');
if(PRODUCTION_MODE&&SETUP_TOKEN&&Buffer.byteLength(SETUP_TOKEN)<32)throw new Error('ASPECT_SETUP_TOKEN must contain at least 32 bytes in production.');
const DATA_DIR = process.env.ASPECT_DATA_DIR ? path.resolve(ROOT, process.env.ASPECT_DATA_DIR) : DEFAULT_DATA_DIR;
if(PILOT_MODE&&DATA_DIR.toLowerCase()===path.resolve(DEFAULT_DATA_DIR).toLowerCase())throw new Error('Pilot mode requires an isolated ASPECT_DATA_DIR outside the standard portal data folder.');
const DATA_FILE = path.join(DATA_DIR, 'portal.json');
const DB_FILE = path.join(DATA_DIR, 'portal.sqlite');
const DOCUMENTS_DIR = path.join(DATA_DIR, 'documents');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const PORT = Number(process.env.PORT || 3000);
const LISTEN_HOST = process.env.HOST || '127.0.0.1';
const SESSION_COOKIE = PILOT_MODE ? 'aspect_pilot_session' : 'aspect_session';
const SESSION_DAYS = 7;
const SESSION_MAX_DAYS = 90;
const SESSION_RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const SQLITE_CONSTRAINT_UNIQUE = 2067;
const loginFailures = new Map();
const TYPES = ['Operating company', 'Holding company', 'Shared services', 'Real estate', 'Investment'];
const ROLES = ['admin', 'member'];
const DOC_CATEGORIES = ['Contracts', 'Finance', 'Operations', 'Compliance', 'People', 'Other'];
const PROJECT_DOC_CATEGORIES = ['Estimates', 'Contracts', 'Photos', 'Permits', 'Work orders', 'Other'];
const TASK_STATUSES = ['Open', 'In progress', 'Blocked', 'Completed'];
const TASK_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const NOTE_CATEGORIES = ['General', 'Meeting', 'Decision', 'Reference'];
const PROJECT_STATUSES = ['Planning', 'Active', 'On hold', 'Completed', 'Cancelled'];
const PROJECT_STAGES = ['Lead', 'Estimating', 'Approved', 'Scheduled', 'In progress', 'Punch list'];
const PROJECT_REQUEST_STATUSES = ['Open', 'In progress', 'Blocked', 'Completed', 'Declined', 'Cancelled'];
const MILESTONE_STATUSES = ['Planned', 'In progress', 'Completed', 'Skipped'];
const US_TIME_ZONES = ['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];
const CALENDAR_USER_COLORS = ['gold','blue','green','coral','violet','teal','rose','orange'];
const CALENDAR_LOCATION_TYPES = ['Phone','Virtual meeting','On-site'];
const CALENDAR_MEETING_TYPES = ['Client check-in','Discovery','Project planning','Status review','Proposal review','Training','Internal planning','System building','Virtual Meeting','Other'];
const SYSTEM_DEVELOPMENT_KINDS = ['work','release','decision'];
const SYSTEM_DEVELOPMENT_STATUSES = ['Planned','In progress','Blocked','Complete'];
const SYSTEM_DEVELOPMENT_WORK_STATUSES = ['Planned','In progress','Blocked','Complete'];
const SYSTEM_DEVELOPMENT_PHASES = ['work','review','completed'];
function normalizeDevelopmentChecklist(value){
 if(!Array.isArray(value)||value.length>30)return null;
 const rows=[];
 for(const item of value){
  if(!item||typeof item.text!=='string'||typeof item.checked!=='boolean')return null;
  const text=item.text.trim();if(!text)continue;if(text.length>240)return null;rows.push({text,checked:item.checked});
 }
 return rows;
}
function developmentChecklistStatus(checklist,currentStatus){
 if(!Array.isArray(checklist)||!checklist.length)return currentStatus;
 const checked=checklist.filter(step=>step.checked).length;
 if(checked===checklist.length)return 'Complete';
 if(currentStatus==='Blocked')return 'Blocked';
 return checked?'In progress':'Planned';
}
const INTAKE_STATUSES = ['New', 'In review', 'Follow-up', 'Qualified', 'Closed'];
const INTAKE_SOURCES = ['Phone', 'Email', 'Website', 'Referral', 'Walk-in', 'Other'];
const ACCOUNTING_MARKETING_CHANNELS = ['Website / organic search', 'Paid advertising', 'Social media', 'Email marketing', 'Referral / word of mouth', 'Networking event', 'Direct outreach', 'Other'];
const INTAKE_CLOSURE_OUTCOMES = ['Resolved', 'Referred', 'Not proceeding', 'Unable to reach', 'Duplicate', 'Other'];
const INTAKE_CONTACT_TYPES = ['Call', 'Email', 'Text', 'Meeting', 'Note'];
const ACCOUNTING_COMPANY_ID = 'aspect-ventures';
const APP_SETTING_DEFAULTS = Object.freeze({workspaceTeammates:true,workspaceTasks:true,workspaceActivity:true,workspaceCalendar:true,workspaceClients:true,workspaceReception:true,workspaceSystemDevelopment:true,clientImports:true,meetingPdfPreview:true,calendarEmails:true,documentUploads:true,calendarReminders:true,calendarSlackReminders:false});
const APP_TEXT_SETTING_DEFAULTS = Object.freeze({calendarSenderEmail:'',calendarSlackChannel:''});
const APP_NUMBER_SETTING_DEFAULTS = Object.freeze({calendarReminderMinutes:30});
const SIGNATURE_COMPANY_ID = 'aspect-property';
const SIGNATURE_POOL_SERVICES = ['New pool construction','Pool renovation or resurfacing','Pool repair','Pool maintenance','Safety inspection','Outdoor living','Other'];
const DOCUMENT_TYPES = {'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.txt':'text/plain','.csv':'text/csv','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_COMPANY_LOGO_BYTES = 512 * 1024;
const MAX_CLIENT_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_CLIENT_IMPORT_ROWS = 1000;
const MAX_CLIENT_IMPORT_EXPANDED_BYTES = 64 * 1024 * 1024;
const CLIENT_IMPORT_COLUMNS = [
 {key:'company',header:'Company',aliases:['company','company name']},
 {key:'assignedUserEmails',header:'Assigned user emails',aliases:['assigned user emails','assigned users','client assignees']},
 {key:'name',header:'Client name',aliases:['client name','client','customer name','customer','account name','name']},
 {key:'contactName',header:'Contact name',aliases:['contact name','primary contact','contact']},
 {key:'email',header:'Email',aliases:['email','email address','contact email']},
 {key:'phone',header:'Phone',aliases:['phone','phone number','contact phone']},
 {key:'location',header:'Location',aliases:['location','address','client address']},
 {key:'notes',header:'Notes',aliases:['notes','client notes','description']},
];
let backupBusy = false;
let maintenanceMode = false;
let documentMutations = 0;
let inFlightApiMutations = 0;
function beginDocumentMutation(){documentMutations++;}
function endDocumentMutation(){documentMutations=Math.max(0,documentMutations-1);}
async function waitForDocumentMutations(){while(documentMutations)await new Promise(resolve=>setTimeout(resolve,10));}
async function waitForApiMutations(){while(inFlightApiMutations)await new Promise(resolve=>setTimeout(resolve,10));}
fsSync.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS companies (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, legal_name TEXT NOT NULL, type TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'In setup', industry TEXT NOT NULL, location TEXT NOT NULL,
 employees INTEGER NOT NULL DEFAULT 0, owner TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES companies(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  profile_confirmed INTEGER NOT NULL DEFAULT 0, slug TEXT, time_zone TEXT NOT NULL DEFAULT 'America/New_York', logo_data TEXT
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','member')),
 must_change_password INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, time_zone TEXT, calendar_color TEXT
);
CREATE TABLE IF NOT EXISTS memberships (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('manager','member')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(user_id, company_id)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL, company_id TEXT REFERENCES companies(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS activities (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, time TEXT NOT NULL, kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'update',
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, actor_name TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id,read_at,created_at DESC);
CREATE TABLE IF NOT EXISTS calendar_event_reminder_deliveries (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 delivery_target TEXT NOT NULL, lead_minutes INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, sent_at TEXT,
 UNIQUE(event_id,delivery_target,lead_minutes)
);
CREATE INDEX IF NOT EXISTS idx_calendar_reminder_delivery_status ON calendar_event_reminder_deliveries(status,attempts,created_at);
CREATE TABLE IF NOT EXISTS company_documents (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS company_notes (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reception_intakes (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 contact_name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL DEFAULT 'Other' CHECK(source IN ('Phone','Email','Website','Referral','Walk-in','Other')),
 request_type TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'New',
 organization_name TEXT NOT NULL DEFAULT '', accounting_details_json TEXT NOT NULL DEFAULT '{}', workload_review_json TEXT NOT NULL DEFAULT '{}',
 assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 next_action TEXT NOT NULL DEFAULT '', next_action_date TEXT,
 follow_up_completed_at TEXT, follow_up_completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 closure_outcome TEXT NOT NULL DEFAULT '', closure_note TEXT NOT NULL DEFAULT '', closed_at TEXT, closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 linked_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reception_intake_events (
 id TEXT PRIMARY KEY, intake_id TEXT NOT NULL REFERENCES reception_intakes(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL DEFAULT 'update', detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reception_intake_origins (
 intake_id TEXT PRIMARY KEY REFERENCES reception_intakes(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 source_system TEXT NOT NULL, source_record_id TEXT NOT NULL,
 source_channel TEXT NOT NULL DEFAULT '',
 source_created_at TEXT NOT NULL, received_at TEXT NOT NULL,
 mapping_version INTEGER NOT NULL, payload_sha256 TEXT NOT NULL,
 source_payload_json TEXT NOT NULL DEFAULT '{}', sync_revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(company_id,source_system,source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_reception_intake_origins_source ON reception_intake_origins(source_system,source_record_id);
CREATE TABLE IF NOT EXISTS reception_intake_documents (
 id TEXT PRIMARY KEY, intake_id TEXT NOT NULL REFERENCES reception_intakes(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reception_intake_documents_intake ON reception_intake_documents(intake_id,created_at DESC);
CREATE TABLE IF NOT EXISTS calendar_events (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0,1)),
 company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
 location TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 location_type TEXT NOT NULL DEFAULT 'On-site', meeting_type TEXT NOT NULL DEFAULT 'Other',
 color TEXT NOT NULL DEFAULT 'gold' CHECK(color IN ('gold','green','coral','blue')),
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, time_zone TEXT NOT NULL DEFAULT 'America/New_York',
 start_date TEXT, end_date TEXT, event_type TEXT NOT NULL DEFAULT 'event' CHECK(event_type IN ('event','lunch','unavailable')),
 client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
 source_system TEXT NOT NULL DEFAULT 'portal', source_event_id TEXT,
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','canceled')),
 canceled_at TEXT, canceled_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS calendar_event_attendees (
 event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, response TEXT NOT NULL DEFAULT 'awaiting', responded_at TEXT,
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS calendar_event_external_attendees (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL, normalized_email TEXT NOT NULL,
 response TEXT NOT NULL DEFAULT 'awaiting' CHECK(response IN ('awaiting','accepted','maybe','declined')), responded_at TEXT,
 token_hash TEXT NOT NULL UNIQUE, email_status TEXT NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending','sent','failed')),
 email_error TEXT NOT NULL DEFAULT '', email_sent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(event_id,normalized_email)
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_range ON calendar_events(starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON calendar_events(client_id,starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_creator ON calendar_events(created_by,starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_event_attendees_user ON calendar_event_attendees(user_id,event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_external_event ON calendar_event_external_attendees(event_id,response);
CREATE TABLE IF NOT EXISTS clients (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(company_id,name)
);
CREATE INDEX IF NOT EXISTS idx_clients_company_name ON clients(company_id,name);
CREATE TABLE IF NOT EXISTS client_assignments (
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL, assigned_at TEXT NOT NULL,
 PRIMARY KEY(client_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_client_assignments_user ON client_assignments(user_id,client_id);
CREATE TABLE IF NOT EXISTS system_development_members (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_development_projects (
 id TEXT PRIMARY KEY, company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
 title TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', meeting_date TEXT,
 notes TEXT NOT NULL DEFAULT '', phase TEXT NOT NULL DEFAULT 'work' CHECK(phase IN ('work','review','completed')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_development_project_members (
 project_id TEXT NOT NULL REFERENCES system_development_projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 added_by TEXT REFERENCES users(id) ON DELETE SET NULL, added_at TEXT NOT NULL,
 PRIMARY KEY(project_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_system_development_project_members_user ON system_development_project_members(user_id,project_id);
CREATE TABLE IF NOT EXISTS system_development_items (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('work','release','decision')),
 title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', checklist_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'Planned'
 CHECK(status IN ('Planned','In progress','Blocked','Complete')),
 owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, target_date TEXT,
 company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
 project_id TEXT REFERENCES system_development_projects(id) ON DELETE CASCADE,
 focus_item INTEGER NOT NULL DEFAULT 0 CHECK(focus_item IN (0,1)),
 phase TEXT NOT NULL DEFAULT 'work' CHECK(phase IN ('work','review','completed')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_development_items_kind_updated ON system_development_items(kind,updated_at DESC);
CREATE TABLE IF NOT EXISTS system_development_events (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES system_development_items(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_development_project_events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES system_development_projects(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_development_project_posts (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES system_development_projects(id) ON DELETE CASCADE,
 parent_id TEXT REFERENCES system_development_project_posts(id) ON DELETE CASCADE,
 author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_development_project_posts_project ON system_development_project_posts(project_id,created_at);
CREATE TABLE IF NOT EXISTS system_development_project_documents (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES system_development_projects(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '',
 uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Blocked','Completed')),
 priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low','Normal','High','Urgent')),
 due_date TEXT, assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 project_number TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, client_name TEXT NOT NULL DEFAULT '',
 site_location TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Planning'
 CHECK(status IN ('Planning','Active','On hold','Completed','Cancelled')),
 start_date TEXT, target_date TEXT, estimated_value_cents INTEGER,
 description TEXT NOT NULL DEFAULT '', project_manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 stage TEXT NOT NULL DEFAULT 'Lead', created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_milestones (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Planned'
 CHECK(status IN ('Planned','In progress','Completed','Skipped')),
 due_date TEXT, assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_documents (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_requests (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 target_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Blocked','Completed','Declined','Cancelled')),
 priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low','Normal','High','Urgent')),
 due_date TEXT, assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_request_events (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES project_requests(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies(parent_id);
CREATE INDEX IF NOT EXISTS idx_memberships_company ON memberships(company_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_company ON company_documents(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_notes_company ON company_notes(company_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reception_intakes_company_status ON reception_intakes(company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reception_intakes_assignee ON reception_intakes(assignee_user_id,status,next_action_date);
CREATE INDEX IF NOT EXISTS idx_reception_intake_events_intake ON reception_intake_events(intake_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON tasks(company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_user_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_company_number ON projects(company_id,project_number) WHERE project_number<>'';
CREATE INDEX IF NOT EXISTS idx_projects_company_status ON projects(company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_project_milestones_assignee ON project_milestones(assignee_user_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_events_project ON project_events(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_requests_project ON project_requests(project_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_requests_target ON project_requests(target_company_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_project_request_events_request ON project_request_events(request_id,created_at DESC);
`);
db.exec('CREATE TABLE IF NOT EXISTS portal_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS portal_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT)');
db.exec(`CREATE TABLE IF NOT EXISTS company_reception_configs (
 company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
 config_json TEXT NOT NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_at TEXT NOT NULL
)`);
const seedPortalSetting=db.prepare('INSERT OR IGNORE INTO portal_settings(key,value,updated_at,updated_by) VALUES(?,?,?,NULL)');
for(const [key,value] of Object.entries(APP_SETTING_DEFAULTS))seedPortalSetting.run(key,JSON.stringify(value),new Date().toISOString());
function getPortalSettings(){const settings={...APP_SETTING_DEFAULTS,...APP_TEXT_SETTING_DEFAULTS,...APP_NUMBER_SETTING_DEFAULTS};for(const row of db.prepare('SELECT key,value FROM portal_settings').all()){if(!Object.hasOwn(settings,row.key))continue;try{const value=JSON.parse(row.value);if(typeof value===typeof settings[row.key])settings[row.key]=value;}catch{}}return settings;}
function getPrivatePortalSetting(key){const row=db.prepare('SELECT value FROM portal_settings WHERE key=?').get(key);if(!row)return'';try{const value=JSON.parse(row.value);return typeof value==='string'?value:'';}catch{return'';}}
function defaultReceptionConfig(companyId){
 const standardStatuses=INTAKE_STATUSES.map(id=>({id,label:id,active:true,terminal:id==='Closed'}));
 if(companyId===SIGNATURE_COMPANY_ID)return{moduleLabel:'Reception',statuses:standardStatuses,sources:INTAKE_SOURCES.slice(),services:SIGNATURE_POOL_SERVICES.slice(),closureOutcomes:INTAKE_CLOSURE_OUTCOMES.slice()};
 if(companyId!==ACCOUNTING_COMPANY_ID)return{moduleLabel:'Marketing',statuses:standardStatuses,sources:INTAKE_SOURCES.slice(),services:[],closureOutcomes:INTAKE_CLOSURE_OUTCOMES.slice()};
 return{moduleLabel:'Reception',statuses:[
  {id:'New',label:'New',active:true},{id:'In review',label:'In review',active:true},{id:'Discovery scheduled',label:'Discovery scheduled',active:true},
  {id:'Follow-up',label:'Awaiting information',active:true},{id:'Qualified',label:'Ready for setup',active:true},{id:'Setup in progress',label:'Setup in progress',active:true},
  {id:'Closed',label:'Closed',active:true,terminal:true}
 ],sources:[...new Set([...ACCOUNTING_MARKETING_CHANNELS,...INTAKE_SOURCES])],services:['Monthly bookkeeping','Catch-up / cleanup','Tax preparation','Tax planning','Payroll','Sales tax','Financial reporting','Controller / CFO support','Other'],closureOutcomes:['Referred','Not proceeding','Unable to reach','Duplicate','Outside services','Other']};
}
function getReceptionConfig(companyId){
 const defaults=defaultReceptionConfig(companyId),row=db.prepare('SELECT config_json FROM company_reception_configs WHERE company_id=?').get(companyId);
 if(!row)return defaults;
 try{const saved=JSON.parse(row.config_json),savedSources=Array.isArray(saved.sources)?saved.sources:defaults.sources;return{...defaults,...saved,statuses:Array.isArray(saved.statuses)?saved.statuses:defaults.statuses,sources:companyId===ACCOUNTING_COMPANY_ID?[...new Set([...ACCOUNTING_MARKETING_CHANNELS,...savedSources])]:savedSources,services:Array.isArray(saved.services)&&!(companyId===SIGNATURE_COMPANY_ID&&saved.services.length===0)?saved.services:defaults.services,closureOutcomes:Array.isArray(saved.closureOutcomes)?saved.closureOutcomes:defaults.closureOutcomes};}
 catch{return defaults;}
}
function receptionStatusLabel(companyId,status){return getReceptionConfig(companyId).statuses.find(item=>item.id===status)?.label||status;}
function settingKeysForRequest(pathname,method){
 const keys=[];
 if(/^\/api\/people$/.test(pathname))keys.push('workspaceTeammates');
 if(/^\/api\/(?:tasks(?:\/.*)?|project-requests(?:\/.*)?|projects\/[^/]+\/requests)$/.test(pathname))keys.push('workspaceTasks');
 if(method==='GET'&&(/^\/api\/activities$/.test(pathname)||/^\/api\/companies\/[^/]+\/activities$/.test(pathname)))keys.push('workspaceActivity');
 if(pathname==='/api/calendar'||/^\/api\/calendar\/(?!external-rsvp(?:$|\/)).+/.test(pathname))keys.push('workspaceCalendar');
 if(/^\/api\/clients(?:\/.*)?$/.test(pathname))keys.push('workspaceClients');
 if(pathname==='/api/reception-intakes'||/^\/api\/reception-intakes\/.*$/.test(pathname)||/^\/api\/companies\/[^/]+\/reception-intakes$/.test(pathname))keys.push('workspaceReception');
 if(/^\/api\/companies\/[^/]+\/reception-config$/.test(pathname))keys.push('workspaceReception');
 if(pathname==='/api/system-development'||/^\/api\/system-development\//.test(pathname))keys.push('workspaceSystemDevelopment');
 if(/^\/api\/clients\/import(?:$|\/)|^\/api\/clients\/import-template$/.test(pathname))keys.push('clientImports');
 if(/^\/api\/system-development\/documents\/[^/]+\/preview$/.test(pathname))keys.push('meetingPdfPreview');
 if(method==='POST'&&(/^\/api\/companies\/[^/]+\/documents$/.test(pathname)||/^\/api\/projects\/[^/]+\/documents$/.test(pathname)||/^\/api\/system-development\/projects\/[^/]+\/documents$/.test(pathname)))keys.push('documentUploads');
 return [...new Set(keys)];
}
function migrateProjectRequestDeclinedStatus(){
 const schema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='project_requests'").get()?.sql||'';
 if(/'Declined'/.test(schema))return;
 db.exec('PRAGMA foreign_keys=OFF');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE project_requests_with_declined (
   id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
   target_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
   title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
   status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Blocked','Completed','Declined','Cancelled')),
   priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low','Normal','High','Urgent')),
   due_date TEXT, assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
   created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  db.exec('INSERT INTO project_requests_with_declined SELECT id,project_id,target_company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at FROM project_requests');
  db.exec('DROP TABLE project_requests');
  db.exec('ALTER TABLE project_requests_with_declined RENAME TO project_requests');
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_requests_project ON project_requests(project_id,status,updated_at DESC); CREATE INDEX IF NOT EXISTS idx_project_requests_target ON project_requests(target_company_id,status,due_date)');
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 finally{db.exec('PRAGMA foreign_keys=ON');}
}
migrateProjectRequestDeclinedStatus();
const companyColumns = new Set(db.prepare('PRAGMA table_info(companies)').all().map(column=>column.name));
if(!companyColumns.has('profile_confirmed'))db.exec('ALTER TABLE companies ADD COLUMN profile_confirmed INTEGER NOT NULL DEFAULT 0');
if(!companyColumns.has('slug'))db.exec('ALTER TABLE companies ADD COLUMN slug TEXT');
if(!companyColumns.has('time_zone'))db.exec("ALTER TABLE companies ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'America/New_York'");
if(!companyColumns.has('logo_data'))db.exec('ALTER TABLE companies ADD COLUMN logo_data TEXT');
const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column=>column.name));
if(!userColumns.has('time_zone'))db.exec('ALTER TABLE users ADD COLUMN time_zone TEXT');
if(!userColumns.has('job_title'))db.exec('ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT \'\'');
if(!userColumns.has('phone'))db.exec('ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT \'\'');
if(!userColumns.has('location'))db.exec('ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT \'\'');
if(!userColumns.has('directory_visible'))db.exec('ALTER TABLE users ADD COLUMN directory_visible INTEGER NOT NULL DEFAULT 1');
if(!userColumns.has('share_email'))db.exec('ALTER TABLE users ADD COLUMN share_email INTEGER NOT NULL DEFAULT 0');
if(!userColumns.has('share_phone'))db.exec('ALTER TABLE users ADD COLUMN share_phone INTEGER NOT NULL DEFAULT 0');
if(!userColumns.has('share_location'))db.exec('ALTER TABLE users ADD COLUMN share_location INTEGER NOT NULL DEFAULT 0');
if(!userColumns.has('calendar_color'))db.exec('ALTER TABLE users ADD COLUMN calendar_color TEXT');
const calendarColumns = new Set(db.prepare('PRAGMA table_info(calendar_events)').all().map(column=>column.name));
if(!calendarColumns.has('time_zone'))db.exec("ALTER TABLE calendar_events ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'America/New_York'");
if(!calendarColumns.has('start_date'))db.exec('ALTER TABLE calendar_events ADD COLUMN start_date TEXT');
if(!calendarColumns.has('end_date'))db.exec('ALTER TABLE calendar_events ADD COLUMN end_date TEXT');
if(!calendarColumns.has('location_type'))db.exec("ALTER TABLE calendar_events ADD COLUMN location_type TEXT NOT NULL DEFAULT 'On-site'");
if(!calendarColumns.has('meeting_type'))db.exec("ALTER TABLE calendar_events ADD COLUMN meeting_type TEXT NOT NULL DEFAULT 'Other'");
if(!calendarColumns.has('event_type'))db.exec("ALTER TABLE calendar_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'event' CHECK(event_type IN ('event','lunch','unavailable'))");
if(!calendarColumns.has('client_id'))db.exec('ALTER TABLE calendar_events ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL');
if(!calendarColumns.has('source_system'))db.exec("ALTER TABLE calendar_events ADD COLUMN source_system TEXT NOT NULL DEFAULT 'portal'");
if(!calendarColumns.has('source_event_id'))db.exec('ALTER TABLE calendar_events ADD COLUMN source_event_id TEXT');
if(!calendarColumns.has('status'))db.exec("ALTER TABLE calendar_events ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','canceled'))");
if(!calendarColumns.has('canceled_at'))db.exec('ALTER TABLE calendar_events ADD COLUMN canceled_at TEXT');
if(!calendarColumns.has('canceled_by'))db.exec('ALTER TABLE calendar_events ADD COLUMN canceled_by TEXT REFERENCES users(id) ON DELETE SET NULL');
db.exec("UPDATE calendar_events SET start_date=substr(starts_at,1,10),end_date=substr(ends_at,1,10) WHERE all_day=1 AND (start_date IS NULL OR end_date IS NULL)");
const attendeeColumns = new Set(db.prepare('PRAGMA table_info(calendar_event_attendees)').all().map(column=>column.name));
if(!attendeeColumns.has('response'))db.exec("ALTER TABLE calendar_event_attendees ADD COLUMN response TEXT NOT NULL DEFAULT 'awaiting'");
if(!attendeeColumns.has('responded_at'))db.exec('ALTER TABLE calendar_event_attendees ADD COLUMN responded_at TEXT');
const externalAttendeeColumns = new Set(db.prepare('PRAGMA table_info(calendar_event_external_attendees)').all().map(column=>column.name));
if(!externalAttendeeColumns.has('responded_at'))db.exec('ALTER TABLE calendar_event_external_attendees ADD COLUMN responded_at TEXT');
const systemDevelopmentColumns = new Set(db.prepare('PRAGMA table_info(system_development_items)').all().map(column=>column.name));
const systemDevelopmentProjectColumns = new Set(db.prepare('PRAGMA table_info(system_development_projects)').all().map(column=>column.name));
if(!systemDevelopmentProjectColumns.has('company_id'))db.exec('ALTER TABLE system_development_projects ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL');
if(!systemDevelopmentProjectColumns.has('purpose'))db.exec("ALTER TABLE system_development_projects ADD COLUMN purpose TEXT NOT NULL DEFAULT ''");
if(!systemDevelopmentProjectColumns.has('archived_at'))db.exec('ALTER TABLE system_development_projects ADD COLUMN archived_at TEXT');
if(!systemDevelopmentProjectColumns.has('archived_by'))db.exec('ALTER TABLE system_development_projects ADD COLUMN archived_by TEXT REFERENCES users(id) ON DELETE SET NULL');
if(!systemDevelopmentColumns.has('company_id'))db.exec('ALTER TABLE system_development_items ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL');
if(!systemDevelopmentColumns.has('project_id'))db.exec('ALTER TABLE system_development_items ADD COLUMN project_id TEXT REFERENCES system_development_projects(id) ON DELETE CASCADE');
if(!systemDevelopmentColumns.has('focus_item'))db.exec('ALTER TABLE system_development_items ADD COLUMN focus_item INTEGER NOT NULL DEFAULT 0 CHECK(focus_item IN (0,1))');
if(!systemDevelopmentColumns.has('phase')){db.exec("ALTER TABLE system_development_items ADD COLUMN phase TEXT NOT NULL DEFAULT 'work' CHECK(phase IN ('work','review','completed'))");db.exec("UPDATE system_development_items SET phase=CASE WHEN status='Complete' THEN 'completed' ELSE 'work' END");}
if(!systemDevelopmentColumns.has('checklist_json'))db.exec("ALTER TABLE system_development_items ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '[]'");
const systemDevelopmentPostColumns=new Set(db.prepare('PRAGMA table_info(system_development_project_posts)').all().map(column=>column.name));
if(!systemDevelopmentPostColumns.has('client_request_id'))db.exec('ALTER TABLE system_development_project_posts ADD COLUMN client_request_id TEXT');
const systemDevelopmentDocumentColumns=new Set(db.prepare('PRAGMA table_info(system_development_project_documents)').all().map(column=>column.name));
if(!systemDevelopmentDocumentColumns.has('upload_request_id'))db.exec('ALTER TABLE system_development_project_documents ADD COLUMN upload_request_id TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_system_development_posts_request ON system_development_project_posts(author_user_id,client_request_id) WHERE client_request_id IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_system_development_documents_request ON system_development_project_documents(uploaded_by,upload_request_id) WHERE upload_request_id IS NOT NULL');
db.exec(`UPDATE system_development_projects SET company_id=(SELECT MIN(company_id) FROM system_development_items WHERE project_id=system_development_projects.id GROUP BY project_id HAVING COUNT(DISTINCT company_id)=1 AND COUNT(company_id)=COUNT(*)) WHERE company_id IS NULL`);
db.exec('CREATE INDEX IF NOT EXISTS idx_system_development_items_phase_updated ON system_development_items(phase,updated_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_system_development_items_project ON system_development_items(project_id,focus_item DESC,updated_at DESC)');
function migrateSystemDevelopmentProjects(){
 const ungrouped=db.prepare('SELECT id,created_by,created_at FROM system_development_items WHERE project_id IS NULL ORDER BY created_at').all();
 if(!ungrouped.length)return;
 const projectId=randomUUID(),now=new Date().toISOString(),createdAt=ungrouped[0].created_at||now,createdBy=ungrouped[0].created_by;
 db.prepare("INSERT INTO system_development_projects(id,title,purpose,meeting_date,notes,phase,created_by,created_at,updated_at) VALUES(?,'Earlier shared work','Work carried over from the previous team workspace.',NULL,'', 'work',?,?,?)").run(projectId,createdBy,createdAt,now);
 db.prepare('UPDATE system_development_items SET project_id=? WHERE project_id IS NULL').run(projectId);
}
migrateSystemDevelopmentProjects();
const systemDevelopmentProjectMembersMigration='system-development-project-members-v1';
if(!db.prepare('SELECT 1 FROM portal_migrations WHERE id=?').get(systemDevelopmentProjectMembersMigration)){
 const now=new Date().toISOString();
 db.prepare('INSERT OR IGNORE INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT p.id,m.user_id,p.created_by,COALESCE(m.added_at,p.created_at,?) FROM system_development_projects p CROSS JOIN system_development_members m').run(now);
 db.prepare('INSERT OR IGNORE INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT id,created_by,created_by,COALESCE(created_at,?) FROM system_development_projects').run(now);
 db.prepare('INSERT OR IGNORE INTO portal_migrations(id,applied_at) VALUES(?,?)').run(systemDevelopmentProjectMembersMigration,now);
}
db.exec(`UPDATE system_development_projects SET company_id=(SELECT MIN(company_id) FROM system_development_items WHERE project_id=system_development_projects.id GROUP BY project_id HAVING COUNT(DISTINCT company_id)=1 AND COUNT(company_id)=COUNT(*)) WHERE company_id IS NULL`);
db.exec("UPDATE users SET time_zone='America/New_York' WHERE time_zone IS NOT NULL AND time_zone NOT IN ('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu')");
db.exec("UPDATE companies SET time_zone='America/New_York' WHERE time_zone NOT IN ('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu')");
db.exec("UPDATE calendar_events SET time_zone='America/New_York' WHERE time_zone NOT IN ('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu')");
const membershipColumns = new Set(db.prepare('PRAGMA table_info(memberships)').all().map(column=>column.name));
if(!membershipColumns.has('role'))db.exec("ALTER TABLE memberships ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
if(!membershipColumns.has('active'))db.exec('ALTER TABLE memberships ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
migrateLegacyMembershipRoles();
const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(column=>column.name));
if(!sessionColumns.has('company_id'))db.exec('ALTER TABLE sessions ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL');
const intakeColumns = new Set(db.prepare('PRAGMA table_info(reception_intakes)').all().map(column=>column.name));
if(!intakeColumns.has('organization_name'))db.exec("ALTER TABLE reception_intakes ADD COLUMN organization_name TEXT NOT NULL DEFAULT ''");
if(!intakeColumns.has('accounting_details_json'))db.exec("ALTER TABLE reception_intakes ADD COLUMN accounting_details_json TEXT NOT NULL DEFAULT '{}'");
if(!intakeColumns.has('workload_review_json'))db.exec("ALTER TABLE reception_intakes ADD COLUMN workload_review_json TEXT NOT NULL DEFAULT '{}'");
if(!intakeColumns.has('follow_up_completed_at'))db.exec('ALTER TABLE reception_intakes ADD COLUMN follow_up_completed_at TEXT');
if(!intakeColumns.has('follow_up_completed_by'))db.exec('ALTER TABLE reception_intakes ADD COLUMN follow_up_completed_by TEXT REFERENCES users(id) ON DELETE SET NULL');
if(!intakeColumns.has('closure_outcome'))db.exec("ALTER TABLE reception_intakes ADD COLUMN closure_outcome TEXT NOT NULL DEFAULT ''");
if(!intakeColumns.has('closure_note'))db.exec("ALTER TABLE reception_intakes ADD COLUMN closure_note TEXT NOT NULL DEFAULT ''");
if(!intakeColumns.has('closed_at'))db.exec('ALTER TABLE reception_intakes ADD COLUMN closed_at TEXT');
if(!intakeColumns.has('closed_by'))db.exec('ALTER TABLE reception_intakes ADD COLUMN closed_by TEXT REFERENCES users(id) ON DELETE SET NULL');
if(!intakeColumns.has('linked_task_id'))db.exec('ALTER TABLE reception_intakes ADD COLUMN linked_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL');
const intakeEventColumns = new Set(db.prepare('PRAGMA table_info(reception_intake_events)').all().map(column=>column.name));
if(!intakeEventColumns.has('event_type'))db.exec("ALTER TABLE reception_intake_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'update'");
const intakeOriginColumns = new Set(db.prepare('PRAGMA table_info(reception_intake_origins)').all().map(column=>column.name));
if(intakeOriginColumns.size&&!intakeOriginColumns.has('source_channel'))db.exec("ALTER TABLE reception_intake_origins ADD COLUMN source_channel TEXT NOT NULL DEFAULT ''");
if(intakeOriginColumns.size&&!intakeOriginColumns.has('source_payload_json'))db.exec("ALTER TABLE reception_intake_origins ADD COLUMN source_payload_json TEXT NOT NULL DEFAULT '{}'");
if(intakeOriginColumns.size&&!intakeOriginColumns.has('sync_revision'))db.exec('ALTER TABLE reception_intake_origins ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0');
const intakeSchemaSql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reception_intakes'").get()?.sql||'';
if(/CHECK\s*\(\s*status\s+IN\s*\(/i.test(intakeSchemaSql)){
 const copyColumns=db.prepare('PRAGMA table_info(reception_intakes)').all().map(column=>column.name);
 db.exec('PRAGMA foreign_keys=OFF');db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE reception_intakes_unrestricted (
   id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
   contact_name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
   source TEXT NOT NULL DEFAULT 'Other', request_type TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'New', organization_name TEXT NOT NULL DEFAULT '',
   accounting_details_json TEXT NOT NULL DEFAULT '{}', workload_review_json TEXT NOT NULL DEFAULT '{}',
   assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
   next_action TEXT NOT NULL DEFAULT '', next_action_date TEXT, follow_up_completed_at TEXT,
   follow_up_completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
   closure_outcome TEXT NOT NULL DEFAULT '', closure_note TEXT NOT NULL DEFAULT '', closed_at TEXT,
   closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
   linked_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
   created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  const newColumns=db.prepare('PRAGMA table_info(reception_intakes_unrestricted)').all().map(column=>column.name),common=copyColumns.filter(column=>newColumns.includes(column));
  db.exec(`INSERT INTO reception_intakes_unrestricted(${common.join(',')}) SELECT ${common.join(',')} FROM reception_intakes`);
  db.exec('DROP TABLE reception_intakes; ALTER TABLE reception_intakes_unrestricted RENAME TO reception_intakes; COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 finally{db.exec('PRAGMA foreign_keys=ON');}
}
db.exec('CREATE INDEX IF NOT EXISTS idx_reception_intakes_follow_up ON reception_intakes(company_id,status,next_action_date,follow_up_completed_at); CREATE INDEX IF NOT EXISTS idx_reception_intakes_task ON reception_intakes(linked_task_id)');
function slugifyCompanyName(value){return String(value||'company').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'company';}
const usedSlugs=new Set(db.prepare('SELECT id,slug FROM companies WHERE slug IS NOT NULL AND slug<>\'\'').all().map(row=>row.slug));
for(const company of db.prepare('SELECT id,name,slug FROM companies ORDER BY created_at,id').all())if(!company.slug){let slug=slugifyCompanyName(company.name),candidate=slug,n=2;while(usedSlugs.has(candidate))candidate=`${slug}-${n++}`;db.prepare('UPDATE companies SET slug=? WHERE id=?').run(candidate,company.id);usedSlugs.add(candidate);}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug)');
const activityColumns = new Set(db.prepare('PRAGMA table_info(activities)').all().map(column=>column.name));
if(!activityColumns.has('company_id'))db.exec('ALTER TABLE activities ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL');
db.exec('CREATE INDEX IF NOT EXISTS idx_activities_company_time ON activities(company_id,time DESC)');
const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(column=>column.name));
if(!projectColumns.has('project_manager_user_id'))db.exec('ALTER TABLE projects ADD COLUMN project_manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
if(!projectColumns.has('stage'))db.exec("ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'Lead'");
db.exec('CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(project_manager_user_id,status,target_date)');

const seedCompanies = [
 {id:'aspect-holdings',name:'Aspect Companies',legalName:'Aspect Companies',type:'Holding company',status:'Active',industry:'Management',location:'Not specified',employees:0,owner:'Unassigned',updatedAt:new Date().toISOString(),description:'Main company for the Aspect Companies organization.',parentId:null},
 {id:'aspect-property',name:'Signature Exteriors',legalName:'Signature Exteriors',type:'Operating company',status:'Active',industry:'Exteriors',location:'Not specified',employees:0,owner:'Unassigned',updatedAt:new Date().toISOString(),description:'',parentId:'aspect-holdings'},
 {id:'aspect-ventures',name:'Aspect Accounting',legalName:'Aspect Accounting',type:'Operating company',status:'Active',industry:'Accounting',location:'Not specified',employees:0,owner:'Unassigned',updatedAt:new Date().toISOString(),description:'',parentId:'aspect-holdings'},
 {id:'aspect-operations',name:'Aspect Consulting Group',legalName:'Aspect Consulting Group',type:'Operating company',status:'Active',industry:'Consulting',location:'Not specified',employees:0,owner:'Unassigned',updatedAt:new Date().toISOString(),description:'',parentId:'aspect-holdings'},
 {id:'aspect-logistics',name:'ELEVATE',legalName:'ELEVATE',type:'Operating company',status:'Active',industry:'Education',location:'Not specified',employees:0,owner:'Unassigned',updatedAt:new Date().toISOString(),description:'Educational courses.',parentId:'aspect-holdings'},
 {id:'aspect-loadaxis',name:'LoadAxis',legalName:'LoadAxis',type:'Operating company',status:'In setup',industry:'Not specified',location:'Not specified',employees:0,owner:'Unassigned',updatedAt:new Date().toISOString(),description:'',parentId:'aspect-holdings'}
];
const legacyCompanyNames = [
 {id:'aspect-holdings',oldName:'Aspect Holdings',name:'Aspect Companies',oldLegalName:'Aspect Holdings, Inc.',oldType:'Holding company',type:'Holding company',oldStatus:'Active',status:'Active',oldIndustry:'Management',industry:'Management',oldLocation:'New York, NY',oldEmployees:12,oldOwner:'Maya Bennett',oldDescription:'Parent company overseeing the Aspect Companies portfolio.',description:'Main company for the Aspect Companies organization.'},
 {id:'aspect-property',oldName:'Aspect Property Group',name:'Signature Exteriors',oldLegalName:'Aspect Property Group, LLC',oldType:'Real estate',type:'Operating company',oldStatus:'Active',status:'Active',oldIndustry:'Real estate',industry:'Exteriors',oldLocation:'New York, NY',oldEmployees:24,oldOwner:'Jordan Lee',oldDescription:'Property acquisition, management, and development.',description:''},
 {id:'aspect-ventures',oldName:'Aspect Ventures',name:'Aspect Accounting',oldLegalName:'Aspect Ventures, LLC',oldType:'Investment',type:'Operating company',oldStatus:'Active',status:'Active',oldIndustry:'Investment',industry:'Accounting',oldLocation:'Brooklyn, NY',oldEmployees:8,oldOwner:'Sam Rivera',oldDescription:'Investment and venture development across the group.',description:''},
 {id:'aspect-operations',oldName:'Aspect Operations',name:'Aspect Consulting Group',oldLegalName:'Aspect Operations, Inc.',oldType:'Shared services',type:'Operating company',oldStatus:'Active',status:'Active',oldIndustry:'Business services',industry:'Consulting',oldLocation:'New York, NY',oldEmployees:31,oldOwner:'Taylor Morgan',oldDescription:'Centralized operational support for portfolio companies.',description:''},
 {id:'aspect-logistics',oldName:'Aspect Logistics',priorName:'Upscale Marketing',priorName2:'Elevate',oldLegalName:'Aspect Logistics, LLC',priorLegalName:'Upscale Marketing',priorLegalName2:'Elevate',name:'ELEVATE',oldType:'Operating company',type:'Operating company',oldStatus:'In setup',status:'Active',oldIndustry:'Logistics',industry:'Education',oldLocation:'Newark, NJ',oldEmployees:0,oldOwner:'Alex Chen',oldDescription:'A new operating company currently being prepared for launch.',description:'Educational courses.'}
];
function normalizeLegacySeedCompany(company){
 const migration=legacyCompanyNames.find(item=>item.id===company.id&&[item.oldName,item.priorName,item.priorName2].includes(company.name));if(!migration)return company;
 return{...company,name:migration.name,legalName:[migration.oldLegalName,migration.priorLegalName,migration.priorLegalName2].includes(company.legalName)?migration.name:company.legalName,type:company.type===migration.oldType?migration.type:company.type,status:company.status===migration.oldStatus?migration.status:company.status,industry:company.industry===migration.oldIndustry||company.id==='aspect-logistics'&&company.industry==='Marketing'?migration.industry:company.industry,location:company.location===migration.oldLocation?'Not specified':company.location,employees:Number(company.employees)===migration.oldEmployees?0:company.employees,owner:company.owner===migration.oldOwner?'Unassigned':company.owner,description:company.description===migration.oldDescription||company.id==='aspect-logistics'&&!company.description?migration.description:company.description,updatedAt:new Date().toISOString()};
}
function normalizeLegacySampleActivity(activity){
 let title=String(activity.title||''),detail=String(activity.detail||'');
 for(const migration of legacyCompanyNames){for(const oldName of [migration.oldName,migration.priorName,migration.priorName2].filter(Boolean)){title=title.replaceAll(oldName,migration.name);detail=detail.replaceAll(oldName,migration.name);}}
 if(detail==='Company profile created by Maya Bennett')detail='Company profile created during workspace setup.';
 if(detail==='Business details reviewed by Taylor Morgan')detail='Business details reviewed during workspace setup.';
 return{...activity,title,detail};
}
function migrateLegacySeedRows(){
 const select=db.prepare('SELECT * FROM companies WHERE id=?'),update=db.prepare('UPDATE companies SET name=?,legal_name=?,type=?,status=?,industry=?,location=?,employees=?,owner=?,description=?,updated_at=? WHERE id=? AND name=?');
 for(const migration of legacyCompanyNames){const row=select.get(migration.id);if(!row||![migration.oldName,migration.priorName,migration.priorName2].includes(row.name))continue;const normalized=normalizeLegacySeedCompany({id:row.id,name:row.name,legalName:row.legal_name,type:row.type,status:row.status,industry:row.industry,location:row.location,employees:row.employees,owner:row.owner,description:row.description,updatedAt:row.updated_at});update.run(normalized.name,normalized.legalName,normalized.type,normalized.status,normalized.industry,normalized.location,normalized.employees,normalized.owner,normalized.description,new Date().toISOString(),row.id,row.name);}
}
function migrateElevatePortal(){const row=db.prepare("SELECT id,name,legal_name,industry,description,slug FROM companies WHERE id='aspect-logistics'").get();if(!row)return;const priorName=['Upscale Marketing','Elevate','Elevate (Marketing Company)','Aspect Logistics'].includes(row.name),name=priorName?'ELEVATE':row.name,industry=['Marketing','Logistics'].includes(row.industry)?'Education':row.industry,priorLegalName=['Aspect Logistics, LLC','Upscale Marketing','Elevate'].includes(row.legal_name),legalName=priorLegalName?'ELEVATE':row.legal_name,description=!row.description||row.description==='A new operating company currently being prepared for launch.'||['Marketing','Logistics'].includes(row.industry)?'Educational courses.':row.description;let slug=row.slug;if(['upscale-marketing','elevate-marketing-company','aspect-logistics'].includes(slug)){slug='elevate';if(db.prepare("SELECT 1 FROM companies WHERE slug='elevate' AND id<>'aspect-logistics'").get())slug=row.slug;}db.prepare('UPDATE companies SET name=?,legal_name=?,industry=?,description=?,slug=? WHERE id=?').run(name,legalName,industry,description,slug,row.id);}
function migrateLegacySampleActivities(){
 const update=db.prepare('UPDATE activities SET title=?,detail=? WHERE id=?');
 for(const activity of db.prepare('SELECT id,title,detail FROM activities').all()){const normalized=normalizeLegacySampleActivity(activity);if(normalized.title!==activity.title||normalized.detail!==activity.detail)update.run(normalized.title,normalized.detail,activity.id);}
}
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
 const derived = (await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex');
 return `${salt}:${derived}`;
}
async function verifyPassword(password, encoded) {
 const [salt, expected] = String(encoded).split(':');
 if (!salt || !expected) return false;
 const actual = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
 const wanted = Buffer.from(expected, 'hex');
 return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
function tokenDigest(token) { return createHash('sha256').update(token).digest('hex'); }
function loginAttemptKeys(req,email){
 const forwarded=process.env.ASPECT_TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';
 const address=forwarded||req.socket.remoteAddress||'unknown',credentialHash=createHash('sha256').update(email).digest('hex');
 return[{key:`ip:${address}`,limit:20},{key:`credential:${address}:${credentialHash}`,limit:6}];
}
function loginRetryAfter(req,email){
 const now=Date.now();let seconds=0;
 for(const[key,entry]of loginFailures){if(entry.resetAt<=now)loginFailures.delete(key);}
 for(const item of loginAttemptKeys(req,email)){const entry=loginFailures.get(item.key);if(entry&&entry.count>=item.limit)seconds=Math.max(seconds,Math.ceil((entry.resetAt-now)/1000));}
 return Math.max(0,seconds);
}
function recordLoginFailure(req,email){
 const now=Date.now();let seconds=0;
 for(const item of loginAttemptKeys(req,email)){
  const previous=loginFailures.get(item.key),entry=!previous||previous.resetAt<=now?{count:0,resetAt:now+LOGIN_RATE_WINDOW_MS}:previous;
  entry.count++;loginFailures.set(item.key,entry);
  if(entry.count>=item.limit)seconds=Math.max(seconds,Math.ceil((entry.resetAt-now)/1000));
 }
 if(loginFailures.size>10000){for(const[key,entry]of loginFailures){if(entry.resetAt<=now)loginFailures.delete(key);if(loginFailures.size<=8000)break;}}
 return seconds;
}
function clearLoginFailures(req,email){for(const item of loginAttemptKeys(req,email))loginFailures.delete(item.key);}
function mapCompany(row) {
 return { id: row.id, slug:row.slug, name: row.name, legalName: row.legal_name, type: row.type, status: row.status, industry: row.industry, location: row.location, employees: row.employees, owner: row.owner, description: row.description, parentId: row.parent_id, timeZone:row.time_zone||'America/New_York', logoUrl:row.logo_data?`/api/companies/${encodeURIComponent(row.id)}/logo?v=${encodeURIComponent(row.updated_at||'')}`:null, profileConfirmed:!!row.profile_confirmed, createdAt: row.created_at, updatedAt: row.updated_at };
}
function normalizeCompanyLogoData(value) {
 if(value===null)return{valid:true,data:null};
 if(typeof value!=='string'||value.length>Math.ceil(MAX_COMPANY_LOGO_BYTES/3)*4+64)return{valid:false,data:null};
 const match=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)return{valid:false,data:null};
 const bytes=Buffer.from(match[2],'base64');
 if(!bytes.length||bytes.length>MAX_COMPANY_LOGO_BYTES||bytes.toString('base64')!==match[2])return{valid:false,data:null};
 const signatureValid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff:bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
 return signatureValid?{valid:true,data:value}:{valid:false,data:null};
}
function insertCompany(c) {
 let slug=c.slug||slugifyCompanyName(c.name),base=slug,n=2;while(db.prepare('SELECT 1 FROM companies WHERE slug=? AND id<>?').get(slug,c.id))slug=`${base}-${n++}`;
 db.prepare(`INSERT OR IGNORE INTO companies(id,name,legal_name,type,status,industry,location,employees,owner,description,parent_id,created_at,updated_at,slug,time_zone,logo_data)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.id,c.name,c.legalName||c.name,c.type,c.status||'In setup',c.industry||'General',c.location||'Not specified',Number(c.employees)||0,c.owner||'Unassigned',c.description||'',c.parentId??null,c.createdAt||c.updatedAt||new Date().toISOString(),c.updatedAt||new Date().toISOString(),slug,c.timeZone||'America/New_York',c.logoData||null);
}
function ensureCompanySlugs(){const used=new Set(db.prepare('SELECT slug FROM companies WHERE slug IS NOT NULL AND slug<>\'\'').all().map(row=>row.slug));for(const company of db.prepare('SELECT id,name,slug FROM companies ORDER BY created_at,id').all())if(!company.slug){const base=slugifyCompanyName(company.name);let slug=base,n=2;while(used.has(slug))slug=`${base}-${n++}`;db.prepare('UPDATE companies SET slug=? WHERE id=?').run(slug,company.id);used.add(slug);}}
function ensureAddedStarterCompanies() {
 const rootExists=db.prepare('SELECT 1 AS found FROM companies WHERE id=?').get('aspect-holdings');
 if(!rootExists)return;
 const loadAxis=seedCompanies.find(company=>company.id==='aspect-loadaxis');
 if(loadAxis)insertCompany(loadAxis);
}
function migrateLegacyMembershipRoles(){
 const migrationId='membership-roles-from-legacy-v1';
 if(db.prepare('SELECT 1 FROM portal_migrations WHERE id=?').get(migrationId))return;
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec("UPDATE memberships SET role=CASE WHEN (SELECT role FROM users WHERE users.id=memberships.user_id)='manager' THEN 'manager' ELSE 'member' END WHERE role='member'");
  db.prepare('INSERT INTO portal_migrations(id,applied_at) VALUES(?,?)').run(migrationId,new Date().toISOString());db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
function normalizeLegacyManagerRoles(){
 const legacyUsers=db.prepare("SELECT 1 FROM users WHERE role='manager' LIMIT 1").get(),legacyMemberships=db.prepare("SELECT 1 FROM memberships WHERE role='manager' LIMIT 1").get();
 if(!legacyUsers&&!legacyMemberships)return;
 db.exec('BEGIN IMMEDIATE');
 try{db.exec("UPDATE users SET role='member' WHERE role='manager'; UPDATE memberships SET role='member' WHERE role='manager';");db.exec('COMMIT');}
 catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
function migrateLegacyMembershipScopes(){
 const migrationId='direct-company-memberships-v1';
 if(db.prepare('SELECT 1 FROM portal_migrations WHERE id=?').get(migrationId))return;
 const companies=db.prepare('SELECT id,parent_id FROM companies').all(),children=new Map();
 for(const company of companies){if(!company.parent_id)continue;if(!children.has(company.parent_id))children.set(company.parent_id,[]);children.get(company.parent_id).push(company.id);}
 const memberships=db.prepare("SELECT m.user_id,m.company_id,m.role,m.active,u.role AS platform_role FROM memberships m JOIN users u ON u.id=m.user_id ORDER BY m.company_id,m.user_id").all(),direct=new Set(memberships.map(item=>`${item.user_id}:${item.company_id}`)),insert=db.prepare('INSERT INTO memberships(user_id,company_id,role,active) VALUES(?,?,?,?) ON CONFLICT(user_id,company_id) DO NOTHING'),now=new Date().toISOString();
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const membership of memberships){if(membership.platform_role==='admin')continue;const pending=[...(children.get(membership.company_id)||[])],visited=new Set();
   while(pending.length){const companyId=pending.pop();if(visited.has(companyId))continue;visited.add(companyId);if(!direct.has(`${membership.user_id}:${companyId}`))insert.run(membership.user_id,companyId,membership.role,membership.active);pending.push(...(children.get(companyId)||[]));}
  }
  db.prepare('INSERT INTO portal_migrations(id,applied_at) VALUES(?,?)').run(migrationId,now);db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
async function initializeData() {
 await fs.mkdir(DATA_DIR, { recursive: true });
 migrateLegacySeedRows();
 migrateElevatePortal();
 migrateLegacySampleActivities();
 const count = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
 if (count) { ensureAddedStarterCompanies(); ensureCompanySlugs(); migrateLegacyMembershipScopes(); normalizeLegacyManagerRoles(); return; }
 let existing;
 try { existing = JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); } catch { existing = null; }
 const companies = existing?.companies?.length ? existing.companies.map(c=>normalizeLegacySeedCompany({...c,parentId:c.id==='aspect-holdings'?null:(c.parentId??'aspect-holdings')})) : seedCompanies;
 const seed = db.prepare(`INSERT INTO companies(id,name,legal_name,type,status,industry,location,employees,owner,description,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 db.exec('BEGIN');
 try {
   for(const c of companies) seed.run(c.id,c.name,c.legalName||c.name,c.type,c.status||'In setup',c.industry||'General',c.location||'Not specified',Number(c.employees)||0,c.owner||'Unassigned',c.description||'',c.parentId??null,c.updatedAt||new Date().toISOString(),c.updatedAt||new Date().toISOString());
    for(const original of existing?.activities||[]){const a=normalizeLegacySampleActivity(original);db.prepare('INSERT OR IGNORE INTO activities(id,title,detail,time,kind) VALUES(?,?,?,?,?)').run(a.id||randomUUID(),a.title,a.detail,a.time,a.kind||'system');}
   db.exec('COMMIT');
 } catch(error) { db.exec('ROLLBACK'); throw error; }
 ensureAddedStarterCompanies();
 ensureCompanySlugs();
 migrateLegacyMembershipScopes();
 normalizeLegacyManagerRoles();
}
function send(res, status, body, type='application/json; charset=utf-8', headers={}) {
 res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Opener-Policy':'same-origin',...headers});
 res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
const liveUpdateClients=new Set();
const LIVE_UPDATE_TOPICS=new Set(['work-items','calendar','notifications','reception']);
function liveUpdatesEnabled(){return !['false','0','off','no'].includes(String(process.env.PORTAL_LIVE_UPDATES||'true').trim().toLowerCase());}
function closeLiveUpdateClient(client,endResponse=true){
 if(client.closed)return;
 client.closed=true;
 clearInterval(client.heartbeat);
 liveUpdateClients.delete(client);
 if(endResponse&&!client.res.writableEnded){try{client.res.end();}catch{}}
}
function closeAllLiveUpdateClients(){for(const client of liveUpdateClients)closeLiveUpdateClient(client);}
function broadcastCompanyUpdate(companyId,topics,sourceClientId='',sourceUserId=''){
 if(!companyId||!liveUpdatesEnabled())return;
 const safeTopics=[...new Set((Array.isArray(topics)?topics:[topics]).filter(topic=>LIVE_UPDATE_TOPICS.has(topic)))];
 if(!safeTopics.length)return;
 for(const client of liveUpdateClients){
  if(!client.companyIds.has(companyId)||client.closed||client.res.destroyed||client.res.writableEnded)continue;
  try{if(!client.res.write(`event: update\ndata: ${JSON.stringify({topics:safeTopics,fromThisTab:Boolean(sourceClientId&&sourceUserId===client.user.id&&sourceClientId===client.clientId)})}\n\n`))closeLiveUpdateClient(client);}catch{closeLiveUpdateClient(client);}
 }
}
function broadcastCompaniesUpdate(companyIds,topics,sourceClientId='',sourceUserId=''){
 for(const companyId of new Set((companyIds||[]).filter(Boolean)))broadcastCompanyUpdate(companyId,topics,sourceClientId,sourceUserId);
}
function broadcastUsersUpdate(userIds,topics,sourceClientId='',sourceUserId='',payload={}){
 if(!liveUpdatesEnabled())return;
 const recipients=new Set((userIds||[]).filter(id=>typeof id==='string'&&id));if(!recipients.size)return;
 const safeTopics=[...new Set((Array.isArray(topics)?topics:[topics]).filter(topic=>LIVE_UPDATE_TOPICS.has(topic)))];if(!safeTopics.length)return;
 for(const client of liveUpdateClients){
  if(!recipients.has(client.user.id)||client.closed||client.res.destroyed||client.res.writableEnded)continue;
  const message={...payload,topics:safeTopics,fromThisTab:Boolean(sourceClientId&&sourceUserId===client.user.id&&sourceClientId===client.clientId)};
  try{if(!client.res.write(`event: update\ndata: ${JSON.stringify(message)}\n\n`))closeLiveUpdateClient(client);}catch{closeLiveUpdateClient(client);}
 }
}
function nextUpdateTimestamp(previous){const prior=Date.parse(previous||''),now=Date.now();return new Date(Number.isFinite(prior)?Math.max(now,prior+1):now).toISOString();}
function requestClientId(req){const value=String(req.headers['x-portal-client-id']||'');return /^[A-Za-z0-9_-]{1,80}$/.test(value)?value:'';}
function startLiveUpdateStream(req,res,user,url){
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)return send(res,403,{error:'Request origin was not accepted.'});}catch{return send(res,403,{error:'Request origin was not accepted.'});}}
 if(!liveUpdatesEnabled()){
  res.writeHead(204,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  return res.end();
 }
 if(liveUpdateClients.size>=1000){res.writeHead(204,{'Cache-Control':'no-store'});return res.end();}
 const companyIds=new Set(userCompanyIds(user));
 if(!companyIds.size&&!hasSystemDevelopmentAccess(user)){res.writeHead(204,{'Cache-Control':'no-store'});return res.end();}
 const requestedClientId=url.searchParams.get('clientId')||'',clientId=/^[A-Za-z0-9_-]{1,80}$/.test(requestedClientId)?requestedClientId:'';
 const client={req,res,user,companyIds,clientId,closed:false,heartbeat:null,lastSessionCheck:Date.now()};
 liveUpdateClients.add(client);
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Opener-Policy':'same-origin'});
 res.flushHeaders?.();
 res.write('retry: 12000\n: connected\n\n');
 if(!hasSystemDevelopmentAccess(user))res.write(`event: update\ndata: ${JSON.stringify({collaborationAccessChanged:{hasAccess:false}})}\n\n`);
 client.heartbeat=setInterval(()=>{
  if(client.closed)return;
  try{
   if(Date.now()-client.lastSessionCheck>=60000){
    const currentUser=sessionUser(req);
    if(!currentUser){res.write('event: session-expired\ndata: {}\n\n');return closeLiveUpdateClient(client);}
    client.user=currentUser;
    client.companyIds=new Set(userCompanyIds(currentUser));
    client.lastSessionCheck=Date.now();
   }
   if(!res.write(': keep-alive\n\n'))closeLiveUpdateClient(client);
  }catch{closeLiveUpdateClient(client,false);}
 },20000);
 client.heartbeat.unref?.();
 res.on('close',()=>closeLiveUpdateClient(client,false));
 res.on('error',()=>closeLiveUpdateClient(client,false));
}
function isUniqueConstraintError(error){return error?.code==='ERR_SQLITE_CONSTRAINT_UNIQUE'||error?.errcode===SQLITE_CONSTRAINT_UNIQUE;}
async function bodyJson(req, maxChars=1e6) {
 let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>maxChars) throw new Error('Request body too large'); }
 return raw?JSON.parse(raw):{};
}
function normalizeClientImportHeader(value){return String(value??'').normalize('NFKC').trim().toLocaleLowerCase().replace(/[^a-z0-9]/g,'');}
function normalizeClientImportCompany(value){return String(value??'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');}
function normalizeClientImportName(value){return String(value??'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');}
function clientImportCellText(cell){
 const value=cell?.value;if(value===null||value===undefined)return'';
 if(value instanceof Date)return value.toISOString().slice(0,10);
 if(typeof value==='object'){
  if(Array.isArray(value.richText))return value.richText.map(part=>String(part.text||'')).join('').trim();
  if(typeof value.text==='string')return value.text.trim();
  if(Object.hasOwn(value,'formula'))return value.result===undefined?'':String(value.result).trim();
  return'';
 }
 return(typeof cell.text==='string'?cell.text:String(value)).trim();
}
function clientImportBuffer(input){
 const fileName=typeof input?.fileName==='string'?path.basename(input.fileName):'',extension=path.extname(fileName).toLowerCase(),encoded=input?.fileData;
 if(!['.xlsx','.csv'].includes(extension))throw new Error('Choose an Excel workbook (.xlsx) or CSV file.');
 if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_CLIENT_IMPORT_BYTES*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new Error('Choose a valid spreadsheet file up to 4 MB.');
 const buffer=Buffer.from(encoded,'base64');if(!buffer.length||buffer.length>MAX_CLIENT_IMPORT_BYTES)throw new Error('Choose a valid spreadsheet file up to 4 MB.');
 if(extension==='.xlsx'&&!buffer.subarray(0,4).equals(Buffer.from([80,75,3,4])))throw new Error('The selected file is not a valid Excel workbook.');
 if(extension==='.csv'&&buffer.includes(0))throw new Error('The selected CSV file is not valid text.');
 return{fileName,extension,buffer};
}
function validateClientImportArchive(buffer){
 const searchStart=Math.max(0,buffer.length-22-0xffff);let endRecord=-1;
 for(let offset=buffer.length-22;offset>=searchStart;offset--){if(buffer.readUInt32LE(offset)===0x06054b50){const commentLength=buffer.readUInt16LE(offset+20);if(offset+22+commentLength<=buffer.length){endRecord=offset;break;}}}
 if(endRecord<0)throw new Error('The selected file is not a valid Excel workbook.');
 const entryCount=buffer.readUInt16LE(endRecord+10),directorySize=buffer.readUInt32LE(endRecord+12),directoryOffset=buffer.readUInt32LE(endRecord+16);
 if(entryCount===0xffff||directorySize===0xffffffff||directoryOffset===0xffffffff||entryCount>1000||directoryOffset+directorySize>endRecord)throw new Error('This Excel workbook is not supported or exceeds the import limits.');
 let offset=directoryOffset,totalExpanded=0;
 for(let index=0;index<entryCount;index++){
  if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('The selected file is not a valid Excel workbook.');
  const flags=buffer.readUInt16LE(offset+8),compressed=buffer.readUInt32LE(offset+20),expanded=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28),extraLength=buffer.readUInt16LE(offset+30),commentLength=buffer.readUInt16LE(offset+32),nameStart=offset+46,nameEnd=nameStart+nameLength,next=nameEnd+extraLength+commentLength;
  if((flags&1)||compressed===0xffffffff||expanded===0xffffffff||next>buffer.length)throw new Error('Encrypted or oversized Excel workbooks are not supported.');
  const entryName=buffer.toString('utf8',nameStart,nameEnd).replace(/\\/g,'/');if(entryName.startsWith('/')||entryName.split('/').includes('..'))throw new Error('The Excel workbook contains an invalid entry.');
  totalExpanded+=expanded;if(totalExpanded>MAX_CLIENT_IMPORT_EXPANDED_BYTES)throw new Error('The Excel workbook expands beyond the 64 MB import limit.');offset=next;
 }
 if(offset!==directoryOffset+directorySize)throw new Error('The selected file is not a valid Excel workbook.');
}
async function readClientImportRows(input){
 const {fileName,extension,buffer}=clientImportBuffer(input),workbook=new ExcelJS.Workbook();
 if(extension==='.xlsx')validateClientImportArchive(buffer);
 try{if(extension==='.csv')await workbook.csv.read(Readable.from([buffer]),{sheetName:'Clients'});else await workbook.xlsx.load(buffer);}
 catch{throw new Error('The spreadsheet could not be read. Save it as an Excel Workbook (.xlsx) or CSV and try again.');}
 const worksheet=workbook.getWorksheet('Clients')||workbook.worksheets[0];if(!worksheet)throw new Error('The workbook does not contain a Clients worksheet.');
 if(worksheet.rowCount>MAX_CLIENT_IMPORT_ROWS+1)throw new Error(`The spreadsheet can contain up to ${MAX_CLIENT_IMPORT_ROWS} client rows.`);
 const headerRow=worksheet.getRow(1);if(headerRow.cellCount>50)throw new Error('The header row has too many columns. Use the downloadable template.');
 const columnByKey=new Map();
 for(let column=1;column<=headerRow.cellCount;column++){
  const header=normalizeClientImportHeader(clientImportCellText(headerRow.getCell(column)));if(!header)continue;
  const field=CLIENT_IMPORT_COLUMNS.find(item=>item.aliases.some(alias=>normalizeClientImportHeader(alias)===header));if(!field)continue;
  if(columnByKey.has(field.key))throw new Error(`The header "${field.header}" appears more than once.`);columnByKey.set(field.key,column);
 }
 const missing=CLIENT_IMPORT_COLUMNS.filter(field=>['company','name'].includes(field.key)&&!columnByKey.has(field.key)).map(field=>field.header);
 if(missing.length)throw new Error(`Add these required columns to the first row: ${missing.join(', ')}.`);
 const rows=[];
 for(let rowNumber=2;rowNumber<=worksheet.rowCount;rowNumber++){
  const row=worksheet.getRow(rowNumber),values={};for(const field of CLIENT_IMPORT_COLUMNS)values[field.key]=columnByKey.has(field.key)?clientImportCellText(row.getCell(columnByKey.get(field.key))):'';
  if(Object.values(values).every(value=>!String(value||'').trim()))continue;
  rows.push({rowNumber,...values});if(rows.length>MAX_CLIENT_IMPORT_ROWS)throw new Error(`The spreadsheet can contain up to ${MAX_CLIENT_IMPORT_ROWS} client rows.`);
 }
 if(!rows.length)throw new Error('The spreadsheet has no client rows below its header.');
 return{fileName,rows};
}
function assessClientImportRows(rows,user){
 const companyIds=userCompanyIds(user).filter(id=>canManageCompany(user,id)),companies=companyIds.length?db.prepare(`SELECT id,name FROM companies WHERE id IN (${companyIds.map(()=>'?').join(',')})`).all(...companyIds):[],companyIndex=new Map(),existing=new Set(),seen=new Set();
 for(const company of companies){const key=normalizeClientImportCompany(company.name),matches=companyIndex.get(key)||[];matches.push(company);companyIndex.set(key,matches);}
 const assignableByCompany=new Map(companies.map(company=>[company.id,new Map(listClientAssignableUsers(company.id).map(person=>[normalizeClientImportName(person.email),person]))]));
 if(companyIds.length)for(const client of db.prepare(`SELECT company_id,name FROM clients WHERE company_id IN (${companyIds.map(()=>'?').join(',')})`).all(...companyIds))existing.add(client.company_id+'|'+normalizeClientImportName(client.name));
 return rows.map(row=>{
  const companyText=String(row.company||'').trim(),name=String(row.name||'').trim(),contactName=String(row.contactName||'').trim(),email=String(row.email||'').trim(),phone=String(row.phone||'').trim(),location=String(row.location||'').trim(),notes=String(row.notes||'').trim(),assignedUserEmails=String(row.assignedUserEmails||'').trim(),errors=[];
  const matches=companyIndex.get(normalizeClientImportCompany(companyText))||[],company=matches.length===1?matches[0]:null;
  if(!company)errors.push(matches.length>1?'Company name matches more than one company.':'Company must match a company you can manage.');
  if(name.length<2||name.length>160)errors.push('Client name must be 2–160 characters.');
  if(contactName.length>120)errors.push('Contact name must be 120 characters or fewer.');
  if(email.length>254||email&&!/^\S+@\S+\.\S+$/.test(email))errors.push('Enter a valid email address (254 characters or fewer).');
  if(phone.length>40)errors.push('Phone must be 40 characters or fewer.');
  if(location.length>160)errors.push('Location must be 160 characters or fewer.');
  if(notes.length>4000)errors.push('Notes must be 4,000 characters or fewer.');
  const assignmentEmails=[...new Set(assignedUserEmails.split(/[;,]/).map(value=>normalizeClientImportName(value)).filter(Boolean))],assignedUsers=[];
  if(assignmentEmails.length>20)errors.push('Assign no more than 20 users to a client.');
  if(company){const userByEmail=assignableByCompany.get(company.id)||new Map();for(const assignedEmail of assignmentEmails){const person=userByEmail.get(assignedEmail);if(!person)errors.push(`Assigned user ${assignedEmail} does not have active access to ${company.name}.`);else assignedUsers.push(person);}}
  const item={rowNumber:row.rowNumber,companyId:company?.id||'',companyName:company?.name||companyText,name,contactName,email,phone,location,notes,assignedUserEmails:assignedUsers.map(person=>person.email).join('; '),assignedUserNames:assignedUsers.map(person=>person.name),assignedUserIds:assignedUsers.map(person=>person.id),status:'ready',issue:''};
  if(errors.length){item.status='invalid';item.issue=errors.join(' ');return item;}
  const key=company.id+'|'+normalizeClientImportName(name);
  if(existing.has(key)){item.status='duplicate';item.issue='A client with this name already exists for this company.';return item;}
  if(seen.has(key)){item.status='duplicate';item.issue='This client name appears more than once in the spreadsheet for this company.';return item;}
  seen.add(key);return item;
 });
}
async function buildClientImportTemplate(user){
 const workbook=new ExcelJS.Workbook();workbook.creator='Aspect Companies';workbook.created=new Date();
 const clients=workbook.addWorksheet('Clients');clients.columns=CLIENT_IMPORT_COLUMNS.map(field=>({header:field.header,key:field.key,width:field.key==='notes'?42:field.key==='company'||field.key==='name'?28:field.key==='assignedUserEmails'?34:22}));
 clients.views=[{state:'frozen',ySplit:1}];clients.autoFilter=`A1:${String.fromCharCode(64+CLIENT_IMPORT_COLUMNS.length)}1`;clients.getRow(1).font={bold:true,color:{argb:'FF302F28'}};clients.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF0BF'}};clients.getRow(1).height=24;
 const instructions=workbook.addWorksheet('Instructions');instructions.columns=[{width:29},{width:100}];instructions.addRow(['Aspect Companies client import','Instructions']);instructions.getRow(1).font={bold:true,size:14,color:{argb:'FF302F28'}};
 instructions.addRow(['Required columns','Company and Client name. Other fields may be blank.']);instructions.addRow(['Company','Enter the exact company name shown in the portal.']);instructions.addRow(['Assigned user emails','Optional. Enter active company user email addresses separated by semicolons.']);instructions.addRow(['Duplicates','Existing clients and repeated company/name pairs in this file are skipped, not overwritten.']);instructions.addRow(['Review','Upload the completed file to preview row errors and duplicates before importing.']);instructions.addRow(['Limits',`Excel Workbook (.xlsx) or CSV, up to ${MAX_CLIENT_IMPORT_ROWS} client rows and 4 MB.`]);
 const ids=userCompanyIds(user).filter(id=>canManageCompany(user,id)),companies=ids.length?db.prepare(`SELECT name FROM companies WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY name`).all(...ids):[];
 instructions.addRow(['Companies you can manage',companies.map(company=>company.name).join(', ')||'None']);
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
function validDocumentSignature(buffer,extension) {
 if(extension==='.pdf')return buffer.subarray(0,5).toString('ascii')==='%PDF-';
 if(extension==='.png')return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(extension==='.jpg'||extension==='.jpeg')return buffer.length>3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
 if(['.docx','.xlsx','.pptx'].includes(extension))return buffer.subarray(0,4).equals(Buffer.from([80,75,3,4]));
 if(extension==='.txt'||extension==='.csv')return !buffer.includes(0);
 return false;
}
function mapDocument(row){return{id:row.id,companyId:row.company_id,name:row.original_name,mimeType:row.mime_type,sizeBytes:row.size_bytes,category:row.category,description:row.description,uploader:row.uploader,createdAt:row.created_at};}
function cookie(req,name) {
 const found=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`));
 return found?decodeURIComponent(found.slice(name.length+1)):null;
}
function sessionUser(req) {
 const token=cookie(req,SESSION_COOKIE); if(!token) return null;
 const row=db.prepare(`SELECT u.id,u.name,u.email,u.role,u.time_zone,u.calendar_color,u.must_change_password,u.job_title,u.phone,u.location,u.directory_visible,u.share_email,u.share_phone,u.share_location,s.company_id AS active_company_id,c.name AS active_company_name,c.slug AS active_company_slug FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN companies c ON c.id=s.company_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).get(tokenDigest(token),new Date().toISOString());
 if(!row) return null;
 const memberships=db.prepare(`SELECT c.id,c.name,c.slug,c.status,m.role,m.active FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? ORDER BY c.name`).all(row.id).map(item=>({...item,active:!!item.active}));
  return {...row,timeZone:row.time_zone||null,calendarColor:row.calendar_color||'gold',calendarColorOptions:calendarColorOptionsForUser(row.id,row.role,row.calendar_color||'gold'),jobTitle:row.job_title||'',phone:row.phone||'',location:row.location||'',directoryVisible:!!row.directory_visible,shareEmail:!!row.share_email,sharePhone:!!row.share_phone,shareLocation:!!row.share_location,activeCompanyId:row.active_company_id,activeCompanyName:row.active_company_name,activeCompanySlug:row.active_company_slug,activeCompanyRole:row.role==='admin'?'admin':memberships.find(item=>item.id===row.active_company_id&&item.active)?.role||null,mustChangePassword:!!row.must_change_password,canAccessSystemDevelopment:hasSystemDevelopmentAccess({id:row.id,role:row.role,active:true}),memberships};
}
function sessionCookie(token,maxAgeSeconds=SESSION_DAYS*86400) {
 return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAgeSeconds))}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
function makeSession(userId,companyId=null) {
 const token=randomBytes(32).toString('base64url');
 const expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString();
 db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,company_id) VALUES(?,?,?,?,?)').run(tokenDigest(token),userId,expires,new Date().toISOString(),companyId);
 return sessionCookie(token);
}
function renewSession(req,res,requestPath) {
 if(req.method==='POST'&&requestPath==='/api/auth/logout')return;
 const token=cookie(req,SESSION_COOKIE);if(!token)return;
 const tokenHash=tokenDigest(token),now=Date.now(),nowIso=new Date(now).toISOString();
 const row=db.prepare('SELECT s.token_hash,s.created_at,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(tokenHash,nowIso);
 if(!row)return;
 const currentExpiry=Date.parse(row.expires_at),absoluteExpiry=Date.parse(row.created_at)+SESSION_MAX_DAYS*86400000;
 if(!Number.isFinite(currentExpiry)||!Number.isFinite(absoluteExpiry)||absoluteExpiry<=now||currentExpiry-now>SESSION_RENEW_WINDOW_MS)return;
 const nextExpiry=Math.min(now+SESSION_DAYS*86400000,absoluteExpiry);
 if(nextExpiry<=currentExpiry+60000)return;
 db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(new Date(nextExpiry).toISOString(),row.token_hash);
 res.setHeader('Set-Cookie',sessionCookie(token,Math.ceil((nextExpiry-now)/1000)));
}
function hasExpiredSession(req) {
 const token=cookie(req,SESSION_COOKIE);if(!token)return false;
 return Boolean(db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at<=?').get(tokenDigest(token),new Date().toISOString()));
}
function requireUser(req,res) { const user=sessionUser(req); if(!user) send(res,401,{error:'Please sign in to continue.'}); return user; }
function userCompanyIds(user) {
 const root=db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id;
 if(user.activeCompanyId){
  const activeCompany=db.prepare('SELECT status FROM companies WHERE id=?').get(user.activeCompanyId);
  if(!activeCompany||activeCompany.status==='Inactive'||user.role!=='admin'&&activeCompany.status!=='Active')return[];
  if(user.role==='admin'&&user.activeCompanyId===root)return db.prepare('SELECT id FROM companies').all().map(c=>c.id);
  if(user.role==='admin')return[user.activeCompanyId];
  return user.memberships.some(item=>item.id===user.activeCompanyId&&item.active)?[user.activeCompanyId]:[];
 }
 if(user.role==='admin')return db.prepare('SELECT id FROM companies').all().map(c=>c.id);
 return user.memberships.filter(item=>item.active&&item.status==='Active').map(item=>item.id);
}
function availablePortals(user) {
 const rows=user.role==='admin'?db.prepare("SELECT id,slug,name,status,parent_id AS parentId,updated_at AS updatedAt,logo_data AS logoData FROM companies WHERE status<>'Inactive' ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,name").all():db.prepare("SELECT c.id,c.slug,c.name,c.status,c.parent_id AS parentId,c.updated_at AS updatedAt,c.logo_data AS logoData FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? AND m.active=1 AND c.status='Active' ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,c.name").all(user.id);
 return rows.map(row=>({id:row.id,slug:row.slug,name:row.name,status:row.status,parentId:row.parentId,logoUrl:row.logoData?`/api/companies/${encodeURIComponent(row.id)}/logo?v=${encodeURIComponent(row.updatedAt||'')}`:null}));
}
function canManageCompany(user,id,rootCompanyId) { if(user.role!=='admin')return false;return !user.activeCompanyId||user.activeCompanyId===id||user.activeCompanyId===(rootCompanyId??db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id); }
function addActivity(title,detail,kind,companyId=null) { db.prepare('INSERT INTO activities(id,title,detail,time,kind,company_id) VALUES(?,?,?,?,?,?)').run(randomUUID(),title,detail,new Date().toISOString(),kind,companyId); }
function listCompanyActivity(companyId,limit=200) {
 const rowLimit=Math.max(1,Math.min(200,Number.isInteger(limit)?limit:200)),activities=db.prepare('SELECT id,title,detail,time,kind FROM activities WHERE company_id=? ORDER BY time DESC LIMIT ?').all(companyId,rowLimit);
 const taskEvents=db.prepare('SELECT e.id,e.event_type,e.detail,e.created_at,t.title AS task_title,c.name AS company_name,u.name AS actor_name FROM task_events e JOIN tasks t ON t.id=e.task_id JOIN companies c ON c.id=t.company_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE t.company_id=? ORDER BY e.created_at DESC LIMIT ?').all(companyId,rowLimit);
 for(const event of taskEvents)activities.push({id:event.id,title:event.event_type==='created'?'Task created':'Task updated',detail:`${event.task_title} · ${event.company_name} — ${event.detail}${event.actor_name?` by ${event.actor_name}`:''}`,time:event.created_at,kind:'task'});
 const projectEvents=db.prepare('SELECT e.id,e.event_type,e.detail,e.created_at,p.name AS project_name,c.name AS company_name,u.name AS actor_name FROM project_events e JOIN projects p ON p.id=e.project_id JOIN companies c ON c.id=p.company_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE p.company_id=? ORDER BY e.created_at DESC LIMIT ?').all(companyId,rowLimit);
 for(const event of projectEvents){const title=event.event_type==='created'?'Project created':event.event_type==='milestone'?(event.detail.startsWith('Milestone added:')?'Milestone added':'Milestone updated'):event.event_type==='document'?(event.detail.startsWith('Project document added:')?'Job document uploaded':'Job document removed'):'Project updated';activities.push({id:event.id,title,detail:`${event.project_name} · ${event.company_name} — ${event.detail}${event.actor_name?` by ${event.actor_name}`:''}`,time:event.created_at,kind:'project'});}
 const requestEvents=db.prepare('SELECT e.id,e.detail,e.created_at,p.name AS project_name,pc.name AS project_company_name,tc.name AS target_company_name,r.title AS request_title,u.name AS actor_name FROM project_request_events e JOIN project_requests r ON r.id=e.request_id JOIN projects p ON p.id=r.project_id JOIN companies pc ON pc.id=p.company_id JOIN companies tc ON tc.id=r.target_company_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE p.company_id=? OR r.target_company_id=? ORDER BY e.created_at DESC LIMIT ?').all(companyId,companyId,rowLimit);
 for(const event of requestEvents)activities.push({id:event.id,title:event.detail==='Shared request created.'?'Shared request created':'Shared request updated',detail:`${event.project_name} · ${event.request_title} · ${event.project_company_name} → ${event.target_company_name} — ${event.detail}${event.actor_name?` by ${event.actor_name}`:''}`,time:event.created_at,kind:'request'});
 return activities.sort((a,b)=>b.time.localeCompare(a.time)).slice(0,rowLimit);
}
function notificationCompanyAccess(userId,companyId){const account=db.prepare('SELECT role,active FROM users WHERE id=?').get(userId);if(!account?.active)return false;if(account.role==='admin')return Boolean(db.prepare("SELECT 1 FROM companies WHERE id=? AND status<>'Inactive'").get(companyId));return Boolean(db.prepare("SELECT 1 FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? AND m.company_id=? AND m.active=1 AND c.status='Active'").get(userId,companyId));}
function addNotification({recipientIds=[],actorId=null,title,message='',kind='update',entityType,entityId,companyId=null}){
 if(!entityType||!entityId||!title)return;
 const actorName=actorId?(db.prepare('SELECT name FROM users WHERE id=?').get(actorId)?.name||''):'';
 const insert=db.prepare('INSERT INTO notifications(id,user_id,title,message,kind,entity_type,entity_id,company_id,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'),now=new Date().toISOString();
 for(const userId of new Set(recipientIds.filter(id=>typeof id==='string'&&id&&id!==actorId))){
  const account=db.prepare('SELECT active,role FROM users WHERE id=?').get(userId);if(!account?.active)continue;
  if(companyId&&!notificationCompanyAccess(userId,companyId))continue;
  if(entityType==='systemDevelopment'){
   const recipient={id:userId,role:account.role,active:true};if(!hasSystemDevelopmentAccess(recipient))continue;
   const project=systemDevelopmentNotificationProject(entityId);if(!project||!canAccessSystemDevelopmentProject(recipient,project))continue;
  }
  insert.run(randomUUID(),userId,title,String(message).slice(0,1200),kind,entityType,entityId,companyId,actorId,actorName,now);
 }
}
const SIGNATURE_DESIGN_INTEGRATION_PATH='/api/integrations/v1/signature-design/inquiries';
const SIGNATURE_DESIGN_WRITEBACK_PATH='/api/integrations/v1/aspect-signature/inquiries/';
const SIGNATURE_DESIGN_SOURCE_ORIGIN='https://app.srv1633240.hstgr.cloud';
const SIGNATURE_DESIGN_PROJECT_VISIONS=new Set(['New pool','Pool remodel','Spa addition','Outdoor living area','Pool and outdoor living','Water feature','Landscape project','Repair or renovation','Other / needs discussion']);
const SIGNATURE_DESIGN_SYSTEM_ACTOR_EMAIL='signature-design-integration@system.invalid';
const SIGNATURE_DESIGN_SYSTEM_ACTOR_NAME='Signature Exteriors Design Portal';
const signatureDesignRateWindows=new Map();
function canonicalIntegrationJson(value){
 if(Array.isArray(value))return`[${value.map(canonicalIntegrationJson).join(',')}]`;
 if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalIntegrationJson(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
function integrationObject(value,allowed,required=[]){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=Object.keys(value);return keys.every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key));
}
function integrationText(value,max,{required=false}={}){
 if(value===null||value===undefined)return required?null:'';
 if(typeof value!=='string')return null;
 const text=value.trim();if(text.length>max||required&&!text)return null;return text;
}
function signatureDesignRequestType(vision){
 const normalized=vision.trim().toLocaleLowerCase();
 if(normalized==='new pool')return'New pool construction';
 if(normalized==='pool remodel')return'Pool renovation or resurfacing';
 if(normalized==='outdoor living area'||normalized==='pool and outdoor living')return'Outdoor living';
 return'Other';
}
function signatureDesignSource(value){
 const map={PHONE:'Phone',SMS:'Phone',EMAIL:'Email',WEBSITE:'Website',REFERRAL:'Referral',WALK_IN:'Walk-in',OTHER:'Other'};
 return map[value]||'Other';
}
function signatureDesignSummary(parts){
 const sections=[];
 const push=(label,value,max)=>{if(!value)return;const clipped=value.length>max?`${value.slice(0,max-1).trimEnd()}…`:value;sections.push(`${label}: ${clipped}`);};
 push('Contact',parts.contactName,160);
 push('Property',parts.property,500);
 push('Project vision',parts.projectVision,300);
 push('Project details',parts.description,600);
 push('Goals',parts.objectives,600);
 push('Requested scope',parts.preliminaryScope,700);
 push('Design inspirations',parts.designInspirations,700);
 push('Desired timing',parts.desiredTiming,180);
 push('Budget expectation',parts.budgetExpectation,180);
 push('Referral',parts.referralName,120);
 push('Client company',parts.clientCompany,120);
 return sections.join('\n\n').slice(0,3999);
}
const signatureDesignSourceRecordV2Keys=['updatedAt','intakeRevision','legacyReviewStatus','discoveryData','discoveryCompletedAt','siteAssessment','siteAssessmentData','romAmount','proposalNarrative','romProposalDetails','proposalProvidedAt','proposalClientResponse','romStatus','romDecisionAt','romApprovedBy','designAgreementStatus','designAgreementAcceptedAt','designAgreementAcceptedBy','handoffSummary','handoffApprovedAt','handoffApprovedBy','complianceVerificationStatus','complianceVerificationCheckedAt','complianceVerificationSource','complianceVerificationCategories','complianceVerificationLinks','complianceVerificationReviewedBy','complianceVerificationReviewedAt','complianceVerificationNotes','qualificationStatus','ownerId','nextAction','nextActionDueAt','declineReason','clientDisposition','clientDispositionComment','clientDispositionSource','clientDispositionAt','clientDispositionReviewStatus','clientDispositionReviewedAt','romPreviewSnapshot','romPreviewHash','romPreviewRevision','romPreviewSavedAt','convertedAt'];
const signatureDesignSourceRecordV3Keys=[...signatureDesignSourceRecordV2Keys,'consultations','workItems','criterionStates','complianceResearchJobs','savedComplianceLinks','project'];
const signatureDesignSourceRecordV4Keys=[...signatureDesignSourceRecordV3Keys,'createdAt','ownerName','clientDispositionRecordedByName','clientDispositionReviewedByName','clientDispositionClientUserName','readiness'];
function signatureDesignSnapshotJsonSafe(value,depth=0){
 if(depth>12)return false;
 if(value===null||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value==='string')return value.length<=200000;
 if(Array.isArray(value))return value.length<=1000&&value.every(item=>signatureDesignSnapshotJsonSafe(item,depth+1));
 if(value&&typeof value==='object')return Object.keys(value).length<=60&&Object.keys(value).every(key=>!['__proto__','prototype','constructor'].includes(key)&&signatureDesignSnapshotJsonSafe(value[key],depth+1));
 return false;
}
function normalizeSignatureDesignPayload(input){
 const version=input?.schemaVersion,versioned=version>=2,sourceRevision=versioned?input.sourceRevision:1,topKeys=['schemaVersion','sourceSystem','sourceInquiryId','sourceCreatedAt','contact','inquiry',...(versioned?['sourceRevision','sourceRecord']:[])];
 if(!integrationObject(input,topKeys,topKeys)||![1,2,3,4].includes(version)||input.sourceSystem!=='signature-exteriors-design'||!Number.isSafeInteger(sourceRevision)||sourceRevision<1)return null;
 if(!integrationObject(input.contact,['name','company','email','phone'],['name'])||!integrationObject(input.inquiry,['sourceChannel','referralName','projectVision','property','description','objectives','preliminaryScope','designInspirations','budgetExpectation','desiredTiming','clientCompany'],['sourceChannel','projectVision','property']))return null;
 const sourceRecordKeys=version===4?signatureDesignSourceRecordV4Keys:version===3?signatureDesignSourceRecordV3Keys:signatureDesignSourceRecordV2Keys;
 const requiredSourceRecordKeys=version===4?sourceRecordKeys.filter(key=>key!=='readiness'):sourceRecordKeys;
 if(versioned&&(!integrationObject(input.sourceRecord,sourceRecordKeys,requiredSourceRecordKeys)||!Object.hasOwn(input.contact,'company')||!Object.hasOwn(input.inquiry,'designInspirations')))return null;
 if(version>=3&&(!signatureDesignSnapshotJsonSafe(input.sourceRecord)||canonicalIntegrationJson(input.sourceRecord).length>900000))return null;
 const sourceInquiryId=integrationText(input.sourceInquiryId,128,{required:true}),sourceCreatedAt=integrationText(input.sourceCreatedAt,40,{required:true}),contactName=integrationText(input.contact.name,160,{required:true}),email=integrationText(input.contact.email,200),phone=integrationText(input.contact.phone,60),clientCompany=integrationText(input.contact.company??input.inquiry.clientCompany,200),sourceChannel=integrationText(input.inquiry.sourceChannel,100),referralName=integrationText(input.inquiry.referralName,200),projectVision=integrationText(input.inquiry.projectVision,120,{required:true}),description=integrationText(input.inquiry.description,5000),objectives=integrationText(input.inquiry.objectives,5000),preliminaryScope=integrationText(input.inquiry.preliminaryScope,5000),designInspirations=integrationText(input.inquiry.designInspirations,5000),budgetExpectation=integrationText(input.inquiry.budgetExpectation,500),desiredTiming=integrationText(input.inquiry.desiredTiming,500);
 const propertyInput=input.inquiry.property,propertyKeys=versioned?['address','city','state','postalCode','jurisdiction','hoaName']:['address','city','state','postalCode'];
 if(!integrationObject(propertyInput,propertyKeys,versioned?['address','city','state','postalCode','jurisdiction','hoaName']:['address','city','state','postalCode']))return null;
 const address=integrationText(propertyInput.address,300),city=integrationText(propertyInput.city,100),state=integrationText(propertyInput.state,50),postalCode=integrationText(propertyInput.postalCode,20),jurisdiction=integrationText(propertyInput.jurisdiction,150),hoaName=integrationText(propertyInput.hoaName,150);
 if(!sourceInquiryId||!sourceCreatedAt||!Number.isFinite(Date.parse(sourceCreatedAt))||!contactName||email===null||phone===null||clientCompany===null||sourceChannel===null||referralName===null||!projectVision||description===null||objectives===null||preliminaryScope===null||designInspirations===null||budgetExpectation===null||desiredTiming===null||address===null||city===null||state===null||postalCode===null||jurisdiction===null||hoaName===null||(!email&&!phone)||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
 return{version,sourceRevision,sourceInquiryId,sourceCreatedAt,contactName,email,phone,clientCompany,sourceChannel,referralName,projectVision,description,objectives,preliminaryScope,designInspirations,budgetExpectation,desiredTiming,address,city,state,postalCode,jurisdiction,hoaName,sourceRecord:versioned?input.sourceRecord:null,payload:input};
}
function signatureDesignMappedSummary(record){
 const property=[record.address,record.city,record.state,record.postalCode].filter(Boolean).join(', ');
 return signatureDesignSummary({contactName:record.contactName,property,projectVision:record.projectVision,description:record.description,objectives:record.objectives,preliminaryScope:record.preliminaryScope,designInspirations:record.designInspirations,budgetExpectation:record.budgetExpectation,desiredTiming:record.desiredTiming,referralName:record.referralName,clientCompany:record.clientCompany});
}
function signatureDesignComparableSnapshot(value){
 if(Array.isArray(value))return value.map(signatureDesignComparableSnapshot);
 if(!value||typeof value!=='object')return value;
 const ignored=new Set(['id','createdAt','updatedAt','intakeRevision','updatedByName','romPreviewSnapshot','romPreviewHash','romPreviewRevision','romPreviewSavedAt']),userNameFields=new Set(['ownerName','memberName','reviewerName','completedByName']);
 return Object.fromEntries(Object.entries(value).filter(([key])=>!ignored.has(key)).map(([key,item])=>[key,userNameFields.has(key)&&typeof item==='string'?item.trim().toLocaleLowerCase():signatureDesignComparableSnapshot(item)]));
}
function updateSignatureDesignIntegrationIntake(previous,record,payloadSha256,receivedAt,direction='design-to-aspect'){
 const intakeId=previous.intake_id||previous.id;
 const requestType=signatureDesignRequestType(record.projectVision),services=getReceptionConfig(SIGNATURE_COMPANY_ID).services||[];
 if(!services.includes(requestType))return{error:'The mapped pool service is not enabled in Signature Exteriors Reception.'};
 db.exec('BEGIN IMMEDIATE');
 try{
  const current=db.prepare('SELECT sync_revision FROM reception_intake_origins WHERE intake_id=?').get(intakeId);
  if(!current){db.exec('ROLLBACK');return{error:'The linked Signature Reception inquiry could not be found.'};}
  if(record.sourceRevision<=Number(current.sync_revision||0)){db.exec('ROLLBACK');return{stale:true};}
  const mappedSource=signatureDesignSource(record.sourceChannel),summary=signatureDesignMappedSummary(record);
  db.prepare('UPDATE reception_intakes SET contact_name=?,organization_name=?,email=?,phone=?,source=?,request_type=?,summary=?,updated_at=? WHERE id=?').run(record.contactName,record.clientCompany,record.email,record.phone,mappedSource,requestType,summary,receivedAt,intakeId);
  db.prepare('UPDATE reception_intake_origins SET source_channel=?,mapping_version=?,payload_sha256=?,source_payload_json=?,sync_revision=? WHERE intake_id=?').run(record.sourceChannel,record.version,payloadSha256,JSON.stringify(record.payload),record.sourceRevision,intakeId);
  db.prepare('INSERT INTO reception_intake_events(id,intake_id,actor_user_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),intakeId,null,'update',direction==='aspect-to-design'?`Shared inquiry details synchronized to Signature Exteriors Design (revision ${record.sourceRevision}).`:`Shared inquiry details synchronized from Signature Exteriors Design (revision ${record.sourceRevision}).`,receivedAt);
  db.exec('COMMIT');
  return{stale:false,updated:true,intakeId};
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
function signatureDesignExistingResult(previous,record,payloadSha256,receivedAt){
 const currentRevision=Number(previous.sync_revision||0);
 if(record.version===1){if(previous.payload_sha256!==payloadSha256)return{status:409,body:{error:'This source inquiry ID was already received with a different payload.'}};return{status:200,body:{intakeId:previous.intake_id,companyId:SIGNATURE_COMPANY_ID,sourceSystem:'signature-exteriors-design',sourceInquiryId:record.sourceInquiryId,receivedAt:previous.received_at,sourceRevision:currentRevision,duplicate:true}};}
 if(record.sourceRevision<currentRevision)return{status:200,body:{intakeId:previous.intake_id,companyId:SIGNATURE_COMPANY_ID,sourceSystem:'signature-exteriors-design',sourceInquiryId:record.sourceInquiryId,receivedAt:previous.received_at,sourceRevision:currentRevision,stale:true,duplicate:true}};
 if(record.sourceRevision===currentRevision){if(previous.payload_sha256!==payloadSha256)return{status:409,body:{error:'This source revision was already received with a different payload.'}};return{status:200,body:{intakeId:previous.intake_id,companyId:SIGNATURE_COMPANY_ID,sourceSystem:'signature-exteriors-design',sourceInquiryId:record.sourceInquiryId,receivedAt:previous.received_at,sourceRevision:currentRevision,duplicate:true}};}
 const updated=updateSignatureDesignIntegrationIntake(previous,record,payloadSha256,receivedAt);
 if(updated.error)return{status:409,body:{error:updated.error}};
 if(updated.stale)return{status:200,body:{intakeId:previous.intake_id,companyId:SIGNATURE_COMPANY_ID,sourceSystem:'signature-exteriors-design',sourceInquiryId:record.sourceInquiryId,receivedAt:previous.received_at,sourceRevision:currentRevision,stale:true,duplicate:true}};
 addActivity('Signature Design inquiry synchronized','A Signature Exteriors Design inquiry update was added to Reception.','update',SIGNATURE_COMPANY_ID);
 return{status:200,updated:true,body:{intakeId:previous.intake_id,companyId:SIGNATURE_COMPANY_ID,sourceSystem:'signature-exteriors-design',sourceInquiryId:record.sourceInquiryId,receivedAt,sourceRevision:record.sourceRevision,duplicate:false,updated:true}};
}
function signatureDesignWritebackConfig(){
 const enabled=process.env.SIGNATURE_DESIGN_WRITEBACK_ENABLED==='true',keyId=String(process.env.SIGNATURE_DESIGN_HMAC_KEY_ID||''),secret=String(process.env.SIGNATURE_DESIGN_HMAC_SECRET||''),configuredBase=String(process.env.SIGNATURE_DESIGN_WRITEBACK_BASE_URL||'');
 if(enabled&&process.env.NODE_ENV!=='production'&&!configuredBase)throw new Error('An explicit source URL is required outside production when Signature Design writeback is enabled.');
 const sourceBase=configuredBase||SIGNATURE_DESIGN_SOURCE_ORIGIN;let sourceUrl;
 try{sourceUrl=new URL(sourceBase);}catch{throw new Error('The Signature Design source URL is invalid.');}
 const localHttp=process.env.NODE_ENV!=='production'&&sourceUrl.protocol==='http:'&&['localhost','127.0.0.1'].includes(sourceUrl.hostname);
 if(enabled&&process.env.NODE_ENV!=='production'&&sourceUrl.origin===SIGNATURE_DESIGN_SOURCE_ORIGIN)throw new Error('Non-production writeback cannot target the production Design portal.');
 if((!localHttp&&sourceUrl.protocol!=='https:')||sourceUrl.username||sourceUrl.password||sourceUrl.pathname!=='/'||sourceUrl.search||sourceUrl.hash)throw new Error('The Signature Design source must be an HTTPS origin (local HTTP is allowed outside production).');
 if(enabled&&(keyId.length<1||keyId.length>100||Buffer.byteLength(secret)<32))throw new Error('A key ID and a 32-byte HMAC secret are required when writeback is enabled.');
 return{enabled,keyId,secret,sourceUrl};
}
function signatureDesignSharedDetails(record){return{contact:{name:record.contactName,company:record.clientCompany||null,email:record.email||null,phone:record.phone||null},inquiry:{sourceChannel:record.sourceChannel,referralName:record.referralName||null,projectVision:record.projectVision,property:record.address?{address:record.address,city:record.city||null,state:record.state||null,postalCode:record.postalCode||null,jurisdiction:record.jurisdiction||null,hoaName:record.hoaName||null}:null,description:record.description||null,objectives:record.objectives||null,preliminaryScope:record.preliminaryScope||null,designInspirations:record.designInspirations||null,budgetExpectation:record.budgetExpectation||null,desiredTiming:record.desiredTiming||null}};}
function normalizeSignatureDesignEditDetails(details){
 const optional=value=>typeof value==='string'?value.trim()||null:null,property=details.inquiry.property,projectVision=details.inquiry.projectVision.trim();
 return{contact:{name:details.contact.name.trim(),company:optional(details.contact.company),email:optional(details.contact.email),phone:optional(details.contact.phone)},inquiry:{
  sourceChannel:typeof details.inquiry.sourceChannel==='string'?details.inquiry.sourceChannel.trim():'',referralName:optional(details.inquiry.referralName),projectVision,
  property:property?{address:property.address.trim(),city:optional(property.city),state:optional(property.state),postalCode:optional(property.postalCode),jurisdiction:optional(property.jurisdiction),hoaName:optional(property.hoaName)}:null,
  description:projectVision==='Other / needs discussion'?optional(details.inquiry.description):null,objectives:optional(details.inquiry.objectives),preliminaryScope:optional(details.inquiry.preliminaryScope),
  designInspirations:optional(details.inquiry.designInspirations),budgetExpectation:optional(details.inquiry.budgetExpectation),desiredTiming:optional(details.inquiry.desiredTiming),
 }};
}
async function writeSignatureDesignDetails(req,res,user,intakeId){
 let config;try{config=signatureDesignWritebackConfig();}catch(error){return send(res,503,{error:error.message});}
 if(!config.enabled)return send(res,503,{error:'Bidirectional Signature Design sync is paused.'});
 const intake=getReceptionIntakeRow(intakeId);
 if(!intake||intake.company_id!==SIGNATURE_COMPANY_ID||!userCompanyIds(user).includes(SIGNATURE_COMPANY_ID)||intake.origin_source_system!=='signature-exteriors-design')return send(res,404,{error:'Design inquiry not found.'});
 let input;try{input=await bodyJson(req,950000);}catch(error){return send(res,400,{error:'Check the shared inquiry details and try again.'});}
 const detailsSchemaOk=(()=>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['expectedSourceRevision','details','sourceRecord'].includes(key))||!Number.isSafeInteger(input.expectedSourceRevision)||input.expectedSourceRevision<1)return false;
  const details=input.details;if(!details||typeof details!=='object'||Array.isArray(details)||Object.keys(details).some(key=>!['contact','inquiry'].includes(key)))return false;
  const contact=details.contact,inquiry=details.inquiry;if(!contact||typeof contact!=='object'||Array.isArray(contact)||Object.keys(contact).some(key=>!['name','company','email','phone'].includes(key))||!inquiry||typeof inquiry!=='object'||Array.isArray(inquiry)||Object.keys(inquiry).some(key=>!['sourceChannel','referralName','projectVision','property','description','objectives','preliminaryScope','designInspirations','budgetExpectation','desiredTiming'].includes(key)))return false;
  const text=(value,max,required=false)=>value===null?!required:typeof value==='string'&&value.trim().length<=max&&(!required||Boolean(value.trim()));
  if(!text(contact.name,160,true)||!text(contact.company,200)||!text(contact.email,200)||!text(contact.phone,60)||!(contact.email||contact.phone)||contact.email&&!/^\S+@\S+\.\S+$/.test(contact.email))return false;
  if(!text(inquiry.sourceChannel,100)||!text(inquiry.referralName,200)||!text(inquiry.projectVision,120,true)||!text(inquiry.description,5000)||!text(inquiry.objectives,5000)||!text(inquiry.preliminaryScope,5000)||!text(inquiry.designInspirations,5000)||!text(inquiry.budgetExpectation,500)||!text(inquiry.desiredTiming,500))return false;
  const property=inquiry.property;if(property!==null){if(!property||typeof property!=='object'||Array.isArray(property)||Object.keys(property).some(key=>!['address','city','state','postalCode','jurisdiction','hoaName'].includes(key))||!text(property.address,300,true)||!text(property.city,100)||!text(property.state,50)||!text(property.postalCode,20)||!text(property.jurisdiction,150)||!text(property.hoaName,150))return false;}
  return true;
 })();
 if(!detailsSchemaOk)return send(res,400,{error:'Check the shared inquiry details before saving.'});
 const details=normalizeSignatureDesignEditDetails(input.details);
 if(!SIGNATURE_DESIGN_PROJECT_VISIONS.has(details.inquiry.projectVision))return send(res,400,{error:'Choose a supported project vision.'});
 const currentPayload=intake.origin_source_payload_json&&intake.origin_source_payload_json!=='{}'?parseIntakeJson(intake.origin_source_payload_json):null,currentRecord=currentPayload?normalizeSignatureDesignPayload(currentPayload):null;
 if(!currentRecord||currentRecord.version<2)return send(res,409,{error:'This Design inquiry needs a fresh sync before it can be edited here. Refresh the inquiry and try again.'});
 if(currentRecord.version>=4){const requiredKeys=signatureDesignSourceRecordV4Keys.filter(key=>key!=='readiness');if(!integrationObject(input.sourceRecord,signatureDesignSourceRecordV4Keys,requiredKeys)||!signatureDesignSnapshotJsonSafe(input.sourceRecord)||canonicalIntegrationJson(input.sourceRecord).length>900000)return send(res,400,{error:'Check the synchronized Design workflow fields and try again.'});}
 else if(input.sourceRecord!==undefined)return send(res,400,{error:'This Design inquiry needs a fresh workflow snapshot before structured edits can be saved.'});
 if(Number(intake.origin_sync_revision||0)!==input.expectedSourceRevision)return send(res,409,{error:'This inquiry has changed in the Design portal. Reload the latest details before saving.',sourceRevision:Number(intake.origin_sync_revision||0)});
 const currentDetails=signatureDesignSharedDetails(currentRecord);
 const workflowUnchanged=currentRecord.version<4||canonicalIntegrationJson(signatureDesignComparableSnapshot(currentRecord.sourceRecord))===canonicalIntegrationJson(signatureDesignComparableSnapshot(input.sourceRecord));
 if(canonicalIntegrationJson(currentDetails)===canonicalIntegrationJson(details)&&workflowUnchanged)return send(res,200,{ok:true,duplicate:true,sourceRevision:currentRecord.sourceRevision,intake:{...mapReceptionIntake(getReceptionIntakeRow(intakeId)),history:getReceptionIntakeHistory(intakeId)}});
 const sourceInquiryId=intake.origin_source_record_id,pathName=SIGNATURE_DESIGN_WRITEBACK_PATH+encodeURIComponent(sourceInquiryId),requestPayload={schemaVersion:currentRecord.version>=4?4:2,sourceSystem:'aspect-companies-signature',sourceInquiryId,targetIntakeId:intakeId,expectedSourceRevision:input.expectedSourceRevision,details,...(currentRecord.version>=4?{sourceRecord:input.sourceRecord}:{})},timestamp=String(Math.floor(Date.now()/1000)),bodyDigest=createHash('sha256').update(canonicalIntegrationJson(requestPayload)).digest('hex'),signed=`v1\n${timestamp}\nPATCH\n${pathName}\n${bodyDigest}`,signature=createHmac('sha256',config.secret).update(signed).digest('hex');
 let response;try{response=await fetch(new URL(pathName,config.sourceUrl),{method:'PATCH',headers:{'content-type':'application/json','x-aspect-signature-key-id':config.keyId,'x-aspect-signature-timestamp':timestamp,'x-aspect-signature-signature':signature},body:JSON.stringify(requestPayload),signal:AbortSignal.timeout(12_000)});}catch{return send(res,502,{error:'The Design portal could not be reached. No shared changes were saved; try again.'});}
 let result;try{result=await response.json();}catch{result=null;}
 if(response.status===409){
  const latest=result?.payload&&normalizeSignatureDesignPayload(result.payload);
  if(latest?.version>=2){const digest=createHash('sha256').update(canonicalIntegrationJson(result.payload)).digest('hex'),updated=updateSignatureDesignIntegrationIntake(intake,latest,digest,new Date().toISOString(),'design-to-aspect');if(updated.updated)broadcastCompanyUpdate(SIGNATURE_COMPANY_ID,['reception']);}
  return send(res,409,{error:'This inquiry changed in the Design portal. The latest version has been refreshed; reopen it and apply your edits again.',sourceRevision:result?.sourceRevision||null});
 }
 if(!response.ok||!result||!Number.isSafeInteger(result.sourceRevision)||!result.payload)return send(res,response.status>=500?502:409,{error:response.status>=500?'The Design portal could not save these details. No shared changes were saved; try again.':'The Design portal rejected the shared details. Review them and try again.'});
 const returned=normalizeSignatureDesignPayload(result.payload);if(!returned||returned.version<2||returned.sourceInquiryId!==sourceInquiryId||returned.sourceRevision!==result.sourceRevision)return send(res,502,{error:'The Design portal returned an invalid sync response. Reload the inquiry before continuing.'});
 const digest=createHash('sha256').update(canonicalIntegrationJson(result.payload)).digest('hex'),updated=updateSignatureDesignIntegrationIntake(intake,returned,digest,new Date().toISOString(),'aspect-to-design');
 if(updated.error)return send(res,502,{error:'The Design portal saved the change, but the local copy could not be refreshed. Reload the inquiry to reconcile it.'});
 if(updated.updated){addActivity('Signature Design inquiry updated','A shared inquiry detail was edited in Aspect Companies Signature and synchronized to Design.','update',SIGNATURE_COMPANY_ID);broadcastCompanyUpdate(SIGNATURE_COMPANY_ID,['reception']);}
 return send(res,200,{ok:true,duplicate:Boolean(result.duplicate),sourceRevision:returned.sourceRevision,intake:{...mapReceptionIntake(getReceptionIntakeRow(intakeId)),history:getReceptionIntakeHistory(intakeId)}});
}
function signatureDesignRateLimited(req){
 const key=String(req.socket.remoteAddress||'unknown'),now=Date.now(),current=signatureDesignRateWindows.get(key);
 if(!current||now-current.startedAt>=60_000){signatureDesignRateWindows.set(key,{startedAt:now,count:1});if(signatureDesignRateWindows.size>10_000)for(const [address,window] of signatureDesignRateWindows)if(now-window.startedAt>=60_000)signatureDesignRateWindows.delete(address);return false;}
 current.count++;return current.count>60;
}
async function createSignatureDesignIntegrationIntake(req,res){
 if(process.env.SIGNATURE_DESIGN_INTEGRATION_ENABLED!=='true')return send(res,503,{error:'Signature Design inquiry integration is paused.'});
 if(signatureDesignRateLimited(req))return send(res,429,{error:'Too many integration requests.'},'application/json; charset=utf-8',{'Retry-After':'60'});
 if(!String(req.headers['content-type']||'').toLocaleLowerCase().startsWith('application/json'))return send(res,415,{error:'JSON content is required.'});
 const keyId=String(process.env.SIGNATURE_DESIGN_HMAC_KEY_ID||''),secret=String(process.env.SIGNATURE_DESIGN_HMAC_SECRET||'');
 if(keyId.length<1||keyId.length>100||Buffer.byteLength(secret)<32)return send(res,503,{error:'Signature Design integration is not fully configured.'});
 const providedKeyId=String(req.headers['x-signature-design-key-id']||''),timestamp=String(req.headers['x-signature-design-timestamp']||''),providedSignature=String(req.headers['x-signature-design-signature']||'');
 if(providedKeyId!==keyId||!/^\d{10}$/.test(timestamp)||Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300||! /^[a-f0-9]{64}$/i.test(providedSignature))return send(res,401,{error:'Integration authentication failed.'});
 const input=await bodyJson(req,1024*1024),canonical=canonicalIntegrationJson(input),bodyDigest=createHash('sha256').update(canonical).digest('hex');
 const signed=`v1\n${timestamp}\nPOST\n${SIGNATURE_DESIGN_INTEGRATION_PATH}\n${bodyDigest}`;
 const expected=createHmac('sha256',secret).update(signed).digest(),provided=Buffer.from(providedSignature,'hex');
 if(expected.length!==provided.length||!timingSafeEqual(expected,provided))return send(res,401,{error:'Integration authentication failed.'});
 const record=normalizeSignatureDesignPayload(input);if(!record)return send(res,400,{error:'Check the complete Signature Design inquiry payload.'});
 const {sourceInquiryId,sourceCreatedAt,contactName,email,phone,sourceChannel,projectVision,description,objectives,preliminaryScope,designInspirations,budgetExpectation,desiredTiming,clientCompany}=record;
 const sourceOrigin='signature-exteriors-design',payloadSha256=createHash('sha256').update(canonical).digest('hex'),receivedAt=new Date().toISOString();
 const previous=db.prepare('SELECT intake_id,payload_sha256,received_at,sync_revision FROM reception_intake_origins WHERE company_id=? AND source_system=? AND source_record_id=?').get(SIGNATURE_COMPANY_ID,sourceOrigin,sourceInquiryId);
 if(previous){const result=signatureDesignExistingResult(previous,record,payloadSha256,receivedAt);if(result.updated)broadcastCompanyUpdate(SIGNATURE_COMPANY_ID,['reception']);return send(res,result.status,result.body);}
 const company=db.prepare("SELECT id,name FROM companies WHERE id=? AND status='Active'").get(SIGNATURE_COMPANY_ID);
 if(!company)return send(res,503,{error:'The Signature Exteriors company portal is not active.'});
 const recipientIds=listClientAssignableUsers(SIGNATURE_COMPANY_ID).map(({id})=>id);
 if(!recipientIds.length)return send(res,503,{error:'No active user currently has access to the Signature Exteriors portal.'});
 const summary=signatureDesignMappedSummary(record),requestType=signatureDesignRequestType(projectVision),mappedSource=signatureDesignSource(sourceChannel);
 const services=getReceptionConfig(SIGNATURE_COMPANY_ID).services||[];
 if(!services.includes(requestType))return send(res,409,{error:'The mapped pool service is not enabled in Signature Exteriors Reception.'});
 const createdAt=new Date().toISOString(),intakeId=randomUUID();let actor=db.prepare('SELECT id,name,active FROM users WHERE email=?').get(SIGNATURE_DESIGN_SYSTEM_ACTOR_EMAIL);
 if(actor&&(actor.name!==SIGNATURE_DESIGN_SYSTEM_ACTOR_NAME||actor.active))return send(res,503,{error:'The integration audit identity is reserved and must be repaired by an administrator.'});
 const passwordHash=actor?null:await hashPassword(randomBytes(48).toString('base64url'));
 db.exec('BEGIN IMMEDIATE');
 try{
  const duplicate=db.prepare('SELECT o.intake_id,o.payload_sha256,o.received_at,o.sync_revision FROM reception_intake_origins o WHERE o.company_id=? AND o.source_system=? AND o.source_record_id=?').get(SIGNATURE_COMPANY_ID,sourceOrigin,sourceInquiryId);
  if(duplicate){db.exec('ROLLBACK');const result=signatureDesignExistingResult(duplicate,record,payloadSha256,receivedAt);if(result.updated)broadcastCompanyUpdate(SIGNATURE_COMPANY_ID,['reception']);return send(res,result.status,result.body);}
  if(!actor){const actorId=randomUUID();db.prepare("INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?, 'member',0,?)").run(actorId,SIGNATURE_DESIGN_SYSTEM_ACTOR_NAME,SIGNATURE_DESIGN_SYSTEM_ACTOR_EMAIL,passwordHash,createdAt);actor={id:actorId,name:SIGNATURE_DESIGN_SYSTEM_ACTOR_NAME,active:0};}
  db.prepare('INSERT INTO reception_intakes(id,company_id,contact_name,organization_name,email,phone,source,request_type,summary,status,accounting_details_json,workload_review_json,assignee_user_id,next_action,next_action_date,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(intakeId,SIGNATURE_COMPANY_ID,contactName,clientCompany,email,phone,mappedSource,requestType,summary,'New','{}','{}',null,'Review Design portal inquiry',null,actor.id,createdAt,createdAt);
  db.prepare('INSERT INTO reception_intake_origins(intake_id,company_id,source_system,source_record_id,source_channel,source_created_at,received_at,mapping_version,payload_sha256,source_payload_json,sync_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(intakeId,SIGNATURE_COMPANY_ID,sourceOrigin,sourceInquiryId,sourceChannel,new Date(sourceCreatedAt).toISOString(),createdAt,record.version,payloadSha256,JSON.stringify(record.payload),record.sourceRevision);
  db.prepare('INSERT INTO reception_intake_events(id,intake_id,actor_user_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),intakeId,actor.id,'created','Inquiry received from Signature Exteriors Design Portal.',createdAt);
  addNotification({recipientIds,actorId:actor.id,title:'New Signature Design inquiry',message:'A new inquiry was received from Signature Exteriors Design Portal. Open the company portal for details.',kind:'intake',entityType:'intake',entityId:intakeId,companyId:SIGNATURE_COMPANY_ID});
  addActivity('Signature Design inquiry received','A new inquiry was added to Signature Exteriors Reception.','update',SIGNATURE_COMPANY_ID);
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error)){const duplicate=db.prepare('SELECT intake_id,payload_sha256,received_at,sync_revision FROM reception_intake_origins WHERE company_id=? AND source_system=? AND source_record_id=?').get(SIGNATURE_COMPANY_ID,sourceOrigin,sourceInquiryId);if(duplicate){const result=signatureDesignExistingResult(duplicate,record,payloadSha256,receivedAt);if(result.updated)broadcastCompanyUpdate(SIGNATURE_COMPANY_ID,['reception']);return send(res,result.status,result.body);}}throw error;}
 broadcastCompanyUpdate(SIGNATURE_COMPANY_ID,['reception']);
 broadcastUsersUpdate(recipientIds,['notifications']);
 return send(res,201,{intakeId,companyId:SIGNATURE_COMPANY_ID,sourceSystem:sourceOrigin,sourceInquiryId,receivedAt:createdAt,sourceRevision:record.sourceRevision,duplicate:false});
}
function addProjectNotification(projectId,actorId,title,message,kind='project'){
 const project=db.prepare('SELECT id,company_id,created_by,project_manager_user_id FROM projects WHERE id=?').get(projectId);if(!project)return;
 const milestoneOwners=db.prepare('SELECT DISTINCT assignee_user_id FROM project_milestones WHERE project_id=? AND assignee_user_id IS NOT NULL').all(projectId).map(row=>row.assignee_user_id);
 addNotification({recipientIds:[project.created_by,project.project_manager_user_id,...milestoneOwners],actorId,title,message,kind,entityType:'project',entityId:projectId,companyId:project.company_id});
}
function addDevelopmentNotification(projectId,itemId,actorId,title,message,kind='development'){
 const project=projectId?db.prepare('SELECT id,title FROM system_development_projects WHERE id=?').get(projectId):null;
 const owners=itemId?db.prepare('SELECT owner_user_id FROM system_development_items WHERE id=? AND owner_user_id IS NOT NULL').all(itemId).map(row=>row.owner_user_id):[];
 const members=projectId?systemDevelopmentProjectRecipientIds(projectId):db.prepare('SELECT user_id FROM system_development_members').all().map(row=>row.user_id);
 addNotification({recipientIds:[...members,...owners],actorId,title,message,kind,entityType:'systemDevelopment',entityId:projectId||itemId,companyId:null});
}
function addCalendarNotification(eventId,actorId,title,message,additionalRecipients=[]){
 const event=db.prepare('SELECT id,title,company_id,created_by FROM calendar_events WHERE id=?').get(eventId);if(!event)return;
 const attendees=db.prepare('SELECT user_id FROM calendar_event_attendees WHERE event_id=?').all(eventId).map(row=>row.user_id);
 addNotification({recipientIds:[event.created_by,...attendees,...additionalRecipients],actorId,title,message:message||event.title,kind:'calendar',entityType:'calendar',entityId:eventId,companyId:event.company_id});
}
function calendarReminderLeadMinutes(){const value=getPortalSettings().calendarReminderMinutes;return[5,10,15,30,60,120,1440].includes(value)?value:30;}
function calendarReminderLabel(minutes){if(minutes===1440)return'1 day';if(minutes>=60)return`${minutes/60} hour${minutes===60?'':'s'}`;return`${minutes} minutes`;}
function calendarSlackWebhookUrl(){const value=getPrivatePortalSetting('calendarSlackWebhookUrl').trim();return /^https:\/\/hooks\.slack(?:-gov)?\.com\/services\/[A-Za-z0-9/_-]+$/.test(value)?value:'';}
function calendarSlackSettings(){const settings=getPortalSettings(),webhookUrl=calendarSlackWebhookUrl();return{enabled:settings.calendarSlackReminders===true,configured:Boolean(webhookUrl),webhookUrl,channel:settings.calendarSlackChannel||''};}
function slackEscape(value){return String(value||'').replace(/[&<>]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[character]));}
async function postCalendarSlackReminder(event,leadMinutes){
 const slack=calendarSlackSettings();if(!slack.enabled||!slack.configured)return false;
 const when=calendarLocalDateTime(event),location=[event.location_type||'',event.location||''].filter(Boolean).join(' — '),portalUrl=calendarSmtpSettings().publicUrl,calendarUrl=portalUrl?`${portalUrl}/portal/aspect-companies#calendar`:'';
 const text=`Calendar reminder: ${event.title} starts in ${calendarReminderLabel(leadMinutes)}.`,fields=[{type:'mrkdwn',text:`*Company*\n${slackEscape(event.company_name||'Company')}`},{type:'mrkdwn',text:`*When*\n${slackEscape(when)}`}];if(location)fields.push({type:'mrkdwn',text:`*Location*\n${slackEscape(location)}`});
 const blocks=[{type:'header',text:{type:'plain_text',text:`Upcoming: ${String(event.title).slice(0,135)}`,emoji:true}},{type:'section',text:{type:'mrkdwn',text:`This event starts in *${calendarReminderLabel(leadMinutes)}*.`}},{type:'section',fields}];if(calendarUrl)blocks.push({type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Open calendar'},url:calendarUrl}]});
 const response=await fetch(slack.webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,blocks}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Slack returned ${response.status}.`);return true;
}
function calendarProfileReminderHtml(event,user,leadMinutes){
 const title=escapeCalendarEmailHtml(event.title),greeting=escapeCalendarEmailHtml(user.name?`Hello ${user.name},`:'Hello,'),when=calendarLocalDateTime(event),location=[event.location_type||'On-site',event.location].filter(Boolean).join(' — '),portalUrl=calendarSmtpSettings().publicUrl,calendarUrl=portalUrl?`${portalUrl}/portal/aspect-companies#calendar`:'';
 const details=calendarEmailDetail('Company',event.company_name||'Company')+calendarEmailDetail('Date and time',when)+(location?calendarEmailDetail('Location',location):'')+(event.description?calendarEmailDetail('Notes',event.description):''),button=calendarUrl?`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 10px;"><tr><td align="center" bgcolor="#292923" style="border-radius:9px;"><a href="${escapeCalendarEmailHtml(calendarUrl)}" style="display:inline-block;padding:13px 21px;border:1px solid #292923;border-radius:9px;color:#f8df84;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">Open calendar</a></td></tr></table>`:'';
 return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f6f3e9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f3e9"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #e8e1d2;border-radius:16px;background:#fffefa;"><tr><td height="5" bgcolor="#d9b64a"></td></tr><tr><td style="padding:25px 26px 24px;"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff2c6;color:#785d12;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;">UPCOMING EVENT</div><h1 style="margin:13px 0 9px;color:#302f28;font-family:Arial,sans-serif;font-size:23px;line-height:1.3;">${title}</h1><p style="margin:0 0 8px;color:#49473d;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;">${greeting}</p><p style="margin:0 0 18px;color:#716b5f;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;">Your event starts in <strong>${calendarReminderLabel(leadMinutes)}</strong>.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details}</table>${button}<p style="margin:22px 0 0;padding-top:15px;border-top:1px solid #eee9dc;color:#898374;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;">Aspect Companies calendar</p></td></tr></table></td></tr></table></body></html>`;
}
async function sendCalendarProfileReminder(transporter,mailSettings,event,user,leadMinutes){
 const when=calendarLocalDateTime(event),location=[event.location_type||'',event.location||''].filter(Boolean).join(' — '),lines=[`Hello ${user.name||''},`,'',`Your event starts in ${calendarReminderLabel(leadMinutes)}.`,event.title,event.company_name||'Company',when];if(location)lines.push(location);if(event.description)lines.push('',event.description);lines.push('','Aspect Companies calendar');
 await transporter.sendMail({from:mailSettings.from,to:user.email,subject:`Reminder: ${event.title} starts in ${calendarReminderLabel(leadMinutes)}`,text:lines.join('\n'),html:calendarProfileReminderHtml(event,user,leadMinutes)});
}
let calendarReminderRunActive=false;
async function runCalendarReminderCycle(){
 if(calendarReminderRunActive)return;calendarReminderRunActive=true;
 try{
  const settings=getPortalSettings();if(settings.workspaceCalendar===false||settings.calendarReminders===false)return;
  const leadMinutes=calendarReminderLeadMinutes(),now=new Date(),limit=new Date(now.getTime()+leadMinutes*60000).toISOString(),nowIso=now.toISOString(),events=db.prepare("SELECT e.*,c.name AS company_name FROM calendar_events e JOIN companies c ON c.id=e.company_id WHERE e.event_type='event' AND e.status='scheduled' AND e.all_day=0 AND e.starts_at>? AND e.starts_at<=? ORDER BY e.starts_at LIMIT 100").all(nowIso,limit),insert=db.prepare("INSERT OR IGNORE INTO calendar_event_reminder_deliveries(id,event_id,delivery_target,lead_minutes,status,attempts,error,created_at) VALUES(?,?,?,?, 'pending',0,'',?)"),findDelivery=db.prepare('SELECT id,status,attempts FROM calendar_event_reminder_deliveries WHERE event_id=? AND delivery_target=? AND lead_minutes=?'),markSent=db.prepare("UPDATE calendar_event_reminder_deliveries SET status='sent',attempts=attempts+1,error='',sent_at=? WHERE id=?"),markFailed=db.prepare("UPDATE calendar_event_reminder_deliveries SET status='failed',attempts=attempts+1,error=? WHERE id=?"),mailSettings=calendarSmtpSettings();let transporter=null;
  if(mailSettings.configured)try{const nodemailer=require('nodemailer');transporter=nodemailer.createTransport({host:mailSettings.host,port:mailSettings.port,secure:mailSettings.secure,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:5000,auth:mailSettings.user?{user:mailSettings.user,pass:mailSettings.pass}:undefined});}catch(error){console.error('Calendar reminder email is unavailable:',error.message);}
  for(const event of events){
   const owner=db.prepare('SELECT id,name,email FROM users WHERE id=? AND active=1').get(event.created_by),attendees=db.prepare("SELECT DISTINCT u.id,u.name,u.email FROM calendar_event_attendees a JOIN users u ON u.id=a.user_id WHERE a.event_id=? AND a.response<>'declined' AND u.active=1 AND (u.role='admin' OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.company_id=? AND m.active=1))").all(event.id,event.company_id),recipients=[...new Map([owner,...attendees].filter(Boolean).map(person=>[person.id,person])).values()],when=calendarLocalDateTime(event),message=[event.title,when,event.location||''].filter(Boolean).join(' · ');
   for(const person of recipients){
    const notificationTarget=`user:${person.id}`,notificationId=randomUUID(),notificationResult=insert.run(notificationId,event.id,notificationTarget,leadMinutes,nowIso);if(notificationResult.changes){addNotification({recipientIds:[person.id],actorId:null,title:`Event starts in ${calendarReminderLabel(leadMinutes)}`,message,kind:'calendar',entityType:'calendar',entityId:event.id,companyId:event.company_id});markSent.run(nowIso,notificationId);broadcastUsersUpdate([person.id],['notifications']);}
    if(transporter&&person.email){const emailTarget=`email:${person.id}`,emailId=randomUUID();insert.run(emailId,event.id,emailTarget,leadMinutes,nowIso);const delivery=findDelivery.get(event.id,emailTarget,leadMinutes);if(delivery&&delivery.status!=='sent'&&delivery.attempts<3)try{await sendCalendarProfileReminder(transporter,mailSettings,event,person,leadMinutes);markSent.run(new Date().toISOString(),delivery.id);}catch(error){markFailed.run(String(error?.message||'Email reminder failed.').slice(0,500),delivery.id);}}
   }
   const slack=calendarSlackSettings();if(slack.enabled&&slack.configured){const target='slack',newId=randomUUID();insert.run(newId,event.id,target,leadMinutes,nowIso);const delivery=findDelivery.get(event.id,target,leadMinutes);if(delivery&&delivery.status!=='sent'&&delivery.attempts<3)try{await postCalendarSlackReminder(event,leadMinutes);markSent.run(new Date().toISOString(),delivery.id);}catch(error){markFailed.run(String(error?.message||'Slack reminder failed.').slice(0,500),delivery.id);}}
  }
 }catch(error){console.error('Calendar reminder cycle failed:',error.message);}finally{calendarReminderRunActive=false;}
}
let calendarReminderTimer=null;
function calendarNotificationChangeSummary(existing,next){
 const changes=[];
 if(existing.title!==next.title)changes.push('Title changed to '+next.title+'.');
 if(existing.starts_at!==next.startsAt||existing.ends_at!==next.endsAt||(existing.time_zone||'America/New_York')!==next.timeZone||(existing.start_date||null)!==(next.startDate||null)||(existing.end_date||null)!==(next.endDate||null))changes.push('Date or time changed.');
 if(Boolean(existing.all_day)!==next.allDay)changes.push(next.allDay?'Changed to an all-day item.':'Changed to a timed item.');
 if((existing.location||'')!==next.location)changes.push('Location changed to '+(next.location||'No location')+'.');
 if((existing.location_type||'On-site')!==next.locationType)changes.push('Location type changed to '+next.locationType+'.');
 if((existing.meeting_type||'Other')!==next.meetingType)changes.push('Meeting type changed to '+next.meetingType+'.');
 if((existing.description||'')!==next.description)changes.push('Meeting details changed.');
 if((existing.event_type||'event')!==next.eventType)changes.push('Calendar item type changed.');
 if((existing.client_id||'')!==(next.clientId||''))changes.push('Linked client changed.');
 if(next.attendeesChanged)changes.push('Team invitees changed.');
 if(next.externalChanged)changes.push('External guests changed.');
 return changes.join(' · ')||'Calendar details updated.';
}
function mapTask(row){return{id:row.id,companyId:row.company_id,companyName:row.company_name,title:row.title,description:row.description,status:row.status,priority:row.priority,dueDate:row.due_date,assigneeUserId:row.assignee_user_id,assigneeName:row.assignee_name,createdBy:row.created_by,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at};}
function parseIntakeJson(value){try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return{};}}
const ACCOUNTING_FIT_OPTIONS=['Likely fit','Need clarification','Capacity constrained','Outside services'];
const ACCOUNTING_DECISION_OPTIONS=['Undecided','Proceed to engagement','Request more information','Schedule a later start','Refer out','Decline'];
const ACCOUNTING_WORK_CYCLE_OPTIONS=['One-time','Weekly','Biweekly','Monthly','Quarterly','Annually','Seasonal','As needed','Unknown'];
const ACCOUNTING_COMPLEXITY_OPTIONS=['Inventory','Job/project costing','Multiple currencies','Intercompany activity','Restricted or grant funds','Trusts','POS or e-commerce','Other'];
function normalizeAccountingDetails(value,fallback={}){
 if(value===undefined)return fallback;if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const text=(key,max)=>{const item=value[key]===undefined?fallback[key]||'':typeof value[key]==='string'?value[key].trim():null;return item===null||item.length>max?null:item;};
 const number=(key,max)=>{const raw=value[key]===undefined?fallback[key]??'':value[key];if(raw===''||raw===null)return '';const parsed=Number(raw);return Number.isInteger(parsed)&&parsed>=0&&parsed<=max?parsed:null;};
  const result={legalName:text('legalName',200),entityType:text('entityType',80),businessAddress:text('businessAddress',500),mailingAddress:text('mailingAddress',500),jurisdictions:text('jurisdictions',400),monthlyTransactions:number('monthlyTransactions',10000000),entityCount:number('entityCount',10000),locationCount:number('locationCount',10000),accountCount:number('accountCount',10000),employeeCount:number('employeeCount',1000000),payrollFrequency:text('payrollFrequency',60),payrollEmployeeStates:text('payrollEmployeeStates',400),salesTaxJurisdictions:text('salesTaxJurisdictions',400),salesTaxFrequency:text('salesTaxFrequency',60),accountingSoftware:text('accountingSoftware',120),payrollProvider:text('payrollProvider',120),otherSystems:text('otherSystems',300),booksCurrentThrough:text('booksCurrentThrough',30),catchUpMonths:number('catchUpMonths',1200),coverageFrom:text('coverageFrom',7),coverageThrough:text('coverageThrough',7),desiredStartDate:text('desiredStartDate',10),hardDeadline:text('hardDeadline',10),recordsReadiness:text('recordsReadiness',80),priorAccountantStatus:text('priorAccountantStatus',160),recordTransferHelp:text('recordTransferHelp',60),softwareAccess:text('softwareAccess',80),clientResponseTime:text('clientResponseTime',80)};
 if(Object.values(result).some(item=>item===null))return null;
 for(const field of ['desiredStartDate','hardDeadline'])if(result[field]&&!taskDateIsValid(result[field]))return null;
  for(const field of ['booksCurrentThrough','coverageFrom','coverageThrough'])if(result[field]&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(result[field]))return null;
  if(result.coverageFrom&&result.coverageThrough&&result.coverageThrough<result.coverageFrom)return null;
 const rawContacts=value.contacts===undefined?(fallback.contacts||[]):value.contacts;
 if(!Array.isArray(rawContacts)||rawContacts.length>25)return null;
 const contacts=rawContacts.map(contact=>{
  if(!contact||typeof contact!=='object'||Array.isArray(contact))return null;
  const id=typeof contact.id==='string'?contact.id.trim():'',name=typeof contact.name==='string'?contact.name.trim():'',role=typeof contact.role==='string'?contact.role.trim():'',email=typeof contact.email==='string'?contact.email.trim():'',phone=typeof contact.phone==='string'?contact.phone.trim():'';
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)||!name||name.length>160||!role||role.length>120||email.length>200||email&&!/^\S+@\S+\.\S+$/.test(email)||phone.length>60)return null;
  return{id,name,role,email,phone};
 });
 if(contacts.some(contact=>!contact)||new Set(contacts.map(contact=>contact.id)).size!==contacts.length)return null;
 const primaryContactId=value.primaryContactId===undefined?fallback.primaryContactId||'':typeof value.primaryContactId==='string'?value.primaryContactId.trim():null;
 if(primaryContactId===null||primaryContactId.length>120||primaryContactId&&!contacts.some(contact=>contact.id===primaryContactId)||contacts.length&&!primaryContactId)return null;
 result.contacts=contacts;result.primaryContactId=primaryContactId;
 const flags=value.complexityFlags===undefined?fallback.complexityFlags||[]:value.complexityFlags;
 if(!Array.isArray(flags)||flags.length>ACCOUNTING_COMPLEXITY_OPTIONS.length||flags.some(flag=>!ACCOUNTING_COMPLEXITY_OPTIONS.includes(flag)))return null;
 result.complexityFlags=[...new Set(flags)];return result;
}
function normalizeWorkloadReview(value,fallback={},reviewerId=null){
 if(value===undefined)return fallback;if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const text=(key,max)=>{const item=value[key]===undefined?fallback[key]||'':typeof value[key]==='string'?value[key].trim():null;return item===null||item.length>max?null:item;};
 const rawHours=value.estimatedEffortHours===undefined?fallback.estimatedEffortHours??'':value.estimatedEffortHours,estimatedEffortHours=rawHours===''||rawHours===null?'':Number(rawHours);
 if(estimatedEffortHours!==''&&(!Number.isFinite(estimatedEffortHours)||estimatedEffortHours<0||estimatedEffortHours>100000))return null;
 const savedFitStatus=value.fitStatus===undefined?fallback.fitStatus||'Need clarification':value.fitStatus,fitStatus=savedFitStatus==='Needs scoping'?'Need clarification':savedFitStatus,decision=value.decision===undefined?fallback.decision||'Undecided':value.decision,effortConfidence=value.effortConfidence===undefined?fallback.effortConfidence||'Unknown':value.effortConfidence,workCycleType=value.workCycleType===undefined?fallback.workCycleType||'Unknown':value.workCycleType;
 if(!ACCOUNTING_FIT_OPTIONS.includes(fitStatus)||!ACCOUNTING_DECISION_OPTIONS.includes(decision)||!['Unknown','Low','Medium','High'].includes(effortConfidence)||!ACCOUNTING_WORK_CYCLE_OPTIONS.includes(workCycleType))return null;
  const checklist=value.startChecklist===undefined?(fallback.startChecklist||{}):value.startChecklist;if(!checklist||typeof checklist!=='object'||Array.isArray(checklist)||Object.values(checklist).some(item=>typeof item!=='boolean'))return null;
  const rawCapacityWindow=text('capacityWindow',160),capacityWindow=rawCapacityWindow==='Later'?'Not checked':rawCapacityWindow,requiredTimeframeDate=text('requiredTimeframeDate',10);
  if(capacityWindow===null||requiredTimeframeDate===null||requiredTimeframeDate&&!taskDateIsValid(requiredTimeframeDate)||capacityWindow==='Specific due date'&&!requiredTimeframeDate)return null;
  const result={fitStatus,rationale:text('rationale',2000),capacityWindow,requiredTimeframeDate,estimatedEffortHours,workCycleType,effortConfidence,capacityCheckedPeriod:text('capacityCheckedPeriod',120),decision,decisionNotes:text('decisionNotes',1000),startChecklist:{scope:checklist.scope===true,capacity:checklist.capacity===true,terms:checklist.terms===true,records:checklist.records===true},reviewedBy:reviewerId||fallback.reviewedBy||null,reviewedAt:reviewerId?new Date().toISOString():fallback.reviewedAt||null};
 if(Object.values(result).some(item=>item===null&&item!==result.reviewedBy&&item!==result.reviewedAt))return null;
 return result;
}
function mapReceptionIntake(row){const accounting= row.company_id===ACCOUNTING_COMPANY_ID;const rawWorkloadReview=parseIntakeJson(row.workload_review_json);return{id:row.id,companyId:row.company_id,companyName:row.company_name,companyTimeZone:row.company_time_zone||null,contactName:row.contact_name,organizationName:row.organization_name||'',email:row.email,phone:row.phone,source:row.source,requestType:row.request_type,summary:row.summary,status:row.status,statusLabel:receptionStatusLabel(row.company_id,row.status),assigneeUserId:row.assignee_user_id,assigneeName:row.assignee_name,nextAction:row.next_action,nextActionDate:row.next_action_date,followUpCompletedAt:row.follow_up_completed_at,followUpCompletedBy:row.follow_up_completed_by,closureOutcome:row.closure_outcome||'',closureNote:row.closure_note||'',closedAt:row.closed_at,closedBy:row.closed_by,linkedTaskId:row.linked_task_id,createdBy:row.created_by,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at,...(row.origin_source_system?{origin:{sourceSystem:row.origin_source_system,sourceRecordId:row.origin_source_record_id,sourceChannel:row.origin_source_channel,sourceCreatedAt:row.origin_source_created_at,receivedAt:row.origin_received_at,mappingVersion:row.origin_mapping_version,syncRevision:Number(row.origin_sync_revision||0),sourcePayload:row.origin_source_payload_json&&row.origin_source_payload_json!=='{}'?parseIntakeJson(row.origin_source_payload_json):null}}:{}),...(accounting?{accountingDetails:parseIntakeJson(row.accounting_details_json),workloadReview:normalizeWorkloadReview(rawWorkloadReview,{},null)||rawWorkloadReview}:{})};}
function mapCompanyNote(row){return{id:row.id,companyId:row.company_id,title:row.title,body:row.body,category:row.category,createdBy:row.created_by,createdByName:row.created_by_name,updatedBy:row.updated_by,updatedByName:row.updated_by_name,createdAt:row.created_at,updatedAt:row.updated_at};}
function getCompanyNoteRow(id){return db.prepare('SELECT n.*,creator.name AS created_by_name,editor.name AS updated_by_name FROM company_notes n LEFT JOIN users creator ON creator.id=n.created_by LEFT JOIN users editor ON editor.id=n.updated_by WHERE n.id=?').get(id);}
function mapProject(row){return{id:row.id,companyId:row.company_id,companyName:row.company_name,projectNumber:row.project_number,name:row.name,clientName:row.client_name,siteLocation:row.site_location,status:row.status,stage:row.stage,projectManagerUserId:row.project_manager_user_id,projectManagerName:row.project_manager_name,startDate:row.start_date,targetDate:row.target_date,estimatedValueCents:row.estimated_value_cents,description:row.description,createdBy:row.created_by,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at};}
function mapProjectMilestone(row){return{id:row.id,projectId:row.project_id,title:row.title,details:row.details,status:row.status,dueDate:row.due_date,assigneeUserId:row.assignee_user_id,assigneeName:row.assignee_name,createdBy:row.created_by,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at};}
function mapProjectDocument(row){return{id:row.id,projectId:row.project_id,name:row.original_name,mimeType:row.mime_type,sizeBytes:row.size_bytes,category:row.category,description:row.description,uploader:row.uploader,createdAt:row.created_at};}
function mapProjectRequest(row){return{id:row.id,projectId:row.project_id,projectName:row.project_name,projectCompanyId:row.project_company_id,projectCompanyName:row.project_company_name,targetCompanyId:row.target_company_id,targetCompanyName:row.target_company_name,title:row.title,description:row.description,status:row.status,priority:row.priority,dueDate:row.due_date,assigneeUserId:row.assignee_user_id,assigneeName:row.assignee_name,createdBy:row.created_by,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at};}
function getProjectRow(id){return db.prepare('SELECT p.*,c.name AS company_name,u.name AS created_by_name,pm.name AS project_manager_name FROM projects p JOIN companies c ON c.id=p.company_id JOIN users u ON u.id=p.created_by LEFT JOIN users pm ON pm.id=p.project_manager_user_id WHERE p.id=?').get(id);}
function getProjectMilestoneRow(id){return db.prepare('SELECT m.*,a.name AS assignee_name,u.name AS created_by_name FROM project_milestones m LEFT JOIN users a ON a.id=m.assignee_user_id JOIN users u ON u.id=m.created_by WHERE m.id=?').get(id);}
function getProjectRequestRow(id){return db.prepare('SELECT r.*,p.name AS project_name,p.company_id AS project_company_id,pc.name AS project_company_name,tc.name AS target_company_name,a.name AS assignee_name,u.name AS created_by_name FROM project_requests r JOIN projects p ON p.id=r.project_id JOIN companies pc ON pc.id=p.company_id JOIN companies tc ON tc.id=r.target_company_id LEFT JOIN users a ON a.id=r.assignee_user_id JOIN users u ON u.id=r.created_by WHERE r.id=?').get(id);}
function addProjectEvent(projectId,userId,eventType,detail){db.prepare('INSERT INTO project_events(id,project_id,actor_user_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),projectId,userId,eventType,detail,new Date().toISOString());addProjectNotification(projectId,userId,eventType==='milestone'?'Project milestone updated':'Project updated',detail,'project');}
function addProjectRequestEvent(requestId,userId,detail){db.prepare('INSERT INTO project_request_events(id,request_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),requestId,userId,detail,new Date().toISOString());const request=db.prepare('SELECT r.assignee_user_id,r.created_by,r.target_company_id,r.id,p.created_by AS project_creator,p.project_manager_user_id,p.company_id AS source_company_id FROM project_requests r JOIN projects p ON p.id=r.project_id WHERE r.id=?').get(requestId);if(request){addNotification({recipientIds:[request.assignee_user_id],actorId:userId,title:'Shared request updated',message:detail,kind:'request',entityType:'request',entityId:requestId,companyId:request.target_company_id});addNotification({recipientIds:[request.created_by,request.project_creator,request.project_manager_user_id],actorId:userId,title:'Shared request updated',message:detail,kind:'request',entityType:'request',entityId:requestId,companyId:request.source_company_id});}}
function companyIdsFromInput(input){const raw=Array.isArray(input.companyIds)?input.companyIds:(input.companyId===undefined?[]:[input.companyId]);if(raw.length>100||raw.some(id=>typeof id!=='string'))return null;return[...new Set(raw.map(id=>id.trim()).filter(Boolean))];}
function companyIdsExist(ids){if(!ids?.length)return false;const rows=db.prepare(`SELECT id FROM companies WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids);return rows.length===ids.length;}
function sameMembershipAccess(current,requested){if(current.length!==requested.length)return false;const existing=new Map(current.map(item=>[item.companyId,`${item.role}:${item.active?1:0}`]));return requested.every(item=>existing.get(item.companyId)===`${item.role}:${item.active?1:0}`);}
function getTaskRow(id){return db.prepare('SELECT t.*,c.name AS company_name,a.name AS assignee_name,creator.name AS created_by_name FROM tasks t JOIN companies c ON c.id=t.company_id LEFT JOIN users a ON a.id=t.assignee_user_id JOIN users creator ON creator.id=t.created_by WHERE t.id=?').get(id);}
function addTaskEvent(taskId,userId,eventType,detail){db.prepare('INSERT INTO task_events(id,task_id,actor_user_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),taskId,userId,eventType,detail,new Date().toISOString());const task=db.prepare('SELECT t.title,t.company_id,t.assignee_user_id,t.created_by FROM tasks t WHERE t.id=?').get(taskId);if(task)addNotification({recipientIds:[task.assignee_user_id,task.created_by],actorId:userId,title:eventType==='created'?'Task assigned':'Task updated',message:`${task.title} · ${detail}`,kind:'task',entityType:'task',entityId:taskId,companyId:task.company_id});}
function getReceptionIntakeRow(id){return db.prepare('SELECT i.*,c.name AS company_name,c.time_zone AS company_time_zone,a.name AS assignee_name,u.name AS created_by_name,o.source_system AS origin_source_system,o.source_record_id AS origin_source_record_id,o.source_channel AS origin_source_channel,o.source_created_at AS origin_source_created_at,o.received_at AS origin_received_at,o.mapping_version AS origin_mapping_version,o.source_payload_json AS origin_source_payload_json,o.sync_revision AS origin_sync_revision FROM reception_intakes i JOIN companies c ON c.id=i.company_id LEFT JOIN users a ON a.id=i.assignee_user_id JOIN users u ON u.id=i.created_by LEFT JOIN reception_intake_origins o ON o.intake_id=i.id WHERE i.id=?').get(id);}
function addReceptionIntakeEvent(intakeId,userId,detail,eventType='update'){db.prepare('INSERT INTO reception_intake_events(id,intake_id,actor_user_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),intakeId,userId,eventType,detail,new Date().toISOString());const intake=db.prepare('SELECT company_id,assignee_user_id,created_by FROM reception_intakes WHERE id=?').get(intakeId);if(intake)addNotification({recipientIds:[intake.assignee_user_id,intake.created_by],actorId:userId,title:'Intake updated',message:'A reception intake was updated. Open the company portal for details.',kind:'intake',entityType:'intake',entityId:intakeId,companyId:intake.company_id});}
function getReceptionIntakeHistory(intakeId){return db.prepare('SELECT e.id,e.event_type,e.detail,e.created_at,u.name AS actor_name FROM reception_intake_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.intake_id=? ORDER BY e.created_at DESC').all(intakeId).map(event=>({id:event.id,type:event.event_type,detail:event.detail,actor:event.actor_name||'System',createdAt:event.created_at}));}
function getReceptionIntakeDocumentRow(id){return db.prepare('SELECT d.*,u.name AS uploader FROM reception_intake_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.id=?').get(id);}
function mapReceptionIntakeDocument(row){return{id:row.id,intakeId:row.intake_id,name:row.original_name,mimeType:row.mime_type,sizeBytes:row.size_bytes,uploadedBy:row.uploaded_by,uploader:row.uploader,createdAt:row.created_at,downloadUrl:`/api/reception-intakes/${encodeURIComponent(row.intake_id)}/documents/${encodeURIComponent(row.id)}/download`};}
const CALENDAR_COLORS=['gold','green','coral','blue'];
function calendarTimestamp(value){if(typeof value!=='string'||value.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}
function validTimeZone(value){if(typeof value!=='string'||value.length>100||!US_TIME_ZONES.includes(value))return null;try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(0);return value;}catch{return null;}}
function validCalendarDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;}
function addCalendarDays(value,days){const [year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day+days));return date.toISOString().slice(0,10);}
function timeZoneParts(timestamp,timeZone){const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));return values;}
function zonedDateTimeToIso(date,time,timeZone){
 if(!validCalendarDate(date)||typeof time!=='string'||!/^\d{2}:\d{2}$/.test(time)||!validTimeZone(timeZone))return null;
 const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);if(hour>23||minute>59)return null;
 const wallTime=Date.UTC(year,month-1,day,hour,minute),offsets=new Set();
 for(let hours=-48;hours<=48;hours+=6){const sample=wallTime+hours*3600000,parts=timeZoneParts(sample,timeZone);offsets.add(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-sample);}
 const matches=[];for(const offset of offsets){const instant=wallTime-offset,parts=timeZoneParts(instant,timeZone);if(parts.year===year&&parts.month===month&&parts.day===day&&parts.hour===hour&&parts.minute===minute)matches.push(instant);}
 return matches.length?new Date(Math.min(...matches)).toISOString():null;
}
function validDateRange(fromDate,toDate){return validCalendarDate(fromDate)&&validCalendarDate(toDate)&&toDate>fromDate&&Date.parse(`${toDate}T00:00:00Z`)-Date.parse(`${fromDate}T00:00:00Z`)<=370*86400000;}
function calendarAttendeeIds(input){if(input===undefined)return[];if(!Array.isArray(input)||input.length>50||input.some(id=>typeof id!=='string'))return null;const ids=[...new Set(input.map(id=>id.trim()).filter(Boolean))];return ids.length<=50?ids:null;}
function ensureUserCalendarColors(){
 const counts=new Map(CALENDAR_USER_COLORS.map(color=>[color,0]));
 for(const row of db.prepare('SELECT calendar_color,COUNT(*) AS count FROM users WHERE calendar_color IS NOT NULL GROUP BY calendar_color').all())if(counts.has(row.calendar_color))counts.set(row.calendar_color,row.count);
 const missing=db.prepare('SELECT id,role FROM users WHERE calendar_color IS NULL OR calendar_color NOT IN ('+CALENDAR_USER_COLORS.map(()=>'?').join(',')+') ORDER BY created_at,id').all(...CALENDAR_USER_COLORS);
 const update=db.prepare('UPDATE users SET calendar_color=? WHERE id=?');
 for(const user of missing){const available=calendarColorOptionsForUser(user.id,user.role,null).filter(option=>option.available).map(option=>option.color),choices=available.length?available:CALENDAR_USER_COLORS,color=choices.sort((a,b)=>counts.get(a)-counts.get(b)||CALENDAR_USER_COLORS.indexOf(a)-CALENDAR_USER_COLORS.indexOf(b))[0];update.run(color,user.id);counts.set(color,(counts.get(color)||0)+1);}
}
function calendarColorOptionsForUser(userId,userRole,currentColor){
 const placeholders=CALENDAR_USER_COLORS.map(()=>'?').join(','),takenRows=db.prepare(`SELECT DISTINCT u.calendar_color FROM users u WHERE u.active=1 AND u.id<>? AND u.calendar_color IN (${placeholders}) AND (?='admin' OR u.role='admin' OR EXISTS(SELECT 1 FROM memberships mine JOIN memberships theirs ON theirs.company_id=mine.company_id WHERE mine.user_id=? AND theirs.user_id=u.id AND mine.active=1 AND theirs.active=1))`).all(userId,...CALENDAR_USER_COLORS,userRole,userId),taken=new Set(takenRows.map(row=>row.calendar_color));
 return CALENDAR_USER_COLORS.map(color=>({color,available:color===currentColor||!taken.has(color)}));
}
function hasSystemDevelopmentAccess(user){return Boolean(user?.active!==false&&user?.id&&db.prepare('SELECT 1 FROM system_development_members WHERE user_id=?').get(user.id));}
function canAccessSystemDevelopmentProject(user,project){return Boolean(hasSystemDevelopmentAccess(user)&&project&&(user.role==='admin'||project.created_by===user.id||db.prepare('SELECT 1 FROM system_development_project_members WHERE project_id=? AND user_id=?').get(project.id,user.id)));}
function canAccessActiveSystemDevelopmentProject(user,project){return Boolean(project&&!project.archived_at&&canAccessSystemDevelopmentProject(user,project));}
function canManageSystemDevelopmentProjectMembers(user,project){return Boolean(hasSystemDevelopmentAccess(user)&&project&&(user.role==='admin'||project.created_by===user.id));}
function systemDevelopmentNotificationProject(entityId){
 const project=db.prepare('SELECT id,created_by FROM system_development_projects WHERE id=?').get(entityId);if(project)return project;
 const item=db.prepare('SELECT project_id FROM system_development_items WHERE id=?').get(entityId);return item?.project_id?db.prepare('SELECT id,created_by FROM system_development_projects WHERE id=?').get(item.project_id):null;
}
function canAccessSystemDevelopmentNotification(user,entityId){const project=systemDevelopmentNotificationProject(entityId);return Boolean(project&&hasSystemDevelopmentAccess(user)&&canAccessSystemDevelopmentProject(user,project));}
function systemDevelopmentProjectMemberIds(projectId){return db.prepare('SELECT user_id FROM system_development_project_members WHERE project_id=? ORDER BY added_at,user_id').all(projectId).map(row=>row.user_id);}
function systemDevelopmentProjectRecipientIds(projectId){return db.prepare("SELECT u.id FROM users u JOIN system_development_members sm ON sm.user_id=u.id WHERE u.active=1 AND (u.role='admin' OR EXISTS(SELECT 1 FROM system_development_project_members pm WHERE pm.project_id=? AND pm.user_id=u.id)) ORDER BY u.name,u.id").all(projectId).map(row=>row.id);}
function normalizeSystemDevelopmentProjectMemberIds(value,creatorId){
 if(value===undefined)return null;
 if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=='string'||!id.trim()))return null;
 const ids=[...new Set(value.map(id=>id.trim()))];if(!ids.includes(creatorId))ids.push(creatorId);
 const activeUsers=new Set(db.prepare('SELECT id FROM users WHERE active=1').all().map(row=>row.id));
 const collaborationUsers=new Set(db.prepare('SELECT user_id FROM system_development_members').all().map(row=>row.user_id));
 return ids.every(id=>activeUsers.has(id)&&(id===creatorId||collaborationUsers.has(id)))?ids:null;
}
function replaceSystemDevelopmentProjectMembers(projectId,userIds,actorId,now){
 db.prepare('DELETE FROM system_development_project_members WHERE project_id=?').run(projectId);
 const insert=db.prepare('INSERT INTO system_development_project_members(project_id,user_id,added_by,added_at) VALUES(?,?,?,?)');
 for(const userId of userIds)insert.run(projectId,userId,actorId,now);
}
function getCalendarEventRow(id){return db.prepare('SELECT e.*,c.name AS company_name,cl.name AS client_name,u.name AS created_by_name,u.calendar_color AS created_by_calendar_color,canceler.name AS canceled_by_name FROM calendar_events e LEFT JOIN companies c ON c.id=e.company_id LEFT JOIN clients cl ON cl.id=e.client_id JOIN users u ON u.id=e.created_by LEFT JOIN users canceler ON canceler.id=e.canceled_by WHERE e.id=?').get(id);}
function calendarEventAttendeeIndex(events){
 const attendeeIndex=new Map(events.map(event=>[event.id,[]]));if(!events.length)return attendeeIndex;
 const placeholders=events.map(()=>'?').join(','),attendees=db.prepare(`SELECT a.event_id,u.id,u.name,u.calendar_color,CASE WHEN u.role='admin' THEN 'Platform administrator' ELSE m.role END AS role,a.response,a.responded_at FROM calendar_event_attendees a JOIN calendar_events e ON e.id=a.event_id JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=e.company_id WHERE a.event_id IN (${placeholders}) AND u.active=1 AND (u.role='admin' OR m.active=1) ORDER BY u.name`).all(...events.map(event=>event.id));
 for(const attendee of attendees)attendeeIndex.get(attendee.event_id)?.push({id:attendee.id,name:attendee.name,role:attendee.role,calendarColor:CALENDAR_USER_COLORS.includes(attendee.calendar_color)?attendee.calendar_color:'gold',response:attendee.response||'awaiting',respondedAt:attendee.responded_at||null});
 return attendeeIndex;
}
function calendarExternalAttendeeIndex(events){const index=new Map(events.map(event=>[event.id,[]]));if(!events.length)return index;const rows=db.prepare(`SELECT id,event_id,name,email,response,email_status,email_error,email_sent_at FROM calendar_event_external_attendees WHERE event_id IN (${events.map(()=>'?').join(',')}) ORDER BY name,email`).all(...events.map(event=>event.id));for(const row of rows)index.get(row.event_id)?.push({id:row.id,name:row.name,email:row.email,response:row.response,emailStatus:row.email_status,emailError:row.email_error,emailSentAt:row.email_sent_at});return index;}
function getCalendarPermissionScope(user,companyIds){
 return{companyIds:companyIds||userCompanyIds(user),rootCompanyId:db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id};
}
function calendarEventInCurrentScope(user,event,scope){
 if(!user||!event)return false;
 scope=scope||getCalendarPermissionScope(user);const organizationCalendar=user.role==='admin'&&user.activeCompanyId===scope.rootCompanyId;
 return scope.companyIds.includes(event.company_id)&&(organizationCalendar||event.company_id===user.activeCompanyId);
}
function canManageCalendarEvent(user,event,scope){
 scope=scope||getCalendarPermissionScope(user);
 return calendarEventInCurrentScope(user,event,scope)&&(event.created_by===user.id||canManageCompany(user,event.company_id,scope.rootCompanyId));
}
function mapCalendarEvent(row,attendeeIndex,externalIndex,viewer,permissionScope){
 const attendees=attendeeIndex?attendeeIndex.get(row.id)||[]:db.prepare("SELECT u.id,u.name,u.calendar_color,CASE WHEN u.role='admin' THEN 'Platform administrator' ELSE m.role END AS role,a.response,a.responded_at FROM calendar_event_attendees a JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE a.event_id=? AND u.active=1 AND (u.role='admin' OR m.active=1) ORDER BY u.name").all(row.company_id,row.id).map(item=>({id:item.id,name:item.name,role:item.role,calendarColor:CALENDAR_USER_COLORS.includes(item.calendar_color)?item.calendar_color:'gold',response:item.response||'awaiting',respondedAt:item.responded_at||null}));
 const canManage=Boolean(viewer&&canManageCalendarEvent(viewer,row,permissionScope)),externalAttendees=(externalIndex?.get(row.id)||[]).map(guest=>({id:guest.id,name:guest.name,email:canManage?guest.email:'',response:guest.response,emailStatus:guest.emailStatus,emailError:canManage?guest.emailError:'',emailSentAt:guest.emailSentAt}));
 return{id:row.id,title:row.event_type==='lunch'?'Lunch Break':row.event_type==='unavailable'?'Time Off':row.title,eventType:row.event_type||'event',status:row.status||'scheduled',canceledAt:row.canceled_at||null,canceledByName:row.canceled_by_name||'',startsAt:row.starts_at,endsAt:row.ends_at,allDay:!!row.all_day,startDate:row.start_date,endDateExclusive:row.end_date,timeZone:row.time_zone||'America/New_York',companyId:row.company_id,companyName:row.company_name||'Company',clientId:row.client_id||'',clientName:row.client_name||'',location:row.location,locationType:row.location_type||'On-site',meetingType:row.meeting_type||'Other',description:row.description,color:row.created_by_calendar_color||row.calendar_color||row.color||'gold',sourceSystem:row.source_system||'portal',sourceEventId:row.source_event_id||'',createdBy:row.created_by,createdByName:row.created_by_name,canManage,attendees,externalAttendees,createdAt:row.created_at,updatedAt:row.updated_at};
}
function mapCalendarWorkItem(row){return{id:row.id,type:'calendarEvent',title:row.event_type==='lunch'?'Lunch Break':row.event_type==='unavailable'?'Time Off':row.title,status:row.status||'scheduled',canceledAt:row.canceled_at||null,canceledByName:row.canceled_by_name||'',startsAt:row.starts_at,endsAt:row.ends_at,allDay:!!row.all_day,startDate:row.start_date,endDateExclusive:row.end_date,timeZone:row.time_zone||'America/New_York',companyId:row.company_id,companyName:row.company_name||'Company',clientId:row.client_id||'',clientName:row.client_name||'',location:row.location,locationType:row.location_type||'On-site',meetingType:row.meeting_type||'Other',description:row.description,sourceSystem:row.source_system||'portal',sourceEventId:row.source_event_id||'',createdBy:row.created_by,createdByName:row.created_by_name,updatedAt:row.updated_at};}
function replaceCalendarEventAttendees(eventId,attendeeIds,createdAt){const ids=[...new Set(attendeeIds)],existing=db.prepare('SELECT user_id FROM calendar_event_attendees WHERE event_id=?').all(eventId).map(row=>row.user_id),keep=new Set(ids),remove=db.prepare('DELETE FROM calendar_event_attendees WHERE event_id=? AND user_id=?'),insert=db.prepare("INSERT OR IGNORE INTO calendar_event_attendees(event_id,user_id,created_at,response) VALUES(?,?,?,'awaiting')");for(const id of existing)if(!keep.has(id))remove.run(eventId,id);for(const id of ids)insert.run(eventId,id,createdAt);}
function normalizeExternalCalendarAttendees(input){if(input===undefined)return undefined;if(!Array.isArray(input)||input.length>25)return null;const guests=[],seen=new Set();for(const entry of input){if(!entry||typeof entry!=='object')return null;const name=typeof entry.name==='string'?entry.name.trim():'',email=typeof entry.email==='string'?entry.email.trim():'',normalizedEmail=email.toLowerCase();if(!email||email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||name.length>120)return null;if(seen.has(normalizedEmail))continue;seen.add(normalizedEmail);guests.push({name,email,normalizedEmail});}return guests;}
function replaceCalendarExternalAttendees(eventId,guests,createdAt,notifyAll=false){const existing=db.prepare('SELECT * FROM calendar_event_external_attendees WHERE event_id=?').all(eventId),byEmail=new Map(existing.map(row=>[row.normalized_email,row])),incoming=new Set(guests.map(guest=>guest.normalizedEmail)),remove=db.prepare('DELETE FROM calendar_event_external_attendees WHERE id=?');for(const row of existing)if(!incoming.has(row.normalized_email))remove.run(row.id);const recipients=[];for(const guest of guests){const row=byEmail.get(guest.normalizedEmail),shouldSend=!row||notifyAll||row.email_status!=='sent';if(!shouldSend){db.prepare('UPDATE calendar_event_external_attendees SET name=?,email=?,updated_at=? WHERE id=?').run(guest.name,guest.email,createdAt,row.id);continue;}const token=randomBytes(32).toString('base64url'),tokenHash=createHash('sha256').update(token).digest('hex'),id=row?.id||randomUUID(),response=notifyAll&&row?'awaiting':row?.response||'awaiting',respondedAt=notifyAll&&row?null:row?.responded_at||null;if(row)db.prepare('UPDATE calendar_event_external_attendees SET name=?,email=?,response=?,responded_at=?,token_hash=?,email_status=?,email_error=?,email_sent_at=NULL,updated_at=? WHERE id=?').run(guest.name,guest.email,response,respondedAt,tokenHash,'pending','',createdAt,id);else db.prepare("INSERT INTO calendar_event_external_attendees(id,event_id,name,email,normalized_email,response,token_hash,email_status,email_error,created_at,updated_at) VALUES(?,?,?,?,?,'awaiting',?,'pending','',?,?)").run(id,eventId,guest.name,guest.email,guest.normalizedEmail,tokenHash,createdAt,createdAt);recipients.push({...guest,id,token});}return recipients;}
function calendarGuestFacingDetailsChanged(existing,updated){return existing.title!==updated.title||existing.starts_at!==updated.startsAt||existing.ends_at!==updated.endsAt||Boolean(existing.all_day)!==updated.allDay||existing.start_date!==updated.startDate||existing.end_date!==updated.endDate||String(existing.time_zone||'America/New_York')!==updated.timeZone||existing.location!==updated.location||String(existing.location_type||'On-site')!==updated.locationType||String(existing.meeting_type||'Other')!==updated.meetingType||existing.description!==updated.description;}
function calendarExternalUpdateRecipients(eventId,candidateIds,invitationRecipients,updatedAt){if(!candidateIds.length)return[];const invited=new Set(invitationRecipients.map(recipient=>recipient.id)),ids=candidateIds.filter(id=>!invited.has(id));if(!ids.length)return[];const rows=db.prepare(`SELECT id,name,email,response FROM calendar_event_external_attendees WHERE event_id=? AND id IN (${ids.map(()=>'?').join(',')})`).all(eventId,...ids);for(const row of rows)db.prepare("UPDATE calendar_event_external_attendees SET email_status='pending',email_error='',email_sent_at=NULL,updated_at=? WHERE id=?").run(updatedAt,row.id);return rows;}
function calendarEmailFromHeader(value){const raw=String(value||'').trim(),bracketed=raw.match(/<\s*([^<>]+)\s*>/),email=(bracketed?bracketed[1]:raw).trim();return email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:'';}
function calendarSmtpSettings(){const host=String(process.env.SMTP_HOST||'').trim(),port=Number(process.env.SMTP_PORT||587),serverFrom=String(process.env.SMTP_FROM||'').trim(),publicUrl=String(process.env.PORTAL_PUBLIC_URL||'').trim().replace(/\/$/,''),senderOverride=getPortalSettings().calendarSenderEmail,senderEmail=senderOverride||calendarEmailFromHeader(serverFrom),nameMatch=serverFrom.match(/^\s*(.*?)\s*<\s*[^<>]+\s*>\s*$/),senderName=nameMatch?.[1]?.trim().replace(/^['"]|['"]$/g,'')||'Aspect Companies',from=senderOverride?{name:senderName,address:senderOverride}:serverFrom;return{host,port,from,publicUrl,senderEmail,senderOverride:Boolean(senderOverride),secure:process.env.SMTP_SECURE==='true'||port===465,user:String(process.env.SMTP_USER||''),pass:String(process.env.SMTP_PASS||''),configured:Boolean(host&&Number.isInteger(port)&&port>0&&port<=65535&&from&&publicUrl)};}
function portalSettingsPayload(){const mail=calendarSmtpSettings(),slack=calendarSlackSettings();return{...getPortalSettings(),meta:{calendarEmailConfigured:mail.configured,calendarSenderEmail:mail.senderEmail,calendarSenderOverride:mail.senderOverride,calendarSlackConfigured:slack.configured,portalUrlConfigured:Boolean(mail.publicUrl),limits:{documentUploadBytes:MAX_DOCUMENT_BYTES,clientImportBytes:MAX_CLIENT_IMPORT_BYTES,clientImportRows:MAX_CLIENT_IMPORT_ROWS,sessionDays:SESSION_DAYS}}};}
function calendarLocalDateTime(event){
 const zone=event.time_zone||'America/New_York';
 if(event.all_day){const value=event.start_date||event.starts_at.slice(0,10),[year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day,12));return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(date)+' (all day)';}
 const start=new Date(event.starts_at),end=new Date(event.ends_at),dateFormat=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'long',year:'numeric',month:'long',day:'numeric'}),timeFormat=new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}),zoneFormat=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longGeneric'}),startDate=dateFormat.format(start),endDate=dateFormat.format(end),startTime=timeFormat.format(start),endTime=timeFormat.format(end),zoneName=zoneFormat.formatToParts(start).find(part=>part.type==='timeZoneName')?.value||zone;
 return startDate===endDate?`${startDate}, ${startTime} – ${endTime} (${zoneName})`:`${startDate}, ${startTime} – ${endDate}, ${endTime} (${zoneName})`;
}
function escapeCalendarEmailHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function calendarEmailDetail(label,value){return `<tr><td style="padding:0 0 9px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #eee8d9;border-radius:11px;background:#faf7ed;"><tr><td style="padding:12px 14px;"><div style="margin:0 0 5px;color:#8a7950;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1.1px;">${escapeCalendarEmailHtml(label.toUpperCase())}</div><div style="color:#39382f;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeCalendarEmailHtml(value||'—')}</div></td></tr></table></td></tr>`;}
function calendarNotificationHtml({isUpdate,greeting,eventTitle,company,dateLine,location,meetingType,description,response,responseLink}){
 const label=isUpdate?'CALENDAR UPDATE':'CALENDAR INVITATION',intro=isUpdate?'The details for this meeting have changed.':'You are invited to the following calendar meeting.',safeTitle=escapeCalendarEmailHtml(eventTitle),safeGreeting=escapeCalendarEmailHtml(greeting),safeResponse=escapeCalendarEmailHtml(response),button=isUpdate?`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 10px;"><tr><td style="padding:13px 15px;border:1px solid #eee5cf;border-radius:10px;background:#faf7ed;color:#655d49;font-family:Arial,sans-serif;font-size:13px;line-height:1.55;"><strong style="color:#39382f;">Your current reply:</strong> ${safeResponse}<br>Use the response link in your original invitation to review the latest details or change your reply.</td></tr></table>`:`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 10px;"><tr><td align="center" bgcolor="#292923" style="border-radius:9px;"><a href="${escapeCalendarEmailHtml(responseLink)}" style="display:inline-block;padding:13px 21px;border:1px solid #292923;border-radius:9px;color:#f8df84;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;line-height:1.2;text-decoration:none;">View invitation and respond</a></td></tr></table><p style="margin:8px 0 0;color:#777365;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;">If the button does not work, copy and paste this link into your browser:<br><a href="${escapeCalendarEmailHtml(responseLink)}" style="color:#836812;overflow-wrap:anywhere;">${escapeCalendarEmailHtml(responseLink)}</a></p>`;
 const detailRows=calendarEmailDetail('Company',company)+calendarEmailDetail('Date and time',dateLine)+calendarEmailDetail('Location',location)+calendarEmailDetail('Meeting type',meetingType)+(description?calendarEmailDetail('Notes',description):'');
 return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f6f3e9;"><span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${label}: ${safeTitle}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f3e9" style="width:100%;background:#f6f3e9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #e8e1d2;border-radius:16px;background:#fffefa;"><tr><td height="5" bgcolor="#d9b64a" style="height:5px;background:#d9b64a;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:23px 26px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="38" valign="middle"><div style="width:34px;height:34px;border-radius:10px;background:#292923;color:#f4d45f;font-family:Arial,sans-serif;font-size:21px;font-weight:bold;line-height:34px;text-align:center;">A</div></td><td style="padding-left:10px;color:#39382f;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:1.2px;">ASPECT<br><span style="color:#898374;font-size:9px;letter-spacing:2px;">COMPANIES</span></td></tr></table></td></tr><tr><td style="padding:25px 26px 24px;"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fff2c6;color:#785d12;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;">${label}</div><h1 style="margin:13px 0 9px;color:#302f28;font-family:Arial,sans-serif;font-size:23px;line-height:1.3;">${safeTitle}</h1><p style="margin:0 0 8px;color:#49473d;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;">${safeGreeting}</p><p style="margin:0 0 18px;color:#716b5f;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;">${intro}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}</table>${button}<p style="margin:22px 0 0;padding-top:15px;border-top:1px solid #eee9dc;color:#898374;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;">Thank you,<br><strong style="color:#5b574c;">Aspect Companies</strong></p></td></tr></table></td></tr></table></body></html>`;
}
async function sendCalendarNotifications(event,invitationRecipients,updateRecipients){
 const recipients=[...invitationRecipients.map(recipient=>({...recipient,notificationType:'invitation'})),...updateRecipients.map(recipient=>({...recipient,notificationType:'update'}))];
 if(!recipients.length)return{sent:0,failed:0,configured:calendarSmtpSettings().configured};
 const settings=calendarSmtpSettings();let transporter=null,setupError='SMTP email is not configured. Set SMTP_HOST, SMTP_FROM, and PORTAL_PUBLIC_URL.';
 if(settings.configured){try{const nodemailer=require('nodemailer');transporter=nodemailer.createTransport({host:settings.host,port:settings.port,secure:settings.secure,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:5000,auth:settings.user?{user:settings.user,pass:settings.pass}:undefined});}catch(error){setupError='Email delivery is unavailable on this server.';}}
 const company=event.company_name||'Company',dateLine=calendarLocalDateTime(event),location=[event.location_type||'On-site',event.location].filter(Boolean).join(' — '),meetingType=event.meeting_type||'Other';let sent=0,failed=0;
 for(const recipient of recipients){
  const isUpdate=recipient.notificationType==='update';let errorText='';
  if(!transporter)errorText=setupError;
  else{
   const link=isUpdate?'':settings.publicUrl+'/calendar-rsvp.html?token='+encodeURIComponent(recipient.token),response=recipient.response==='awaiting'?'Awaiting your response':String(recipient.response||'').replace(/^./,letter=>letter.toUpperCase()),greeting=recipient.name?'Hello '+recipient.name+',':'Hello,',body=[greeting,'',isUpdate?'The details for this calendar meeting have changed.':'You are invited to the following calendar meeting.','','MEETING',event.title,'','COMPANY',company,'','DATE AND TIME',dateLine,'','LOCATION',location,'','MEETING TYPE',meetingType];
   if(event.description)body.push('','NOTES',event.description);
   if(isUpdate)body.push('','YOUR RSVP',response,'Use the response link in your original invitation to review the latest details or change your response.');
   else body.push('','PLEASE RESPOND','Use this link to accept, maybe, or decline:',link);
   body.push('','Thank you,','Aspect Companies');
   try{await transporter.sendMail({from:settings.from,to:recipient.email,subject:(isUpdate?'Calendar update: ':'Calendar invitation: ')+event.title,text:body.join('\n'),html:calendarNotificationHtml({isUpdate,greeting,eventTitle:event.title,company,dateLine,location,meetingType,description:event.description,response,responseLink:link})});}catch(error){errorText=String(error?.message||'Email could not be sent.').slice(0,500);}
  }
  const now=new Date().toISOString();db.prepare('UPDATE calendar_event_external_attendees SET email_status=?,email_error=?,email_sent_at=?,updated_at=? WHERE id=?').run(errorText?'failed':'sent',errorText,errorText?null:now,now,recipient.id);if(errorText)failed++;else sent++;
 }
 broadcastCompanyUpdate(event.company_id,['calendar']);
 return{sent,failed,configured:settings.configured};
}
function queueCalendarNotifications(event,invitationRecipients,updateRecipients=[]){const configured=calendarSmtpSettings().configured,queued=invitationRecipients.length+updateRecipients.length;if(!queued)return{queued:0,invitations:0,updates:0,configured};if(!getPortalSettings().calendarEmails){const message='External calendar emails are disabled in portal settings.',now=new Date().toISOString(),update=db.prepare("UPDATE calendar_event_external_attendees SET email_status='failed',email_error=?,updated_at=? WHERE id=?");for(const recipient of [...invitationRecipients,...updateRecipients])update.run(message,now,recipient.id);return{queued:0,invitations:0,updates:0,configured,disabled:true,suppressed:queued};}setImmediate(()=>{sendCalendarNotifications(event,invitationRecipients,updateRecipients).catch(error=>{const message=String(error?.message||'Email could not be sent.').slice(0,500),now=new Date().toISOString(),update=db.prepare("UPDATE calendar_event_external_attendees SET email_status='failed',email_error=?,updated_at=? WHERE id=?");for(const recipient of [...invitationRecipients,...updateRecipients])update.run(message,now,recipient.id);broadcastCompanyUpdate(event.company_id,['calendar']);console.error('Calendar notification delivery failed:',message);});});return{queued,invitations:invitationRecipients.length,updates:updateRecipients.length,configured};}
function seedPilotSampleData(userId){
 if(!PILOT_MODE)return;
 const now=new Date().toISOString();
 const tasks=[
  {id:'pilot-sample-task-signature',companyId:'aspect-property',title:'[PILOT SAMPLE] Confirm first job intake fields',description:'Demo task for checking that Signature Exteriors work stays within its company workspace.'},
  {id:'pilot-sample-task-accounting',companyId:'aspect-ventures',title:'[PILOT SAMPLE] Review sample month-end checklist',description:'Demo task for checking that Aspect Accounting work stays within its company workspace.'}
 ];
 const notes=[
  {id:'pilot-sample-note-signature',companyId:'aspect-property',title:'[PILOT SAMPLE] Signature workspace access check',body:'Demo content only. A Signature Exteriors-scoped pilot account should see this note. It should not appear in another company’s Notes workspace.'},
  {id:'pilot-sample-note-accounting',companyId:'aspect-ventures',title:'[PILOT SAMPLE] Aspect Accounting access check',body:'Demo content only. An Aspect Accounting-scoped pilot account should see this note. It should not appear in another company’s Notes workspace.'}
 ];
 // Initial workspace setup already runs inside a transaction; keep these
 // sample records in that transaction instead of nesting another one.
 for(const task of tasks){
  const result=db.prepare("INSERT OR IGNORE INTO tasks(id,company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at) VALUES(?,?,?,?,'Open','Normal',NULL,NULL,?,?,?)").run(task.id,task.companyId,task.title,task.description,userId,now,now);
  if(result.changes)addTaskEvent(task.id,userId,'created','Pilot sample task created.');
 }
 for(const note of notes)db.prepare("INSERT OR IGNORE INTO company_notes(id,company_id,title,body,category,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,'Reference',?,?,?,?)").run(note.id,note.companyId,note.title,note.body,userId,userId,now,now);
}
function canAssignTaskTo(userId,companyId){if(!userId)return true;const account=db.prepare('SELECT id,role FROM users WHERE id=? AND active=1').get(userId);if(!account)return false;if(account.role==='admin')return true;return !!db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND company_id=? AND active=1').get(userId,companyId);}
function listTaskAssignees(companyId){return db.prepare("SELECT DISTINCT u.id,u.name,CASE WHEN u.role='admin' THEN 'Platform administrator' ELSE m.role END AS role FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE u.active=1 AND (u.role='admin' OR m.active=1) ORDER BY u.name").all(companyId);}
function listClientAssignableUsers(companyId){return db.prepare("SELECT DISTINCT u.id,u.name,u.email,CASE WHEN u.role='admin' THEN 'Platform administrator' ELSE m.role END AS role FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE u.active=1 AND (u.role='admin' OR m.active=1) ORDER BY u.name").all(companyId);}
function clientAssignedUserIds(input,companyId){if(input===undefined)return[];if(!Array.isArray(input)||input.length>100||input.some(id=>typeof id!=='string'||!id.trim()))return null;const ids=[...new Set(input.map(id=>id.trim()))],valid=new Set(listClientAssignableUsers(companyId).map(person=>person.id));return ids.every(id=>valid.has(id))?ids:null;}
function replaceClientAssignments(clientId,userIds,actorId,now){db.prepare('DELETE FROM client_assignments WHERE client_id=?').run(clientId);const insert=db.prepare('INSERT INTO client_assignments(client_id,user_id,assigned_by,assigned_at) VALUES(?,?,?,?)');for(const userId of userIds)insert.run(clientId,userId,actorId,now);}
function listClientAssignments(clientId){return db.prepare('SELECT u.id,u.name FROM client_assignments a JOIN clients c ON c.id=a.client_id JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=c.company_id WHERE a.client_id=? AND u.active=1 AND (u.role=\'admin\' OR m.active=1) ORDER BY u.name COLLATE NOCASE').all(clientId);}
function taskDateIsValid(value){if(value===null||value==='')return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00.000Z`);return!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;}
function ensureProjectClient(companyId,value,userId,now){const name=String(value||'').trim();if(!name)return;const existing=db.prepare('SELECT id FROM clients WHERE company_id=? AND lower(trim(name))=lower(trim(?))').get(companyId,name);if(existing)return existing.id;const id=randomUUID();db.prepare("INSERT INTO clients(id,company_id,name,contact_name,email,phone,location,notes,created_by,created_at,updated_at) VALUES(?,?,?,'','','','','',?,?,?)").run(id,companyId,name,userId,now,now);return id;}
function migrateProjectClientNames(){const rows=db.prepare("SELECT company_id,MIN(trim(client_name)) AS name,MIN(created_by) AS created_by,MIN(created_at) AS created_at FROM projects WHERE trim(client_name)<>'' GROUP BY company_id,lower(trim(client_name))").all(),insert=db.prepare("INSERT OR IGNORE INTO clients(id,company_id,name,contact_name,email,phone,location,notes,created_by,created_at,updated_at) VALUES(?,?,?,'','','','','',?,?,?)");for(const row of rows)insert.run(randomUUID(),row.company_id,row.name,row.created_by,row.created_at,row.created_at);}
ensureUserCalendarColors();
migrateProjectClientNames();
function validBackupId(id){return /^\d{8}T\d{9}Z-[0-9a-f-]{36}$/.test(id);}
function sqlString(value){return `'${String(value).replace(/'/g,"''")}'`;}
function makeBackupId(){return `${new Date().toISOString().replace(/[-:]/g,'').replace(/\.(\d{3})Z$/,'$1Z')}-${randomUUID()}`;}
async function createBackupSnapshot(){
 const id=makeBackupId(),partial=path.join(BACKUPS_DIR,`.partial-${id}`),destination=path.join(BACKUPS_DIR,id),snapshotPath=path.join(partial,'portal.sqlite'),docsDestination=path.join(partial,'documents');
 await fs.mkdir(docsDestination,{recursive:true});
 try{
  db.exec(`VACUUM INTO ${sqlString(snapshotPath)}`);
  const snapshotDb=new DatabaseSync(snapshotPath);let documents;
     try{snapshotDb.prepare('DELETE FROM sessions').run();documents=snapshotDb.prepare('SELECT stored_name,size_bytes FROM company_documents UNION ALL SELECT stored_name,size_bytes FROM project_documents UNION ALL SELECT stored_name,size_bytes FROM system_development_project_documents UNION ALL SELECT stored_name,size_bytes FROM reception_intake_documents ORDER BY stored_name').all();}
  finally{snapshotDb.close();}
  let totalBytes=(await fs.stat(snapshotPath)).size;
  for(const doc of documents){
   if(!/^[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|txt|csv|docx|xlsx|pptx)$/i.test(doc.stored_name))throw new Error('A document record has an invalid storage name.');
   const source=path.join(DOCUMENTS_DIR,doc.stored_name),target=path.join(docsDestination,doc.stored_name);
   await fs.copyFile(source,target);const stat=await fs.stat(target);if(stat.size!==doc.size_bytes)throw new Error(`Document size changed during backup: ${doc.stored_name}`);totalBytes+=stat.size;
  }
  const manifest={version:1,id,createdAt:new Date().toISOString(),database:'portal.sqlite',documentCount:documents.length,totalBytes};
  await fs.writeFile(path.join(partial,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  await fs.rename(partial,destination);return manifest;
 }catch(error){await fs.rm(partial,{recursive:true,force:true}).catch(()=>{});throw error;}
}
async function listBackupSnapshots(){
 await fs.mkdir(BACKUPS_DIR,{recursive:true});const items=await fs.readdir(BACKUPS_DIR,{withFileTypes:true}),backups=[];
 for(const item of items){if(!item.isDirectory()||!validBackupId(item.name))continue;try{const manifest=JSON.parse(await fs.readFile(path.join(BACKUPS_DIR,item.name,'manifest.json'),'utf8'));if(manifest.version===1&&manifest.id===item.name)backups.push(manifest);}catch{}}
 return backups.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
async function validateBackupSnapshot(id){
 if(!validBackupId(id))throw new Error('Invalid backup identifier.');
 const root=path.join(BACKUPS_DIR,id),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 if(manifest.version!==1||manifest.id!==id||manifest.database!=='portal.sqlite')throw new Error('This backup is not valid for restoration.');
  const snapshotPath=path.join(root,'portal.sqlite'),snapshotDb=new DatabaseSync(snapshotPath);let documents;
    try{const integrity=Object.values(snapshotDb.prepare('PRAGMA integrity_check').get()||{})[0];if(integrity!=='ok')throw new Error('The backup database failed its integrity check.');const tables=new Set(snapshotDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name)),projectDocs=tables.has('project_documents')?' UNION ALL SELECT stored_name,size_bytes FROM project_documents':'',developmentDocs=tables.has('system_development_project_documents')?' UNION ALL SELECT stored_name,size_bytes FROM system_development_project_documents':'',intakeDocs=tables.has('reception_intake_documents')?' UNION ALL SELECT stored_name,size_bytes FROM reception_intake_documents':'';documents=snapshotDb.prepare(`SELECT stored_name,size_bytes FROM company_documents${projectDocs}${developmentDocs}${intakeDocs} ORDER BY stored_name`).all();}
 finally{snapshotDb.close();}
 if(documents.length!==manifest.documentCount)throw new Error('The backup document count does not match its manifest.');
 for(const doc of documents){if(!/^[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|txt|csv|docx|xlsx|pptx)$/i.test(doc.stored_name))throw new Error('The backup contains an invalid document path.');const stat=await fs.stat(path.join(root,'documents',doc.stored_name));if(stat.size!==doc.size_bytes)throw new Error(`A backup document is missing or incomplete: ${doc.stored_name}`);}
 return{root,manifest,snapshotPath,documents};
}
async function restoreBackupSnapshot(id){
 const source=await validateBackupSnapshot(id),preRestoreBackup=await createBackupSnapshot(),stagedDocs=path.join(DATA_DIR,`.restore-documents-${randomUUID()}`),previousDocs=path.join(DATA_DIR,`.previous-documents-${randomUUID()}`);let hadCurrentDocs=false,movedCurrentDocs=false,swappedDocs=false,attached=false,transaction=false,databaseCommitted=false;
 try{
  await fs.mkdir(stagedDocs,{recursive:true});
  for(const doc of source.documents)await fs.copyFile(path.join(source.root,'documents',doc.stored_name),path.join(stagedDocs,doc.stored_name));
  try{await fs.access(DOCUMENTS_DIR);hadCurrentDocs=true;}catch{}
  if(hadCurrentDocs){await fs.rename(DOCUMENTS_DIR,previousDocs);movedCurrentDocs=true;}
  await fs.rename(stagedDocs,DOCUMENTS_DIR);swappedDocs=true;
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare('ATTACH DATABASE ? AS restore_src').run(source.snapshotPath);attached=true;
  db.exec('BEGIN IMMEDIATE');transaction=true;
     db.exec(`DELETE FROM sessions; DELETE FROM notifications; DELETE FROM calendar_event_external_attendees; DELETE FROM calendar_event_attendees; DELETE FROM calendar_events; DELETE FROM system_development_project_members; DELETE FROM system_development_project_documents; DELETE FROM system_development_project_posts; DELETE FROM system_development_project_events; DELETE FROM system_development_events; DELETE FROM system_development_items; DELETE FROM system_development_projects; DELETE FROM system_development_members; DELETE FROM client_assignments; DELETE FROM clients; DELETE FROM project_request_events; DELETE FROM project_requests; DELETE FROM project_documents; DELETE FROM project_milestones; DELETE FROM project_events; DELETE FROM projects; DELETE FROM reception_intake_documents; DELETE FROM reception_intake_events; DELETE FROM reception_intakes; DELETE FROM company_reception_configs; DELETE FROM task_events; DELETE FROM tasks; DELETE FROM company_notes; DELETE FROM company_documents; DELETE FROM memberships; DELETE FROM activities; DELETE FROM users; DELETE FROM companies; DELETE FROM portal_migrations; DELETE FROM portal_settings;`);
  const sourceTables=new Set(db.prepare("SELECT name FROM restore_src.sqlite_master WHERE type='table'").all().map(row=>row.name)),sourceCompanyColumns=new Set(db.prepare('PRAGMA restore_src.table_info(companies)').all().map(row=>row.name)),sourceUserColumns=new Set(db.prepare('PRAGMA restore_src.table_info(users)').all().map(row=>row.name)),sourceCalendarColumns=sourceTables.has('calendar_events')?new Set(db.prepare('PRAGMA restore_src.table_info(calendar_events)').all().map(row=>row.name)):new Set(),sourceAttendeeColumns=sourceTables.has('calendar_event_attendees')?new Set(db.prepare('PRAGMA restore_src.table_info(calendar_event_attendees)').all().map(row=>row.name)):new Set(),sourceActivityColumns=new Set(db.prepare('PRAGMA restore_src.table_info(activities)').all().map(row=>row.name)),sourceMembershipColumns=sourceTables.has('memberships')?new Set(db.prepare('PRAGMA restore_src.table_info(memberships)').all().map(row=>row.name)):new Set(),profileConfirmedExpr=sourceCompanyColumns.has('profile_confirmed')?'profile_confirmed':'0',companySlugExpr=sourceCompanyColumns.has('slug')?'slug':'NULL',companyTimeZoneExpr=sourceCompanyColumns.has('time_zone')?'time_zone':"'America/New_York'",companyLogoExpr=sourceCompanyColumns.has('logo_data')?'logo_data':'NULL',userTimeZoneExpr=sourceUserColumns.has('time_zone')?'time_zone':'NULL',userJobTitleExpr=sourceUserColumns.has('job_title')?'job_title':"''",userPhoneExpr=sourceUserColumns.has('phone')?'phone':"''",userLocationExpr=sourceUserColumns.has('location')?'location':"''",userCalendarColorExpr=sourceUserColumns.has('calendar_color')?'calendar_color':'NULL',userDirectoryVisibleExpr=sourceUserColumns.has('directory_visible')?'directory_visible':'1',userShareEmailExpr=sourceUserColumns.has('share_email')?'share_email':'0',userSharePhoneExpr=sourceUserColumns.has('share_phone')?'share_phone':'0',userShareLocationExpr=sourceUserColumns.has('share_location')?'share_location':'0',eventTimeZoneExpr=sourceCalendarColumns.has('time_zone')?'time_zone':"'America/New_York'",eventStartDateExpr=sourceCalendarColumns.has('start_date')?'start_date':'CASE WHEN all_day=1 THEN substr(starts_at,1,10) ELSE NULL END',eventEndDateExpr=sourceCalendarColumns.has('end_date')?'end_date':'CASE WHEN all_day=1 THEN substr(ends_at,1,10) ELSE NULL END',eventLocationTypeExpr=sourceCalendarColumns.has('location_type')?'location_type':"'On-site'",eventMeetingTypeExpr=sourceCalendarColumns.has('meeting_type')?'meeting_type':"'Other'",eventTypeExpr=sourceCalendarColumns.has('event_type')?'event_type':"'event'",attendeeResponseExpr=sourceAttendeeColumns.has('response')?'response':"'awaiting'",attendeeRespondedAtExpr=sourceAttendeeColumns.has('responded_at')?'responded_at':'NULL',activityCompanyExpr=sourceActivityColumns.has('company_id')?'company_id':'NULL',membershipRoleExpr=sourceMembershipColumns.has('role')?'role':"CASE WHEN (SELECT role FROM restore_src.users WHERE id=memberships.user_id)='manager' THEN 'manager' ELSE 'member' END",membershipActiveExpr=sourceMembershipColumns.has('active')?'active':'1',membershipRestoreSql=sourceTables.has('memberships')?`INSERT INTO memberships(user_id,company_id,role,active) SELECT user_id,company_id,${membershipRoleExpr},${membershipActiveExpr} FROM restore_src.memberships;`:'',migrationRestoreSql=sourceTables.has('portal_migrations')?'INSERT INTO portal_migrations(id,applied_at) SELECT id,applied_at FROM restore_src.portal_migrations;':'';
   const eventClientIdExpr=sourceCalendarColumns.has('client_id')?'client_id':'NULL',eventSourceSystemExpr=sourceCalendarColumns.has('source_system')?'source_system':"'portal'",eventSourceIdExpr=sourceCalendarColumns.has('source_event_id')?'source_event_id':'NULL',eventStatusExpr=sourceCalendarColumns.has('status')?'status':"'scheduled'",eventCanceledAtExpr=sourceCalendarColumns.has('canceled_at')?'canceled_at':'NULL',eventCanceledByExpr=sourceCalendarColumns.has('canceled_by')?'canceled_by':'NULL',intakeSourceColumns=sourceTables.has('reception_intakes')?new Set(db.prepare('PRAGMA restore_src.table_info(reception_intakes)').all().map(row=>row.name)):new Set(),intakeOrganizationExpr=intakeSourceColumns.has('organization_name')?'organization_name':"''",intakeAccountingDetailsExpr=intakeSourceColumns.has('accounting_details_json')?'accounting_details_json':"'{}'",intakeWorkloadReviewExpr=intakeSourceColumns.has('workload_review_json')?'workload_review_json':"'{}'",intakeFollowUpCompletedAtExpr=intakeSourceColumns.has('follow_up_completed_at')?'follow_up_completed_at':'NULL',intakeFollowUpCompletedByExpr=intakeSourceColumns.has('follow_up_completed_by')?'follow_up_completed_by':'NULL',intakeClosureOutcomeExpr=intakeSourceColumns.has('closure_outcome')?'closure_outcome':"''",intakeClosureNoteExpr=intakeSourceColumns.has('closure_note')?'closure_note':"''",intakeClosedAtExpr=intakeSourceColumns.has('closed_at')?'closed_at':'NULL',intakeClosedByExpr=intakeSourceColumns.has('closed_by')?'closed_by':'NULL',intakeLinkedTaskExpr=intakeSourceColumns.has('linked_task_id')?'linked_task_id':'NULL',intakeEventSourceColumns=sourceTables.has('reception_intake_events')?new Set(db.prepare('PRAGMA restore_src.table_info(reception_intake_events)').all().map(row=>row.name)):new Set(),intakeEventTypeExpr=intakeEventSourceColumns.has('event_type')?'event_type':"'update'";
   const sourceDevelopmentColumns=sourceTables.has('system_development_items')?new Set(db.prepare('PRAGMA restore_src.table_info(system_development_items)').all().map(row=>row.name)):new Set(),sourceDevelopmentProjectColumns=sourceTables.has('system_development_projects')?new Set(db.prepare('PRAGMA restore_src.table_info(system_development_projects)').all().map(row=>row.name)):new Set(),developmentProjectCompanyExpr=sourceDevelopmentProjectColumns.has('company_id')?'company_id':'NULL',developmentPurposeExpr=sourceDevelopmentProjectColumns.has('purpose')?'purpose':"''",developmentCompanyExpr=sourceDevelopmentColumns.has('company_id')?'company_id':'NULL',developmentPhaseExpr=sourceDevelopmentColumns.has('phase')?'phase':"CASE WHEN status='Complete' THEN 'completed' ELSE 'work' END",developmentProjectExpr=sourceDevelopmentColumns.has('project_id')?'project_id':'NULL',developmentFocusExpr=sourceDevelopmentColumns.has('focus_item')?'focus_item':'0',developmentChecklistExpr=sourceDevelopmentColumns.has('checklist_json')?'checklist_json':"'[]'";
  db.exec(`INSERT INTO companies(id,name,legal_name,type,status,industry,location,employees,owner,description,parent_id,created_at,updated_at,profile_confirmed,slug,time_zone,logo_data) SELECT id,name,legal_name,type,status,industry,location,employees,owner,description,parent_id,created_at,updated_at,${profileConfirmedExpr},${companySlugExpr},${companyTimeZoneExpr},${companyLogoExpr} FROM restore_src.companies;
   INSERT INTO users(id,name,email,password_hash,role,must_change_password,active,created_at,time_zone,job_title,phone,location,directory_visible,share_email,share_phone,share_location,calendar_color) SELECT id,name,email,password_hash,role,must_change_password,active,created_at,${userTimeZoneExpr},${userJobTitleExpr},${userPhoneExpr},${userLocationExpr},${userDirectoryVisibleExpr},${userShareEmailExpr},${userSharePhoneExpr},${userShareLocationExpr},${userCalendarColorExpr} FROM restore_src.users;
   ${membershipRestoreSql}
   ${migrationRestoreSql}
   INSERT INTO activities(id,title,detail,time,kind,company_id) SELECT id,title,detail,time,kind,${activityCompanyExpr} FROM restore_src.activities;
   INSERT INTO company_documents(id,company_id,original_name,stored_name,mime_type,size_bytes,category,description,uploaded_by,created_at) SELECT id,company_id,original_name,stored_name,mime_type,size_bytes,category,description,uploaded_by,created_at FROM restore_src.company_documents;`);
  if(sourceTables.has('portal_settings'))db.exec('INSERT INTO portal_settings(key,value,updated_at,updated_by) SELECT key,value,updated_at,updated_by FROM restore_src.portal_settings');
  if(sourceTables.has('company_reception_configs'))db.exec('INSERT INTO company_reception_configs(company_id,config_json,updated_by,updated_at) SELECT company_id,config_json,updated_by,updated_at FROM restore_src.company_reception_configs');
  if(sourceTables.has('notifications'))db.exec('INSERT INTO notifications(id,user_id,title,message,kind,entity_type,entity_id,company_id,actor_id,actor_name,created_at,read_at) SELECT id,user_id,title,message,kind,entity_type,entity_id,company_id,actor_id,actor_name,created_at,read_at FROM restore_src.notifications');
   if(sourceTables.has('calendar_events'))db.exec(`INSERT INTO calendar_events(id,title,starts_at,ends_at,all_day,company_id,location,description,color,created_by,created_at,updated_at,time_zone,start_date,end_date,location_type,meeting_type,event_type,client_id,source_system,source_event_id,status,canceled_at,canceled_by) SELECT id,title,starts_at,ends_at,all_day,company_id,location,description,color,created_by,created_at,updated_at,${eventTimeZoneExpr},${eventStartDateExpr},${eventEndDateExpr},${eventLocationTypeExpr},${eventMeetingTypeExpr},${eventTypeExpr},${eventClientIdExpr},${eventSourceSystemExpr},${eventSourceIdExpr},${eventStatusExpr},${eventCanceledAtExpr},${eventCanceledByExpr} FROM restore_src.calendar_events;`);
  if(sourceTables.has('calendar_event_attendees'))db.exec(`INSERT INTO calendar_event_attendees(event_id,user_id,created_at,response,responded_at) SELECT event_id,user_id,created_at,${attendeeResponseExpr},${attendeeRespondedAtExpr} FROM restore_src.calendar_event_attendees;`);
  if(sourceTables.has('calendar_event_external_attendees'))db.exec(`INSERT INTO calendar_event_external_attendees(id,event_id,name,email,normalized_email,response,token_hash,email_status,email_error,email_sent_at,created_at,updated_at) SELECT id,event_id,name,email,normalized_email,response,token_hash,email_status,email_error,email_sent_at,created_at,updated_at FROM restore_src.calendar_event_external_attendees;`);
   if(sourceTables.has('clients'))db.exec(`INSERT INTO clients(id,company_id,name,contact_name,email,phone,location,notes,created_by,created_at,updated_at) SELECT id,company_id,name,contact_name,email,phone,location,notes,created_by,created_at,updated_at FROM restore_src.clients;`);
   if(sourceTables.has('client_assignments'))db.exec(`INSERT INTO client_assignments(client_id,user_id,assigned_by,assigned_at) SELECT client_id,user_id,assigned_by,assigned_at FROM restore_src.client_assignments;`);
  if(sourceTables.has('system_development_members'))db.exec(`INSERT INTO system_development_members(user_id,added_at) SELECT user_id,added_at FROM restore_src.system_development_members;`);
  const developmentArchivedAtExpr=sourceDevelopmentProjectColumns.has('archived_at')?'archived_at':'NULL',developmentArchivedByExpr=sourceDevelopmentProjectColumns.has('archived_by')?'archived_by':'NULL';
   if(sourceTables.has('system_development_projects'))db.exec(`INSERT INTO system_development_projects(id,company_id,title,purpose,meeting_date,notes,phase,created_by,created_at,updated_at,archived_at,archived_by) SELECT id,${developmentProjectCompanyExpr},title,${developmentPurposeExpr},meeting_date,notes,phase,created_by,created_at,updated_at,${developmentArchivedAtExpr},${developmentArchivedByExpr} FROM restore_src.system_development_projects;`);
   if(sourceTables.has('system_development_project_members'))db.exec(`INSERT INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT project_id,user_id,added_by,added_at FROM restore_src.system_development_project_members;`);
   else db.exec(`INSERT OR IGNORE INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT p.id,m.user_id,p.created_by,COALESCE(m.added_at,p.created_at) FROM system_development_projects p CROSS JOIN system_development_members m; INSERT OR IGNORE INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT id,created_by,created_by,created_at FROM system_development_projects;`);
   if(sourceTables.has('system_development_items'))db.exec(`INSERT INTO system_development_items(id,kind,title,details,checklist_json,status,owner_user_id,target_date,company_id,project_id,focus_item,phase,created_by,created_at,updated_at) SELECT id,kind,title,details,${developmentChecklistExpr},status,owner_user_id,target_date,${developmentCompanyExpr},${developmentProjectExpr},${developmentFocusExpr},${developmentPhaseExpr},created_by,created_at,updated_at FROM restore_src.system_development_items;`);
  db.exec(`UPDATE system_development_projects SET company_id=(SELECT MIN(company_id) FROM system_development_items WHERE project_id=system_development_projects.id GROUP BY project_id HAVING COUNT(DISTINCT company_id)=1 AND COUNT(company_id)=COUNT(*)) WHERE company_id IS NULL`);
  db.exec(`UPDATE system_development_items SET company_id=(SELECT company_id FROM system_development_projects WHERE id=system_development_items.project_id) WHERE project_id IN (SELECT id FROM system_development_projects WHERE company_id IS NOT NULL)`);
  if(sourceTables.has('system_development_events'))db.exec(`INSERT INTO system_development_events(id,item_id,actor_user_id,detail,created_at) SELECT id,item_id,actor_user_id,detail,created_at FROM restore_src.system_development_events;`);
   if(sourceTables.has('system_development_project_events'))db.exec(`INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) SELECT id,project_id,actor_user_id,detail,created_at FROM restore_src.system_development_project_events;`);
   if(sourceTables.has('system_development_project_posts'))db.exec(`INSERT INTO system_development_project_posts(id,project_id,parent_id,author_user_id,body,created_at) SELECT id,project_id,parent_id,author_user_id,body,created_at FROM restore_src.system_development_project_posts;`);
   if(sourceTables.has('system_development_project_documents'))db.exec(`INSERT INTO system_development_project_documents(id,project_id,original_name,stored_name,mime_type,size_bytes,description,uploaded_by,created_at) SELECT id,project_id,original_name,stored_name,mime_type,size_bytes,description,uploaded_by,created_at FROM restore_src.system_development_project_documents;`);
  if(sourceTables.has('tasks'))db.exec(`INSERT INTO tasks(id,company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at) SELECT id,company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at FROM restore_src.tasks;`);
  if(sourceTables.has('company_notes'))db.exec(`INSERT INTO company_notes(id,company_id,title,body,category,created_by,updated_by,created_at,updated_at) SELECT id,company_id,title,body,category,created_by,updated_by,created_at,updated_at FROM restore_src.company_notes;`);
  if(sourceTables.has('reception_intakes'))db.exec(`INSERT INTO reception_intakes(id,company_id,contact_name,organization_name,email,phone,source,request_type,summary,status,accounting_details_json,workload_review_json,assignee_user_id,next_action,next_action_date,follow_up_completed_at,follow_up_completed_by,closure_outcome,closure_note,closed_at,closed_by,linked_task_id,created_by,created_at,updated_at) SELECT id,company_id,contact_name,${intakeOrganizationExpr},email,phone,source,request_type,summary,status,${intakeAccountingDetailsExpr},${intakeWorkloadReviewExpr},assignee_user_id,next_action,next_action_date,${intakeFollowUpCompletedAtExpr},${intakeFollowUpCompletedByExpr},${intakeClosureOutcomeExpr},${intakeClosureNoteExpr},${intakeClosedAtExpr},${intakeClosedByExpr},${intakeLinkedTaskExpr},created_by,created_at,updated_at FROM restore_src.reception_intakes;`);
   if(sourceTables.has('reception_intake_documents'))db.exec('INSERT INTO reception_intake_documents(id,intake_id,original_name,stored_name,mime_type,size_bytes,uploaded_by,created_at) SELECT id,intake_id,original_name,stored_name,mime_type,size_bytes,uploaded_by,created_at FROM restore_src.reception_intake_documents');
  if(sourceTables.has('task_events'))db.exec(`INSERT INTO task_events(id,task_id,actor_user_id,event_type,detail,created_at) SELECT id,task_id,actor_user_id,event_type,detail,created_at FROM restore_src.task_events;`);
  if(sourceTables.has('reception_intake_events'))db.exec(`INSERT INTO reception_intake_events(id,intake_id,actor_user_id,event_type,detail,created_at) SELECT id,intake_id,actor_user_id,${intakeEventTypeExpr},detail,created_at FROM restore_src.reception_intake_events;`);
  if(sourceTables.has('projects')){const projectSourceColumns=new Set(db.prepare('PRAGMA restore_src.table_info(projects)').all().map(row=>row.name)),managerExpr=projectSourceColumns.has('project_manager_user_id')?'project_manager_user_id':'NULL',stageExpr=projectSourceColumns.has('stage')?'stage':"'Lead'";db.exec(`INSERT INTO projects(id,company_id,project_number,name,client_name,site_location,status,start_date,target_date,estimated_value_cents,description,project_manager_user_id,stage,created_by,created_at,updated_at) SELECT id,company_id,project_number,name,client_name,site_location,status,start_date,target_date,estimated_value_cents,description,${managerExpr},${stageExpr},created_by,created_at,updated_at FROM restore_src.projects;`);}
  if(sourceTables.has('project_milestones'))db.exec(`INSERT INTO project_milestones(id,project_id,title,details,status,due_date,assignee_user_id,created_by,created_at,updated_at) SELECT id,project_id,title,details,status,due_date,assignee_user_id,created_by,created_at,updated_at FROM restore_src.project_milestones;`);
  if(sourceTables.has('project_documents'))db.exec(`INSERT INTO project_documents(id,project_id,original_name,stored_name,mime_type,size_bytes,category,description,uploaded_by,created_at) SELECT id,project_id,original_name,stored_name,mime_type,size_bytes,category,description,uploaded_by,created_at FROM restore_src.project_documents;`);
  if(sourceTables.has('project_events'))db.exec(`INSERT INTO project_events(id,project_id,actor_user_id,event_type,detail,created_at) SELECT id,project_id,actor_user_id,event_type,detail,created_at FROM restore_src.project_events;`);
  if(sourceTables.has('project_requests'))db.exec(`INSERT INTO project_requests(id,project_id,target_company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at) SELECT id,project_id,target_company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at FROM restore_src.project_requests;`);
  if(sourceTables.has('project_request_events'))db.exec(`INSERT INTO project_request_events(id,request_id,actor_user_id,detail,created_at) SELECT id,request_id,actor_user_id,detail,created_at FROM restore_src.project_request_events;`);
  if(db.prepare('PRAGMA main.foreign_key_check').all().length)throw new Error('The backup contains broken company or user relationships.');
   db.exec('COMMIT');transaction=false;databaseCommitted=true;db.exec('DETACH DATABASE restore_src');attached=false;db.exec('PRAGMA foreign_keys=ON');migrateLegacySeedRows();migrateElevatePortal();ensureAddedStarterCompanies();ensureCompanySlugs();migrateLegacyMembershipRoles();migrateLegacyMembershipScopes();normalizeLegacyManagerRoles();ensureUserCalendarColors();migrateProjectClientNames();migrateSystemDevelopmentProjects();db.exec(`INSERT OR IGNORE INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT p.id,m.user_id,p.created_by,COALESCE(m.added_at,p.created_at) FROM system_development_projects p CROSS JOIN system_development_members m WHERE NOT EXISTS(SELECT 1 FROM system_development_project_members pm WHERE pm.project_id=p.id); INSERT OR IGNORE INTO system_development_project_members(project_id,user_id,added_by,added_at) SELECT p.id,p.created_by,p.created_by,p.created_at FROM system_development_projects p WHERE NOT EXISTS(SELECT 1 FROM system_development_project_members pm WHERE pm.project_id=p.id AND pm.user_id=p.created_by);`);
   db.prepare('INSERT OR IGNORE INTO portal_migrations(id,applied_at) VALUES(?,?)').run('system-development-project-members-v1',new Date().toISOString());
  if(hadCurrentDocs)await fs.rm(previousDocs,{recursive:true,force:true}).catch(()=>{});
  return{restored:id,preRestoreBackup:preRestoreBackup.id,documentCount:source.documents.length};
 }catch(error){
  if(transaction)try{db.exec('ROLLBACK');}catch{}
  if(attached)try{db.exec('DETACH DATABASE restore_src');}catch{}
  try{db.exec('PRAGMA foreign_keys=ON');}catch{}
  if(!databaseCommitted){if(swappedDocs)await fs.rm(DOCUMENTS_DIR,{recursive:true,force:true});if(movedCurrentDocs)await fs.rename(previousDocs,DOCUMENTS_DIR).catch(()=>{});}
  await fs.rm(stagedDocs,{recursive:true,force:true}).catch(()=>{});throw error;
 }
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const APP_CONTENT_SECURITY_POLICY="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:";
const staticAssetCache=new Map();
const STATIC_COMPRESSION_MIN_BYTES=1024;
function encodingQuality(header,name){
 const entries=String(header||'').split(',').map(part=>part.trim().split(';')),qualities=new Map();
 for(const [rawName,...parameters] of entries){if(!rawName)continue;const qualityParameter=parameters.map(parameter=>parameter.trim()).find(parameter=>parameter.startsWith('q=')),quality=qualityParameter?Number(qualityParameter.slice(2)):1;qualities.set(rawName.toLowerCase(),Number.isFinite(quality)?Math.max(0,Math.min(1,quality)):0);}
 return qualities.has(name)?qualities.get(name):qualities.get('*')||0;
}
function etagMatches(header,etag){
 const normalized=etag.replace(/^W\//,'');
 return String(header||'').split(',').some(candidate=>candidate.trim()==='*'||candidate.trim().replace(/^W\//,'')===normalized);
}
async function compressStatic(buffer,encoding){
 return new Promise((resolve,reject)=>{
  const compress=encoding==='br'?zlib.brotliCompress:zlib.gzip;
  compress(buffer,(error,result)=>error?reject(error):resolve(result));
 });
}
async function loadStaticAsset(file){
 const stat=await fs.stat(file),cached=staticAssetCache.get(file);
 if(cached&&cached.size===stat.size&&cached.mtimeMs===stat.mtimeMs){staticAssetCache.delete(file);staticAssetCache.set(file,cached);return cached;}
 const content=await fs.readFile(file),entry={content,size:stat.size,mtimeMs:stat.mtimeMs,lastModified:stat.mtime.toUTCString(),representations:new Map()};
 entry.representations.set('identity',{body:content,etag:`"${createHash('sha256').update(content).digest('base64url')}"`});
 if(staticAssetCache.size>=64)staticAssetCache.delete(staticAssetCache.keys().next().value);
 staticAssetCache.set(file,entry);return entry;
}
async function sendStaticAsset(req,res,file,url){
 const asset=await loadStaticAsset(file),type=mime[path.extname(file)]||'application/octet-stream',compressible=type.startsWith('text/')||type==='image/svg+xml'||type.includes('javascript');
 let encoding=null;
 if(compressible&&asset.content.length>=STATIC_COMPRESSION_MIN_BYTES){
  const brQuality=encodingQuality(req.headers['accept-encoding'],'br'),gzipQuality=encodingQuality(req.headers['accept-encoding'],'gzip');
  if(brQuality>0&&brQuality>=gzipQuality)encoding='br';else if(gzipQuality>0)encoding='gzip';
 }
 if(encoding&&!asset.representations.has(encoding))asset.representations.set(encoding,{body:await compressStatic(asset.content,encoding)});
 const representation=asset.representations.get(encoding||'identity');
 if(!representation.etag)representation.etag=`"${createHash('sha256').update(representation.body).digest('base64url')}"`;
 const isHtml=path.extname(file)==='.html',versioned=url.searchParams.has('v')&&Boolean(url.searchParams.get('v'));
 const headers={'Content-Type':type,'Cache-Control':isHtml?'no-store':versioned?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate','ETag':representation.etag,'Last-Modified':asset.lastModified,'Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Opener-Policy':'same-origin'};
  if(isHtml)headers['Content-Security-Policy']=APP_CONTENT_SECURITY_POLICY;
 if(encoding)headers['Content-Encoding']=encoding;
 const noneMatch=req.headers['if-none-match'],modifiedSince=req.headers['if-modified-since'],notModified=noneMatch?etagMatches(noneMatch,representation.etag):modifiedSince&&Number.isFinite(Date.parse(modifiedSince))&&Math.floor(asset.mtimeMs/1000)<=Math.floor(Date.parse(modifiedSince)/1000);
 if(notModified){res.writeHead(304,headers);return res.end();}
 headers['Content-Length']=String(representation.body.length);res.writeHead(200,headers);return req.method==='HEAD'?res.end():res.end(representation.body);
}
const server=http.createServer(async(req,res)=>{
 let countedMutation=false;
 try {
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  renewSession(req,res,url.pathname);
  if(url.pathname.startsWith('/api/')) {
   if(maintenanceMode&&url.pathname!=='/api/health')return send(res,503,{error:'The portal is restoring a backup. Try again in a moment.'});
   if(['POST','PATCH','DELETE'].includes(req.method)&&!/^\/api\/backups\/[^/]+\/restore$/.test(url.pathname)){inFlightApiMutations++;countedMutation=true;}
   if(req.method==='GET'&&url.pathname==='/api/health') return send(res,200,{status:'ok',service:'aspect-portal-api',database:'sqlite',pilotMode:PILOT_MODE,buildId:BUILD_ID});
   if(req.method==='GET'&&url.pathname==='/api/auth/status') {const setupRequired=db.prepare('SELECT COUNT(*) AS n FROM users').get().n===0,setupTokenRequired=PRODUCTION_MODE||!!SETUP_TOKEN;return send(res,200,{setupRequired,setupTokenRequired,setupAvailable:!PRODUCTION_MODE||!!SETUP_TOKEN,user:sessionUser(req),sessionExpired:hasExpiredSession(req),pilotMode:PILOT_MODE,productionMode:PRODUCTION_MODE});}
  if(['POST','PATCH','DELETE'].includes(req.method)&&!(req.method==='POST'&&url.pathname===SIGNATURE_DESIGN_INTEGRATION_PATH)){
    const origin=req.headers.origin;
    if(origin&&new URL(origin).host!==req.headers.host)return send(res,403,{error:'Request origin was not accepted.'});
    if(process.env.NODE_ENV==='production'&&!origin)return send(res,403,{error:'Request origin is required for this operation.'});
   }
   if(req.method==='POST'&&url.pathname===SIGNATURE_DESIGN_INTEGRATION_PATH)return await createSignatureDesignIntegrationIntake(req,res);
   if(req.method==='POST'&&url.pathname==='/api/auth/setup') {
    if(db.prepare('SELECT COUNT(*) AS n FROM users').get().n!==0) return send(res,409,{error:'Initial setup has already been completed.'});
    const input=await bodyJson(req);
    if(PRODUCTION_MODE&&!SETUP_TOKEN)return send(res,503,{error:'Administrator setup is locked until the server operator configures ASPECT_SETUP_TOKEN.'});
    if(PRODUCTION_MODE||SETUP_TOKEN){const provided=Buffer.from(String(input.setupToken||'')),expected=Buffer.from(SETUP_TOKEN);if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return send(res,403,{error:'The administrator setup code is incorrect.'});}
    const name=String(input.name||'').trim(),email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
    if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<12) return send(res,400,{error:'Enter your name, a valid email address, and a password of at least 12 characters.'});
     const root=db.prepare("SELECT id FROM companies WHERE parent_id IS NULL AND status<>'Inactive' ORDER BY created_at LIMIT 1").get();
    if(!root)return send(res,503,{error:'Initial setup is unavailable because the company workspace has not been initialized.'});
     const passwordHash=await hashPassword(password),userId=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
    try {
     if(db.prepare('SELECT COUNT(*) AS n FROM users').get().n!==0){db.exec('ROLLBACK');return send(res,409,{error:'Initial setup has already been completed.'});}
      db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(userId,name,email,passwordHash,'admin',now);
     db.prepare('INSERT INTO memberships(user_id,company_id,role) VALUES(?,?,?)').run(userId,root.id,'member');
     seedPilotSampleData(userId);
     db.exec('COMMIT');
    }
    catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'Initial setup has already been completed.'});throw error;}
     ensureUserCalendarColors();const setCookie=makeSession(userId);const user=sessionUser({headers:{cookie:setCookie.split(';')[0]}});
    return send(res,201,{user},'application/json; charset=utf-8',{'Set-Cookie':setCookie});
   }
   if(req.method==='POST'&&url.pathname==='/api/auth/login') {
     const input=await bodyJson(req,16*1024),email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
    if(email.length>254||password.length>1024)return send(res,401,{error:'Email or password is incorrect.'});
    const retryAfter=loginRetryAfter(req,email);
    if(retryAfter)return send(res,429,{error:'Too many unsuccessful sign-in attempts. Try again after the displayed wait.'},'application/json; charset=utf-8',{'Retry-After':String(retryAfter)});
    const account=db.prepare('SELECT id,password_hash,active,role FROM users WHERE email=?').get(email);
      const passwordMatches=await verifyPassword(password,account?.password_hash||DUMMY_PASSWORD_HASH);
      if(!account||!account.active||!passwordMatches){
     const lockSeconds=recordLoginFailure(req,email);
     return lockSeconds?send(res,429,{error:'Too many unsuccessful sign-in attempts. Try again after the displayed wait.'},'application/json; charset=utf-8',{'Retry-After':String(lockSeconds)}):send(res,401,{error:'Email or password is incorrect.'});
    }
    clearLoginFailures(req,email);
     const setCookie=makeSession(account.id); const user=sessionUser({headers:{cookie:setCookie.split(';')[0]}});
    return send(res,200,{user},'application/json; charset=utf-8',{'Set-Cookie':setCookie});
   }
   if(req.method==='POST'&&url.pathname==='/api/auth/logout') {const token=cookie(req,SESSION_COOKIE);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenDigest(token));return send(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`});}
   if(req.method==='POST'&&url.pathname==='/api/auth/select-company'){
     const user=requireUser(req,res);if(!user)return;const input=await bodyJson(req,4096),company=db.prepare("SELECT id,status FROM companies WHERE slug=? AND status<>'Inactive'").get(String(input.companySlug||''));
    if(!company)return send(res,404,{error:'That company portal is unavailable.'});
     if(user.role!=='admin'&&(company.status!=='Active'||!user.memberships.some(item=>item.id===company.id&&item.active)))return send(res,404,{error:'That company portal is unavailable.'});
    const token=cookie(req,SESSION_COOKIE);db.prepare('UPDATE sessions SET company_id=? WHERE token_hash=?').run(company.id,tokenDigest(token));return send(res,200,{user:sessionUser(req)});
   }
   if(req.method==='GET'&&url.pathname==='/api/auth/me'){const user=requireUser(req,res);if(!user)return;return send(res,200,{user});}
   if(req.method==='PATCH'&&url.pathname==='/api/auth/preferences'){const user=requireUser(req,res);if(!user)return;if(user.mustChangePassword)return send(res,403,{error:'Change your temporary password before updating preferences.'});const input=await bodyJson(req,4096),timeZone=validTimeZone(input.timeZone);if(!timeZone)return send(res,400,{error:'Choose a valid IANA time zone.'});db.prepare('UPDATE users SET time_zone=? WHERE id=?').run(timeZone,user.id);return send(res,200,{user:sessionUser(req)});}
    if(req.method==='PATCH'&&url.pathname==='/api/auth/profile'){
     const user=requireUser(req,res);if(!user)return;if(user.mustChangePassword)return send(res,403,{error:'Change your temporary password before updating your profile.'});
     const input=await bodyJson(req,8192),name=String(input.name??user.name).trim(),jobTitle=String(input.jobTitle??user.jobTitle).trim(),phone=String(input.phone??user.phone).trim(),location=String(input.location??user.location).trim(),timeZone=validTimeZone(input.timeZone??user.timeZone??'America/New_York'),calendarColor=input.calendarColor===undefined?user.calendarColor:String(input.calendarColor);
     const boolValue=(key,current)=>input[key]===undefined?(current?1:0):input[key]===true||input[key]==='true'?1:input[key]===false||input[key]==='false'?0:null;
     const directoryVisible=boolValue('directoryVisible',user.directoryVisible),shareEmail=boolValue('shareEmail',user.shareEmail),sharePhone=boolValue('sharePhone',user.sharePhone),shareLocation=boolValue('shareLocation',user.shareLocation);
     if(name.length<2||name.length>120||jobTitle.length>120||phone.length>40||location.length>120||!timeZone||!CALENDAR_USER_COLORS.includes(calendarColor)||[directoryVisible,shareEmail,sharePhone,shareLocation].some(value=>value===null))return send(res,400,{error:'Check the profile fields and privacy preferences, then try again.'});
     const calendarColorChanged=calendarColor!==user.calendarColor;db.exec('BEGIN IMMEDIATE');
     try{
      if(calendarColorChanged){const conflict=db.prepare(`SELECT 1 FROM users u WHERE u.id<>? AND u.active=1 AND u.calendar_color=? AND (?='admin' OR u.role='admin' OR EXISTS(SELECT 1 FROM memberships mine JOIN memberships theirs ON theirs.company_id=mine.company_id WHERE mine.user_id=? AND theirs.user_id=u.id AND mine.active=1 AND theirs.active=1)) LIMIT 1`).get(user.id,calendarColor,user.role,user.id);if(conflict){db.exec('ROLLBACK');return send(res,409,{error:'That color is already in use by someone who shares a company calendar with you. Choose another color.'});}}
      db.prepare('UPDATE users SET name=?,job_title=?,phone=?,location=?,time_zone=?,calendar_color=?,directory_visible=?,share_email=?,share_phone=?,share_location=? WHERE id=?').run(name,jobTitle,phone,location,timeZone,calendarColor,directoryVisible,shareEmail,sharePhone,shareLocation,user.id);db.exec('COMMIT');
     }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     if(calendarColorChanged){const companyIds=user.role==='admin'?db.prepare("SELECT id FROM companies WHERE status<>'Inactive'").all().map(row=>row.id):user.memberships.filter(item=>item.active&&item.status==='Active').map(item=>item.id);broadcastCompaniesUpdate(companyIds,['calendar'],requestClientId(req),user.id);}
     return send(res,200,{user:sessionUser(req)});
    }
   if(req.method==='GET'&&url.pathname==='/api/auth/sessions'){
    const user=requireUser(req,res);if(!user)return;if(user.mustChangePassword)return send(res,403,{error:'Change your temporary password before reviewing sessions.'});
    const currentHash=tokenDigest(cookie(req,SESSION_COOKIE)),now=new Date().toISOString(),rows=db.prepare('SELECT s.token_hash,s.created_at,s.expires_at,c.name AS company_name FROM sessions s LEFT JOIN companies c ON c.id=s.company_id WHERE s.user_id=? AND s.expires_at>? ORDER BY s.created_at DESC').all(user.id,now);
    return send(res,200,rows.map(row=>({isCurrent:row.token_hash===currentHash,createdAt:row.created_at,expiresAt:row.expires_at,companyName:row.company_name||'Organization workspace'})));
   }
   if(req.method==='POST'&&url.pathname==='/api/auth/sessions/revoke-others'){
    const user=requireUser(req,res);if(!user)return;if(user.mustChangePassword)return send(res,403,{error:'Change your temporary password before managing sessions.'});
    const currentHash=tokenDigest(cookie(req,SESSION_COOKIE)),result=db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id,currentHash);
    return send(res,200,{revoked:result.changes});
   }
    if(req.method==='POST'&&url.pathname==='/api/auth/password') {const user=requireUser(req,res);if(!user)return;const input=await bodyJson(req),newPassword=String(input.newPassword||''),current=String(input.currentPassword||'');const record=db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);if(!await verifyPassword(current,record.password_hash))return send(res,400,{error:'Current password is incorrect.'});if(newPassword.length<12)return send(res,400,{error:'Use a password with at least 12 characters.'});const passwordHash=await hashPassword(newPassword);db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(passwordHash,user.id);return send(res,200,{ok:true});}
   if(req.method==='GET'&&url.pathname==='/api/calendar/external-rsvp'){
      const token=String(url.searchParams.get('token')||'');if(token.length<32||token.length>128)return send(res,404,{error:'This invitation link is invalid or expired.'});const guest=db.prepare('SELECT g.name,g.response,e.status,e.title,e.starts_at,e.ends_at,e.all_day,e.start_date,e.time_zone,e.location,e.location_type,e.meeting_type,c.name AS company_name FROM calendar_event_external_attendees g JOIN calendar_events e ON e.id=g.event_id LEFT JOIN companies c ON c.id=e.company_id WHERE g.token_hash=?').get(createHash('sha256').update(token).digest('hex'));if(!guest)return send(res,404,{error:'This invitation link is invalid or expired.'});return send(res,200,{guestName:guest.name,response:guest.response,event:{title:guest.title,status:guest.status||'scheduled',startsAt:guest.starts_at,endsAt:guest.ends_at,allDay:!!guest.all_day,startDate:guest.start_date,timeZone:guest.time_zone||'America/New_York',location:guest.location,locationType:guest.location_type,meetingType:guest.meeting_type,companyName:guest.company_name||'Company'}});
   }
   if(req.method==='POST'&&url.pathname==='/api/calendar/external-rsvp'){
     const input=await bodyJson(req,4096),token=String(input.token||''),response=String(input.response||'');
     if(token.length<32||token.length>128||!['accepted','maybe','declined'].includes(response))return send(res,400,{error:'Choose accept, maybe, or decline using a valid invitation link.'});
     const tokenHash=createHash('sha256').update(token).digest('hex'),guest=db.prepare('SELECT g.name AS guest_name,g.response AS current_response,e.id AS event_id,e.status,e.company_id,e.created_by,e.title FROM calendar_event_external_attendees g JOIN calendar_events e ON e.id=g.event_id WHERE g.token_hash=?').get(tokenHash);
     if(!guest)return send(res,404,{error:'This invitation link is invalid or expired.'});
     if(guest.status==='canceled')return send(res,409,{error:'This event was canceled. Responses are closed.'});
     const changed=guest.current_response!==response,now=new Date().toISOString(),result=db.prepare('UPDATE calendar_event_external_attendees SET response=?,responded_at=?,updated_at=? WHERE token_hash=?').run(response,now,now,tokenHash);
     if(!result.changes)return send(res,404,{error:'This invitation link is invalid or expired.'});
     if(changed){const action=response==='accepted'?'accepted':response==='maybe'?'might attend':'declined';addNotification({recipientIds:[guest.created_by],title:'Calendar invitation response',message:`${guest.guest_name||'An external invitee'} ${action} “${guest.title}”.`,kind:'calendar',entityType:'calendar',entityId:guest.event_id,companyId:guest.company_id});}
     broadcastCompanyUpdate(guest.company_id,changed?['calendar','notifications']:['calendar']);
     return send(res,200,{response});
   }
   const user=requireUser(req,res);if(!user)return;
   if(user.mustChangePassword&&!(req.method==='POST'&&url.pathname==='/api/auth/password'))return send(res,403,{error:'Change your temporary password before continuing.'});
   const signatureDesignWritebackMatch=url.pathname.match(/^\/api\/reception-intakes\/([^/]+)\/signature-design-details$/);
   if(signatureDesignWritebackMatch&&req.method==='PATCH')return await writeSignatureDesignDetails(req,res,user,decodeURIComponent(signatureDesignWritebackMatch[1]));
   if(req.method==='GET'&&url.pathname==='/api/updates')return startLiveUpdateStream(req,res,user,url);
   if(url.pathname==='/api/notifications'&&req.method==='GET'){
    const companyIds=user.role==='admin'?db.prepare("SELECT id FROM companies WHERE status<>'Inactive'").all().map(row=>row.id):user.memberships.filter(item=>item.active&&item.status==='Active').map(item=>item.id);
    const scopes=[],args=[user.id];if(companyIds.length){scopes.push(`company_id IN (${companyIds.map(()=>'?').join(',')})`);args.push(...companyIds);}if(hasSystemDevelopmentAccess(user)){
     const projectAccess=user.role==='admin'?'1=1':'(p.created_by=? OR EXISTS(SELECT 1 FROM system_development_project_members pm WHERE pm.project_id=p.id AND pm.user_id=?))',projectAccessArgs=user.role==='admin'?[]:[user.id,user.id];
     scopes.push(`entity_type='systemDevelopment' AND company_id IS NULL AND (EXISTS(SELECT 1 FROM system_development_projects p WHERE p.id=entity_id AND ${projectAccess}) OR EXISTS(SELECT 1 FROM system_development_items i JOIN system_development_projects p ON p.id=i.project_id WHERE i.id=entity_id AND ${projectAccess}))`);args.push(...projectAccessArgs,...projectAccessArgs);
    }
    if(!scopes.length)return send(res,200,{notifications:[],unreadCount:0});
    const where=`user_id=? AND entity_type NOT IN ('project','request') AND (${scopes.join(' OR ')})`;
    const unreadCount=db.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE ${where} AND read_at IS NULL`).get(...args).count;
    const rows=db.prepare(`SELECT n.*,COALESCE(NULLIF(n.actor_name,''),a.name,'') AS actor_display FROM notifications n LEFT JOIN users a ON a.id=n.actor_id WHERE ${where} ORDER BY n.created_at DESC LIMIT 40`).all(...args);
    const hrefFor=type=>({task:'#tasks',calendar:'#calendar',intake:'#reception',systemDevelopment:'#system-development'})[type]||'#overview';
    return send(res,200,{unreadCount,notifications:rows.map(row=>({id:row.id,title:row.entity_type==='systemDevelopment'?row.title.replaceAll('Collaboration space','Collaboration project'):row.title,message:row.entity_type==='systemDevelopment'?row.message.replaceAll('Moved to Needs review','Moved to Waiting for input').replaceAll('Moved to Resolved','Moved to Complete').replaceAll('Marked resolved.','Marked complete.').replaceAll('Marked as a priority item.','Marked as a team priority.').replaceAll('Marked as a priority','Marked as a team priority').replaceAll('Priority marker removed','Team priority removed'):row.message,kind:row.kind,entityType:row.entity_type,entityId:row.entity_id,companyId:row.company_id,actorName:row.actor_display,createdAt:row.created_at,readAt:row.read_at,href:hrefFor(row.entity_type)}))});
   }
   if(url.pathname==='/api/notifications/read-all'&&req.method==='PATCH'){const now=new Date().toISOString();db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now,user.id);return send(res,200,{ok:true});}
   const notificationMatch=url.pathname.match(/^\/api\/notifications\/([^/]+)$/);
   if(notificationMatch&&req.method==='PATCH'){
    const id=decodeURIComponent(notificationMatch[1]),notification=db.prepare('SELECT * FROM notifications WHERE id=? AND user_id=?').get(id,user.id);if(!notification)return send(res,404,{error:'Notification not found.'});
    const accessible=notification.company_id?notificationCompanyAccess(user.id,notification.company_id):notification.entity_type==='systemDevelopment'&&canAccessSystemDevelopmentNotification(user,notification.entity_id);if(!accessible)return send(res,404,{error:'Notification not found.'});
    const input=await bodyJson(req,2048);if(typeof input.read!=='boolean')return send(res,400,{error:'Choose whether this notification is read.'});db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(input.read?new Date().toISOString():null,id,user.id);return send(res,200,{ok:true,read:input.read});
   }
   if(url.pathname==='/api/settings'&&req.method==='GET')return send(res,200,portalSettingsPayload());
   if(url.pathname==='/api/settings'&&req.method==='PATCH'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required.'});
    const activeCompany=user.activeCompanyId?db.prepare('SELECT parent_id FROM companies WHERE id=?').get(user.activeCompanyId):null;if(activeCompany?.parent_id)return send(res,403,{error:'Portal settings can only be changed from the Aspect Companies organization portal.'});
    const input=await bodyJson(req,4096),key=String(input.key||'');let value=input.value,activityDetail='';
    if(Object.hasOwn(APP_SETTING_DEFAULTS,key)&&typeof value==='boolean')activityDetail=`${key} ${value?'enabled':'disabled'} by ${user.name}`;
    else if(key==='calendarSenderEmail'&&typeof value==='string'){
     value=value.trim();if(value.length>254||value&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value))return send(res,400,{error:'Enter a valid sender email address under 254 characters, or leave it blank to use the server default.'});
     activityDetail=`Calendar invite sender ${value?'updated':'reset to server default'} by ${user.name}`;
    }else if(key==='calendarReminderMinutes'){
     value=Number(value);if(![5,10,15,30,60,120,1440].includes(value))return send(res,400,{error:'Choose a supported reminder time.'});
     activityDetail=`Calendar reminder time updated to ${calendarReminderLabel(value)} by ${user.name}`;
    }else if(key==='calendarSlackChannel'&&typeof value==='string'){
     value=value.trim().replace(/^#/,'').trim();if(value.length>80)return send(res,400,{error:'Keep the Slack channel name under 80 characters.'});
     activityDetail=`Slack calendar channel label ${value?'updated':'cleared'} by ${user.name}`;
    }else if(key==='calendarSlackWebhookUrl'&&typeof value==='string'){
     value=value.trim();if(value&&!/^https:\/\/hooks\.slack(?:-gov)?\.com\/services\/[A-Za-z0-9/_-]+$/.test(value))return send(res,400,{error:'Paste a valid Slack Incoming Webhook address.'});
     activityDetail=`Slack calendar connection ${value?'updated':'removed'} by ${user.name}`;
     if(!value)db.prepare("INSERT INTO portal_settings(key,value,updated_at) VALUES('calendarSlackReminders','false',?) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=excluded.updated_at").run(new Date().toISOString());
    }else return send(res,400,{error:'Choose a supported portal setting and value.'});
    db.prepare('INSERT INTO portal_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(key,JSON.stringify(value),new Date().toISOString(),user.id);
    addActivity('Portal setting updated',activityDetail,'update');return send(res,200,portalSettingsPayload());
   }
   if(url.pathname==='/api/settings/calendar-email-test'&&req.method==='POST'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required.'});
    const activeCompany=user.activeCompanyId?db.prepare('SELECT parent_id FROM companies WHERE id=?').get(user.activeCompanyId):null;if(activeCompany?.parent_id)return send(res,403,{error:'Portal settings can only be changed from the Aspect Companies organization portal.'});
    const account=db.prepare('SELECT name,email FROM users WHERE id=? AND active=1').get(user.id);if(!account?.email||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(account.email))return send(res,400,{error:'Add a valid email address to your profile before sending a test.'});
    const settings=calendarSmtpSettings();if(!settings.configured)return send(res,400,{error:'Calendar email is not configured. Check SMTP settings and the public portal URL.'});
    try{
     const nodemailer=require('nodemailer'),transporter=nodemailer.createTransport({host:settings.host,port:settings.port,secure:settings.secure,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:5000,auth:settings.user?{user:settings.user,pass:settings.pass}:undefined}),sentAt=new Date().toLocaleString('en-US',{dateStyle:'full',timeStyle:'short',timeZone:user.timeZone||'America/New_York'}),greeting=escapeCalendarEmailHtml(`Hello ${account.name||''},`),sender=escapeCalendarEmailHtml(settings.senderEmail||''),body=`Hello ${account.name||''},\n\nThis is a test email from your Aspect Companies calendar notification settings.\n\nSent: ${sentAt}\nSender: ${settings.senderEmail||'Calendar sender'}\n\nIf you received this message, calendar email delivery is working.`,html=`<!doctype html><html lang="en"><body style="margin:0;padding:28px 12px;background:#f6f3e9;font-family:Arial,sans-serif;color:#39382f;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#fffefa;border:1px solid #e8e1d2;border-radius:15px;"><tr><td height="5" bgcolor="#d9b64a"></td></tr><tr><td style="padding:26px;"><div style="font-size:10px;font-weight:bold;letter-spacing:1px;color:#785d12;">ASPECT COMPANIES · CALENDAR</div><h1 style="font-size:22px;line-height:1.3;margin:14px 0 10px;">Test email received</h1><p style="font-size:14px;line-height:1.6;">${greeting}</p><p style="font-size:14px;line-height:1.6;">This is a test from your calendar notification settings. If you received it, email delivery is working.</p><p style="font-size:12px;color:#716b5f;line-height:1.6;">Sent: ${escapeCalendarEmailHtml(sentAt)}<br>Sender: ${sender}</p></td></tr></table></td></tr></table></body></html>`;
     await transporter.sendMail({from:settings.from,to:account.email,subject:'Aspect Companies calendar email test',text:body,html});
    }catch(error){console.error('Calendar email test failed:',String(error?.message||error).slice(0,500));return send(res,502,{error:'The test email could not be sent. Check the SMTP settings and try again.'});}
    addActivity('Calendar email test sent',`Test message sent to ${account.email} by ${account.name}.`,'calendar');
    return send(res,200,{ok:true,message:`Test email sent to ${account.email}.`});
   }
   if(url.pathname==='/api/settings/calendar-slack-test'&&req.method==='POST'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required.'});
    const activeCompany=user.activeCompanyId?db.prepare('SELECT parent_id FROM companies WHERE id=?').get(user.activeCompanyId):null;if(activeCompany?.parent_id)return send(res,403,{error:'Portal settings can only be changed from the Aspect Companies organization portal.'});
    const slack=calendarSlackSettings();if(!slack.configured)return send(res,400,{error:'Connect a Slack channel before sending a test.'});
    const response=await fetch(slack.webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:`Aspect Companies calendar connected${slack.channel?` to #${slack.channel}`:''}. Upcoming event reminders will appear here.`}),signal:AbortSignal.timeout(10000)});if(!response.ok)return send(res,502,{error:`Slack did not accept the test message (${response.status}).`});
    addActivity('Slack calendar connection tested',slack.channel?`Test message sent to #${slack.channel}.`:'Test message sent to the connected channel.','calendar');
    return send(res,200,{ok:true,message:'Test message sent to Slack.'});
   }
   if(/^\/api\/(?:projects(?:\/.*)?|project-milestones\/.*|project-documents\/.*|project-requests(?:\/.*)?)$/.test(url.pathname))return send(res,404,{error:'This section is no longer available.'});
   const disabledSetting=settingKeysForRequest(url.pathname,req.method).find(key=>getPortalSettings()[key]===false);if(disabledSetting)return send(res,403,{error:`This feature is turned off by a portal administrator (${disabledSetting}).`});
   if(url.pathname==='/api/admin/system-development-members'&&req.method==='GET'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required.'});
    const rows=db.prepare('SELECT u.id,u.name,u.email,u.active,CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS has_access FROM users u LEFT JOIN system_development_members m ON m.user_id=u.id WHERE u.email<>? ORDER BY u.name COLLATE NOCASE').all(SIGNATURE_DESIGN_SYSTEM_ACTOR_EMAIL);
    return send(res,200,rows.map(row=>({id:row.id,name:row.name,email:row.email,active:!!row.active,hasAccess:!!row.has_access})));
   }
   const systemMemberMatch=url.pathname.match(/^\/api\/admin\/system-development-members\/([^/]+)$/);
   if(systemMemberMatch&&req.method==='PATCH'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required.'});
    const targetId=decodeURIComponent(systemMemberMatch[1]),target=db.prepare('SELECT id,name,active,role FROM users WHERE id=?').get(targetId);
    if(!target)return send(res,404,{error:'Account not found.'});
    const input=await bodyJson(req,4096),access=input.access===true||input.access==='true'?true:input.access===false||input.access==='false'?false:null;
    if(access===null)return send(res,400,{error:'Choose whether this person has Collaboration access.'});
    if(access&&!target.active)return send(res,400,{error:'Reactivate this account before granting access.'});
    const result=access?db.prepare('INSERT OR IGNORE INTO system_development_members(user_id,added_at) VALUES(?,?)').run(targetId,new Date().toISOString()):db.prepare('DELETE FROM system_development_members WHERE user_id=?').run(targetId);
    if(result.changes){addActivity(`Collaboration access ${access?'granted':'removed'}`,`${target.name} · access ${access?'granted':'removed'} by ${user.name}`,'user');broadcastUsersUpdate([targetId],['notifications'],requestClientId(req),user.id,{collaborationAccessChanged:{hasAccess:access}});}
    return send(res,200,{id:targetId,hasAccess:access});
   }
    if(req.method==='GET'&&url.pathname==='/api/auth/portals')return send(res,200,availablePortals(user));
   if(req.method==='GET'&&url.pathname==='/api/people'){
    const scopedCompanyIds=userCompanyIds(user),marks=scopedCompanyIds.map(()=>'?').join(',');
    const rows=user.role==='admin'
     ?db.prepare('SELECT id,name,email,role,active,must_change_password,created_at,job_title,phone,location,directory_visible,share_email,share_phone,share_location FROM users WHERE active=1 ORDER BY name COLLATE NOCASE').all()
     :scopedCompanyIds.length
      ?db.prepare(`SELECT DISTINCT u.id,u.name,u.email,u.role,u.active,u.must_change_password,u.created_at,u.job_title,u.phone,u.location,u.directory_visible,u.share_email,u.share_phone,u.share_location FROM users u WHERE u.active=1 AND (u.directory_visible=1 OR u.id=? OR u.role='admin') AND (u.id=? OR u.role='admin' OR EXISTS(SELECT 1 FROM memberships sm WHERE sm.user_id=u.id AND sm.active=1 AND sm.company_id IN (${marks}))) ORDER BY u.name COLLATE NOCASE`).all(user.id,user.id,...scopedCompanyIds)
      :db.prepare("SELECT id,name,email,role,active,must_change_password,created_at,job_title,phone,location,directory_visible,share_email,share_phone,share_location FROM users WHERE active=1 AND (id=? OR role='admin') ORDER BY name COLLATE NOCASE").all(user.id);
    const people=rows.map(person=>{
     const memberships=db.prepare('SELECT m.company_id AS id,c.name,m.role FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? AND m.active=1 ORDER BY c.name COLLATE NOCASE').all(person.id);
     const visibleMemberships=user.role==='admin'?memberships:memberships.filter(item=>scopedCompanyIds.includes(item.id));
     const isSelf=person.id===user.id,isAdmin=user.role==='admin',maySeeEmail=isSelf||isAdmin||person.share_email||visibleMemberships.some(item=>canManageCompany(user,item.id));
     const roleLabel=person.role==='admin'?'Platform administrator':'Company member';
     return{id:person.id,name:person.name,jobTitle:person.job_title||'',role:person.role,roleLabel,companies:person.role==='admin'?'All companies':visibleMemberships.map(item=>({id:item.id,name:item.name,role:item.role})),email:maySeeEmail?person.email:null,phone:isSelf||person.share_phone?person.phone||null:null,location:isSelf||person.share_location?person.location||null:null,isSelf};
    });
    return send(res,200,people);
   }
   if(req.method==='GET'&&url.pathname==='/api/clients/import-template'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required to import clients.'});
    const template=await buildClientImportTemplate(user);return send(res,200,template,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':'attachment; filename="aspect-clients-import-template.xlsx"'});
   }
   if(req.method==='POST'&&url.pathname==='/api/clients/import/preview'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required to import clients.'});
    const input=await bodyJson(req,6*1024*1024);let parsed;try{parsed=await readClientImportRows(input);}catch(error){return send(res,400,{error:error.message});}
    const rows=assessClientImportRows(parsed.rows,user);return send(res,200,{fileName:parsed.fileName,rows,readyCount:rows.filter(row=>row.status==='ready').length,duplicateCount:rows.filter(row=>row.status==='duplicate').length,invalidCount:rows.filter(row=>row.status==='invalid').length});
   }
   if(req.method==='POST'&&url.pathname==='/api/clients/import'){
    if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required to import clients.'});
    const input=await bodyJson(req,6*1024*1024);let parsed;try{parsed=await readClientImportRows(input);}catch(error){return send(res,400,{error:error.message});}
    let rows,imported=0,skippedDuplicates=0;const importedByCompany=new Map();db.exec('BEGIN IMMEDIATE');
    try{
     rows=assessClientImportRows(parsed.rows,user);
     for(const row of rows){if(row.status==='duplicate'){skippedDuplicates++;continue;}if(row.status!=='ready')continue;
      const now=new Date().toISOString(),clientId=randomUUID();try{db.prepare('INSERT INTO clients(id,company_id,name,contact_name,email,phone,location,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(clientId,row.companyId,row.name,row.contactName,row.email,row.phone,row.location,row.notes,user.id,now,now);replaceClientAssignments(clientId,row.assignedUserIds,user.id,now);imported++;importedByCompany.set(row.companyId,(importedByCompany.get(row.companyId)||0)+1);}
      catch(error){if(isUniqueConstraintError(error)){skippedDuplicates++;continue;}throw error;}
      }
     for(const [companyId,count]of importedByCompany){const companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name||'Company';addActivity('Client list imported',`${count} client${count===1?'':'s'} imported for ${companyName} by ${user.name}`,'update',companyId);}
      db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    return send(res,200,{imported,skippedDuplicates,skippedInvalid:rows.filter(row=>row.status==='invalid').length});
   }
   if(url.pathname==='/api/clients/assignees'&&req.method==='GET'){
    const companyId=url.searchParams.get('companyId')||'';if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to assign clients.'});return send(res,200,listClientAssignableUsers(companyId));
   }
   if(url.pathname==='/api/clients'&&req.method==='GET'){
    const accessible=userCompanyIds(user),requested=url.searchParams.get('companyId')||'',ids=requested?[requested]:accessible;
    if(requested&&!accessible.includes(requested))return send(res,404,{error:'That client directory was not found.'});
    if(!ids.length)return send(res,200,[]);
    const marks=ids.map(()=>'?').join(','),rows=db.prepare(`SELECT c.*,co.name AS company_name,u.name AS created_by_name FROM clients c JOIN companies co ON co.id=c.company_id LEFT JOIN users u ON u.id=c.created_by WHERE c.company_id IN (${marks}) ORDER BY c.name COLLATE NOCASE`).all(...ids);
    return send(res,200,rows.map(row=>({id:row.id,companyId:row.company_id,companyName:row.company_name,name:row.name,contactName:row.contact_name,email:row.email,phone:row.phone,location:row.location,notes:row.notes,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at,canManage:canManageCompany(user,row.company_id),assignedUsers:listClientAssignments(row.id),})));
   }
   if(url.pathname==='/api/clients'&&req.method==='POST'){
    const input=await bodyJson(req,16000),companyId=String(input.companyId||''),name=typeof input.name==='string'?input.name.trim():'',contactName=typeof input.contactName==='string'?input.contactName.trim():'',email=typeof input.email==='string'?input.email.trim():'',phone=typeof input.phone==='string'?input.phone.trim():'',location=typeof input.location==='string'?input.location.trim():'',notes=typeof input.notes==='string'?input.notes.trim():null;
    if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
    if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to manage clients.'});
    const requestedAssignedUserIds=clientAssignedUserIds(input.assignedUserIds,companyId);
    if(requestedAssignedUserIds===null)return send(res,400,{error:'Choose active users who have access to the selected company.'});
    const assignedUserIds=[...new Set([...requestedAssignedUserIds,user.id])];
    if(name.length<2||name.length>160||!contactName||contactName.length>120||!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!phone||phone.length>40||!location||location.length>160||notes===null||!notes||notes.length>4000)return send(res,400,{error:'Complete every client field with valid information before saving.'});
    const id=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
    try{db.prepare('INSERT INTO clients(id,company_id,name,contact_name,email,phone,location,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,companyId,name,contactName,email,phone,location,notes,user.id,now,now);replaceClientAssignments(id,assignedUserIds,user.id,now);addActivity('Client added',`${name} added by ${user.name}`,'update',companyId);db.exec('COMMIT');}
    catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'A client with that name already exists for this company.'});throw error;}
    return send(res,201,{id,companyId,companyName:db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name,name,contactName,email,phone,location,notes,createdByName:user.name,createdAt:now,updatedAt:now,canManage:true,assignedUsers:listClientAssignments(id),projects:[]});
   }
   const clientCalendarEventsMatch=url.pathname.match(/^\/api\/clients\/([^/]+)\/calendar-events$/);
   if(clientCalendarEventsMatch&&req.method==='GET'){
    const clientId=decodeURIComponent(clientCalendarEventsMatch[1]),client=db.prepare('SELECT id,company_id FROM clients WHERE id=?').get(clientId);if(!client||!userCompanyIds(user).includes(client.company_id))return send(res,404,{error:'Client not found.'});const now=new Date().toISOString(),events=db.prepare("SELECT e.id,e.title,e.starts_at AS startsAt,e.ends_at AS endsAt,e.all_day AS allDay,e.start_date AS startDate,e.end_date AS endDateExclusive,e.time_zone AS timeZone,e.event_type AS eventType,e.meeting_type AS meetingType,e.status,e.location,c.name AS companyName,u.name AS createdByName FROM calendar_events e JOIN companies c ON c.id=e.company_id JOIN users u ON u.id=e.created_by WHERE e.client_id=? AND e.company_id=? ORDER BY CASE WHEN e.starts_at>=? THEN 0 ELSE 1 END,CASE WHEN e.starts_at>=? THEN e.starts_at END ASC,CASE WHEN e.starts_at<? THEN e.starts_at END DESC LIMIT 50").all(client.id,client.company_id,now,now,now);return send(res,200,events.map(event=>({...event,allDay:!!event.allDay})));
   }
   const clientMatch=url.pathname.match(/^\/api\/clients\/([^/]+)$/);
   if(clientMatch&&req.method==='PATCH'){
     const id=decodeURIComponent(clientMatch[1]),existing=db.prepare('SELECT * FROM clients WHERE id=?').get(id);
     if(!existing||!userCompanyIds(user).includes(existing.company_id))return send(res,404,{error:'Client not found.'});
     if(!canManageCompany(user,existing.company_id))return send(res,403,{error:'Platform administrator access is required to manage clients.'});
     const input=await bodyJson(req,16000),name=input.name===undefined?existing.name:String(input.name).trim(),contactName=input.contactName===undefined?existing.contact_name:String(input.contactName).trim(),email=input.email===undefined?existing.email:String(input.email).trim(),phone=input.phone===undefined?existing.phone:String(input.phone).trim(),location=input.location===undefined?existing.location:String(input.location).trim(),notes=input.notes===undefined?existing.notes:typeof input.notes==='string'?input.notes.trim():null,assignedUserIds=input.assignedUserIds===undefined?listClientAssignments(id).map(person=>person.id):clientAssignedUserIds(input.assignedUserIds,existing.company_id);
     if(assignedUserIds===null)return send(res,400,{error:'Choose active users who have access to the selected company.'});
     if(name.length<2||name.length>160||contactName.length>120||email.length>254||email&&!/^\S+@\S+\.\S+$/.test(email)||phone.length>40||location.length>160||notes===null||notes.length>4000)return send(res,400,{error:'Check the client name and contact details, then try again.'});
     const duplicate=db.prepare('SELECT id FROM clients WHERE company_id=? AND lower(trim(name))=lower(trim(?)) AND id<>?').get(existing.company_id,name,id);if(duplicate)return send(res,409,{error:'A client with that name already exists for this company.'});
     const now=new Date().toISOString(),relatedProjects=name===existing.name?[]:db.prepare('SELECT id FROM projects WHERE company_id=? AND lower(trim(client_name))=lower(trim(?))').all(existing.company_id,existing.name);db.exec('BEGIN IMMEDIATE');
     try{db.prepare('UPDATE clients SET name=?,contact_name=?,email=?,phone=?,location=?,notes=?,updated_at=? WHERE id=?').run(name,contactName,email,phone,location,notes,now,id);replaceClientAssignments(id,assignedUserIds,user.id,now);if(relatedProjects.length){db.prepare('UPDATE projects SET client_name=?,updated_at=? WHERE company_id=? AND lower(trim(client_name))=lower(trim(?))').run(name,now,existing.company_id,existing.name);for(const project of relatedProjects)addProjectEvent(project.id,user.id,'updated',`Client name updated from ${existing.name} to ${name}.`);}addActivity('Client updated',`${name} updated by ${user.name}`,'update',existing.company_id);db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'A client with that name already exists for this company.'});throw error;}
     return send(res,200,{id,companyId:existing.company_id,companyName:db.prepare('SELECT name FROM companies WHERE id=?').get(existing.company_id)?.name,name,contactName,email,phone,location,notes,createdByName:db.prepare('SELECT name FROM users WHERE id=?').get(existing.created_by)?.name||'',createdAt:existing.created_at,updatedAt:now,canManage:true,assignedUsers:listClientAssignments(id),});
   }
   if(url.pathname==='/api/system-development'){
    if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});
    if(req.method==='GET'){
       const allProjectRows=db.prepare("SELECT p.*,u.name AS created_by_name,c.name AS company_name,archiver.name AS archived_by_name FROM system_development_projects p JOIN users u ON u.id=p.created_by LEFT JOIN companies c ON c.id=p.company_id LEFT JOIN users archiver ON archiver.id=p.archived_by ORDER BY CASE p.phase WHEN 'work' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,p.updated_at DESC").all();
       const projectRows=allProjectRows.filter(project=>canAccessSystemDevelopmentProject(user,project)),projectIds=projectRows.map(row=>row.id),projectMarks=projectIds.map(()=>'?').join(',');
       const rows=projectIds.length?db.prepare(`SELECT i.*,owner.name AS owner_name,creator.name AS created_by_name,company.name AS company_name FROM system_development_items i LEFT JOIN users owner ON owner.id=i.owner_user_id JOIN users creator ON creator.id=i.created_by LEFT JOIN companies company ON company.id=i.company_id WHERE i.project_id IN (${projectMarks}) ORDER BY i.focus_item DESC,CASE i.status WHEN 'Blocked' THEN 0 WHEN 'In progress' THEN 1 WHEN 'Planned' THEN 2 ELSE 3 END,i.updated_at DESC`).all(...projectIds):[];
       const projectMemberships=projectIds.length?db.prepare(`SELECT project_id,user_id FROM system_development_project_members WHERE project_id IN (${projectMarks}) ORDER BY added_at,user_id`).all(...projectIds):[];
      const itemIds=rows.map(row=>row.id);
      const events=itemIds.length?db.prepare(`SELECT e.id,e.item_id,e.detail,e.created_at,u.name AS actor_name FROM system_development_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.item_id IN (${itemIds.map(()=>'?').join(',')}) ORDER BY e.created_at DESC`).all(...itemIds):[];
      const projectEvents=projectIds.length?db.prepare(`SELECT e.id,e.project_id,e.detail,e.created_at,u.name AS actor_name FROM system_development_project_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.project_id IN (${projectIds.map(()=>'?').join(',')}) ORDER BY e.created_at DESC`).all(...projectIds):[];
       const projectPosts=projectIds.length?db.prepare(`SELECT p.id,p.project_id,p.parent_id,p.author_user_id,p.body,p.created_at,u.name AS author_name FROM system_development_project_posts p LEFT JOIN users u ON u.id=p.author_user_id WHERE p.project_id IN (${projectIds.map(()=>'?').join(',')}) ORDER BY p.created_at ASC`).all(...projectIds):[];
      const docs=projectIds.length?db.prepare(`SELECT d.*,u.name AS uploader FROM system_development_project_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.project_id IN (${projectIds.map(()=>'?').join(',')}) ORDER BY d.created_at DESC`).all(...projectIds):[];
      const mappedItems=rows.map(row=>({id:row.id,projectId:row.project_id,kind:row.kind,title:row.title,details:row.details,checklist:(()=>{try{const parsed=JSON.parse(row.checklist_json||'[]');return Array.isArray(parsed)?parsed:[]}catch{return[]}})(),status:row.status,phase:row.phase,focusItem:!!row.focus_item,companyId:row.company_id,companyName:row.company_name,ownerUserId:row.owner_user_id,ownerName:row.owner_name,targetDate:row.target_date,createdByName:row.created_by_name,createdAt:row.created_at,updatedAt:row.updated_at,history:events.filter(event=>event.item_id===row.id).map(event=>({id:event.id,detail:event.detail,actor:event.actor_name||'System',createdAt:event.created_at}))}));
      const mappedProjects=projectRows.map(row=>({id:row.id,companyId:row.company_id,companyName:row.company_name,title:row.title,purpose:row.purpose||'',meetingDate:row.meeting_date,notes:row.notes,phase:row.phase,createdByUserId:row.created_by,createdByName:row.created_by_name,memberUserIds:projectMemberships.filter(member=>member.project_id===row.id).map(member=>member.user_id),canManageMembers:canManageSystemDevelopmentProjectMembers(user,row),createdAt:row.created_at,updatedAt:row.updated_at,archivedAt:row.archived_at||null,archivedByName:row.archived_by_name||'',items:mappedItems.filter(item=>item.projectId===row.id),posts:projectPosts.filter(post=>post.project_id===row.id).map(post=>({id:post.id,parentId:post.parent_id,authorUserId:post.author_user_id,authorName:post.author_name||'Former teammate',body:post.body,createdAt:post.created_at})),documents:docs.filter(doc=>doc.project_id===row.id).map(doc=>({id:doc.id,projectId:doc.project_id,originalName:doc.original_name,mimeType:doc.mime_type,sizeBytes:doc.size_bytes,description:doc.description,uploader:doc.uploader,createdAt:doc.created_at,downloadUrl:`/api/system-development/documents/${encodeURIComponent(doc.id)}/download`})),history:projectEvents.filter(event=>event.project_id===row.id).map(event=>({id:event.id,detail:event.detail,actor:event.actor_name||'System',createdAt:event.created_at}))}));
     return send(res,200,{
        projects:mappedProjects.filter(project=>!project.archivedAt),
        archivedProjects:mappedProjects.filter(project=>Boolean(project.archivedAt)).map(project=>({id:project.id,title:project.title,purpose:project.purpose,companyName:project.companyName,canManageMembers:project.canManageMembers,archivedAt:project.archivedAt,archivedByName:project.archivedByName,itemCount:project.items.length,documentCount:project.documents.length})),
       items:mappedItems.filter(item=>!projectRows.find(project=>project.id===item.projectId)?.archived_at),
      members:db.prepare('SELECT u.id,u.name FROM system_development_members m JOIN users u ON u.id=m.user_id WHERE u.active=1 ORDER BY u.name').all(),
      companies:db.prepare('SELECT id,name FROM companies ORDER BY name COLLATE NOCASE').all()
     });
    }
      if(req.method==='POST')return send(res,400,{error:'Create a collaboration project, then add shared work to it.'});
   }
    if(url.pathname==='/api/system-development/projects'&&req.method==='POST'){
     if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});
      const input=await bodyJson(req,20000),title=typeof input.title==='string'?input.title.trim():'',purpose=typeof input.purpose==='string'?input.purpose.trim():'',meetingDate=input.meetingDate?String(input.meetingDate):null,notes=typeof input.notes==='string'?input.notes.trim():'',companyId=typeof input.companyId==='string'?input.companyId.trim():'',company=companyId?db.prepare('SELECT id,name FROM companies WHERE id=?').get(companyId):null,memberUserIds=normalizeSystemDevelopmentProjectMemberIds(input.memberUserIds===undefined?[user.id]:input.memberUserIds,user.id);
      if(memberUserIds===null)return send(res,400,{error:'Choose active teammates who have Collaboration access.'});if(companyId&&!company)return send(res,400,{error:'Choose an active company or leave the company blank.'});if(title.length<2||title.length>160||purpose.length>4000||!taskDateIsValid(meetingDate)||notes.length>12000)return send(res,400,{error:'Check the project name, purpose, and project due date.'});
      const id=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO system_development_projects(id,company_id,title,purpose,meeting_date,notes,phase,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?, 'work',?,?,?)").run(id,companyId||null,title,purpose,meetingDate,notes,user.id,now,now);replaceSystemDevelopmentProjectMembers(id,memberUserIds,user.id,now);db.prepare('INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,'Collaboration project created.',now);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      addDevelopmentNotification(id,null,user.id,'Collaboration project created',title,'development');return send(res,201,{id,companyId:companyId||null,companyName:company?.name||null,title,purpose,meetingDate,notes,phase:'work',createdByUserId:user.id,createdByName:user.name,memberUserIds,canManageMembers:true,createdAt:now,updatedAt:now,items:[],posts:[],documents:[],history:[]});
    }
    const developmentProjectArchiveMatch=url.pathname.match(/^\/api\/system-development\/projects\/([^/]+)\/(archive|restore)$/);
    if(developmentProjectArchiveMatch&&req.method==='POST'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});
      const id=decodeURIComponent(developmentProjectArchiveMatch[1]),action=developmentProjectArchiveMatch[2],existing=db.prepare('SELECT * FROM system_development_projects WHERE id=?').get(id);
      if(!existing||!canAccessSystemDevelopmentProject(user,existing))return send(res,404,{error:'Collaboration project not found.'});
      if(!canManageSystemDevelopmentProjectMembers(user,existing))return send(res,403,{error:'Only the project creator or a portal administrator can delete or restore this project.'});
      const shouldArchive=action==='archive';if(Boolean(existing.archived_at)===shouldArchive)return send(res,200,{ok:true,archived:shouldArchive});
      const now=new Date().toISOString(),detail=shouldArchive?'Project deleted and moved to Archived projects.':'Project restored from Archived projects.';db.exec('BEGIN IMMEDIATE');
      try{db.prepare('UPDATE system_development_projects SET archived_at=?,archived_by=?,updated_at=? WHERE id=?').run(shouldArchive?now:null,shouldArchive?user.id:null,now,id);db.prepare('INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,detail,now);db.exec('COMMIT');}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      broadcastUsersUpdate(systemDevelopmentProjectRecipientIds(id),['notifications'],requestClientId(req),user.id,{projectAccessChanged:{projectId:id,accessible:!shouldArchive,archived:shouldArchive}});return send(res,200,{ok:true,archived:shouldArchive});
    }
    const developmentProjectMatch=url.pathname.match(/^\/api\/system-development\/projects\/([^/]+)$/);
    if(developmentProjectMatch&&req.method==='PATCH'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});
      const id=decodeURIComponent(developmentProjectMatch[1]),existing=db.prepare('SELECT * FROM system_development_projects WHERE id=?').get(id);if(!existing||!canAccessSystemDevelopmentProject(user,existing))return send(res,404,{error:'Collaboration project not found.'});
      if(existing.archived_at)return send(res,409,{error:'Restore this project from Archived before changing it.'});
      const input=await bodyJson(req,20000);if(Object.hasOwn(input,'memberUserIds')&&!canManageSystemDevelopmentProjectMembers(user,existing))return send(res,403,{error:'Only the project creator or a platform administrator can change project access.'});
      const memberInput=Object.hasOwn(input,'memberUserIds')?normalizeSystemDevelopmentProjectMemberIds(input.memberUserIds,existing.created_by):null;if(Object.hasOwn(input,'memberUserIds')&&memberInput===null)return send(res,400,{error:'Choose active teammates who have Collaboration access.'});
      const memberUserIds=memberInput||systemDevelopmentProjectMemberIds(id),title=input.title===undefined?existing.title:(typeof input.title==='string'?input.title.trim():''),purpose=input.purpose===undefined?existing.purpose:(typeof input.purpose==='string'?input.purpose.trim():''),meetingDate=input.meetingDate===undefined?existing.meeting_date:(input.meetingDate?String(input.meetingDate):null),notes=input.notes===undefined?existing.notes:(typeof input.notes==='string'?input.notes.trim():null),phase=input.phase===undefined?existing.phase:String(input.phase),companyId=input.companyId===undefined?existing.company_id:typeof input.companyId==='string'?(input.companyId.trim()||null):null,company=companyId?db.prepare('SELECT id,name FROM companies WHERE id=?').get(companyId):null;
      if(companyId&&!company)return send(res,400,{error:'Choose an active company or leave the company blank.'});if(title.length<2||title.length>160||purpose.length>4000||!taskDateIsValid(meetingDate)||notes===null||notes.length>12000)return send(res,400,{error:'Check the project name, purpose, and project due date.'});if(!SYSTEM_DEVELOPMENT_PHASES.includes(phase))return send(res,400,{error:'Choose Active, Waiting for input, or Complete.'});
      const allowed={work:['review'],review:['work','completed'],completed:['work']};if(phase!==existing.phase&&!allowed[existing.phase]?.includes(phase))return send(res,400,{error:'That project move is not available from this stage.'});
      const oldMemberIds=systemDevelopmentProjectMemberIds(id),membersChanged=memberInput!==null&&([...oldMemberIds].sort().join('|')!==[...memberUserIds].sort().join('|'));
      if(membersChanged){const owners=db.prepare('SELECT DISTINCT owner_user_id FROM system_development_items WHERE project_id=? AND owner_user_id IS NOT NULL').all(id).map(row=>row.owner_user_id);if(owners.some(ownerId=>!memberUserIds.includes(ownerId)))return send(res,400,{error:'Reassign this teammate’s work items before removing their project access.'});}
      const now=new Date().toISOString(),changes=[];if(companyId!==existing.company_id)changes.push(company?'Company linked: '+company.name:'Company link removed.');if(title!==existing.title)changes.push('Project name updated.');if(purpose!==(existing.purpose||''))changes.push('Project purpose updated.');if(meetingDate!==existing.meeting_date)changes.push(`Project due date changed to ${meetingDate||'Not set'}.`);if(notes!==existing.notes)changes.push('Shared context updated.');if(phase!==existing.phase)changes.push(phase==='review'?'Moved to Waiting for input':phase==='completed'?'Marked complete.':existing.phase==='completed'?'Reopened':'Returned to Active');if(membersChanged)changes.push('Project access updated.');
      if(!changes.length)return send(res,200,{id,companyId:companyId||null,companyName:company?.name||null,title,purpose,meetingDate,notes,phase,createdByUserId:existing.created_by,memberUserIds:oldMemberIds,canManageMembers:canManageSystemDevelopmentProjectMembers(user,existing),updatedAt:existing.updated_at});db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE system_development_projects SET company_id=?,title=?,purpose=?,meeting_date=?,notes=?,phase=?,updated_at=? WHERE id=?').run(companyId,title,purpose,meetingDate,notes,phase,now,id);if(companyId!==existing.company_id)db.prepare('UPDATE system_development_items SET company_id=?,updated_at=? WHERE project_id=?').run(companyId,now,id);if(membersChanged)replaceSystemDevelopmentProjectMembers(id,memberUserIds,user.id,now);db.prepare('INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,changes.join(' '),now);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      addDevelopmentNotification(id,null,user.id,'Collaboration project updated',changes.join(' · '),'development');if(membersChanged){const currentRecipients=systemDevelopmentProjectRecipientIds(id),currentRecipientSet=new Set(currentRecipients),revokedMembers=oldMemberIds.filter(memberId=>!currentRecipientSet.has(memberId));broadcastUsersUpdate(revokedMembers,['notifications'],requestClientId(req),user.id,{projectAccessChanged:{projectId:id,accessible:false}});broadcastUsersUpdate(currentRecipients,['notifications'],requestClientId(req),user.id,{projectAccessChanged:{projectId:id,accessible:true}});}return send(res,200,{id,companyId:companyId||null,companyName:company?.name||null,title,purpose,meetingDate,notes,phase,createdByUserId:existing.created_by,memberUserIds:systemDevelopmentProjectMemberIds(id),canManageMembers:canManageSystemDevelopmentProjectMembers(user,existing),createdByName:db.prepare('SELECT name FROM users WHERE id=?').get(existing.created_by)?.name||'',createdAt:existing.created_at,updatedAt:now});
    }
     const developmentProjectPostsMatch=url.pathname.match(/^\/api\/system-development\/projects\/([^/]+)\/posts$/);
     if(developmentProjectPostsMatch&&req.method==='GET'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration projects are available to their team only.'});
      const projectId=decodeURIComponent(developmentProjectPostsMatch[1]),project=db.prepare('SELECT id,created_by,archived_at FROM system_development_projects WHERE id=?').get(projectId);if(!project||!canAccessActiveSystemDevelopmentProject(user,project))return send(res,404,{error:'Collaboration project not found.'});
      const rawSince=url.searchParams.get('since'),since=rawSince&&Number.isFinite(Date.parse(rawSince))?new Date(rawSince).toISOString():null;if(rawSince&&!since)return send(res,400,{error:'Choose a valid discussion update time.'});
      const rows=since?db.prepare('SELECT p.id,p.project_id,p.parent_id,p.author_user_id,p.body,p.created_at,u.name AS author_name FROM system_development_project_posts p LEFT JOIN users u ON u.id=p.author_user_id WHERE p.project_id=? AND p.created_at>=? ORDER BY p.created_at,p.id').all(projectId,since):db.prepare('SELECT p.id,p.project_id,p.parent_id,p.author_user_id,p.body,p.created_at,u.name AS author_name FROM system_development_project_posts p LEFT JOIN users u ON u.id=p.author_user_id WHERE p.project_id=? ORDER BY p.created_at,p.id').all(projectId);
      return send(res,200,{posts:rows.map(post=>({id:post.id,projectId:post.project_id,parentId:post.parent_id,authorUserId:post.author_user_id,authorName:post.author_name||'Former teammate',body:post.body,createdAt:post.created_at}))});
     }
     if(developmentProjectPostsMatch&&req.method==='POST'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration projects are available to their team only.'});
      const projectId=decodeURIComponent(developmentProjectPostsMatch[1]),project=db.prepare('SELECT id,title,created_by,archived_at FROM system_development_projects WHERE id=?').get(projectId);if(!project||!canAccessActiveSystemDevelopmentProject(user,project))return send(res,404,{error:'Collaboration project not found.'});
      const input=await bodyJson(req,12000),body=typeof input.body==='string'?input.body.trim():'',parentId=typeof input.parentId==='string'&&input.parentId?input.parentId:null,requestId=typeof input.requestId==='string'?input.requestId.trim():'';
      if(requestId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return send(res,400,{error:'The update request could not be verified. Please try again.'});
      if(body.length<1||body.length>4000)return send(res,400,{error:'Write an update or reply under 4,000 characters.'});
      if(requestId){const previous=db.prepare('SELECT p.id,p.project_id,p.parent_id,p.author_user_id,p.body,p.created_at,u.name AS author_name FROM system_development_project_posts p LEFT JOIN users u ON u.id=p.author_user_id WHERE p.author_user_id=? AND p.client_request_id=?').get(user.id,requestId);if(previous){if(previous.project_id!==projectId||previous.parent_id!==(parentId||null)||previous.body!==body)return send(res,409,{error:'This update was already sent with different content. Start a new update to continue.'});return send(res,200,{id:previous.id,projectId:previous.project_id,parentId:previous.parent_id,authorUserId:previous.author_user_id,authorName:previous.author_name||'Former teammate',body:previous.body,createdAt:previous.created_at});}}
      if(parentId&&!db.prepare('SELECT id FROM system_development_project_posts WHERE id=? AND project_id=? AND parent_id IS NULL').get(parentId,projectId))return send(res,400,{error:'Choose a conversation in this project before replying.'});
      const id=randomUUID(),createdAt=new Date().toISOString(),notificationTitle=parentId?'New reply':'New collaboration update',notificationMessage=`${project.title} · ${body.slice(0,220)}`;db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO system_development_project_posts(id,project_id,parent_id,author_user_id,body,created_at,client_request_id) VALUES(?,?,?,?,?,?,?)').run(id,projectId,parentId,user.id,body,createdAt,requestId||null);db.prepare('INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),projectId,user.id,parentId?'Replied in the collaboration project.':'Posted an update in the collaboration project.',createdAt);db.prepare('UPDATE system_development_projects SET updated_at=? WHERE id=?').run(createdAt,projectId);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}if(requestId&&error.code==='SQLITE_CONSTRAINT_UNIQUE'){const previous=db.prepare('SELECT p.id,p.project_id,p.parent_id,p.author_user_id,p.body,p.created_at,u.name AS author_name FROM system_development_project_posts p LEFT JOIN users u ON u.id=p.author_user_id WHERE p.author_user_id=? AND p.client_request_id=?').get(user.id,requestId);if(previous&&previous.project_id===projectId&&previous.parent_id===(parentId||null)&&previous.body===body)return send(res,200,{id:previous.id,projectId:previous.project_id,parentId:previous.parent_id,authorUserId:previous.author_user_id,authorName:previous.author_name||'Former teammate',body:previous.body,createdAt:previous.created_at});}throw error;}
      addDevelopmentNotification(projectId,null,user.id,notificationTitle,notificationMessage,'discussion');broadcastUsersUpdate(systemDevelopmentProjectRecipientIds(projectId).filter(memberId=>memberId!==user.id),['notifications'],requestClientId(req),user.id,{discussionPost:{projectId,projectTitle:project.title,postId:id,parentId,authorUserId:user.id,authorName:user.name,body,createdAt,notificationTitle}});return send(res,201,{id,projectId,parentId,authorUserId:user.id,authorName:user.name,body,createdAt});
     }
    const developmentProjectDocumentsMatch=url.pathname.match(/^\/api\/system-development\/projects\/([^/]+)\/documents$/);
    if(developmentProjectDocumentsMatch){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});const projectId=decodeURIComponent(developmentProjectDocumentsMatch[1]),project=db.prepare('SELECT id,created_by,archived_at FROM system_development_projects WHERE id=?').get(projectId);if(!project||!canAccessActiveSystemDevelopmentProject(user,project))return send(res,404,{error:'Collaboration project not found.'});
     if(req.method==='GET'){const rows=db.prepare('SELECT d.*,u.name AS uploader FROM system_development_project_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.project_id=? ORDER BY d.created_at DESC').all(projectId);return send(res,200,rows.map(doc=>({id:doc.id,projectId:doc.project_id,originalName:doc.original_name,mimeType:doc.mime_type,sizeBytes:doc.size_bytes,description:doc.description,uploader:doc.uploader,createdAt:doc.created_at,downloadUrl:`/api/system-development/documents/${encodeURIComponent(doc.id)}/download` })));}
     if(req.method==='POST'){
      if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});const input=await bodyJson(req,15*1024*1024),originalName=path.posix.basename(String(input.name||'').replace(/\\/g,'/').replace(/[\x00-\x1f\x7f]/g,'')).trim(),extension=path.extname(originalName).toLowerCase(),mimeType=DOCUMENT_TYPES[extension],description=String(input.description||'').trim(),requestId=typeof input.requestId==='string'?input.requestId.trim():'';
      if(requestId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return send(res,400,{error:'This upload could not be verified. Please choose the file again.'});
      if(!originalName||originalName==='.'||originalName.length>180)return send(res,400,{error:'Choose a file with a name under 180 characters.'});if(!mimeType)return send(res,415,{error:'Allowed file types: PDF, PNG, JPG, TXT, CSV, DOCX, XLSX, and PPTX.'});if(description.length>500)return send(res,400,{error:'Document notes must be 500 characters or fewer.'});
      if(typeof input.content!=='string'||!input.content||input.content.length>Math.ceil(MAX_DOCUMENT_BYTES/3)*4+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content))return send(res,400,{error:'The file data is missing or invalid.'});const content=Buffer.from(input.content,'base64');if(!content.length||content.length>MAX_DOCUMENT_BYTES||content.toString('base64')!==input.content)return send(res,400,{error:'Files must be between 1 byte and 10 MB.'});if(!validDocumentSignature(content,extension))return send(res,415,{error:'The file content does not match its file type.'});if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});
      if(requestId){const previous=db.prepare('SELECT d.*,u.name AS uploader FROM system_development_project_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.uploaded_by=? AND d.upload_request_id=?').get(user.id,requestId);if(previous){if(previous.project_id!==projectId||previous.original_name!==originalName)return send(res,409,{error:'This upload was already completed with different file details.'});let previousBytes;try{previousBytes=await fs.readFile(path.join(DOCUMENTS_DIR,previous.stored_name));}catch{return send(res,409,{error:'The earlier upload could not be verified. Contact an administrator before retrying.'});}if(!previousBytes.equals(content))return send(res,409,{error:'This upload was already completed with different file contents.'});return send(res,200,{id:previous.id,projectId:previous.project_id,originalName:previous.original_name,mimeType:previous.mime_type,sizeBytes:previous.size_bytes,description:previous.description,uploader:previous.uploader,createdAt:previous.created_at,downloadUrl:`/api/system-development/documents/${encodeURIComponent(previous.id)}/download`});}}
      const id=randomUUID(),storedName=`${randomUUID()}${extension}`,createdAt=new Date().toISOString();beginDocumentMutation();try{await fs.mkdir(DOCUMENTS_DIR,{recursive:true});const storagePath=path.join(DOCUMENTS_DIR,storedName);await fs.writeFile(storagePath,content,{flag:'wx'});try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO system_development_project_documents(id,project_id,original_name,stored_name,mime_type,size_bytes,description,uploaded_by,created_at,upload_request_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,projectId,originalName,storedName,mimeType,content.length,description,user.id,createdAt,requestId||null);db.prepare('INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),projectId,user.id,`Shared file added: ${originalName}.`,createdAt);db.prepare('UPDATE system_development_projects SET updated_at=? WHERE id=?').run(createdAt,projectId);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}await fs.unlink(storagePath).catch(()=>{});if(requestId&&error.code==='SQLITE_CONSTRAINT_UNIQUE'){const previous=db.prepare('SELECT d.*,u.name AS uploader FROM system_development_project_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.uploaded_by=? AND d.upload_request_id=?').get(user.id,requestId);if(previous&&previous.project_id===projectId&&previous.original_name===originalName&&previous.size_bytes===content.length){let previousBytes;try{previousBytes=await fs.readFile(path.join(DOCUMENTS_DIR,previous.stored_name));}catch{throw error;}if(previousBytes.equals(content))return send(res,200,{id:previous.id,projectId:previous.project_id,originalName:previous.original_name,mimeType:previous.mime_type,sizeBytes:previous.size_bytes,description:previous.description,uploader:previous.uploader,createdAt:previous.created_at,downloadUrl:`/api/system-development/documents/${encodeURIComponent(previous.id)}/download`});}}throw error;}addDevelopmentNotification(projectId,null,user.id,'Shared file uploaded',originalName,'document');return send(res,201,{id,projectId,originalName,mimeType,sizeBytes:content.length,description,uploader:user.name,createdAt,downloadUrl:`/api/system-development/documents/${encodeURIComponent(id)}/download`});}finally{endDocumentMutation();}
     }
    }
    const developmentDocumentPreviewMatch=url.pathname.match(/^\/api\/system-development\/documents\/([^/]+)\/preview$/);
    if(developmentDocumentPreviewMatch&&req.method==='GET'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});const doc=db.prepare('SELECT * FROM system_development_project_documents WHERE id=?').get(decodeURIComponent(developmentDocumentPreviewMatch[1])),project=doc?db.prepare('SELECT id,created_by FROM system_development_projects WHERE id=?').get(doc.project_id):null;if(!doc||!canAccessSystemDevelopmentProject(user,project)||doc.mime_type!=='application/pdf'||path.extname(doc.original_name).toLowerCase()!=='.pdf')return send(res,404,{error:'PDF preview not found.'});const bytes=await fs.readFile(path.join(DOCUMENTS_DIR,doc.stored_name)),fallback=doc.original_name.replace(/[^\x20-\x7e]|["\\]/g,'_');return send(res,200,bytes,'application/pdf',{'Content-Length':String(bytes.length),'Content-Disposition':`inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'",'Referrer-Policy':'no-referrer'});
    }
    const developmentDocumentDownloadMatch=url.pathname.match(/^\/api\/system-development\/documents\/([^/]+)\/download$/);
    if(developmentDocumentDownloadMatch&&req.method==='GET'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});const doc=db.prepare('SELECT * FROM system_development_project_documents WHERE id=?').get(decodeURIComponent(developmentDocumentDownloadMatch[1])),project=doc?db.prepare('SELECT id,created_by FROM system_development_projects WHERE id=?').get(doc.project_id):null;if(!doc||!canAccessSystemDevelopmentProject(user,project))return send(res,404,{error:'Shared file not found.'});const bytes=await fs.readFile(path.join(DOCUMENTS_DIR,doc.stored_name)),fallback=doc.original_name.replace(/[^\x20-\x7e]|["\\]/g,'_');return send(res,200,bytes,doc.mime_type,{'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,'Cache-Control':'private, no-store'});
    }
    const developmentDocumentMatch=url.pathname.match(/^\/api\/system-development\/documents\/([^/]+)$/);
    if(developmentDocumentMatch&&req.method==='DELETE'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});const doc=db.prepare('SELECT * FROM system_development_project_documents WHERE id=?').get(decodeURIComponent(developmentDocumentMatch[1])),project=doc?db.prepare('SELECT id,created_by,archived_at FROM system_development_projects WHERE id=?').get(doc.project_id):null;if(!doc||!canAccessActiveSystemDevelopmentProject(user,project))return send(res,404,{error:'Shared file not found.'});if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try deleting again in a moment.'});beginDocumentMutation();try{await fs.unlink(path.join(DOCUMENTS_DIR,doc.stored_name)).catch(error=>{if(error.code!=='ENOENT')throw error;});const now=new Date().toISOString();db.prepare('DELETE FROM system_development_project_documents WHERE id=?').run(doc.id);db.prepare('INSERT INTO system_development_project_events(id,project_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),doc.project_id,user.id,`Shared file removed: ${doc.original_name}.`,now);db.prepare('UPDATE system_development_projects SET updated_at=? WHERE id=?').run(now,doc.project_id);addDevelopmentNotification(doc.project_id,null,user.id,'Shared file removed',doc.original_name,'document');return send(res,200,{ok:true});}finally{endDocumentMutation();}
    }
    const developmentProjectItemMatch=url.pathname.match(/^\/api\/system-development\/projects\/([^/]+)\/items$/);
    if(developmentProjectItemMatch&&req.method==='POST'){
      if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});const projectId=decodeURIComponent(developmentProjectItemMatch[1]),project=db.prepare('SELECT id,company_id,created_by,archived_at FROM system_development_projects WHERE id=?').get(projectId);if(!project||!canAccessActiveSystemDevelopmentProject(user,project))return send(res,404,{error:'Collaboration project not found.'});
      const input=await bodyJson(req,12000),title=typeof input.title==='string'?input.title.trim():'',details='',checklist=normalizeDevelopmentChecklist(input.checklist),status=developmentChecklistStatus(checklist,String(input.status||'Planned')),checklistComplete=Boolean(checklist?.length&&checklist.every(step=>step.checked)),companyId=project.company_id,ownerUserId=input.ownerUserId?String(input.ownerUserId):null,targetDate=input.targetDate?String(input.targetDate):null,focusItem=input.focusItem===true,company=companyId?db.prepare('SELECT id,name FROM companies WHERE id=?').get(companyId):null;
      if(!checklist||!SYSTEM_DEVELOPMENT_WORK_STATUSES.includes(status)||title.length<2||title.length>160||!taskDateIsValid(targetDate)||ownerUserId&&!db.prepare('SELECT 1 FROM system_development_project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND pm.user_id=? AND u.active=1').get(projectId,ownerUserId))return send(res,400,{error:'Choose an owner who has access to this project, and check the work item, checklist, status, and target date.'});
      const id=randomUUID(),now=new Date().toISOString(),kind='work',phase='work';db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO system_development_items(id,kind,title,details,checklist_json,status,owner_user_id,target_date,company_id,project_id,focus_item,phase,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,kind,title,details,JSON.stringify(checklist),status,ownerUserId,targetDate,companyId,projectId,focusItem?1:0,phase,user.id,now,now);db.prepare('INSERT INTO system_development_events(id,item_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,focusItem?'Marked as a team priority.':'Added to this project.',now);db.prepare('UPDATE system_development_projects SET updated_at=? WHERE id=?').run(now,projectId);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}addDevelopmentNotification(projectId,id,user.id,'Work item added',title,'development');return send(res,201,{id,projectId,kind,title,details,checklist,status,phase,focusItem,companyId,companyName:company?.name||null,ownerUserId,ownerName:ownerUserId?db.prepare('SELECT name FROM users WHERE id=?').get(ownerUserId)?.name:null,targetDate,createdByName:user.name,createdAt:now,updatedAt:now,history:[]});
    }
    const systemItemMatch=url.pathname.match(/^\/api\/system-development\/items\/([^/]+)$/);
   if(systemItemMatch&&req.method==='PATCH'){
    if(!hasSystemDevelopmentAccess(user))return send(res,404,{error:'Collaboration is available to its authorized team only.'});
    const id=decodeURIComponent(systemItemMatch[1]),existing=db.prepare('SELECT * FROM system_development_items WHERE id=?').get(id);
    const existingProject=existing?.project_id?db.prepare('SELECT id,created_by,archived_at FROM system_development_projects WHERE id=?').get(existing.project_id):null;if(!existing||!canAccessActiveSystemDevelopmentProject(user,existingProject))return send(res,404,{error:'Work item not found.'});
    const input=await bodyJson(req,12000),title=input.title===undefined?existing.title:String(input.title).trim(),details=input.details===undefined?existing.details:typeof input.details==='string'?input.details.trim():null,previousChecklist=(()=>{try{return JSON.parse(existing.checklist_json||'[]')}catch{return[]}})(),checklist=input.checklist===undefined?(Array.isArray(previousChecklist)?previousChecklist:[]):normalizeDevelopmentChecklist(input.checklist);
    const parentProject=existing.project_id?db.prepare('SELECT company_id FROM system_development_projects WHERE id=?').get(existing.project_id):null,companyId=parentProject?parentProject.company_id:existing.company_id,company=companyId?db.prepare('SELECT id,name FROM companies WHERE id=?').get(companyId):null;
    let phase=input.phase===undefined?existing.phase:String(input.phase),status=input.status===undefined?existing.status:String(input.status);
    if(input.checklist!==undefined)status=developmentChecklistStatus(checklist,status);
    const ownerUserId=input.ownerUserId===undefined?existing.owner_user_id:input.ownerUserId?String(input.ownerUserId):null,targetDate=input.targetDate===undefined?existing.target_date:input.targetDate?String(input.targetDate):null;
    if(!SYSTEM_DEVELOPMENT_PHASES.includes(phase))return send(res,400,{error:'Choose Active, Waiting for input, or Complete.'});
    if(phase!==existing.phase){
     const allowed={work:['review'],review:['work','completed'],completed:['work']};
     if(!allowed[existing.phase]?.includes(phase))return send(res,400,{error:'That workflow move is not available from this stage.'});
     if(phase==='completed')status='Complete';
     if(phase==='work'&&existing.phase==='completed')status='In progress';
    }
     const focusItem=input.focusItem===undefined?!!existing.focus_item:input.focusItem===true;
     const checklistComplete=Boolean(checklist?.length&&checklist.every(step=>step.checked));
      if(title.length<2||title.length>160||details===null||details.length>4000||!checklist||!SYSTEM_DEVELOPMENT_STATUSES.includes(status)||phase==='work'&&!SYSTEM_DEVELOPMENT_WORK_STATUSES.includes(status)||!taskDateIsValid(targetDate)||ownerUserId&&!db.prepare('SELECT 1 FROM system_development_project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND pm.user_id=? AND u.active=1').get(existing.project_id,ownerUserId))return send(res,400,{error:'Choose an owner who has access to this project, and check the work item, checklist, status, and target date.'});
    const now=new Date().toISOString();
     db.prepare('UPDATE system_development_items SET title=?,details=?,checklist_json=?,status=?,owner_user_id=?,target_date=?,company_id=?,focus_item=?,phase=?,updated_at=? WHERE id=?').run(title,details,JSON.stringify(checklist),status,ownerUserId,targetDate,companyId,focusItem?1:0,phase,now,id);
    const changes=[];
    if(phase!==existing.phase)changes.push(phase==='review'?'Moved to Waiting for input':phase==='completed'?'Moved to Complete':existing.phase==='completed'?'Reopened':'Returned to Active');
    if(companyId!==existing.company_id)changes.push(company?'Company linked: '+company.name:'Company link removed');
    if(status!==existing.status)changes.push('Work status changed to '+status);
    if(title!==existing.title)changes.push('Title updated');
    if(details!==existing.details)changes.push('Details updated');
    if(JSON.stringify(checklist)!==JSON.stringify(previousChecklist))changes.push('Checklist updated');
    if(ownerUserId!==existing.owner_user_id)changes.push('Owner updated');
    if(targetDate!==existing.target_date)changes.push('Target date updated');
     if(focusItem!==!!existing.focus_item)changes.push(focusItem?'Marked as a team priority':'Team priority removed');
    if(changes.length)db.prepare('INSERT INTO system_development_events(id,item_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,changes.join(' · '),now);
      if(changes.length&&existing.project_id){db.prepare('UPDATE system_development_projects SET updated_at=? WHERE id=?').run(now,existing.project_id);addDevelopmentNotification(existing.project_id,id,user.id,'Work item updated',`${title} · ${changes.join(' · ')}`,'development');}
      return send(res,200,{id,projectId:existing.project_id,kind:existing.kind,title,details,checklist,status,phase,focusItem,companyId,companyName:company?.name||null,ownerUserId,ownerName:ownerUserId?db.prepare('SELECT name FROM users WHERE id=?').get(ownerUserId)?.name:null,targetDate,createdByName:db.prepare('SELECT name FROM users WHERE id=?').get(existing.created_by)?.name,createdAt:existing.created_at,updatedAt:now});
   }   if(!user.activeCompanyId)return send(res,403,{error:'Choose an authorized company portal before opening company records.'});
   const activeCompany=db.prepare('SELECT parent_id FROM companies WHERE id=?').get(user.activeCompanyId||'');
   if(user.activeCompanyId&&activeCompany?.parent_id){
    const foundationRoute=req.method==='GET'&&(url.pathname==='/api/company-dashboard'||url.pathname==='/api/company-users'||url.pathname==='/api/companies'||url.pathname==='/api/tasks'||url.pathname==='/api/tasks/assignees'||url.pathname==='/api/work-items'||url.pathname==='/api/project-requests'||url.pathname==='/api/search'||/^\/api\/project-requests\/[^/]+$/.test(url.pathname)||/^\/api\/tasks\/[^/]+$/.test(url.pathname)||/^\/api\/companies\/[^/]+$/.test(url.pathname)||/^\/api\/companies\/[^/]+\/activities$/.test(url.pathname)||url.pathname==='/api/calendar'||/^\/api\/calendar\/events\/[^/]+$/.test(url.pathname))
      ||url.pathname==='/api/tasks'&&req.method==='POST'
      ||/^\/api\/tasks\/[^/]+$/.test(url.pathname)&&req.method==='PATCH'
     ||url.pathname==='/api/company-users'&&['POST'].includes(req.method)
     ||/^\/api\/company-users\/[^/]+(?:\/reset-password)?$/.test(url.pathname)&&['PATCH','POST'].includes(req.method)
      ||/^\/api\/calendar\/events(?:\/[^/]+)?$/.test(url.pathname)&&['POST','PATCH','DELETE'].includes(req.method)
      ||/^\/api\/calendar\/events\/[^/]+\/cancellation$/.test(url.pathname)&&req.method==='POST'
      ||/^\/api\/calendar\/events\/[^/]+\/rsvp$/.test(url.pathname)&&req.method==='POST'
     ||/^\/api\/companies\/[^/]+\/reception-intakes$/.test(url.pathname)&&['GET','POST'].includes(req.method)
     ||/^\/api\/companies\/[^/]+\/reception-config$/.test(url.pathname)&&['GET','PATCH'].includes(req.method)
     ||/^\/api\/reception-intakes\/[^/]+$/.test(url.pathname)&&req.method==='PATCH'
     ||/^\/api\/reception-intakes\/[^/]+\/(?:events|follow-up\/(?:complete|reopen)|reopen|create-task)$/.test(url.pathname)&&req.method==='POST'
     ||/^\/api\/reception-intakes\/[^/]+\/documents$/.test(url.pathname)&&['GET','POST'].includes(req.method)
     ||/^\/api\/reception-intakes\/[^/]+\/documents\/[^/]+\/download$/.test(url.pathname)&&req.method==='GET'
     ||/^\/api\/reception-intakes\/[^/]+\/documents\/[^/]+$/.test(url.pathname)&&req.method==='DELETE';
    if(!foundationRoute)return send(res,404,{error:'This module is not available in the company portal foundation.'});
   }
   if(req.method==='GET'&&url.pathname==='/api/search'){
    const query=String(url.searchParams.get('q')||'').trim().slice(0,200),terms=query.toLocaleLowerCase().split(/\s+/).filter(Boolean),companyIds=userCompanyIds(user);
    if(!companyIds.length)return send(res,200,{results:[],total:0,page:1,pageSize:10,counts:{},companies:[],owners:[],statuses:[]});
    const marks=companyIds.map(()=>'?').join(','),records=[];
    const addRecord=(kind,row,values)=>records.push({kind,id:row.id,title:values.title||'',summary:values.summary||'',companyId:values.companyId||null,companyName:values.companyName||'',ownerId:values.ownerId||'',owner:values.owner||'',status:values.status||'',updatedAt:values.updatedAt||'',dueAt:values.dueAt||'',url:values.url||'',searchText:[values.title,values.summary,values.companyName,values.owner,values.status,...(values.search||[])].filter(Boolean).join(' ').toLocaleLowerCase()});
    for(const row of db.prepare(`SELECT * FROM companies WHERE id IN (${marks}) ORDER BY name`).all(...companyIds))addRecord('company',row,{title:row.name,summary:[row.industry,row.location,row.description].filter(Boolean).join(' · '),companyId:row.id,companyName:row.name,owner:row.owner,status:row.status,updatedAt:row.updated_at,search:[row.legal_name,row.type]});
    for(const row of db.prepare(`SELECT t.*,c.name AS company_name,a.name AS assignee_name,creator.name AS creator_name FROM tasks t JOIN companies c ON c.id=t.company_id LEFT JOIN users a ON a.id=t.assignee_user_id JOIN users creator ON creator.id=t.created_by WHERE t.company_id IN (${marks}) ORDER BY t.updated_at DESC`).all(...companyIds))addRecord('task',row,{title:row.title,summary:row.description,companyId:row.company_id,companyName:row.company_name,ownerId:row.assignee_user_id||row.created_by,owner:row.assignee_name||row.creator_name,status:row.status,updatedAt:row.updated_at,dueAt:row.due_date,search:[row.priority]});
    for(const row of db.prepare(`SELECT e.*,c.name AS company_name,cl.name AS client_name,u.name AS creator_name FROM calendar_events e JOIN companies c ON c.id=e.company_id LEFT JOIN clients cl ON cl.id=e.client_id JOIN users u ON u.id=e.created_by WHERE e.company_id IN (${marks}) AND e.event_type='event' ORDER BY e.updated_at DESC`).all(...companyIds))addRecord('calendar',row,{title:row.title,summary:[row.client_name,row.location,row.description].filter(Boolean).join(' · '),companyId:row.company_id,companyName:row.company_name,clientId:row.client_id||'',clientName:row.client_name||'',ownerId:row.created_by,owner:row.creator_name,status:row.status==='canceled'?'Canceled':'Scheduled',updatedAt:row.updated_at,dueAt:row.starts_at,search:[row.client_name,row.location,row.description,row.starts_at,row.ends_at]});
    for(const row of db.prepare(`SELECT i.*,c.name AS company_name,a.name AS assignee_name,u.name AS creator_name,o.source_record_id AS origin_source_record_id FROM reception_intakes i JOIN companies c ON c.id=i.company_id LEFT JOIN users a ON a.id=i.assignee_user_id JOIN users u ON u.id=i.created_by LEFT JOIN reception_intake_origins o ON o.intake_id=i.id WHERE i.company_id IN (${marks}) ORDER BY i.updated_at DESC`).all(...companyIds))addRecord('intake',row,{title:row.company_id===ACCOUNTING_COMPANY_ID?row.organization_name||row.contact_name:row.contact_name,summary:[row.company_id===ACCOUNTING_COMPANY_ID?row.organization_name:'',row.request_type,row.summary,row.next_action,row.email,row.phone].filter(Boolean).join(' · '),companyId:row.company_id,companyName:row.company_name,ownerId:row.assignee_user_id||row.created_by,owner:row.assignee_name||row.creator_name,status:row.status,updatedAt:row.updated_at,dueAt:row.next_action_date,search:[row.organization_name,row.contact_name,row.source,row.request_type,row.email,row.phone,row.next_action,row.origin_source_record_id]});
    for(const row of db.prepare(`SELECT d.*,c.name AS company_name,u.name AS uploader FROM company_documents d JOIN companies c ON c.id=d.company_id JOIN users u ON u.id=d.uploaded_by WHERE d.company_id IN (${marks}) ORDER BY d.created_at DESC`).all(...companyIds))addRecord('document',row,{title:row.original_name,summary:[row.category,row.description].filter(Boolean).join(' · '),companyId:row.company_id,companyName:row.company_name,ownerId:row.uploaded_by,owner:row.uploader,status:row.category,updatedAt:row.created_at,search:[row.original_name,row.category,row.description],url:`/api/documents/${encodeURIComponent(row.id)}/download`});
    for(const row of db.prepare(`SELECT n.*,c.name AS company_name,u.name AS author_name FROM company_notes n JOIN companies c ON c.id=n.company_id LEFT JOIN users u ON u.id=COALESCE(n.updated_by,n.created_by) WHERE n.company_id IN (${marks}) ORDER BY n.updated_at DESC`).all(...companyIds))addRecord('note',row,{title:row.title,summary:[row.category,row.body].filter(Boolean).join(' · '),companyId:row.company_id,companyName:row.company_name,ownerId:row.updated_by||row.created_by,owner:row.author_name,status:row.category,updatedAt:row.updated_at,search:[row.category,row.body]});
    for(const row of db.prepare(`SELECT u.id,u.name,GROUP_CONCAT(DISTINCT c.id) AS company_ids,GROUP_CONCAT(DISTINCT c.name) AS company_names,MAX(m.company_id) AS company_id,CASE WHEN u.role='admin' THEN 'Platform administrator' ELSE COALESCE(MAX(m.role),'Member') END AS member_role FROM users u JOIN memberships m ON m.user_id=u.id AND m.active=1 JOIN companies c ON c.id=m.company_id WHERE u.active=1 AND m.company_id IN (${marks}) AND (u.directory_visible=1 OR u.id=? OR u.role='admin') GROUP BY u.id ORDER BY u.name`).all(...companyIds,user.id))addRecord('person',row,{title:row.name,summary:[row.member_role,'Team member'].filter(Boolean).join(' · '),companyId:row.company_id,companyName:row.company_names,owner:row.name,status:'Active',updatedAt:'',search:[row.company_names,row.member_role]});
    const searchSettings=getPortalSettings(),matching=records.filter(item=>terms.every(term=>item.searchText.includes(term))).filter(item=>item.kind!=='person'||searchSettings.workspaceTeammates).filter(item=>item.kind!=='task'||searchSettings.workspaceTasks).filter(item=>item.kind!=='calendar'||searchSettings.workspaceCalendar).filter(item=>item.kind!=='intake'||searchSettings.workspaceReception);
    const companyFilter=url.searchParams.get('company')||'',statusFilter=(url.searchParams.get('status')||'').toLocaleLowerCase(),ownerFilter=url.searchParams.get('owner')||'',updatedFilter=url.searchParams.get('updated')||'',typeFilterPresent=url.searchParams.has('types'),typeValues=(url.searchParams.get('types')||'').split(',').filter(value=>['company','task','calendar','intake','document','note','person'].includes(value)),now=Date.now(),cutoff=updatedFilter==='7'?now-7*86400000:updatedFilter==='30'?now-30*86400000:0;
    const filtered=matching.filter(item=>(!companyFilter||item.companyId===companyFilter)&&(!statusFilter||item.status.toLocaleLowerCase()===statusFilter)&&(!ownerFilter||item.owner===ownerFilter)&&(!cutoff||Date.parse(item.updatedAt||0)>=cutoff));
    const categoryKinds={companies:['company'],tasks:['task'],calendar:['calendar'],intake:['intake'],documents:['document','note'],people:['person']},counts={};for(const [category,kinds] of Object.entries(categoryKinds))counts[category]=filtered.filter(item=>kinds.includes(item.kind)).length;
    const selected=typeFilterPresent?(typeValues.length?filtered.filter(item=>typeValues.includes(item.kind)):[]):filtered,owners=[...new Set(matching.map(item=>item.owner).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),statuses=[...new Set(matching.map(item=>item.status).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),companies=db.prepare(`SELECT id,name FROM companies WHERE id IN (${marks}) ORDER BY name`).all(...companyIds);
    const score=item=>{const title=item.title.toLocaleLowerCase();if(title===query.toLocaleLowerCase())return 0;if(title.startsWith(terms[0]))return 1;if(terms.every(term=>title.includes(term)))return 2;return 3;},sort=url.searchParams.get('sort')||'relevance';
    selected.sort((a,b)=>sort==='updated'?Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0):sort==='oldest'?Date.parse(a.updatedAt||0)-Date.parse(b.updatedAt||0):sort==='title'?a.title.localeCompare(b.title):score(a)-score(b)||Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0)||a.title.localeCompare(b.title));
    const page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get('page')||'1',10)||1)),pageSize=10,total=selected.length,results=selected.slice((page-1)*pageSize,page*pageSize).map(({searchText,...item})=>item);
    return send(res,200,{results,total,page,pageSize,counts,companies,owners:owners.filter(Boolean),statuses});
   }
   if(req.method==='GET'&&url.pathname==='/api/company-dashboard'){
    const companyId=user.activeCompanyId;if(!companyId||!userCompanyIds(user).includes(companyId))return send(res,403,{error:'Choose a company portal you can access.'});
    const now=new Date().toISOString(),companyTimeZone=db.prepare('SELECT time_zone FROM companies WHERE id=?').get(companyId)?.time_zone||'UTC',todayParts=timeZoneParts(Date.now(),companyTimeZone),today=`${todayParts.year}-${String(todayParts.month).padStart(2,'0')}-${String(todayParts.day).padStart(2,'0')}`,week=new Date(Date.now()+7*86400000).toISOString(),intake=db.prepare('SELECT COUNT(*) AS total,SUM(CASE WHEN status<>\'Closed\' THEN 1 ELSE 0 END) AS open,SUM(CASE WHEN next_action_date IS NOT NULL AND next_action_date<=? AND next_action<>\'\' AND follow_up_completed_at IS NULL AND linked_task_id IS NULL AND status<>\'Closed\' THEN 1 ELSE 0 END) AS followups FROM reception_intakes WHERE company_id=?').get(today,companyId),upcoming=db.prepare("SELECT COUNT(*) AS total FROM calendar_events WHERE company_id=? AND event_type='event' AND status<>'canceled' AND starts_at>=? AND starts_at<?").get(companyId,now,week).total,members=db.prepare('SELECT COUNT(*) AS total FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND m.active=1 AND u.active=1').get(companyId).total;
    const settings=getPortalSettings(),mayViewActivity=user.role==='admin';return send(res,200,{companyId,counts:{intakes:settings.workspaceReception?(intake.total||0):0,openIntakes:settings.workspaceReception?(intake.open||0):0,followupsDue:settings.workspaceReception?(intake.followups||0):0,upcomingEvents:settings.workspaceCalendar?upcoming:0,teamMembers:members},recentActivity:mayViewActivity&&settings.workspaceActivity?listCompanyActivity(companyId,8):[]});
   }
   if(url.pathname==='/api/company-users'){
    const companyId=user.activeCompanyId;if(!companyId||!userCompanyIds(user).includes(companyId))return send(res,403,{error:'Choose a company portal you can access.'});
    if(req.method==='GET'){
     const rows=db.prepare("SELECT u.id,u.name,u.email,u.active AS user_active,u.must_change_password,u.created_at,u.role AS platform_role,m.role,m.active AS membership_active FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE m.user_id IS NOT NULL OR u.role='admin' ORDER BY u.name").all(companyId);
     const mayManage=canManageCompany(user,companyId);return send(res,200,rows.map(row=>{const isPlatformAdmin=row.platform_role==='admin',accountActive=!!row.user_active,membershipActive=isPlatformAdmin||!!row.membership_active;return{id:row.id,name:row.name,email:mayManage?row.email:null,role:'member',active:accountActive&&membershipActive,accountActive,membershipActive,mustChangePassword:!!row.must_change_password,createdAt:row.created_at,isPlatformAdmin};}));
    }
    if(req.method==='POST'){
     if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required.'});
     const input=await bodyJson(req,16000),name=String(input.name||'').trim(),email=String(input.email||'').trim().toLowerCase(),role='member';
     if(name.length<2||!/^(\S+)@(\S+)\.(\S+)$/.test(email)||input.role!==undefined&&input.role!=='member')return send(res,400,{error:'Enter a name and valid work email. Company access is for members.'});
     const existing=db.prepare('SELECT id,name,active,role FROM users WHERE email=?').get(email);if(existing&&existing.active!==1)return send(res,409,{error:'This account is inactive. Ask a platform administrator to reactivate it first.'});if(existing?.role==='admin')return send(res,409,{error:'This person already has platform administrator access.'});
      const id=existing?.id||randomUUID(),temporaryPassword=existing?null:randomBytes(18).toString('base64url'),passwordHash=existing?null:await hashPassword(temporaryPassword),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
      try{if(!existing)db.prepare("INSERT INTO users(id,name,email,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?, 'member',1,?)").run(id,name,email,passwordHash,now);db.prepare("INSERT INTO memberships(user_id,company_id,role,active) VALUES(?,?,'member',1) ON CONFLICT(user_id,company_id) DO UPDATE SET role='member',active=1").run(id,companyId);db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'An account already exists for this email.'});throw error;}
     ensureUserCalendarColors();
     addActivity(existing?'Company access granted':'Company team member added',`${name} · member access added by ${user.name}`,'user',companyId);
     return send(res,201,{id,name:existing?.name||name,email,role,active:true,mustChangePassword:!existing,temporaryPassword,existingAccount:!!existing});
    }
   }
   const companyUserMatch=url.pathname.match(/^\/api\/company-users\/([^/]+)$/);
   if(companyUserMatch&&req.method==='PATCH'){
    const companyId=user.activeCompanyId,targetId=decodeURIComponent(companyUserMatch[1]);if(!companyId||!userCompanyIds(user).includes(companyId))return send(res,403,{error:'Choose a company portal you can access.'});if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required.'});
    const membership=db.prepare('SELECT m.role,m.active,u.name,u.role AS platform_role,u.active AS user_active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.company_id=?').get(targetId,companyId);if(!membership)return send(res,404,{error:'Company user not found.'});if(membership.platform_role==='admin')return send(res,403,{error:'Platform administrators are managed centrally.'});
    const input=await bodyJson(req,4096),nextRole=input.role===undefined?membership.role:String(input.role),nextActive=input.active===undefined?!!membership.active:input.active;if(nextRole!=='member'||typeof nextActive!=='boolean')return send(res,400,{error:'Company access can only be set to member.'});if(!membership.user_active&&nextActive)return send(res,400,{error:'Ask a platform administrator to reactivate this account first.'});if(targetId===user.id&&!nextActive)return send(res,400,{error:'You cannot remove your own company access.'});
    
    db.prepare("UPDATE memberships SET role='member',active=? WHERE user_id=? AND company_id=?").run(nextActive?1:0,targetId,companyId);if(!nextActive)db.prepare('DELETE FROM sessions WHERE user_id=? AND company_id=?').run(targetId,companyId);addActivity('Company access updated',`${membership.name} · ${nextActive?'member access restored':'access removed'} by ${user.name}`,'user',companyId);
    return send(res,200,{id:targetId,role:nextRole,active:nextActive});
   }
   const companyUserResetMatch=url.pathname.match(/^\/api\/company-users\/([^/]+)\/reset-password$/);
   if(companyUserResetMatch&&req.method==='POST'){
    const companyId=user.activeCompanyId,targetId=decodeURIComponent(companyUserResetMatch[1]);if(!companyId||!userCompanyIds(user).includes(companyId))return send(res,403,{error:'Choose a company portal you can access.'});if(user.role!=='admin')return send(res,403,{error:'Shared account password resets are managed by a platform administrator.'});
    const target=db.prepare('SELECT u.id,u.name,u.active,m.active AS membership_active FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.company_id=?').get(targetId,companyId);if(!target)return send(res,404,{error:'Company user not found.'});if(!target.active||!target.membership_active)return send(res,400,{error:'Restore company access before resetting this password.'});if(target.id===user.id)return send(res,400,{error:'Use your account settings to change your own password.'});
     const temporaryPassword=randomBytes(18).toString('base64url'),passwordHash=await hashPassword(temporaryPassword);db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(passwordHash,targetId);db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);addActivity('Company user password reset',`${target.name} · temporary password issued by ${user.name}`,'user',companyId);return send(res,200,{id:target.id,name:target.name,temporaryPassword,mustChangePassword:true});
   }
   if(req.method==='GET'&&url.pathname==='/api/calendar'){
     const from=calendarTimestamp(url.searchParams.get('from')||''),to=calendarTimestamp(url.searchParams.get('to')||''),fromDate=url.searchParams.get('fromDate')||'',toDate=url.searchParams.get('toDate')||'';
    if(!from||!to||Date.parse(to)<=Date.parse(from)||!validDateRange(fromDate,toDate))return send(res,400,{error:'Choose a calendar date range under one year.'});
     const accessibleCompanyIds=userCompanyIds(user),requestedCompanyId=url.searchParams.get('companyId');
     if(requestedCompanyId&&!accessibleCompanyIds.includes(requestedCompanyId))return send(res,404,{error:'That company calendar was not found.'});
     const companyIds=requestedCompanyId?[requestedCompanyId]:accessibleCompanyIds,permissionScope=getCalendarPermissionScope(user,accessibleCompanyIds);
    if(!companyIds.length)return send(res,200,{companies:[],people:[],events:[]});
    const companyPlaceholders=companyIds.map(()=>'?').join(','),companies=db.prepare(`SELECT id,name,time_zone AS timeZone FROM companies WHERE id IN (${companyPlaceholders}) ORDER BY name`).all(...companyIds);
    const people=db.prepare(`SELECT u.id,u.name,u.calendar_color AS calendarColor,CASE WHEN u.role='admin' THEN 'Platform administrator' ELSE COALESCE(MAX(m.role),'member') END AS role,GROUP_CONCAT(DISTINCT m.company_id) AS company_ids FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.active=1 AND m.company_id IN (${companyPlaceholders}) WHERE u.active=1 AND (u.id=? OR m.user_id IS NOT NULL OR u.role='admin') GROUP BY u.id ORDER BY u.name`).all(...companyIds,user.id);
     const events=db.prepare(`SELECT e.*,c.name AS company_name,cl.name AS client_name,u.name AS created_by_name,u.calendar_color AS created_by_calendar_color,canceler.name AS canceled_by_name FROM calendar_events e JOIN companies c ON c.id=e.company_id LEFT JOIN clients cl ON cl.id=e.client_id JOIN users u ON u.id=e.created_by LEFT JOIN users canceler ON canceler.id=e.canceled_by WHERE e.company_id IN (${companyPlaceholders}) AND ((e.all_day=1 AND e.start_date<? AND e.end_date>?) OR (e.all_day=0 AND e.starts_at<? AND e.ends_at>?)) ORDER BY e.starts_at LIMIT 1000`).all(...companyIds,toDate,fromDate,to,from);
    const attendeeIndex=calendarEventAttendeeIndex(events),externalIndex=calendarExternalAttendeeIndex(events);
     return send(res,200,{companies:companies.map(company=>({...company,canManageClients:canManageCompany(user,company.id,permissionScope.rootCompanyId)})),people:people.map(person=>({...person,calendarColor:CALENDAR_USER_COLORS.includes(person.calendarColor)?person.calendarColor:'gold',companyIds:person.company_ids?person.company_ids.split(','):[]})),events:events.map(event=>mapCalendarEvent(event,attendeeIndex,externalIndex,user,permissionScope))});
   }
   if(req.method==='POST'&&url.pathname==='/api/calendar/events'){
     const input=await bodyJson(req,30000),eventType=String(input.eventType||'event'),title=typeof input.title==='string'?input.title.trim():'',requestedAllDay=input.allDay===true,rootId=db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id,organizationCalendar=user.role==='admin'&&user.activeCompanyId===rootId,requestedCompanyId=typeof input.companyId==='string'?input.companyId.trim():'',companyId=organizationCalendar?requestedCompanyId:user.activeCompanyId,accessibleCompanyIds=userCompanyIds(user),location=eventType==='event'?(typeof input.location==='string'?input.location.trim():null):'',description=eventType==='event'?(typeof input.description==='string'?input.description.trim():null):'',locationType=String(input.locationType||'On-site'),meetingType=String(input.meetingType||'Other'),attendeeIds=eventType==='event'?calendarAttendeeIds(input.attendeeIds):[],externalAttendees=eventType==='event'?normalizeExternalCalendarAttendees(input.externalAttendees===undefined?[]:input.externalAttendees):[],clientIdInvalid=input.clientId!==undefined&&input.clientId!==null&&typeof input.clientId!=='string',clientId=eventType==='event'&&typeof input.clientId==='string'?input.clientId.trim():'';
    if(typeof input.allDay!=='undefined'&&typeof input.allDay!=='boolean')return send(res,400,{error:'Choose whether the event lasts all day.'});
    if(!['event','lunch','unavailable'].includes(eventType))return send(res,400,{error:'Choose a valid calendar item type.'});
    if(!companyId||!accessibleCompanyIds.includes(companyId)||!db.prepare("SELECT 1 FROM companies WHERE id=? AND status<>'Inactive'").get(companyId)||!organizationCalendar&&input.companyId&&input.companyId!==companyId)return send(res,403,{error:'Choose an active company calendar you can access.'});
     if(clientIdInvalid||eventType!=='event'&&clientId)return send(res,400,{error:'Choose a valid client for this calendar event.'});
     if(clientId&&!db.prepare('SELECT 1 FROM clients WHERE id=? AND company_id=?').get(clientId,companyId))return send(res,400,{error:'Choose a client from the selected company.'});
    const permissionScope=getCalendarPermissionScope(user,accessibleCompanyIds);
    const eventTitle=eventType==='lunch'?'Lunch Break':eventType==='unavailable'?'Time Off':title,allDay=eventType==='unavailable'?true:eventType==='lunch'?false:requestedAllDay;
    if(eventType==='event'&&(!eventTitle||eventTitle.length>160))return send(res,400,{error:'Enter an event title of 1 to 160 characters.'});
    const company=db.prepare('SELECT time_zone FROM companies WHERE id=?').get(companyId),timeZone=input.timeZone===undefined?company?.time_zone:validTimeZone(input.timeZone);if(!timeZone)return send(res,400,{error:'Choose a valid IANA time zone.'});
     const startDate=input.startDate,endDate=input.endDate,calendarTodayParts=timeZoneParts(Date.now(),validTimeZone(user.timeZone)||'America/New_York'),calendarToday=String(calendarTodayParts.year).padStart(4,'0')+'-'+String(calendarTodayParts.month).padStart(2,'0')+'-'+String(calendarTodayParts.day).padStart(2,'0');let startsAt,endsAt,startDateStored=null,endDateStored=null;
     if(validCalendarDate(startDate)&&startDate<calendarToday)return send(res,400,{error:'New calendar items can only be scheduled for today or a future date.'});
    if(eventType==='lunch'&&(!validCalendarDate(startDate)||endDate!==startDate))return send(res,400,{error:'A lunch break must start and end on the same date.'});
    if(allDay){if(!validCalendarDate(startDate)||!validCalendarDate(endDate)||endDate<startDate)return send(res,400,{error:'Choose an end date on or after the start date.'});startDateStored=startDate;endDateStored=addCalendarDays(endDate,1);startsAt=startDateStored+'T00:00:00.000Z';endsAt=endDateStored+'T00:00:00.000Z';}
    else{startsAt=zonedDateTimeToIso(startDate,input.startTime,timeZone);endsAt=zonedDateTimeToIso(endDate,input.endTime,timeZone);if(!startsAt||!endsAt)return send(res,400,{error:'Choose valid local times. The selected time may not exist because of a daylight-saving change.'});}
    if(Date.parse(endsAt)<=Date.parse(startsAt))return send(res,400,{error:'Choose an end time after the start time.'});
    if(location===null||location.length>200||description===null||description.length>3000)return send(res,400,{error:'Keep location within 200 characters and event details under 3,000 characters.'});
    if(!attendeeIds)return send(res,400,{error:'Choose up to 50 valid invitees.'});
    if(!externalAttendees)return send(res,400,{error:'Enter up to 25 external invitees with valid email addresses.'});
    if(!CALENDAR_LOCATION_TYPES.includes(locationType)||!CALENDAR_MEETING_TYPES.includes(meetingType))return send(res,400,{error:'Choose a valid meeting location and meeting type.'});
    const allAttendeeIds=eventType==='event'?[...new Set([...attendeeIds,user.id])]:[user.id];
    if(allAttendeeIds.length){const active=db.prepare("SELECT u.id FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE u.active=1 AND (u.id=? OR u.role='admin' OR m.active=1) AND u.id IN ("+allAttendeeIds.map(()=>'?').join(',')+")").all(companyId,user.id,...allAttendeeIds);if(active.length!==allAttendeeIds.length)return send(res,400,{error:'One or more selected invitees are not members of this company.'});}
    const id=randomUUID(),now=new Date().toISOString(),companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name||'Company';db.exec('BEGIN IMMEDIATE');
    let inviteRecipients=[];try{db.prepare('INSERT INTO calendar_events(id,title,starts_at,ends_at,all_day,company_id,location,description,color,created_by,created_at,updated_at,time_zone,start_date,end_date,location_type,meeting_type,event_type,client_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,eventTitle,startsAt,endsAt,allDay?1:0,companyId,location,description,'gold',user.id,now,now,timeZone,startDateStored,endDateStored,locationType,meetingType,eventType,clientId||null);replaceCalendarEventAttendees(id,allAttendeeIds,now);inviteRecipients=replaceCalendarExternalAttendees(id,externalAttendees,now);addActivity(eventType==='event'?'Calendar event created':'Calendar availability block created',companyName+' · '+eventTitle+' created by '+user.name,'update',companyId);addCalendarNotification(id,user.id,'Calendar event created',eventTitle,allAttendeeIds);db.exec('COMMIT');}
    catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    const eventRow=getCalendarEventRow(id),inviteDelivery=queueCalendarNotifications(eventRow,inviteRecipients),attendeeIndex=calendarEventAttendeeIndex([eventRow]),externalIndex=calendarExternalAttendeeIndex([eventRow]);
    broadcastCompanyUpdate(companyId,['calendar','work-items','notifications'],requestClientId(req),user.id);
    return send(res,201,{event:mapCalendarEvent(eventRow,attendeeIndex,externalIndex,user,permissionScope),inviteDelivery});
   }
const calendarRsvpMatch=url.pathname.match(/^\/api\/calendar\/events\/([^/]+)\/rsvp$/);
   if(calendarRsvpMatch&&req.method==='POST'){
     const id=decodeURIComponent(calendarRsvpMatch[1]),event=db.prepare('SELECT id,company_id,created_by,title,status FROM calendar_events WHERE id=?').get(id);if(!event||!userCompanyIds(user).includes(event.company_id))return send(res,404,{error:'Calendar event not found.'});if(event.created_by!==user.id&&!db.prepare('SELECT 1 FROM calendar_event_attendees WHERE event_id=? AND user_id=?').get(id,user.id))return send(res,403,{error:'You are not invited to this calendar event.'});if(event.status==='canceled')return send(res,409,{error:'This event was canceled. Responses are closed.'});const input=await bodyJson(req,4096),response=String(input.response||'');if(!['accepted','maybe','declined'].includes(response))return send(res,400,{error:'Choose accept, maybe, or decline.'});const now=new Date().toISOString();db.prepare("INSERT INTO calendar_event_attendees(event_id,user_id,created_at,response,responded_at) VALUES(?,?,?,'awaiting',NULL) ON CONFLICT(event_id,user_id) DO NOTHING").run(id,user.id,now);db.prepare('UPDATE calendar_event_attendees SET response=?,responded_at=? WHERE event_id=? AND user_id=?').run(response,now,id,user.id);addActivity('Calendar response updated',`${user.name} ${response} the invitation to ${event.title}`,'update',event.company_id);broadcastCompanyUpdate(event.company_id,['calendar'],requestClientId(req),user.id);return send(res,200,{response});
   }
    const calendarEventDetailMatch=url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/);
    if(calendarEventDetailMatch&&req.method==='GET'){
     const id=decodeURIComponent(calendarEventDetailMatch[1]),event=getCalendarEventRow(id),permissionScope=getCalendarPermissionScope(user);
     if(!event||!calendarEventInCurrentScope(user,event,permissionScope))return send(res,404,{error:'Calendar event not found.'});
     const attendeeIndex=calendarEventAttendeeIndex([event]),externalIndex=calendarExternalAttendeeIndex([event]);
     return send(res,200,{event:mapCalendarEvent(event,attendeeIndex,externalIndex,user,permissionScope)});
    }
    const calendarCancellationMatch=url.pathname.match(/^\/api\/calendar\/events\/([^/]+)\/cancellation$/);
    if(calendarCancellationMatch&&req.method==='POST'){
     const id=decodeURIComponent(calendarCancellationMatch[1]),existing=getCalendarEventRow(id),permissionScope=getCalendarPermissionScope(user);if(!existing||!calendarEventInCurrentScope(user,existing,permissionScope))return send(res,404,{error:'Calendar event not found.'});if(!canManageCalendarEvent(user,existing,permissionScope))return send(res,403,{error:'Only the event creator or a platform administrator can change this event.'});
     const input=await bodyJson(req,4096);if(input.expectedUpdatedAt!==undefined&&input.expectedUpdatedAt!==existing.updated_at)return send(res,409,{error:'This calendar item changed while it was open. Your changes are still on screen. Close it and reopen the latest version before trying again.'});if(typeof input.canceled!=='boolean')return send(res,400,{error:'Choose whether this event is canceled.'});const nextStatus=input.canceled?'canceled':'scheduled';
     if((existing.status||'scheduled')===nextStatus){const attendeeIndex=calendarEventAttendeeIndex([existing]),externalIndex=calendarExternalAttendeeIndex([existing]);return send(res,200,{event:mapCalendarEvent(existing,attendeeIndex,externalIndex,user,permissionScope)});}
     const now=nextUpdateTimestamp(existing.updated_at),companyName=existing.company_name||'Company';db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE calendar_events SET status=?,canceled_at=?,canceled_by=?,updated_at=? WHERE id=?').run(nextStatus,input.canceled?now:null,input.canceled?user.id:null,now,id);addActivity(input.canceled?'Calendar event canceled':'Calendar event reinstated',`${companyName} · ${existing.title} ${input.canceled?'canceled':'reinstated'} by ${user.name}`,'update',existing.company_id);addCalendarNotification(id,user.id,input.canceled?'Calendar event canceled':'Calendar event reinstated',existing.title);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     const eventRow=getCalendarEventRow(id),attendeeIndex=calendarEventAttendeeIndex([eventRow]),externalIndex=calendarExternalAttendeeIndex([eventRow]);broadcastCompanyUpdate(existing.company_id,['calendar','work-items','notifications'],requestClientId(req),user.id);return send(res,200,{event:mapCalendarEvent(eventRow,attendeeIndex,externalIndex,user,permissionScope)});
    }
    const calendarEventMatch=url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/);
   if(calendarEventMatch&&req.method==='PATCH'){
    const id=decodeURIComponent(calendarEventMatch[1]),existing=getCalendarEventRow(id),permissionScope=getCalendarPermissionScope(user);if(!existing||!calendarEventInCurrentScope(user,existing,permissionScope))return send(res,404,{error:'Calendar event not found.'});if(!canManageCalendarEvent(user,existing,permissionScope))return send(res,403,{error:'Only the event creator or a platform administrator can change this event.'});
    const input=await bodyJson(req,30000),eventType=existing.event_type||'event';if(input.expectedUpdatedAt!==undefined&&input.expectedUpdatedAt!==existing.updated_at)return send(res,409,{error:'This calendar item changed while you were editing it. Your changes are still on screen. Close it and reopen the latest version before saving.'});if(input.eventType!==undefined&&input.eventType!==eventType)return send(res,400,{error:'The calendar item type cannot be changed after it is created.'});const clientIdInvalid=input.clientId!==undefined&&input.clientId!==null&&typeof input.clientId!=='string',clientId=eventType==='event'?(input.clientId===undefined?existing.client_id||'':typeof input.clientId==='string'?input.clientId.trim():''):'';if(clientIdInvalid||eventType!=='event'&&input.clientId)return send(res,400,{error:'Choose a valid client for this calendar event.'});const title=eventType==='event'?(input.title===undefined?existing.title:typeof input.title==='string'?input.title.trim():null):eventType==='lunch'?'Lunch Break':'Time Off',allDay=eventType==='unavailable'?true:eventType==='lunch'?false:input.allDay===undefined?!!existing.all_day:input.allDay,companyId=existing.company_id,location=eventType==='event'?(input.location===undefined?existing.location:typeof input.location==='string'?input.location.trim():null):'',description=eventType==='event'?(input.description===undefined?existing.description:typeof input.description==='string'?input.description.trim():null):'',locationType=input.locationType===undefined?existing.location_type||'On-site':String(input.locationType),meetingType=input.meetingType===undefined?existing.meeting_type||'Other':String(input.meetingType),attendeeIds=eventType==='event'?calendarAttendeeIds(input.attendeeIds):[],externalAttendees=eventType==='event'?normalizeExternalCalendarAttendees(input.externalAttendees):[],timeZone=input.timeZone===undefined?(existing.time_zone||'America/New_York'):validTimeZone(input.timeZone);
    if(input.companyId!==undefined&&input.companyId!==companyId)return send(res,403,{error:'Calendar events cannot be moved to another company.'});
    if(clientId&&!db.prepare('SELECT 1 FROM clients WHERE id=? AND company_id=?').get(clientId,companyId))return send(res,400,{error:'Choose a client from the selected company.'});
    if(typeof input.allDay!=='undefined'&&typeof input.allDay!=='boolean')return send(res,400,{error:'Choose whether the event lasts all day.'});
    if(eventType==='event'&&(!title||title.length>160))return send(res,400,{error:'Enter an event title of 1 to 160 characters.'});
    if(!timeZone)return send(res,400,{error:'Choose a valid IANA time zone.'});
    const previousStartParts=timeZoneParts(Date.parse(existing.starts_at),timeZone),previousEndParts=timeZoneParts(Date.parse(existing.ends_at),timeZone),previousStartDate=String(previousStartParts.year).padStart(4,'0')+'-'+String(previousStartParts.month).padStart(2,'0')+'-'+String(previousStartParts.day).padStart(2,'0'),previousEndDate=String(previousEndParts.year).padStart(4,'0')+'-'+String(previousEndParts.month).padStart(2,'0')+'-'+String(previousEndParts.day).padStart(2,'0');
    const startDate=input.startDate===undefined?(existing.all_day&&existing.start_date?existing.start_date:previousStartDate):input.startDate,endDate=input.endDate===undefined?(existing.all_day&&existing.end_date?addCalendarDays(existing.end_date,-1):previousEndDate):input.endDate;
    const startTime=input.startTime===undefined?String(previousStartParts.hour).padStart(2,'0')+':'+String(previousStartParts.minute).padStart(2,'0'):input.startTime,endTime=input.endTime===undefined?String(previousEndParts.hour).padStart(2,'0')+':'+String(previousEndParts.minute).padStart(2,'0'):input.endTime;
    let startsAt,endsAt,startDateStored=null,endDateStored=null;
    if(eventType==='lunch'&&(!validCalendarDate(startDate)||endDate!==startDate))return send(res,400,{error:'A lunch break must start and end on the same date.'});
    if(allDay){if(!validCalendarDate(startDate)||!validCalendarDate(endDate)||endDate<startDate)return send(res,400,{error:'Choose an end date on or after the start date.'});startDateStored=startDate;endDateStored=addCalendarDays(endDate,1);startsAt=startDateStored+'T00:00:00.000Z';endsAt=endDateStored+'T00:00:00.000Z';}
    else{const startUnchanged=!existing.all_day&&timeZone===(existing.time_zone||'America/New_York')&&startDate===previousStartDate&&startTime===String(previousStartParts.hour).padStart(2,'0')+':'+String(previousStartParts.minute).padStart(2,'0'),endUnchanged=!existing.all_day&&timeZone===(existing.time_zone||'America/New_York')&&endDate===previousEndDate&&endTime===String(previousEndParts.hour).padStart(2,'0')+':'+String(previousEndParts.minute).padStart(2,'0');startsAt=startUnchanged?existing.starts_at:zonedDateTimeToIso(startDate,startTime,timeZone);endsAt=endUnchanged?existing.ends_at:zonedDateTimeToIso(endDate,endTime,timeZone);if(!startsAt||!endsAt)return send(res,400,{error:'Choose valid local times. The selected time may not exist because of a daylight-saving change.'});}
    if(Date.parse(endsAt)<=Date.parse(startsAt))return send(res,400,{error:'Choose an end time after the start time.'});
    if(location===null||location.length>200||description===null||description.length>3000)return send(res,400,{error:'Keep location within 200 characters and event details under 3,000 characters.'});
    if(!attendeeIds)return send(res,400,{error:'Choose up to 50 valid invitees.'});
    if(externalAttendees===null)return send(res,400,{error:'Enter up to 25 external invitees with valid email addresses.'});
    if(!CALENDAR_LOCATION_TYPES.includes(locationType)||!CALENDAR_MEETING_TYPES.includes(meetingType))return send(res,400,{error:'Choose a valid meeting location and meeting type.'});
    const allAttendeeIds=eventType==='event'?(input.attendeeIds===undefined?null:[...new Set([...attendeeIds,existing.created_by])]):[existing.created_by];
    if(allAttendeeIds?.length){const active=db.prepare("SELECT u.id FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.company_id=? WHERE u.active=1 AND (u.id=? OR u.role='admin' OR m.active=1) AND u.id IN ("+allAttendeeIds.map(()=>'?').join(',')+")").all(companyId,user.id,...allAttendeeIds);if(active.length!==allAttendeeIds.length)return send(res,400,{error:'One or more selected invitees are not members of this company.'});}
    db.exec('BEGIN IMMEDIATE');const current=getCalendarEventRow(id);if(!current){db.exec('ROLLBACK');return send(res,404,{error:'Calendar event not found.'});}
    const attendeeIdsBefore=db.prepare('SELECT user_id FROM calendar_event_attendees WHERE event_id=? ORDER BY user_id').all(id).map(row=>row.user_id),attendeeIdsAfter=allAttendeeIds?[...allAttendeeIds].sort():null,attendeesChanged=Boolean(attendeeIdsAfter)&&JSON.stringify(attendeeIdsBefore)!==JSON.stringify(attendeeIdsAfter),externalBefore=db.prepare('SELECT name,email,normalized_email FROM calendar_event_external_attendees WHERE event_id=? ORDER BY normalized_email').all(id),externalAfter=(externalAttendees||[]).slice().sort((left,right)=>left.normalizedEmail.localeCompare(right.normalizedEmail)).map(({name,email,normalizedEmail})=>({name,email,normalized_email:normalizedEmail})),externalChanged=externalAttendees!==undefined&&JSON.stringify(externalBefore)!==JSON.stringify(externalAfter),eventFieldsChanged=current.title!==title||current.starts_at!==startsAt||current.ends_at!==endsAt||Boolean(current.all_day)!==allDay||(current.location||'')!==location||(current.description||'')!==description||(current.time_zone||'America/New_York')!==timeZone||(current.start_date||null)!==(startDateStored||null)||(current.end_date||null)!==(endDateStored||null)||(current.location_type||'On-site')!==locationType||(current.meeting_type||'Other')!==meetingType||(current.event_type||'event')!==eventType||(current.client_id||'')!==(clientId||'');
    if(!eventFieldsChanged&&!attendeesChanged&&!externalChanged){db.exec('ROLLBACK');const attendeeIndex=calendarEventAttendeeIndex([current]),externalIndex=calendarExternalAttendeeIndex([current]);return send(res,200,{event:mapCalendarEvent(current,attendeeIndex,externalIndex,user,permissionScope),inviteDelivery:{invitations:0,updates:0,queued:0,suppressed:0}});}
    const now=nextUpdateTimestamp(existing.updated_at),companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name||'Company',guestFacingChanged=calendarGuestFacingDetailsChanged(current,{title,startsAt,endsAt,allDay,startDate:startDateStored,endDate:endDateStored,timeZone,location,locationType,meetingType,description});
    let inviteRecipients=[],updateRecipients=[];try{const updateCandidateIds=guestFacingChanged?db.prepare("SELECT id FROM calendar_event_external_attendees WHERE event_id=? AND email_status='sent'").all(id).map(row=>row.id):[];db.prepare('UPDATE calendar_events SET title=?,starts_at=?,ends_at=?,all_day=?,company_id=?,location=?,description=?,updated_at=?,time_zone=?,start_date=?,end_date=?,location_type=?,meeting_type=?,event_type=?,client_id=? WHERE id=?').run(title,startsAt,endsAt,allDay?1:0,companyId,location,description,now,timeZone,startDateStored,endDateStored,locationType,meetingType,eventType,clientId||null,id);if(current.starts_at!==startsAt||current.ends_at!==endsAt||Boolean(current.all_day)!==allDay)db.prepare('DELETE FROM calendar_event_reminder_deliveries WHERE event_id=?').run(id);if(allAttendeeIds)replaceCalendarEventAttendees(id,allAttendeeIds,now);if(externalAttendees!==undefined)inviteRecipients=replaceCalendarExternalAttendees(id,externalAttendees,now);updateRecipients=calendarExternalUpdateRecipients(id,updateCandidateIds,inviteRecipients,now);addActivity(eventType==='event'?'Calendar event updated':'Calendar availability block updated',companyName+' · '+title+' updated by '+user.name,'update',companyId);addCalendarNotification(id,user.id,'Calendar event updated',title+' · '+calendarNotificationChangeSummary(current,{title,startsAt,endsAt,allDay,timeZone,location,description,locationType,meetingType,eventType,clientId,attendeesChanged,externalChanged}),allAttendeeIds||[]);db.exec('COMMIT');}
    catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    const eventRow=getCalendarEventRow(id),inviteDelivery=queueCalendarNotifications(eventRow,inviteRecipients,updateRecipients),attendeeIndex=calendarEventAttendeeIndex([eventRow]),externalIndex=calendarExternalAttendeeIndex([eventRow]);
    broadcastCompanyUpdate(companyId,['calendar','work-items','notifications'],requestClientId(req),user.id);
    return send(res,200,{event:mapCalendarEvent(eventRow,attendeeIndex,externalIndex,user,permissionScope),inviteDelivery});
   }
if(calendarEventMatch&&req.method==='DELETE'){
    const id=decodeURIComponent(calendarEventMatch[1]),existing=db.prepare('SELECT created_by,company_id,title,updated_at FROM calendar_events WHERE id=?').get(id),permissionScope=getCalendarPermissionScope(user);if(!existing||!calendarEventInCurrentScope(user,existing,permissionScope))return send(res,404,{error:'Calendar event not found.'});if(!canManageCalendarEvent(user,existing,permissionScope))return send(res,403,{error:'Only the event creator or a platform administrator can delete this event.'});
    const deleteInput=await bodyJson(req,4096);if(deleteInput.expectedUpdatedAt!==undefined&&deleteInput.expectedUpdatedAt!==existing.updated_at)return send(res,409,{error:'This calendar item changed while it was open. Your changes are still on screen. Close it and reopen the latest version before trying again.'});const companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(existing.company_id)?.name||'Company';addCalendarNotification(id,user.id,'Calendar event deleted',existing.title);db.prepare('DELETE FROM calendar_events WHERE id=?').run(id);addActivity('Calendar event deleted',`${companyName} · ${existing.title} deleted by ${user.name}`,'update',existing.company_id);broadcastCompanyUpdate(existing.company_id,['calendar','work-items','notifications'],requestClientId(req),user.id);return send(res,200,{ok:true});
   }
   if(req.method==='GET'&&url.pathname==='/api/companies/directory'){if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required to browse the company directory.'});const ids=userCompanyIds(user);if(!ids.length)return send(res,200,[]);return send(res,200,db.prepare(`SELECT id,name,type,status FROM companies WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY name`).all(...ids));}
   if(req.method==='GET'&&url.pathname==='/api/companies') {const ids=userCompanyIds(user);if(!ids.length)return send(res,200,[]);const rows=db.prepare(`SELECT * FROM companies WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,name`).all(...ids);return send(res,200,rows.map(mapCompany));}
   const companyActivityMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/activities$/);
   if(companyActivityMatch&&req.method==='GET'){const rootId=db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id;if(user.role!=='admin'||user.activeCompanyId!==rootId)return send(res,403,{error:'Portal administrator access in the organization portal is required to view activity logs.'});const companyId=decodeURIComponent(companyActivityMatch[1]);if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});return send(res,200,listCompanyActivity(companyId));}
   const companyNotesMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/notes$/);
   if(companyNotesMatch){
    const companyId=decodeURIComponent(companyNotesMatch[1]);if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
    if(req.method==='GET'){const rows=db.prepare('SELECT n.*,creator.name AS created_by_name,editor.name AS updated_by_name FROM company_notes n LEFT JOIN users creator ON creator.id=n.created_by LEFT JOIN users editor ON editor.id=n.updated_by WHERE n.company_id=? ORDER BY n.updated_at DESC').all(companyId);return send(res,200,rows.map(mapCompanyNote));}
    if(req.method==='POST'){
     if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to add company notes.'});
     const input=await bodyJson(req,16000),title=typeof input.title==='string'?input.title.trim():'',body=typeof input.body==='string'?input.body.trim():null,category=String(input.category||'General');
     if(!title||title.length>140)return send(res,400,{error:'Enter a note title of 1 to 140 characters.'});
     if(body===null||!body||body.length>8000)return send(res,400,{error:'Enter note details under 8,000 characters.'});
     if(!NOTE_CATEGORIES.includes(category))return send(res,400,{error:'Choose a valid note category.'});
     const id=randomUUID(),now=new Date().toISOString(),companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name||'Company';db.exec('BEGIN IMMEDIATE');
     try{db.prepare('INSERT INTO company_notes(id,company_id,title,body,category,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,companyId,title,body,category,user.id,user.id,now,now);addActivity('Company note added',`${companyName} · ${title} added by ${user.name}`,'update',companyId);db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     return send(res,201,mapCompanyNote(getCompanyNoteRow(id)));
    }
   }
   const companyNoteMatch=url.pathname.match(/^\/api\/company-notes\/([^/]+)$/);
   if(companyNoteMatch){
    const note=getCompanyNoteRow(decodeURIComponent(companyNoteMatch[1]));if(!note||!userCompanyIds(user).includes(note.company_id))return send(res,404,{error:'Company note not found.'});
    if(!canManageCompany(user,note.company_id))return send(res,403,{error:'Platform administrator access is required to update company notes.'});
    if(req.method==='PATCH'){
     const input=await bodyJson(req,16000),title=input.title===undefined?note.title:(typeof input.title==='string'?input.title.trim():''),body=input.body===undefined?note.body:(typeof input.body==='string'?input.body.trim():null),category=input.category===undefined?note.category:String(input.category);
     if(!title||title.length>140)return send(res,400,{error:'Enter a note title of 1 to 140 characters.'});
     if(body===null||!body||body.length>8000)return send(res,400,{error:'Enter note details under 8,000 characters.'});
     if(!NOTE_CATEGORIES.includes(category))return send(res,400,{error:'Choose a valid note category.'});
     if(title===note.title&&body===note.body&&category===note.category)return send(res,200,mapCompanyNote(note));
     const companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(note.company_id)?.name||'Company';db.exec('BEGIN IMMEDIATE');
     try{db.prepare('UPDATE company_notes SET title=?,body=?,category=?,updated_by=?,updated_at=? WHERE id=?').run(title,body,category,user.id,new Date().toISOString(),note.id);addActivity('Company note updated',`${companyName} · ${title} updated by ${user.name}`,'update',note.company_id);db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     return send(res,200,mapCompanyNote(getCompanyNoteRow(note.id)));
    }
    if(req.method==='DELETE'){const companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(note.company_id)?.name||'Company';db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM company_notes WHERE id=?').run(note.id);addActivity('Company note deleted',`${companyName} · ${note.title} deleted by ${user.name}`,'update',note.company_id);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}return send(res,200,{ok:true});}
   }
    if(req.method==='GET'&&url.pathname==='/api/activities'){
     const rootId=db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id;if(user.role!=='admin'||user.activeCompanyId!==rootId)return send(res,403,{error:'Portal administrator access in the organization portal is required to view activity logs.'});
     const requestedDays=Number(url.searchParams.get('days')),activityDays=[30,60,90].includes(requestedDays)?requestedDays:30,activityCutoff=new Date(Date.now()-activityDays*86400000).toISOString(),activityLimit=activityDays===30?30:240;
     const companyIds=userCompanyIds(user),centralAdmin=user.role==='admin'&&user.activeCompanyId===rootId,activityQuery=centralAdmin?`SELECT id,title,detail,time,kind FROM activities WHERE time>=? ORDER BY time DESC LIMIT ${activityLimit}`:companyIds.length?`SELECT id,title,detail,time,kind FROM activities WHERE company_id IN (${companyIds.map(()=>'?').join(',')}) AND time>=? ORDER BY time DESC LIMIT ${activityLimit}`:null,activities=activityQuery?db.prepare(activityQuery).all(...(centralAdmin?[]:companyIds),activityCutoff):[];
     if(companyIds.length){const marks=companyIds.map(()=>'?').join(','),events=db.prepare(`SELECT e.id,e.event_type,e.detail,e.created_at,e.actor_user_id,t.title AS task_title,c.name AS company_name,u.name AS actor_name FROM task_events e JOIN tasks t ON t.id=e.task_id JOIN companies c ON c.id=t.company_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE t.company_id IN (${marks}) AND e.created_at>=? ORDER BY e.created_at DESC LIMIT ${activityLimit}`).all(...companyIds,activityCutoff);for(const event of events)activities.push({id:event.id,title:event.event_type==='created'?'Task created':'Task updated',detail:`${event.task_title} · ${event.company_name} — ${event.detail}${event.actor_name?` by ${event.actor_name}`:''}`,time:event.created_at,kind:'task'});
      const projectEvents=db.prepare(`SELECT e.id,e.event_type,e.detail,e.created_at,e.actor_user_id,p.name AS project_name,c.name AS company_name,u.name AS actor_name FROM project_events e JOIN projects p ON p.id=e.project_id JOIN companies c ON c.id=p.company_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE p.company_id IN (${marks}) AND e.created_at>=? ORDER BY e.created_at DESC LIMIT ${activityLimit}`).all(...companyIds,activityCutoff);for(const event of projectEvents){const title=event.event_type==='created'?'Project created':event.event_type==='milestone'?(event.detail.startsWith('Milestone added:')?'Milestone added':'Milestone updated'):event.event_type==='document'?(event.detail.startsWith('Project document added:')?'Job document uploaded':'Job document removed'):'Project updated';activities.push({id:event.id,title,detail:`${event.project_name} · ${event.company_name} — ${event.detail}${event.actor_name?` by ${event.actor_name}`:''}`,time:event.created_at,kind:'project'});}
      const requestEvents=db.prepare(`SELECT e.id,e.detail,e.created_at,e.actor_user_id,p.name AS project_name,pc.name AS project_company_name,tc.name AS target_company_name,r.title AS request_title,u.name AS actor_name FROM project_request_events e JOIN project_requests r ON r.id=e.request_id JOIN projects p ON p.id=r.project_id JOIN companies pc ON pc.id=p.company_id JOIN companies tc ON tc.id=r.target_company_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE (p.company_id IN (${marks}) OR r.target_company_id IN (${marks})) AND e.created_at>=? ORDER BY e.created_at DESC LIMIT ${activityLimit}`).all(...companyIds,...companyIds,activityCutoff);for(const event of requestEvents)activities.push({id:event.id,title:event.detail==='Shared request created.'?'Shared request created':'Shared request updated',detail:`${event.project_name} · ${event.request_title} · ${event.project_company_name} → ${event.target_company_name} — ${event.detail}${event.actor_name?` by ${event.actor_name}`:''}`,time:event.created_at,kind:'request'});
     }
      return send(res,200,activities.sort((a,b)=>b.time.localeCompare(a.time)).slice(0,activityLimit));
    }
    if(req.method==='GET'&&url.pathname==='/api/tasks'){
     const companyIds=userCompanyIds(user);if(!companyIds.length)return send(res,200,[]);
     const rows=db.prepare(`SELECT t.*,c.name AS company_name,a.name AS assignee_name,creator.name AS created_by_name FROM tasks t JOIN companies c ON c.id=t.company_id LEFT JOIN users a ON a.id=t.assignee_user_id JOIN users creator ON creator.id=t.created_by WHERE t.company_id IN (${companyIds.map(()=>'?').join(',')}) ORDER BY CASE WHEN t.status='Completed' THEN 1 ELSE 0 END,CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,t.due_date,t.updated_at DESC`).all(...companyIds);
     return send(res,200,rows.map(mapTask));
    }
    if(req.method==='GET'&&url.pathname==='/api/work-items'){
      const companyIds=userCompanyIds(user);if(!companyIds.length)return send(res,200,{tasks:[],requests:[],events:[]});const marks=companyIds.map(()=>'?').join(',');
      const tasks=db.prepare(`SELECT t.*,c.name AS company_name,a.name AS assignee_name,creator.name AS created_by_name FROM tasks t JOIN companies c ON c.id=t.company_id LEFT JOIN users a ON a.id=t.assignee_user_id JOIN users creator ON creator.id=t.created_by WHERE t.company_id IN (${marks}) ORDER BY CASE WHEN t.status='Completed' THEN 1 ELSE 0 END,CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,t.due_date,t.updated_at DESC`).all(...companyIds);
      const requests=db.prepare(`SELECT r.*,p.name AS project_name,p.company_id AS project_company_id,pc.name AS project_company_name,tc.name AS target_company_name,a.name AS assignee_name,u.name AS created_by_name FROM project_requests r JOIN projects p ON p.id=r.project_id JOIN companies pc ON pc.id=p.company_id JOIN companies tc ON tc.id=r.target_company_id LEFT JOIN users a ON a.id=r.assignee_user_id JOIN users u ON u.id=r.created_by WHERE p.company_id IN (${marks}) OR r.target_company_id IN (${marks}) ORDER BY CASE WHEN r.status IN ('Completed','Declined','Cancelled') THEN 1 ELSE 0 END,CASE WHEN r.due_date IS NULL THEN 1 ELSE 0 END,r.due_date,r.updated_at DESC`).all(...companyIds,...companyIds);
       const events=db.prepare(`SELECT e.*,c.name AS company_name,cl.name AS client_name,u.name AS created_by_name,canceler.name AS canceled_by_name FROM calendar_events e JOIN companies c ON c.id=e.company_id LEFT JOIN clients cl ON cl.id=e.client_id JOIN users u ON u.id=e.created_by LEFT JOIN users canceler ON canceler.id=e.canceled_by WHERE e.company_id IN (${marks}) AND e.event_type='event' ORDER BY e.starts_at,e.created_at`).all(...companyIds);
      const settings=getPortalSettings();return send(res,200,{tasks:settings.workspaceTasks?tasks.map(mapTask):[],requests:[],events:settings.workspaceCalendar?events.map(mapCalendarWorkItem):[]});
     }
    if(req.method==='GET'&&url.pathname==='/api/tasks/assignees'){
     const companyId=url.searchParams.get('companyId')||'';if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
     if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to assign tasks.'});
     return send(res,200,listTaskAssignees(companyId));
    }
    if(req.method==='POST'&&url.pathname==='/api/tasks'){
     const input=await bodyJson(req,20000),companyId=String(input.companyId||''),title=typeof input.title==='string'?input.title.trim():'',description=typeof input.description==='string'?input.description.trim():null,priority=String(input.priority||'Normal'),dueDate=input.dueDate?String(input.dueDate):null,assigneeUserId=input.assigneeUserId?String(input.assigneeUserId):null;
     if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
     if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to create tasks.'});
     if(!title||title.length>140)return send(res,400,{error:'Enter a task title of 1 to 140 characters.'});
     if(description===null||description.length>4000)return send(res,400,{error:'Task notes must be text under 4,000 characters.'});
     if(!TASK_PRIORITIES.includes(priority))return send(res,400,{error:'Choose a valid task priority.'});
     if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid due date.'});
     if(!canAssignTaskTo(assigneeUserId,companyId))return send(res,400,{error:'The selected assignee does not have access to this company.'});
     const id=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
     try{db.prepare(`INSERT INTO tasks(id,company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at) VALUES(?,?,?,?,'Open',?,?,?,?,?,?)`).run(id,companyId,title,description,priority,dueDate,assigneeUserId,user.id,now,now);addTaskEvent(id,user.id,'created','Task created.');db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     broadcastCompanyUpdate(companyId,['work-items','notifications'],requestClientId(req),user.id);
     return send(res,201,mapTask(getTaskRow(id)));
    }
    const taskMatch=url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if(taskMatch&&req.method==='GET'){
     const task=getTaskRow(decodeURIComponent(taskMatch[1]));if(!task||!userCompanyIds(user).includes(task.company_id))return send(res,404,{error:'Task not found.'});
     const history=db.prepare('SELECT e.id,e.event_type,e.detail,e.created_at,u.name AS actor_name FROM task_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.task_id=? ORDER BY e.created_at DESC').all(task.id).map(event=>({id:event.id,type:event.event_type,detail:event.detail,actor:event.actor_name||'System',createdAt:event.created_at}));
     return send(res,200,{...mapTask(task),history});
    }
    if(taskMatch&&req.method==='PATCH'){
     const task=getTaskRow(decodeURIComponent(taskMatch[1]));if(!task||!userCompanyIds(user).includes(task.company_id))return send(res,404,{error:'Task not found.'});
     if(!canManageCompany(user,task.company_id))return send(res,403,{error:'Platform administrator access is required to update tasks.'});
     const input=await bodyJson(req,20000),title=input.title===undefined?task.title:(typeof input.title==='string'?input.title.trim():''),description=input.description===undefined?task.description:(typeof input.description==='string'?input.description.trim():null),status=input.status===undefined?task.status:String(input.status),priority=input.priority===undefined?task.priority:String(input.priority),dueDate=input.dueDate===undefined?task.due_date:(input.dueDate?String(input.dueDate):null),assigneeUserId=input.assigneeUserId===undefined?task.assignee_user_id:(input.assigneeUserId?String(input.assigneeUserId):null);
     if(input.expectedUpdatedAt!==undefined&&input.expectedUpdatedAt!==task.updated_at)return send(res,409,{error:'This task changed while you were editing it. Your changes are still on the screen. Close it and reopen the latest version before saving.'});
     if(!title||title.length>140)return send(res,400,{error:'Enter a task title of 1 to 140 characters.'});
     if(description===null||description.length>4000)return send(res,400,{error:'Task notes must be text under 4,000 characters.'});
     if(!TASK_STATUSES.includes(status))return send(res,400,{error:'Choose a valid task status.'});
     if(!TASK_PRIORITIES.includes(priority))return send(res,400,{error:'Choose a valid task priority.'});
     if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid due date.'});
     if(assigneeUserId!==task.assignee_user_id&&!canAssignTaskTo(assigneeUserId,task.company_id))return send(res,400,{error:'The selected assignee does not have access to this company.'});
     const changes=[];
     if(title!==task.title)changes.push('Title updated.');
     if(description!==task.description)changes.push('Notes updated.');
     if(status!==task.status)changes.push(`Status changed from ${task.status} to ${status}.`);
     if(priority!==task.priority)changes.push(`Priority changed from ${task.priority} to ${priority}.`);
     if(dueDate!==task.due_date)changes.push(`Due date changed from ${task.due_date||'Not set'} to ${dueDate||'Not set'}.`);
     if(assigneeUserId!==task.assignee_user_id){const oldName=task.assignee_name||'Unassigned',newName=assigneeUserId?(db.prepare('SELECT name FROM users WHERE id=?').get(assigneeUserId)?.name||'Unassigned'):'Unassigned';changes.push(`Assignee changed from ${oldName} to ${newName}.`);}
     if(!changes.length)return send(res,200,mapTask(task));
     const now=nextUpdateTimestamp(task.updated_at);db.exec('BEGIN IMMEDIATE');
     try{db.prepare('UPDATE tasks SET title=?,description=?,status=?,priority=?,due_date=?,assignee_user_id=?,updated_at=? WHERE id=?').run(title,description,status,priority,dueDate,assigneeUserId,now,task.id);addTaskEvent(task.id,user.id,'updated',changes.join(' '));db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     broadcastCompanyUpdate(task.company_id,['work-items','notifications'],requestClientId(req),user.id);
     return send(res,200,mapTask(getTaskRow(task.id)));
    }
    const receptionConfigMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/reception-config$/);
    if(receptionConfigMatch){
     const companyId=decodeURIComponent(receptionConfigMatch[1]);
     if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
     if(req.method==='GET')return send(res,200,getReceptionConfig(companyId));
     if(req.method==='PATCH'){
      if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to configure Reception Intake.'});
      const input=await bodyJson(req,20000),current=getReceptionConfig(companyId),rawStatuses=Array.isArray(input.statuses)?input.statuses:null,rawServices=Array.isArray(input.services)?input.services:null;
      if(!rawStatuses||rawStatuses.length<2||rawStatuses.length>16)return send(res,400,{error:'Keep between 2 and 16 intake statuses.'});
      const statuses=[],seenIds=new Set(),seenLabels=new Set();
      for(const item of rawStatuses){
       if(!item||typeof item.id!=='string'||typeof item.label!=='string')return send(res,400,{error:'Each status needs a stable ID and a display label.'});
       const id=item.id.trim(),label=item.label.trim(),active=item.active!==false,terminal=id==='Closed';
       if(!id||id.length>64||!/[\p{L}\p{N}]/u.test(id)||!/^[\p{L}\p{N} _-]+$/u.test(id)||!label||label.length>48)return send(res,400,{error:'Use a valid status ID (up to 64 characters) and label (up to 48 characters).'});
       if(seenIds.has(id)||seenLabels.has(label.toLocaleLowerCase()))return send(res,400,{error:'Status IDs and labels must be unique.'});
       seenIds.add(id);seenLabels.add(label.toLocaleLowerCase());statuses.push({id,label,active,terminal});
      }
      const closed=statuses.find(item=>item.id==='Closed');if(!closed||!closed.active)return send(res,400,{error:'Keep the Closed status active so closure history and follow-up rules remain intact.'});
      const newStatus=statuses.find(item=>item.id==='New');if(!newStatus||!newStatus.active)return send(res,400,{error:'Keep the New status active so new inquiries have a valid starting point.'});
      const usedStatuses=new Set(db.prepare('SELECT DISTINCT status FROM reception_intakes WHERE company_id=?').all(companyId).map(row=>row.status));
      if([...usedStatuses].some(id=>!seenIds.has(id)))return send(res,409,{error:'A status used by an existing inquiry cannot be removed. Retire it by turning it off instead.'});
      if([...usedStatuses].some(id=>statuses.find(item=>item.id===id)?.active===false))return send(res,409,{error:'A status used by an existing inquiry cannot be disabled. Move its inquiries to another status first.'});
      const services=rawServices||current.services;
      if(!Array.isArray(services)||services.length<1||services.length>30||services.some(item=>typeof item!=='string'||!item.trim()||item.trim().length>100)||new Set(services.map(item=>item.trim().toLocaleLowerCase())).size!==services.length)return send(res,400,{error:'Keep at least one accounting service choice; choices must be unique text values under 100 characters.'});
      const next={...current,statuses,services:services.map(item=>item.trim())},now=new Date().toISOString();
      db.prepare('INSERT INTO company_reception_configs(company_id,config_json,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET config_json=excluded.config_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(companyId,JSON.stringify(next),user.id,now);
      addActivity('Reception intake configuration updated',`${db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name||'Company'} · Intake workflow options updated.`,'update',companyId);
      return send(res,200,next);
     }
    }
    if(req.method==='GET'&&url.pathname==='/api/reception-intakes'){
     const rootId=db.prepare('SELECT id FROM companies WHERE parent_id IS NULL ORDER BY created_at LIMIT 1').get()?.id;
     if(user.role!=='admin'||user.activeCompanyId!==rootId)return send(res,403,{error:'Platform administrator access in the Aspect Companies portal is required.'});
     const companyIds=userCompanyIds(user);if(!companyIds.length)return send(res,200,[]);const marks=companyIds.map(()=>'?').join(',');
     const rows=db.prepare(`SELECT i.*,c.name AS company_name,c.time_zone AS company_time_zone,a.name AS assignee_name,u.name AS created_by_name,o.source_system AS origin_source_system,o.source_record_id AS origin_source_record_id,o.source_channel AS origin_source_channel,o.source_created_at AS origin_source_created_at,o.received_at AS origin_received_at,o.mapping_version AS origin_mapping_version,o.source_payload_json AS origin_source_payload_json,o.sync_revision AS origin_sync_revision FROM reception_intakes i JOIN companies c ON c.id=i.company_id LEFT JOIN users a ON a.id=i.assignee_user_id JOIN users u ON u.id=i.created_by LEFT JOIN reception_intake_origins o ON o.intake_id=i.id WHERE i.company_id IN (${marks}) ORDER BY CASE WHEN i.status='Closed' THEN 1 ELSE 0 END,CASE WHEN i.follow_up_completed_at IS NOT NULL THEN 1 ELSE 0 END,CASE WHEN i.next_action_date IS NULL THEN 1 ELSE 0 END,i.next_action_date,i.updated_at DESC`).all(...companyIds);
     return send(res,200,rows.map(row=>{const intake=mapReceptionIntake(row);delete intake.accountingDetails;delete intake.workloadReview;return{...intake,history:getReceptionIntakeHistory(row.id)};}));
    }
    const companyIntakesMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/reception-intakes$/);
    if(companyIntakesMatch){
     const companyId=decodeURIComponent(companyIntakesMatch[1]);
     if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
     if(req.method==='GET'){
      const rows=db.prepare(`SELECT i.*,c.name AS company_name,c.time_zone AS company_time_zone,a.name AS assignee_name,u.name AS created_by_name,o.source_system AS origin_source_system,o.source_record_id AS origin_source_record_id,o.source_channel AS origin_source_channel,o.source_created_at AS origin_source_created_at,o.received_at AS origin_received_at,o.mapping_version AS origin_mapping_version,o.source_payload_json AS origin_source_payload_json,o.sync_revision AS origin_sync_revision FROM reception_intakes i JOIN companies c ON c.id=i.company_id LEFT JOIN users a ON a.id=i.assignee_user_id JOIN users u ON u.id=i.created_by LEFT JOIN reception_intake_origins o ON o.intake_id=i.id WHERE i.company_id=? ORDER BY CASE WHEN i.status='Closed' THEN 1 ELSE 0 END,CASE WHEN i.follow_up_completed_at IS NOT NULL THEN 1 ELSE 0 END,CASE WHEN i.next_action_date IS NULL THEN 1 ELSE 0 END,i.next_action_date,i.updated_at DESC`).all(companyId);
      return send(res,200,rows.map(row=>({...mapReceptionIntake(row),history:getReceptionIntakeHistory(row.id)})));
     }
      if(req.method==='POST'){
      const input=await bodyJson(req,40000),config=getReceptionConfig(companyId),accounting=companyId===ACCOUNTING_COMPANY_ID,signature=companyId===SIGNATURE_COMPANY_ID,contactName=typeof input.contactName==='string'?input.contactName.trim():'',organizationName=accounting&&typeof input.organizationName==='string'?input.organizationName.trim():'',email=typeof input.email==='string'?input.email.trim():'',phone=typeof input.phone==='string'?input.phone.trim():'',source=String(input.source||'Other'),requestType=typeof input.requestType==='string'?input.requestType.trim():'',summary=typeof input.summary==='string'?input.summary.trim():'',assigneeUserId=input.assigneeUserId?String(input.assigneeUserId):null,nextAction=typeof input.nextAction==='string'?input.nextAction.trim():'',nextActionDate=input.nextActionDate?String(input.nextActionDate):null,accountingDetails=accounting?normalizeAccountingDetails(input.accountingDetails):{},workloadReview=accounting?normalizeWorkloadReview(input.workloadReview,{},canManageCompany(user,companyId)?user.id:null):{};
      if(accounting&&input.workloadReview!==undefined&&!canManageCompany(user,companyId))return send(res,403,{error:'Only a platform administrator can submit the internal workload assessment.'});
      if(!contactName||contactName.length>160)return send(res,400,{error:'Enter a contact name of 1 to 160 characters.'});
      if(accounting&&(!organizationName||organizationName.length>160))return send(res,400,{error:'Enter an organization name under 160 characters.'});
      if(email.length>200||email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return send(res,400,{error:'Enter a valid email address under 200 characters.'});
      if(accounting&&!email&&!phone)return send(res,400,{error:'Add an email address or phone number so the client can be contacted.'});
      if(phone.length>60)return send(res,400,{error:'Phone must be 60 characters or fewer.'});
      if(!config.sources.includes(source))return send(res,400,{error:'Choose a valid contact source.'});
      if(accounting&&(!requestType||!config.services.includes(requestType)))return send(res,400,{error:'Choose an accounting service to assess the requested workload.'});
      if(signature&&(!requestType||!config.services.includes(requestType)))return send(res,400,{error:'Choose a pool service for this inquiry.'});
      if(requestType.length>120)return send(res,400,{error:'Request type must be 120 characters or fewer.'});
      if(!summary||summary.length>4000)return send(res,400,{error:'Enter a short description of the request (up to 4,000 characters).'});
      if(accounting&&(!accountingDetails||!workloadReview))return send(res,400,{error:'Check the accounting scope and workload assessment fields.'});if(accounting&&(!accountingDetails.contacts.length||!accountingDetails.primaryContactId))return send(res,400,{error:'Add at least one client contact and choose a primary contact.'});if(accounting){const primary=accountingDetails.contacts.find(contact=>contact.id===accountingDetails.primaryContactId);if(!primary||primary.name!==contactName||primary.email!==email||primary.phone!==phone)return send(res,400,{error:'Choose the primary contact from the company contacts list.'});}
      if(nextAction.length>500)return send(res,400,{error:'Next action must be 500 characters or fewer.'});
      if(!taskDateIsValid(nextActionDate))return send(res,400,{error:'Choose a valid follow-up date.'});
      if(assigneeUserId&&!canManageCompany(user,companyId)&&assigneeUserId!==user.id)return send(res,403,{error:'Only a platform administrator can assign an intake to another team member.'});
      if(!canAssignTaskTo(assigneeUserId,companyId))return send(res,400,{error:'The selected owner does not have access to this company.'});
      const id=randomUUID(),now=new Date().toISOString(),companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(companyId)?.name||'Company';db.exec('BEGIN IMMEDIATE');
      try{db.prepare('INSERT INTO reception_intakes(id,company_id,contact_name,organization_name,email,phone,source,request_type,summary,status,accounting_details_json,workload_review_json,assignee_user_id,next_action,next_action_date,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,companyId,contactName,organizationName,email,phone,source,requestType,summary,'New',JSON.stringify(accountingDetails),JSON.stringify(workloadReview),assigneeUserId,nextAction,nextActionDate,user.id,now,now);addReceptionIntakeEvent(id,user.id,'Intake created.','created');addActivity('Reception intake created',accounting?`${companyName} · New accounting inquiry recorded.`:`${companyName} · ${contactName} · ${source}`,'update',companyId);db.exec('COMMIT');}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      return send(res,201,{...mapReceptionIntake(getReceptionIntakeRow(id)),history:getReceptionIntakeHistory(id)});
     }
    }
    const receptionIntakeDocumentListMatch=url.pathname.match(/^\/api\/reception-intakes\/([^/]+)\/documents$/);
    const receptionIntakeDocumentDownloadMatch=url.pathname.match(/^\/api\/reception-intakes\/([^/]+)\/documents\/([^/]+)\/download$/);
    const receptionIntakeDocumentMatch=url.pathname.match(/^\/api\/reception-intakes\/([^/]+)\/documents\/([^/]+)$/);
    if(receptionIntakeDocumentListMatch&&req.method==='GET'){
     const intake=getReceptionIntakeRow(decodeURIComponent(receptionIntakeDocumentListMatch[1]));if(!intake||![ACCOUNTING_COMPANY_ID,SIGNATURE_COMPANY_ID].includes(intake.company_id)||!userCompanyIds(user).includes(intake.company_id))return send(res,404,{error:'Reception inquiry not found.'});
     const rows=db.prepare('SELECT d.*,u.name AS uploader FROM reception_intake_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.intake_id=? ORDER BY d.created_at DESC').all(intake.id);return send(res,200,rows.map(mapReceptionIntakeDocument));
    }
    if(receptionIntakeDocumentListMatch&&req.method==='POST'){
     const intake=getReceptionIntakeRow(decodeURIComponent(receptionIntakeDocumentListMatch[1]));if(!intake||![ACCOUNTING_COMPANY_ID,SIGNATURE_COMPANY_ID].includes(intake.company_id)||!userCompanyIds(user).includes(intake.company_id))return send(res,404,{error:'Reception inquiry not found.'});
     if(!canManageCompany(user,intake.company_id)&&intake.created_by!==user.id&&intake.assignee_user_id!==user.id)return send(res,403,{error:'Only the inquiry owner or a platform administrator can upload files.'});
     if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});
     const input=await bodyJson(req,15*1024*1024),originalName=path.posix.basename(String(input.name||'').replace(/\\/g,'/').replace(/[\x00-\x1f\x7f]/g,'')).trim(),extension=path.extname(originalName).toLowerCase(),mimeType=DOCUMENT_TYPES[extension];
     if(!originalName||originalName.length>240||!mimeType)return send(res,415,{error:'Choose a PDF, image, text, CSV, Word, Excel, or PowerPoint file.'});
     if(typeof input.content!=='string'||!input.content||input.content.length>Math.ceil(MAX_DOCUMENT_BYTES/3)*4+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content))return send(res,400,{error:'The file data is missing or invalid.'});
     const content=Buffer.from(input.content,'base64');if(!content.length||content.length>MAX_DOCUMENT_BYTES||content.toString('base64')!==input.content)return send(res,400,{error:'Files must be between 1 byte and 10 MB.'});if(!validDocumentSignature(content,extension))return send(res,415,{error:'The file content does not match its file type.'});
     beginDocumentMutation();try{await fs.mkdir(DOCUMENTS_DIR,{recursive:true});const id=randomUUID(),storedName=`${randomUUID()}${extension}`,createdAt=new Date().toISOString(),storagePath=path.join(DOCUMENTS_DIR,storedName);await fs.writeFile(storagePath,content,{flag:'wx'});try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO reception_intake_documents(id,intake_id,original_name,stored_name,mime_type,size_bytes,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,intake.id,originalName,storedName,mimeType,content.length,user.id,createdAt);addReceptionIntakeEvent(intake.id,user.id,`Supporting file uploaded: ${originalName}.`,'document');db.prepare('UPDATE reception_intakes SET updated_at=? WHERE id=?').run(createdAt,intake.id);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}await fs.unlink(storagePath).catch(()=>{});throw error;}addActivity('Reception file uploaded',`${intake.company_name} · Supporting file added to a reception inquiry.`,'update',intake.company_id);return send(res,201,mapReceptionIntakeDocument(getReceptionIntakeDocumentRow(id)));}finally{endDocumentMutation();}
    }
    if(receptionIntakeDocumentDownloadMatch&&req.method==='GET'){
     const intake=getReceptionIntakeRow(decodeURIComponent(receptionIntakeDocumentDownloadMatch[1])),doc=getReceptionIntakeDocumentRow(decodeURIComponent(receptionIntakeDocumentDownloadMatch[2]));if(!intake||![ACCOUNTING_COMPANY_ID,SIGNATURE_COMPANY_ID].includes(intake.company_id)||!doc||doc.intake_id!==intake.id||!userCompanyIds(user).includes(intake.company_id))return send(res,404,{error:'Reception file not found.'});
     const bytes=await fs.readFile(path.join(DOCUMENTS_DIR,doc.stored_name)),fallback=doc.original_name.replace(/[^\x20-\x7e]|["\\]/g,'_');return send(res,200,bytes,doc.mime_type,{'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    }
    if(receptionIntakeDocumentMatch&&req.method==='DELETE'){
     const intake=getReceptionIntakeRow(decodeURIComponent(receptionIntakeDocumentMatch[1])),doc=getReceptionIntakeDocumentRow(decodeURIComponent(receptionIntakeDocumentMatch[2]));if(!intake||![ACCOUNTING_COMPANY_ID,SIGNATURE_COMPANY_ID].includes(intake.company_id)||!doc||doc.intake_id!==intake.id||!userCompanyIds(user).includes(intake.company_id))return send(res,404,{error:'Reception file not found.'});
     if(!canManageCompany(user,intake.company_id)&&doc.uploaded_by!==user.id)return send(res,403,{error:'Only the uploader or a platform administrator can remove this file.'});if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try deleting again in a moment.'});
     beginDocumentMutation();try{await fs.unlink(path.join(DOCUMENTS_DIR,doc.stored_name)).catch(error=>{if(error.code!=='ENOENT')throw error;});const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM reception_intake_documents WHERE id=?').run(doc.id);addReceptionIntakeEvent(intake.id,user.id,`Supporting file removed: ${doc.original_name}.`,'document');db.prepare('UPDATE reception_intakes SET updated_at=? WHERE id=?').run(now,intake.id);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}addActivity('Reception file removed',`${intake.company_name} · Supporting file removed from a reception inquiry.`,'update',intake.company_id);return send(res,200,{ok:true});}finally{endDocumentMutation();}
    }
    const receptionIntakeMatch=url.pathname.match(/^\/api\/reception-intakes\/([^/]+)$/);
    const receptionIntakeActionMatch=url.pathname.match(/^\/api\/reception-intakes\/([^/]+)\/(events|reopen|follow-up\/(complete|reopen)|create-task)$/);
    if(receptionIntakeActionMatch&&req.method==='POST'){
     const intake=getReceptionIntakeRow(decodeURIComponent(receptionIntakeActionMatch[1]));if(!intake||!userCompanyIds(user).includes(intake.company_id))return send(res,404,{error:'Reception intake not found.'});
     if(!canManageCompany(user,intake.company_id)&&intake.created_by!==user.id&&intake.assignee_user_id!==user.id)return send(res,403,{error:'Only a platform administrator, the intake creator, or the assigned follow-up owner can update this intake.'});
     const action=receptionIntakeActionMatch[2],companyName=intake.company_name||'Company',now=new Date().toISOString();
     if(action==='events'){
      const input=await bodyJson(req,5000),eventType=typeof input.type==='string'?input.type:'',detail=typeof input.detail==='string'?input.detail.trim():'';
      if(!INTAKE_CONTACT_TYPES.includes(eventType))return send(res,400,{error:'Choose Call, Email, Text, Meeting, or Note for the timeline entry.'});
      if(!detail||detail.length>2000)return send(res,400,{error:'Enter a timeline note of 1 to 2,000 characters.'});
      const entryDetail=`${eventType}: ${detail}`;db.exec('BEGIN IMMEDIATE');
      try{addReceptionIntakeEvent(intake.id,user.id,entryDetail,eventType.toLocaleLowerCase());db.prepare('UPDATE reception_intakes SET updated_at=? WHERE id=?').run(now,intake.id);addActivity(`Reception ${eventType.toLocaleLowerCase()} logged`,`${companyName} · ${intake.contact_name} · Contact history recorded.`,'update',intake.company_id);db.exec('COMMIT');}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      return send(res,201,{...mapReceptionIntake(getReceptionIntakeRow(intake.id)),history:getReceptionIntakeHistory(intake.id)});
     }
     if(action==='reopen'){
      if(intake.status!=='Closed')return send(res,200,{...mapReceptionIntake(intake),history:getReceptionIntakeHistory(intake.id)});
      const reopenStatus=getReceptionConfig(intake.company_id).statuses.find(item=>item.active&&item.id!=='Closed')?.id||'New';
      db.exec('BEGIN IMMEDIATE');
      try{db.prepare("UPDATE reception_intakes SET status=?,closure_outcome='',closure_note='',closed_at=NULL,closed_by=NULL,updated_at=? WHERE id=?").run(reopenStatus,now,intake.id);addReceptionIntakeEvent(intake.id,user.id,`Inquiry reopened and returned to ${receptionStatusLabel(intake.company_id,reopenStatus)}.`,'reopened');addActivity('Reception intake reopened',`${companyName} · ${intake.contact_name}`,'update',intake.company_id);db.exec('COMMIT');}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      return send(res,200,{...mapReceptionIntake(getReceptionIntakeRow(intake.id)),history:getReceptionIntakeHistory(intake.id)});
     }
     if(action.startsWith('follow-up/')){
      if(intake.status==='Closed')return send(res,400,{error:'Reopen this inquiry before changing its follow-up.'});
      const complete=action.endsWith('/complete');
      if(complete&&!intake.next_action)return send(res,400,{error:'Add a next step before marking the follow-up complete.'});
      if(complete&&intake.follow_up_completed_at)return send(res,200,{...mapReceptionIntake(intake),history:getReceptionIntakeHistory(intake.id)});
      if(!complete&&!intake.follow_up_completed_at)return send(res,200,{...mapReceptionIntake(intake),history:getReceptionIntakeHistory(intake.id)});
      db.exec('BEGIN IMMEDIATE');
      try{db.prepare('UPDATE reception_intakes SET follow_up_completed_at=?,follow_up_completed_by=?,updated_at=? WHERE id=?').run(complete?now:null,complete?user.id:null,now,intake.id);addReceptionIntakeEvent(intake.id,user.id,complete?'Follow-up marked complete.':'Follow-up reopened.','follow-up');addActivity(complete?'Reception follow-up completed':'Reception follow-up reopened',`${companyName} · ${intake.contact_name}`,'update',intake.company_id);db.exec('COMMIT');}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      return send(res,200,{...mapReceptionIntake(getReceptionIntakeRow(intake.id)),history:getReceptionIntakeHistory(intake.id)});
     }
     if(action==='create-task'){
      if(!canManageCompany(user,intake.company_id))return send(res,403,{error:'Platform administrator access is required to create a Tasks & Requests item.'});
      if(intake.status==='Closed')return send(res,400,{error:'Reopen this inquiry before creating a follow-up task.'});if(intake.follow_up_completed_at)return send(res,400,{error:'Reopen the completed follow-up before handing it off to a task.'});
      const intakeOrg=intake.company_id===ACCOUNTING_COMPANY_ID?(intake.organization_name||intake.contact_name):intake.contact_name,input=await bodyJson(req,10000),defaultTitle=`${intake.company_id===ACCOUNTING_COMPANY_ID?'Accounting follow-up for':'Follow up with'} ${intakeOrg}${intake.request_type?` · ${intake.request_type}`:''}`.slice(0,140),title=typeof input.title==='string'&&input.title.trim()?input.title.trim():defaultTitle,priority=String(input.priority||'Normal'),dueDate=input.dueDate===undefined?intake.next_action_date:(input.dueDate?String(input.dueDate):null),assigneeUserId=input.assigneeUserId===undefined?intake.assignee_user_id:(input.assigneeUserId?String(input.assigneeUserId):null),description=typeof input.description==='string'&&input.description.trim()?input.description.trim():[`Reception intake follow-up`,intake.company_id===ACCOUNTING_COMPANY_ID?`Organization: ${intakeOrg}`:'',`Contact: ${intake.contact_name}`,intake.email?`Email: ${intake.email}`:'',intake.phone?`Phone: ${intake.phone}`:'',intake.request_type?`${intake.company_id===ACCOUNTING_COMPANY_ID?'Accounting service':'Request type'}: ${intake.request_type}`:'',`Request: ${intake.summary}`,intake.next_action?`Next step: ${intake.next_action}`:'',`Intake ID: ${intake.id}`].filter(Boolean).join('\n');
      if(!title||title.length>140)return send(res,400,{error:'Enter a task title of 1 to 140 characters.'});if(description.length>4000)return send(res,400,{error:'Task notes must be 4,000 characters or fewer.'});if(!TASK_PRIORITIES.includes(priority))return send(res,400,{error:'Choose a valid task priority.'});if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid task due date.'});if(!canAssignTaskTo(assigneeUserId,intake.company_id))return send(res,400,{error:'The selected assignee does not have access to this company.'});
      const taskId=randomUUID();db.exec('BEGIN IMMEDIATE');
      try{const current=getReceptionIntakeRow(intake.id);if(current.linked_task_id){db.exec('ROLLBACK');return send(res,409,{error:'A task is already linked to this inquiry.'});}db.prepare(`INSERT INTO tasks(id,company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at) VALUES(?,?,?,?,'Open',?,?,?,?,?,?)`).run(taskId,intake.company_id,title,description,priority,dueDate,assigneeUserId,user.id,now,now);addTaskEvent(taskId,user.id,'created',`Task created from reception intake ${intake.id}.`);db.prepare('UPDATE reception_intakes SET linked_task_id=?,updated_at=? WHERE id=?').run(taskId,now,intake.id);addReceptionIntakeEvent(intake.id,user.id,`Follow-up task created: ${title}.`,'task');addActivity('Reception follow-up task created',`${companyName} · ${intake.contact_name} · ${title}`,'update',intake.company_id);db.exec('COMMIT');}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
      broadcastCompanyUpdate(intake.company_id,['work-items','notifications'],requestClientId(req),user.id);
      return send(res,201,{task:mapTask(getTaskRow(taskId)),intake:{...mapReceptionIntake(getReceptionIntakeRow(intake.id)),history:getReceptionIntakeHistory(intake.id)}});
     }
    }
    if(receptionIntakeMatch&&req.method==='PATCH'){
     const intake=getReceptionIntakeRow(decodeURIComponent(receptionIntakeMatch[1]));if(!intake||!userCompanyIds(user).includes(intake.company_id))return send(res,404,{error:'Reception intake not found.'});
     if(!canManageCompany(user,intake.company_id)&&intake.created_by!==user.id&&intake.assignee_user_id!==user.id)return send(res,403,{error:'Only a platform administrator, the intake creator, or the assigned follow-up owner can update this intake.'});
     const input=await bodyJson(req,40000),config=getReceptionConfig(intake.company_id),accounting=intake.company_id===ACCOUNTING_COMPANY_ID,contactName=input.contactName===undefined?intake.contact_name:(typeof input.contactName==='string'?input.contactName.trim():''),organizationName=input.organizationName===undefined?(intake.organization_name||''):(typeof input.organizationName==='string'?input.organizationName.trim():''),email=input.email===undefined?intake.email:(typeof input.email==='string'?input.email.trim():''),phone=input.phone===undefined?intake.phone:(typeof input.phone==='string'?input.phone.trim():''),source=input.source===undefined?intake.source:String(input.source),requestType=input.requestType===undefined?intake.request_type:(typeof input.requestType==='string'?input.requestType.trim():''),summary=input.summary===undefined?intake.summary:(typeof input.summary==='string'?input.summary.trim():''),status=input.status===undefined?intake.status:String(input.status),assigneeUserId=input.assigneeUserId===undefined?intake.assignee_user_id:(input.assigneeUserId?String(input.assigneeUserId):null),nextAction=input.nextAction===undefined?intake.next_action:(typeof input.nextAction==='string'?input.nextAction.trim():''),nextActionDate=input.nextActionDate===undefined?intake.next_action_date:(input.nextActionDate?String(input.nextActionDate):null),closureOutcome=input.closureOutcome===undefined?(status==='Closed'?(intake.closure_outcome||''):''):String(input.closureOutcome).trim(),closureNote=input.closureNote===undefined?(status==='Closed'?(intake.closure_note||''):''):(typeof input.closureNote==='string'?input.closureNote.trim():''),accountingDetails=accounting?normalizeAccountingDetails(input.accountingDetails,parseIntakeJson(intake.accounting_details_json)):parseIntakeJson(intake.accounting_details_json),previousReview=parseIntakeJson(intake.workload_review_json);
     if(intake.origin_source_system==='signature-exteriors-design'&&['contactName','organizationName','email','phone','source','requestType','summary'].some(key=>Object.hasOwn(input,key)))return send(res,409,{error:'Edit Design-sourced details in the Design details tab so changes stay synchronized between both portals.'});
     if(accounting&&input.workloadReview!==undefined&&!canManageCompany(user,intake.company_id)&&Object.keys(input.workloadReview||{}).some(key=>key!=='startChecklist'))return send(res,403,{error:'Only a platform administrator can update the internal workload assessment.'});
     const workloadReview=accounting?normalizeWorkloadReview(input.workloadReview,previousReview,input.workloadReview!==undefined&&canManageCompany(user,intake.company_id)?user.id:null):previousReview;
     if(!contactName||contactName.length>160)return send(res,400,{error:'Enter a contact name of 1 to 160 characters.'});
     if(accounting&&(!organizationName||organizationName.length>160))return send(res,400,{error:'Enter an organization name under 160 characters.'});
     if(email.length>200||email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return send(res,400,{error:'Enter a valid email address under 200 characters.'});
     if(accounting&&!email&&!phone)return send(res,400,{error:'Add an email address or phone number so the client can be contacted.'});
     if(phone.length>60)return send(res,400,{error:'Phone must be 60 characters or fewer.'});
     if(!config.sources.includes(source))return send(res,400,{error:'Choose a valid contact source.'});
     if(accounting&&(!requestType||requestType!==intake.request_type&&!config.services.includes(requestType)))return send(res,400,{error:'Choose an accounting service to assess the requested workload.'});
     if(intake.company_id===SIGNATURE_COMPANY_ID&&(!requestType||requestType!==intake.request_type&&!config.services.includes(requestType)))return send(res,400,{error:'Choose a pool service for this inquiry.'});
     if(accounting&&(!accountingDetails||!workloadReview))return send(res,400,{error:'Check the accounting scope and workload assessment fields.'});if(accounting&&input.accountingDetails?.contacts!==undefined){if(!accountingDetails.contacts.length||!accountingDetails.primaryContactId)return send(res,400,{error:'Add at least one client contact and choose a primary contact.'});const primary=accountingDetails.contacts.find(contact=>contact.id===accountingDetails.primaryContactId);if(!primary||primary.name!==contactName||primary.email!==email||primary.phone!==phone)return send(res,400,{error:'Choose the primary contact from the company contacts list.'});}
     if(accounting&&['Qualified','Setup in progress'].includes(status)&&status!==intake.status&&!Object.values(workloadReview.startChecklist).every(Boolean))return send(res,400,{error:'Complete the setup readiness checklist before moving this inquiry into setup.'});
     if(requestType.length>120)return send(res,400,{error:'Request type must be 120 characters or fewer.'});
     if(!summary||summary.length>4000)return send(res,400,{error:'Enter a short description of the request (up to 4,000 characters).'});
     if(!config.statuses.some(item=>item.id===status&&(item.active||status===intake.status)))return send(res,400,{error:'Choose a valid active intake status.'});
     if(intake.status==='Closed'&&status!=='Closed')return send(res,400,{error:'Use Reopen inquiry to restart a closed intake.'});
     const closing=status==='Closed'&&intake.status!=='Closed';if(closing&&!config.closureOutcomes.includes(closureOutcome))return send(res,400,{error:'Choose an outcome before closing this inquiry.'});if(status==='Closed'&&(closureOutcome||intake.closure_outcome)&&!config.closureOutcomes.includes(closureOutcome))return send(res,400,{error:'A closed inquiry must keep a valid closure outcome.'});if(status!=='Closed'&&(closureOutcome||closureNote))return send(res,400,{error:'Reopen a closed inquiry before clearing its closure details.'});if(closureNote.length>2000)return send(res,400,{error:'Closure notes must be 2,000 characters or fewer.'});
     if(nextAction.length>500)return send(res,400,{error:'Next action must be 500 characters or fewer.'});
     if(!taskDateIsValid(nextActionDate))return send(res,400,{error:'Choose a valid follow-up date.'});
     if(assigneeUserId!==intake.assignee_user_id&&!canManageCompany(user,intake.company_id))return send(res,403,{error:'Only a platform administrator can change the follow-up owner.'});
     if(assigneeUserId!==intake.assignee_user_id&&!canAssignTaskTo(assigneeUserId,intake.company_id))return send(res,400,{error:'The selected owner does not have access to this company.'});
     const followUpPlanChanged=nextAction!==intake.next_action||nextActionDate!==intake.next_action_date,accountingDetailsChanged=accounting&&JSON.stringify(accountingDetails)!==JSON.stringify(parseIntakeJson(intake.accounting_details_json)),workloadReviewChanged=accounting&&input.workloadReview!==undefined&&JSON.stringify(workloadReview)!==JSON.stringify(previousReview),changes=[];if(contactName!==intake.contact_name||organizationName!==(intake.organization_name||''))changes.push('Client contact details updated.');if(email!==intake.email||phone!==intake.phone)changes.push('Contact methods updated.');if(source!==intake.source)changes.push(`Source changed from ${intake.source} to ${source}.`);if(requestType!==intake.request_type||summary!==intake.summary)changes.push('Request details updated.');if(accountingDetailsChanged)changes.push('Client contacts or accounting scope details updated.');if(workloadReviewChanged)changes.push('Internal workload assessment updated.');if(status!==intake.status)changes.push(`Status changed from ${receptionStatusLabel(intake.company_id,intake.status)} to ${receptionStatusLabel(intake.company_id,status)}.`);if(assigneeUserId!==intake.assignee_user_id){const nextName=assigneeUserId?(db.prepare('SELECT name FROM users WHERE id=?').get(assigneeUserId)?.name||'Unassigned'):'Unassigned';changes.push(`Owner changed from ${intake.assignee_name||'Unassigned'} to ${nextName}.`);}if(followUpPlanChanged){changes.push('Follow-up plan updated.');if(intake.follow_up_completed_at)changes.push('Previous follow-up completion cleared because its plan changed.');}if(closureOutcome!==(intake.closure_outcome||''))changes.push(`Closure outcome recorded: ${closureOutcome}.`);if(closureNote!==(intake.closure_note||''))changes.push('Closure notes updated.');
     if(!changes.length)return send(res,200,mapReceptionIntake(intake));
     const now=new Date().toISOString(),companyName=db.prepare('SELECT name FROM companies WHERE id=?').get(intake.company_id)?.name||'Company';db.exec('BEGIN IMMEDIATE');
     try{db.prepare('UPDATE reception_intakes SET contact_name=?,organization_name=?,email=?,phone=?,source=?,request_type=?,summary=?,status=?,accounting_details_json=?,workload_review_json=?,assignee_user_id=?,next_action=?,next_action_date=?,follow_up_completed_at=CASE WHEN ?=1 THEN NULL ELSE follow_up_completed_at END,follow_up_completed_by=CASE WHEN ?=1 THEN NULL ELSE follow_up_completed_by END,closure_outcome=?,closure_note=?,closed_at=CASE WHEN ?=1 THEN ? ELSE closed_at END,closed_by=CASE WHEN ?=1 THEN ? ELSE closed_by END,updated_at=? WHERE id=?').run(contactName,organizationName,email,phone,source,requestType,summary,status,JSON.stringify(accountingDetails),JSON.stringify(workloadReview),assigneeUserId,nextAction,nextActionDate,followUpPlanChanged?1:0,followUpPlanChanged?1:0,closureOutcome,closureNote,closing?1:0,closing?now:null,closing?1:0,closing?user.id:null,now,intake.id);const detail=changes.join(' ');addReceptionIntakeEvent(intake.id,user.id,detail,closing?'closed':'update');addActivity(closing?'Reception intake closed':'Reception intake updated',`${companyName} · ${accounting?organizationName:contactName} · ${detail}`,'update',intake.company_id);db.exec('COMMIT');}
     catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     return send(res,200,{...mapReceptionIntake(getReceptionIntakeRow(intake.id)),history:getReceptionIntakeHistory(intake.id)});
    }
   if(req.method==='GET'&&url.pathname==='/api/projects'){
    const companyIds=userCompanyIds(user);if(!companyIds.includes(SIGNATURE_COMPANY_ID))return send(res,200,[]);
     const rows=db.prepare(`SELECT p.*,c.name AS company_name,u.name AS created_by_name,pm.name AS project_manager_name FROM projects p JOIN companies c ON c.id=p.company_id JOIN users u ON u.id=p.created_by LEFT JOIN users pm ON pm.id=p.project_manager_user_id WHERE p.company_id=? ORDER BY CASE WHEN p.status IN ('Completed','Cancelled') THEN 1 ELSE 0 END,p.updated_at DESC`).all(SIGNATURE_COMPANY_ID);
    return send(res,200,rows.map(mapProject));
   }
    if(req.method==='GET'&&url.pathname==='/api/projects/assignees'){
     const companyId=url.searchParams.get('companyId')||SIGNATURE_COMPANY_ID;if(companyId!==SIGNATURE_COMPANY_ID||!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Signature Exteriors is not in your company scope.'});if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to assign project owners.'});return send(res,200,listTaskAssignees(companyId));
    }
   if(req.method==='POST'&&url.pathname==='/api/projects'){
     const input=await bodyJson(req,30000),companyId=String(input.companyId||SIGNATURE_COMPANY_ID),projectNumber=String(input.projectNumber||'').trim(),name=String(input.name||'').trim(),clientName=String(input.clientName||'').trim(),siteLocation=String(input.siteLocation||'').trim(),status=String(input.status||'Planning'),stage=String(input.stage||'Lead'),projectManagerUserId=String(input.projectManagerUserId||user.id),startDate=input.startDate?String(input.startDate):null,targetDate=input.targetDate?String(input.targetDate):null,estimatedValue=input.estimatedValue===''||input.estimatedValue===undefined||input.estimatedValue===null?null:Number(input.estimatedValue),description=typeof input.description==='string'?input.description.trim():null;
    if(companyId!==SIGNATURE_COMPANY_ID||!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Signature Exteriors is not in your company scope.'});
    if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to create projects.'});
    if(!name||name.length>140||projectNumber.length>40||clientName.length>160||siteLocation.length>200)return send(res,400,{error:'Enter a project name and keep project, client, and location details within their length limits.'});
    if(!PROJECT_STATUSES.includes(status))return send(res,400,{error:'Choose a valid project status.'});
     if(!PROJECT_STAGES.includes(stage))return send(res,400,{error:'Choose a valid job stage.'});
     if(!canAssignTaskTo(projectManagerUserId,companyId))return send(res,400,{error:'The selected project owner must have access to Signature Exteriors.'});
    if(!taskDateIsValid(startDate)||!taskDateIsValid(targetDate)||startDate&&targetDate&&startDate>targetDate)return send(res,400,{error:'Choose valid project dates. The target date must be on or after the start date.'});
    if(estimatedValue!==null&&(!Number.isFinite(estimatedValue)||estimatedValue<0||estimatedValue>10000000000))return send(res,400,{error:'Estimated value must be a non-negative amount under $10 billion.'});
    if(description===null||description.length>4000)return send(res,400,{error:'Project notes must be text under 4,000 characters.'});
    const id=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
     try{db.prepare('INSERT INTO projects(id,company_id,project_number,name,client_name,site_location,status,start_date,target_date,estimated_value_cents,description,project_manager_user_id,stage,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,companyId,projectNumber,name,clientName,siteLocation,status,startDate,targetDate,estimatedValue===null?null:Math.round(estimatedValue*100),description,projectManagerUserId,stage,user.id,now,now);ensureProjectClient(companyId,clientName,user.id,now);const projectOwner=db.prepare('SELECT name FROM users WHERE id=?').get(projectManagerUserId)?.name||'Unassigned';addProjectEvent(id,user.id,'created',`Project record created at ${stage}; owner: ${projectOwner}.`);db.exec('COMMIT');}
    catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'That project number is already in use for Signature Exteriors.'});throw error;}
    return send(res,201,mapProject(getProjectRow(id)));
   }
   const projectMatch=url.pathname.match(/^\/api\/projects\/([^/]+)$/);
   if(projectMatch&&req.method==='GET'){
    const project=getProjectRow(decodeURIComponent(projectMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});return send(res,200,mapProject(project));
   }
   if(projectMatch&&req.method==='PATCH'){
    const project=getProjectRow(decodeURIComponent(projectMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});
    if(!canManageCompany(user,project.company_id))return send(res,403,{error:'Platform administrator access is required to update projects.'});
     const input=await bodyJson(req,30000),projectNumber=input.projectNumber===undefined?project.project_number:String(input.projectNumber||'').trim(),name=input.name===undefined?project.name:String(input.name||'').trim(),clientName=input.clientName===undefined?project.client_name:String(input.clientName||'').trim(),siteLocation=input.siteLocation===undefined?project.site_location:String(input.siteLocation||'').trim(),status=input.status===undefined?project.status:String(input.status),stage=input.stage===undefined?project.stage:String(input.stage),projectManagerUserId=input.projectManagerUserId===undefined?project.project_manager_user_id:(input.projectManagerUserId?String(input.projectManagerUserId):null),startDate=input.startDate===undefined?project.start_date:(input.startDate?String(input.startDate):null),targetDate=input.targetDate===undefined?project.target_date:(input.targetDate?String(input.targetDate):null),estimatedValue=input.estimatedValue===undefined?(project.estimated_value_cents===null?null:project.estimated_value_cents/100):(input.estimatedValue===''||input.estimatedValue===null?null:Number(input.estimatedValue)),description=input.description===undefined?project.description:(typeof input.description==='string'?input.description.trim():null);
    if(!name||name.length>140||projectNumber.length>40||clientName.length>160||siteLocation.length>200)return send(res,400,{error:'Enter a project name and keep project, client, and location details within their length limits.'});
    if(!PROJECT_STATUSES.includes(status))return send(res,400,{error:'Choose a valid project status.'});
     if(!PROJECT_STAGES.includes(stage))return send(res,400,{error:'Choose a valid job stage.'});
     if(projectManagerUserId!==project.project_manager_user_id&&!canAssignTaskTo(projectManagerUserId,project.company_id))return send(res,400,{error:'The selected project owner must have access to Signature Exteriors.'});
    if(!taskDateIsValid(startDate)||!taskDateIsValid(targetDate)||startDate&&targetDate&&startDate>targetDate)return send(res,400,{error:'Choose valid project dates. The target date must be on or after the start date.'});
    if(estimatedValue!==null&&(!Number.isFinite(estimatedValue)||estimatedValue<0||estimatedValue>10000000000))return send(res,400,{error:'Estimated value must be a non-negative amount under $10 billion.'});
    if(description===null||description.length>4000)return send(res,400,{error:'Project notes must be text under 4,000 characters.'});
     const changes=[];if(status!==project.status)changes.push(`Overall status changed from ${project.status} to ${status}.`);if(stage!==project.stage)changes.push(`Job stage changed from ${project.stage} to ${stage}.`);if(projectManagerUserId!==project.project_manager_user_id){const ownerName=projectManagerUserId?db.prepare('SELECT name FROM users WHERE id=?').get(projectManagerUserId)?.name||'Unassigned':'Unassigned';changes.push(`Responsible person changed to ${ownerName}.`);}if(targetDate!==project.target_date)changes.push(`Target completion date changed to ${targetDate||'Not set'}.`);if(name!==project.name||projectNumber!==project.project_number||clientName!==project.client_name||siteLocation!==project.site_location||description!==project.description)changes.push('Project details updated.');
     if(!changes.length&&((estimatedValue===null?project.estimated_value_cents!==null:Math.round(estimatedValue*100)!==project.estimated_value_cents)||startDate!==project.start_date))changes.push('Project dates or estimated value updated.');if(!changes.length)return send(res,200,mapProject(project));
     db.exec('BEGIN IMMEDIATE');
     try{const now=new Date().toISOString();db.prepare('UPDATE projects SET project_number=?,name=?,client_name=?,site_location=?,status=?,stage=?,project_manager_user_id=?,start_date=?,target_date=?,estimated_value_cents=?,description=?,updated_at=? WHERE id=?').run(projectNumber,name,clientName,siteLocation,status,stage,projectManagerUserId,startDate,targetDate,estimatedValue===null?null:Math.round(estimatedValue*100),description,now,project.id);ensureProjectClient(project.company_id,clientName,user.id,now);addProjectEvent(project.id,user.id,'updated',changes.join(' '));db.exec('COMMIT');}
    catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'That project number is already in use for Signature Exteriors.'});throw error;}
     return send(res,200,mapProject(getProjectRow(project.id)));
   }
    const projectMilestonesMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/milestones$/);
    if(projectMilestonesMatch&&req.method==='GET'){
     const project=getProjectRow(decodeURIComponent(projectMilestonesMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});
     const milestones=db.prepare('SELECT m.*,a.name AS assignee_name,u.name AS created_by_name FROM project_milestones m LEFT JOIN users a ON a.id=m.assignee_user_id JOIN users u ON u.id=m.created_by WHERE m.project_id=? ORDER BY CASE WHEN m.status IN (\'Completed\',\'Skipped\') THEN 1 ELSE 0 END,CASE WHEN m.due_date IS NULL THEN 1 ELSE 0 END,m.due_date,m.created_at').all(project.id);
     return send(res,200,milestones.map(mapProjectMilestone));
    }
    if(projectMilestonesMatch&&req.method==='POST'){
     const project=getProjectRow(decodeURIComponent(projectMilestonesMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});if(!canManageCompany(user,project.company_id))return send(res,403,{error:'Platform administrator access is required to add milestones.'});
     const input=await bodyJson(req,12000),title=typeof input.title==='string'?input.title.trim():'',details=typeof input.details==='string'?input.details.trim():null,status=String(input.status||'Planned'),dueDate=input.dueDate?String(input.dueDate):null,assigneeUserId=input.assigneeUserId?String(input.assigneeUserId):null;
     if(!title||title.length>140)return send(res,400,{error:'Enter a milestone name of 1 to 140 characters.'});if(details===null||details.length>2000)return send(res,400,{error:'Milestone details must be text under 2,000 characters.'});if(!MILESTONE_STATUSES.includes(status))return send(res,400,{error:'Choose a valid milestone status.'});if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid milestone due date.'});if(assigneeUserId&&!canAssignTaskTo(assigneeUserId,project.company_id))return send(res,400,{error:'The selected milestone owner must have access to Signature Exteriors.'});
     const id=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO project_milestones(id,project_id,title,details,status,due_date,assignee_user_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,project.id,title,details,status,dueDate,assigneeUserId,user.id,now,now);addProjectEvent(project.id,user.id,'milestone',`Milestone added: ${title}${dueDate?` · due ${dueDate}`:''}.`);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     return send(res,201,mapProjectMilestone(getProjectMilestoneRow(id)));
    }
    const milestoneMatch=url.pathname.match(/^\/api\/project-milestones\/([^/]+)$/);
    if(milestoneMatch&&req.method==='PATCH'){
     const milestone=getProjectMilestoneRow(decodeURIComponent(milestoneMatch[1])),project=milestone?getProjectRow(milestone.project_id):null;if(!milestone||!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Milestone not found.'});if(!canManageCompany(user,project.company_id))return send(res,403,{error:'Platform administrator access is required to update milestones.'});
     const input=await bodyJson(req,12000),title=input.title===undefined?milestone.title:(typeof input.title==='string'?input.title.trim():''),details=input.details===undefined?milestone.details:(typeof input.details==='string'?input.details.trim():null),status=input.status===undefined?milestone.status:String(input.status),dueDate=input.dueDate===undefined?milestone.due_date:(input.dueDate?String(input.dueDate):null),assigneeUserId=input.assigneeUserId===undefined?milestone.assignee_user_id:(input.assigneeUserId?String(input.assigneeUserId):null);
     if(!title||title.length>140)return send(res,400,{error:'Enter a milestone name of 1 to 140 characters.'});if(details===null||details.length>2000)return send(res,400,{error:'Milestone details must be text under 2,000 characters.'});if(!MILESTONE_STATUSES.includes(status))return send(res,400,{error:'Choose a valid milestone status.'});if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid milestone due date.'});if(assigneeUserId!==milestone.assignee_user_id&&!canAssignTaskTo(assigneeUserId,project.company_id))return send(res,400,{error:'The selected milestone owner must have access to Signature Exteriors.'});
     const changes=[];if(title!==milestone.title)changes.push('Milestone name updated.');if(details!==milestone.details)changes.push('Milestone details updated.');if(status!==milestone.status)changes.push(`Milestone status changed from ${milestone.status} to ${status}.`);if(dueDate!==milestone.due_date)changes.push(`Milestone due date changed to ${dueDate||'Not set'}.`);if(assigneeUserId!==milestone.assignee_user_id){const nextName=assigneeUserId?db.prepare('SELECT name FROM users WHERE id=?').get(assigneeUserId)?.name||'Unassigned':'Unassigned';changes.push(`Milestone owner assigned to ${nextName}.`);}if(!changes.length)return send(res,200,mapProjectMilestone(milestone));
     const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE project_milestones SET title=?,details=?,status=?,due_date=?,assignee_user_id=?,updated_at=? WHERE id=?').run(title,details,status,dueDate,assigneeUserId,now,milestone.id);addProjectEvent(project.id,user.id,'milestone',`${title}: ${changes.join(' ')}`);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
     return send(res,200,mapProjectMilestone(getProjectMilestoneRow(milestone.id)));
    }
    const projectDocumentsMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/documents$/);
    if(projectDocumentsMatch&&req.method==='GET'){
     const project=getProjectRow(decodeURIComponent(projectDocumentsMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});const rows=db.prepare('SELECT d.*,u.name AS uploader FROM project_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.project_id=? ORDER BY d.created_at DESC').all(project.id);return send(res,200,rows.map(mapProjectDocument));
    }
    if(projectDocumentsMatch&&req.method==='POST'){
     const project=getProjectRow(decodeURIComponent(projectDocumentsMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});if(!canManageCompany(user,project.company_id))return send(res,403,{error:'Platform administrator access is required to upload project documents.'});if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});
     const input=await bodyJson(req,15*1024*1024),originalName=path.posix.basename(String(input.name||'').replace(/\\/g,'/').replace(/[\x00-\x1f\x7f]/g,'')).trim(),extension=path.extname(originalName).toLowerCase(),mimeType=DOCUMENT_TYPES[extension],category=String(input.category||''),description=String(input.description||'').trim();
     if(!originalName||originalName==='.'||originalName.length>180)return send(res,400,{error:'Choose a file with a name under 180 characters.'});if(!mimeType)return send(res,415,{error:'Allowed file types: PDF, PNG, JPG, TXT, CSV, DOCX, XLSX, and PPTX.'});if(!PROJECT_DOC_CATEGORIES.includes(category))return send(res,400,{error:'Choose a valid project document category.'});if(description.length>500)return send(res,400,{error:'Document notes must be 500 characters or fewer.'});
     if(typeof input.content!=='string'||!input.content||input.content.length>Math.ceil(MAX_DOCUMENT_BYTES/3)*4+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content))return send(res,400,{error:'The file data is missing or invalid.'});const content=Buffer.from(input.content,'base64');if(!content.length||content.length>MAX_DOCUMENT_BYTES||content.toString('base64')!==input.content)return send(res,400,{error:'Files must be between 1 byte and 10 MB.'});if(!validDocumentSignature(content,extension))return send(res,415,{error:'The file content does not match its file type.'});if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});
     const id=randomUUID(),storedName=`${randomUUID()}${extension}`,createdAt=new Date().toISOString();beginDocumentMutation();try{await fs.mkdir(DOCUMENTS_DIR,{recursive:true});const storagePath=path.join(DOCUMENTS_DIR,storedName);await fs.writeFile(storagePath,content,{flag:'wx'});try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO project_documents(id,project_id,original_name,stored_name,mime_type,size_bytes,category,description,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,project.id,originalName,storedName,mimeType,content.length,category,description,user.id,createdAt);addProjectEvent(project.id,user.id,'document',`Project document added: ${originalName} (${category}).`);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}await fs.unlink(storagePath).catch(()=>{});throw error;}return send(res,201,mapProjectDocument(db.prepare('SELECT d.*,u.name AS uploader FROM project_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.id=?').get(id)));}finally{endDocumentMutation();}
    }
    const projectDocumentDownloadMatch=url.pathname.match(/^\/api\/project-documents\/([^/]+)\/download$/);
    if(projectDocumentDownloadMatch&&req.method==='GET'){
     const doc=db.prepare('SELECT d.*,p.company_id FROM project_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=?').get(decodeURIComponent(projectDocumentDownloadMatch[1]));if(!doc||!userCompanyIds(user).includes(doc.company_id))return send(res,404,{error:'Project document not found.'});const bytes=await fs.readFile(path.join(DOCUMENTS_DIR,doc.stored_name)),fallback=doc.original_name.replace(/[^\x20-\x7e]|["\\]/g,'_');return send(res,200,bytes,doc.mime_type,{'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,'Cache-Control':'private, no-store'});
    }
    const projectDocumentMatch=url.pathname.match(/^\/api\/project-documents\/([^/]+)$/);
    if(projectDocumentMatch&&req.method==='DELETE'){
     const doc=db.prepare('SELECT d.*,p.company_id FROM project_documents d JOIN projects p ON p.id=d.project_id WHERE d.id=?').get(decodeURIComponent(projectDocumentMatch[1]));if(!doc||!userCompanyIds(user).includes(doc.company_id))return send(res,404,{error:'Project document not found.'});if(!canManageCompany(user,doc.company_id))return send(res,403,{error:'Platform administrator access is required to delete project documents.'});if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try deleting again in a moment.'});beginDocumentMutation();try{await fs.unlink(path.join(DOCUMENTS_DIR,doc.stored_name)).catch(error=>{if(error.code!=='ENOENT')throw error;});db.prepare('DELETE FROM project_documents WHERE id=?').run(doc.id);addProjectEvent(doc.project_id,user.id,'document',`Project document removed: ${doc.original_name}.`);return send(res,200,{ok:true});}finally{endDocumentMutation();}
    }
   if(req.method==='GET'&&url.pathname==='/api/project-requests'){
    const companyIds=userCompanyIds(user);if(!companyIds.length)return send(res,200,[]);const marks=companyIds.map(()=>'?').join(',');
    const rows=db.prepare(`SELECT r.*,p.name AS project_name,p.company_id AS project_company_id,pc.name AS project_company_name,tc.name AS target_company_name,a.name AS assignee_name,u.name AS created_by_name FROM project_requests r JOIN projects p ON p.id=r.project_id JOIN companies pc ON pc.id=p.company_id JOIN companies tc ON tc.id=r.target_company_id LEFT JOIN users a ON a.id=r.assignee_user_id JOIN users u ON u.id=r.created_by WHERE p.company_id IN (${marks}) OR r.target_company_id IN (${marks}) ORDER BY CASE WHEN r.status IN ('Completed','Declined','Cancelled') THEN 1 ELSE 0 END,CASE WHEN r.due_date IS NULL THEN 1 ELSE 0 END,r.due_date,r.updated_at DESC`).all(...companyIds,...companyIds);
    return send(res,200,rows.map(mapProjectRequest));
   }
   if(req.method==='GET'&&url.pathname==='/api/project-requests/assignees'){
    const companyId=url.searchParams.get('companyId')||'';if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to assign this request.'});return send(res,200,listTaskAssignees(companyId));
   }
   const projectRequestCreateMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/requests$/);
   if(projectRequestCreateMatch&&req.method==='POST'){
    const project=getProjectRow(decodeURIComponent(projectRequestCreateMatch[1]));if(!project||!userCompanyIds(user).includes(project.company_id))return send(res,404,{error:'Project not found.'});if(!canManageCompany(user,project.company_id))return send(res,403,{error:'Platform administrator access is required to request company support.'});
    const input=await bodyJson(req,20000),targetCompanyId=String(input.targetCompanyId||''),title=typeof input.title==='string'?input.title.trim():'',description=typeof input.description==='string'?input.description.trim():null,priority=String(input.priority||'Normal'),dueDate=input.dueDate?String(input.dueDate):null;
    const targetCompany=db.prepare('SELECT id,status FROM companies WHERE id=?').get(targetCompanyId);
    if(!targetCompany||targetCompany.status==='Inactive'||targetCompanyId===project.company_id)return send(res,400,{error:'Choose another available company to receive this request.'});
    if(!title||title.length>140)return send(res,400,{error:'Enter a shared request title of 1 to 140 characters.'});if(description===null||description.length>4000)return send(res,400,{error:'Request notes must be text under 4,000 characters.'});if(!TASK_PRIORITIES.includes(priority))return send(res,400,{error:'Choose a valid request priority.'});if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid request due date.'});
    const id=randomUUID(),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{db.prepare(`INSERT INTO project_requests(id,project_id,target_company_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'Open',?,?,NULL,?,?,?)`).run(id,project.id,targetCompanyId,title,description,priority,dueDate,user.id,now,now);addProjectRequestEvent(id,user.id,'Shared request created.');db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    broadcastCompaniesUpdate([project.company_id,targetCompanyId],['work-items','notifications'],requestClientId(req),user.id);
    return send(res,201,mapProjectRequest(getProjectRequestRow(id)));
   }
   const projectRequestMatch=url.pathname.match(/^\/api\/project-requests\/([^/]+)$/);
   if(projectRequestMatch&&req.method==='GET'){
    const request=getProjectRequestRow(decodeURIComponent(projectRequestMatch[1])),scope=userCompanyIds(user);if(!request||!scope.includes(request.project_company_id)&&!scope.includes(request.target_company_id))return send(res,404,{error:'Shared request not found.'});const history=db.prepare('SELECT e.id,e.detail,e.created_at,u.name AS actor_name FROM project_request_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.request_id=? ORDER BY e.created_at DESC').all(request.id).map(item=>({id:item.id,detail:item.detail,actor:item.actor_name||'System',createdAt:item.created_at}));return send(res,200,{...mapProjectRequest(request),history});
   }
   if(projectRequestMatch&&req.method==='PATCH'){
    const request=getProjectRequestRow(decodeURIComponent(projectRequestMatch[1])),scope=userCompanyIds(user);if(!request||!scope.includes(request.project_company_id)&&!scope.includes(request.target_company_id))return send(res,404,{error:'Shared request not found.'});
    if(!canManageCompany(user,request.project_company_id)&&!canManageCompany(user,request.target_company_id))return send(res,403,{error:'Platform administrator access is required to update this request.'});
    const input=await bodyJson(req,20000),title=input.title===undefined?request.title:(typeof input.title==='string'?input.title.trim():''),description=input.description===undefined?request.description:(typeof input.description==='string'?input.description.trim():null),status=input.status===undefined?request.status:String(input.status),priority=input.priority===undefined?request.priority:String(input.priority),dueDate=input.dueDate===undefined?request.due_date:(input.dueDate?String(input.dueDate):null),assigneeUserId=input.assigneeUserId===undefined?request.assignee_user_id:(input.assigneeUserId?String(input.assigneeUserId):null);
    if(input.expectedUpdatedAt!==undefined&&input.expectedUpdatedAt!==request.updated_at)return send(res,409,{error:'This shared request changed while you were editing it. Your changes are still on the screen. Close it and reopen the latest version before saving.'});
    if(!title||title.length>140)return send(res,400,{error:'Enter a shared request title of 1 to 140 characters.'});if(description===null||description.length>4000)return send(res,400,{error:'Request notes must be text under 4,000 characters.'});if(!PROJECT_REQUEST_STATUSES.includes(status))return send(res,400,{error:'Choose a valid request status.'});if(!TASK_PRIORITIES.includes(priority))return send(res,400,{error:'Choose a valid request priority.'});if(!taskDateIsValid(dueDate))return send(res,400,{error:'Choose a valid request due date.'});
    if(assigneeUserId!==request.assignee_user_id&&!canManageCompany(user,request.target_company_id))return send(res,403,{error:'Only a platform administrator can change the assignee.'});if(assigneeUserId!==request.assignee_user_id&&!canAssignTaskTo(assigneeUserId,request.target_company_id))return send(res,400,{error:'The selected assignee does not have access to the receiving company.'});
    const changes=[];if(title!==request.title)changes.push('Title updated.');if(description!==request.description)changes.push('Request details updated.');if(status!==request.status)changes.push(`Status changed from ${request.status} to ${status}.`);if(priority!==request.priority)changes.push(`Priority changed from ${request.priority} to ${priority}.`);if(dueDate!==request.due_date)changes.push(`Due date changed from ${request.due_date||'Not set'} to ${dueDate||'Not set'}.`);if(assigneeUserId!==request.assignee_user_id){const nextName=assigneeUserId?db.prepare('SELECT name FROM users WHERE id=?').get(assigneeUserId)?.name||'Unassigned':'Unassigned';changes.push(`Assignee changed to ${nextName}.`);}if(!changes.length)return send(res,200,mapProjectRequest(request));
    const now=nextUpdateTimestamp(request.updated_at);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE project_requests SET title=?,description=?,status=?,priority=?,due_date=?,assignee_user_id=?,updated_at=? WHERE id=?').run(title,description,status,priority,dueDate,assigneeUserId,now,request.id);addProjectRequestEvent(request.id,user.id,changes.join(' '));db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    broadcastCompaniesUpdate([request.project_company_id,request.target_company_id],['work-items','notifications'],requestClientId(req),user.id);
    return send(res,200,mapProjectRequest(getProjectRequestRow(request.id)));
   }
   if(url.pathname==='/api/backups'&&req.method==='GET'){if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});return send(res,200,await listBackupSnapshots());}
   if(url.pathname==='/api/backups'&&req.method==='POST'){
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});if(backupBusy)return send(res,409,{error:'A backup or restore is already running.'});backupBusy=true;
    try{await waitForDocumentMutations();return send(res,201,await createBackupSnapshot());}catch(error){console.error('Backup creation failed:',error);return send(res,500,{error:'Backup creation failed. Check the local server window for details.'});}finally{backupBusy=false;}
   }
   const restoreMatch=url.pathname.match(/^\/api\/backups\/([^/]+)\/restore$/);
   if(restoreMatch&&req.method==='POST'){
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});if(backupBusy||maintenanceMode)return send(res,409,{error:'A backup or restore is already running.'});backupBusy=true;maintenanceMode=true;closeAllLiveUpdateClients();
    try{await waitForApiMutations();await waitForDocumentMutations();const restored=await restoreBackupSnapshot(decodeURIComponent(restoreMatch[1]));return send(res,200,restored,'application/json; charset=utf-8',{'Set-Cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`});}
    catch(error){console.error('Backup restore failed:',error);return send(res,400,{error:error.message||'The backup could not be restored.'});}
    finally{maintenanceMode=false;backupBusy=false;}
   }
   const backupDeleteMatch=url.pathname.match(/^\/api\/backups\/([^/]+)$/);
   if(backupDeleteMatch&&req.method==='DELETE'){
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});if(backupBusy)return send(res,409,{error:'A backup or restore is already running.'});
    backupBusy=true;
    try{const id=decodeURIComponent(backupDeleteMatch[1]),backups=await listBackupSnapshots();if(!validBackupId(id)||!backups.some(item=>item.id===id))return send(res,404,{error:'Backup not found.'});if(backups.length<=1)return send(res,409,{error:'Keep at least one backup. Create another before deleting this one.'});await fs.rm(path.join(BACKUPS_DIR,id),{recursive:true,force:true});return send(res,200,{ok:true});}
    finally{backupBusy=false;}
   }
   const companyDocumentsMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/documents$/);
   if(companyDocumentsMatch&&req.method==='GET'){
    const companyId=decodeURIComponent(companyDocumentsMatch[1]);
    if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
    const rows=db.prepare('SELECT d.*,u.name AS uploader FROM company_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.company_id=? ORDER BY d.created_at DESC').all(companyId);
    return send(res,200,rows.map(mapDocument));
   }
   if(companyDocumentsMatch&&req.method==='POST'){
    const companyId=decodeURIComponent(companyDocumentsMatch[1]);
    if(!userCompanyIds(user).includes(companyId))return send(res,404,{error:'Company not found.'});
    if(!canManageCompany(user,companyId))return send(res,403,{error:'Platform administrator access is required to upload documents.'});
    if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});
    const input=await bodyJson(req,15*1024*1024);
    const originalName=path.posix.basename(String(input.name||'').replace(/\\/g,'/').replace(/[\x00-\x1f\x7f]/g,'')).trim();
    const extension=path.extname(originalName).toLowerCase(),mimeType=DOCUMENT_TYPES[extension];
    const category=String(input.category||'');
    const description=String(input.description||'').trim();
    if(!originalName||originalName==='.'||originalName.length>180)return send(res,400,{error:'Choose a file with a name under 180 characters.'});
    if(!mimeType)return send(res,415,{error:'Allowed file types: PDF, PNG, JPG, TXT, CSV, DOCX, XLSX, and PPTX.'});
    if(!DOC_CATEGORIES.includes(category))return send(res,400,{error:'Choose a valid document category.'});
    if(description.length>500)return send(res,400,{error:'Document notes must be 500 characters or fewer.'});
    if(typeof input.content!=='string'||!input.content||input.content.length>Math.ceil(MAX_DOCUMENT_BYTES/3)*4+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content))return send(res,400,{error:'The file data is missing or invalid.'});
    const content=Buffer.from(input.content,'base64');
    if(!content.length||content.length>MAX_DOCUMENT_BYTES||content.toString('base64')!==input.content)return send(res,400,{error:'Files must be between 1 byte and 10 MB.'});
    if(!validDocumentSignature(content,extension))return send(res,415,{error:'The file content does not match its file type.'});
    if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try uploading again in a moment.'});
    const id=randomUUID(),storedName=`${randomUUID()}${extension}`,createdAt=new Date().toISOString();
    beginDocumentMutation();
    try{
     await fs.mkdir(DOCUMENTS_DIR,{recursive:true});
     const storagePath=path.join(DOCUMENTS_DIR,storedName);
     await fs.writeFile(storagePath,content,{flag:'wx'});
     try{db.prepare('INSERT INTO company_documents(id,company_id,original_name,stored_name,mime_type,size_bytes,category,description,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,companyId,originalName,storedName,mimeType,content.length,category,description,user.id,createdAt);}
     catch(error){await fs.unlink(storagePath).catch(()=>{});throw error;}
     addActivity(`${originalName} uploaded`,`${category} document added to ${db.prepare('SELECT name FROM companies WHERE id=?').get(companyId).name}`,'update',companyId);
     return send(res,201,{id,companyId,name:originalName,mimeType,sizeBytes:content.length,category,description,uploader:user.name,createdAt});
    }finally{endDocumentMutation();}
   }
   const documentDownloadMatch=url.pathname.match(/^\/api\/documents\/([^/]+)\/download$/);
   if(documentDownloadMatch&&req.method==='GET'){
    const doc=db.prepare('SELECT * FROM company_documents WHERE id=?').get(decodeURIComponent(documentDownloadMatch[1]));
    if(!doc||!userCompanyIds(user).includes(doc.company_id))return send(res,404,{error:'Document not found.'});
    const bytes=await fs.readFile(path.join(DOCUMENTS_DIR,doc.stored_name));
    const fallback=doc.original_name.replace(/[^\x20-\x7e]|["\\]/g,'_');
    return send(res,200,bytes,doc.mime_type,{'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,'Cache-Control':'private, no-store'});
   }
   const documentMatch=url.pathname.match(/^\/api\/documents\/([^/]+)$/);
   if(documentMatch&&req.method==='DELETE'){
    const doc=db.prepare('SELECT * FROM company_documents WHERE id=?').get(decodeURIComponent(documentMatch[1]));
    if(!doc||!userCompanyIds(user).includes(doc.company_id))return send(res,404,{error:'Document not found.'});
    if(!canManageCompany(user,doc.company_id))return send(res,403,{error:'Platform administrator access is required to delete documents.'});
    if(backupBusy)return send(res,409,{error:'A backup or restore is running. Try deleting again in a moment.'});
    beginDocumentMutation();
    try{await fs.unlink(path.join(DOCUMENTS_DIR,doc.stored_name)).catch(error=>{if(error.code!=='ENOENT')throw error;});db.prepare('DELETE FROM company_documents WHERE id=?').run(doc.id);addActivity(`${doc.original_name} deleted`,`Document removed from ${db.prepare('SELECT name FROM companies WHERE id=?').get(doc.company_id).name}`,'update',doc.company_id);return send(res,200,{ok:true});}
    finally{endDocumentMutation();}
   }
   if(req.method==='GET'&&url.pathname==='/api/users') {
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});
    const rows=db.prepare(`SELECT u.id,u.name,u.email,u.role,u.active,u.must_change_password,u.created_at,u.job_title,group_concat(CASE WHEN m.active=1 THEN c.name END, ', ') AS companies FROM users u LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN companies c ON c.id=m.company_id WHERE u.email<>? GROUP BY u.id ORDER BY u.name`).all(SIGNATURE_DESIGN_SYSTEM_ACTOR_EMAIL);
    return send(res,200,rows.map(r=>{const companyMemberships=db.prepare('SELECT company_id,role,active FROM memberships WHERE user_id=? ORDER BY company_id').all(r.id).map(item=>({companyId:item.company_id,role:item.role,active:!!item.active})),companyIds=companyMemberships.filter(item=>item.active).map(item=>item.companyId);return{...r,active:!!r.active,mustChangePassword:!!r.must_change_password,createdAt:r.created_at,jobTitle:r.job_title||'',companyId:companyIds[0]||'',companyIds,companyMemberships,companies:r.companies||''};}));
   }
   if(req.method==='POST'&&url.pathname==='/api/users') {
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});
    const input=await bodyJson(req),name=String(input.name||'').trim(),email=String(input.email||'').trim().toLowerCase(),role=String(input.role||'member'),companyIds=companyIdsFromInput(input);
    const validScope=role==='admin'?true:!!companyIds?.length&&companyIdsExist(companyIds);
    if(name.length<2||!/^(\S+)@(\S+)\.(\S+)$/.test(email)||!ROLES.includes(role)||!validScope)return send(res,400,{error:'Enter a name, valid email, and either member or platform administrator access.'});
     const id=randomUUID(),temporaryPassword=randomBytes(18).toString('base64url'),passwordHash=await hashPassword(temporaryPassword);db.exec('BEGIN IMMEDIATE');
     try{db.prepare('INSERT INTO users(id,name,email,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,1,?)').run(id,name,email,passwordHash,role,new Date().toISOString());if(role!=='admin'){const insertMembership=db.prepare('INSERT INTO memberships(user_id,company_id,role,active) VALUES(?,?,?,1)');for(const companyId of companyIds)insertMembership.run(id,companyId,'member');}db.exec('COMMIT');}
    catch(error){try{db.exec('ROLLBACK');}catch{}if(isUniqueConstraintError(error))return send(res,409,{error:'An account already exists for this email.'});throw error;}
    ensureUserCalendarColors();
    addActivity(`${name} added to the workspace`,`${role} access for ${email}`,'user');return send(res,201,{id,name,email,role,companyIds:role==='admin'?[]:companyIds,temporaryPassword,mustChangePassword:true});
   }
   const userMatch=url.pathname.match(/^\/api\/users\/([^/]+)$/);
   if(userMatch&&req.method==='PATCH'){
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});
    const targetId=decodeURIComponent(userMatch[1]),target=db.prepare('SELECT id,name,email,role,active FROM users WHERE id=?').get(targetId);
    if(!target)return send(res,404,{error:'Account not found.'});
    const input=await bodyJson(req),nextRole=input.role??target.role,nextActive=input.active===undefined?!!target.active:input.active,rawScopeProvided=input.companyMemberships!==undefined||input.companyIds!==undefined||input.companyId!==undefined;
    let requestedMemberships=null;
    if(input.companyMemberships!==undefined){
     if(!Array.isArray(input.companyMemberships)||input.companyMemberships.length>100||input.companyMemberships.some(item=>!item||typeof item!=='object'||typeof item.companyId!=='string'||item.role!=='member'||item.active!==undefined&&typeof item.active!=='boolean'))return send(res,400,{error:'Choose valid company memberships and roles.'});
     const seen=new Set();requestedMemberships=input.companyMemberships.map(item=>({companyId:item.companyId.trim(),role:item.role,active:item.active!==false}));
     if(requestedMemberships.some(item=>!item.companyId||seen.has(item.companyId)||(seen.add(item.companyId),false)))return send(res,400,{error:'Choose each company only once.'});
     if(requestedMemberships.length&&!companyIdsExist(requestedMemberships.map(item=>item.companyId)))return send(res,400,{error:'Choose valid company memberships.'});
    }else if(input.companyIds!==undefined||input.companyId!==undefined){
     const requestedIds=companyIdsFromInput(input);if(!requestedIds)return send(res,400,{error:'Choose valid company memberships.'});
     if(requestedIds.length&&!companyIdsExist(requestedIds))return send(res,400,{error:'Choose valid company memberships.'});
     requestedMemberships=requestedIds.map(companyId=>({companyId,role:'member',active:true}));
    }
    const companyIds=requestedMemberships?.filter(item=>item.active).map(item=>item.companyId)||[],currentMemberships=db.prepare('SELECT company_id AS companyId,role,active FROM memberships WHERE user_id=?').all(targetId).map(item=>({...item,active:!!item.active})),currentActiveMemberships=currentMemberships.filter(item=>item.active),requestedActiveMemberships=requestedMemberships?.filter(item=>item.active)||[],currentMembershipById=new Map(currentMemberships.map(item=>[item.companyId,item])),inactiveMembershipChanged=requestedMemberships?.some(item=>!item.active&&(!currentMembershipById.has(item.companyId)||currentMembershipById.get(item.companyId).active||currentMembershipById.get(item.companyId).role!==item.role))||false,companyScopeChanged=requestedMemberships!==null&&(!sameMembershipAccess(currentActiveMemberships,requestedActiveMemberships)||inactiveMembershipChanged);
    if(!ROLES.includes(nextRole)||typeof nextActive!=='boolean')return send(res,400,{error:'Choose member or platform administrator access and a valid account status.'});
    if(target.id===user.id&&(nextRole!==target.role||companyScopeChanged))return send(res,400,{error:'Another platform administrator must change your account role or company access.'});
    if(nextRole!=='admin'&&requestedMemberships!==null&&!companyIds.length)return send(res,400,{error:'Choose at least one active company membership.'});
    if(target.role==='admin'&&nextRole!=='admin'&&(!rawScopeProvided||!companyIds.length))return send(res,400,{error:'Choose this account’s company scope before changing it from administrator.'});
    if(target.role==='admin'&&target.active&&(nextRole!=='admin'||!nextActive)&&db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").get().n<=1)return send(res,409,{error:'The last active administrator cannot be demoted or deactivated.'});
    if(target.id===user.id&&!nextActive)return send(res,400,{error:'You cannot deactivate your own account.'});
    
    db.exec('BEGIN');
    try{
     db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(nextRole,nextActive?1:0,targetId);
     if(companyScopeChanged){
      const desired=new Map(requestedMemberships.map(item=>[item.companyId,item]));
      for(const membership of db.prepare('SELECT company_id,active FROM memberships WHERE user_id=?').all(targetId)){
       const next=desired.get(membership.company_id);
       if(!next){if(membership.active)db.prepare('UPDATE memberships SET active=0 WHERE user_id=? AND company_id=?').run(targetId,membership.company_id);}
       else{db.prepare('UPDATE memberships SET role=?,active=? WHERE user_id=? AND company_id=?').run(next.role,next.active?1:0,targetId,membership.company_id);desired.delete(membership.company_id);}
      }
      const insertMembership=db.prepare('INSERT INTO memberships(user_id,company_id,role,active) VALUES(?,?,?,?)');for(const membership of desired.values())insertMembership.run(targetId,membership.companyId,membership.role,membership.active?1:0);
      const removedCompanyIds=db.prepare('SELECT company_id FROM memberships WHERE user_id=? AND active=0').all(targetId).map(item=>item.company_id);for(const companyId of removedCompanyIds)db.prepare('DELETE FROM sessions WHERE user_id=? AND company_id=?').run(targetId,companyId);
     }
     if(!nextActive||nextRole!==target.role)db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
     db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    addActivity(`${target.name} account updated`,`Access changed by ${user.name}`,'user');
    const savedCompanyIds=db.prepare('SELECT company_id FROM memberships WHERE user_id=? ORDER BY company_id').all(targetId).map(item=>item.company_id);
    return send(res,200,{id:target.id,name:target.name,email:target.email,role:nextRole,active:nextActive,companyIds:savedCompanyIds});
   }
   const resetMatch=url.pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
   if(resetMatch&&req.method==='POST'){
    if(user.role!=='admin')return send(res,403,{error:'Administrator access is required.'});
    const targetId=decodeURIComponent(resetMatch[1]),target=db.prepare('SELECT id,name,email,active FROM users WHERE id=?').get(targetId);
    if(!target)return send(res,404,{error:'Account not found.'});
    if(!target.active)return send(res,400,{error:'Reactivate this account before resetting its password.'});
    if(target.id===user.id)return send(res,400,{error:'Use the signed-in password change flow to update your own password.'});
     const temporaryPassword=randomBytes(18).toString('base64url'),passwordHash=await hashPassword(temporaryPassword);
     db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(passwordHash,targetId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
    addActivity(`${target.name} password reset`,`Temporary sign-in issued by ${user.name}`,'user');
    return send(res,200,{id:target.id,name:target.name,email:target.email,temporaryPassword,mustChangePassword:true});
   }
   if(req.method==='POST'&&url.pathname==='/api/companies') {if(user.role!=='admin')return send(res,403,{error:'Platform administrator access is required to add companies.'});const input=await bodyJson(req),required=['name','type','industry','location','owner'],logo=input.logoData===undefined?{valid:true,data:null}:normalizeCompanyLogoData(input.logoData);if(!logo.valid)return send(res,400,{error:'Choose a PNG, JPG, or WebP company logo under 512 KB.'});if(required.some(k=>typeof input[k]!=='string'||!input[k].trim()))return send(res,400,{error:'Name, type, industry, location, and owner are required.'});if(!TYPES.includes(input.type))return send(res,400,{error:'Choose a valid company type.'});const parentId=input.parentId||user.activeCompanyId;if(!parentId||!userCompanyIds(user).includes(parentId)||!canManageCompany(user,parentId))return send(res,403,{error:'You cannot add a company under that parent.'});const parent=db.prepare('SELECT time_zone FROM companies WHERE id=?').get(parentId),timeZone=input.timeZone===undefined?parent?.time_zone:validTimeZone(input.timeZone);if(!timeZone)return send(res,400,{error:'Choose a valid IANA time zone.'});const now=new Date().toISOString(),company={id:randomUUID(),name:input.name.trim(),legalName:(input.legalName||input.name).trim(),type:input.type,status:'In setup',industry:input.industry.trim(),location:input.location.trim(),employees:0,owner:input.owner.trim(),description:(input.description||'').trim(),parentId,timeZone,logoData:logo.data,createdAt:now,updatedAt:now};insertCompany(company);addActivity(`${company.name} added to the portfolio`,`Company profile created by ${user.name}`,'company',company.id);return send(res,201,mapCompany(db.prepare('SELECT * FROM companies WHERE id=?').get(company.id)));}
   const companyLogoMatch=url.pathname.match(/^\/api\/companies\/([^/]+)\/logo$/);
   if(companyLogoMatch&&req.method==='GET'){
    const company=db.prepare('SELECT id,logo_data FROM companies WHERE id=?').get(decodeURIComponent(companyLogoMatch[1]));
    if(!company||!company.logo_data||user.role!=='admin'&&!userCompanyIds(user).includes(company.id))return send(res,404,{error:'Company logo not found.'});
    const logo=normalizeCompanyLogoData(company.logo_data);if(!logo.valid)return send(res,404,{error:'Company logo not found.'});
    const [,mimeType,encoded]=company.logo_data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/),bytes=Buffer.from(encoded,'base64');
    return send(res,200,bytes,mimeType,{'Content-Length':String(bytes.length),'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'});
   }
   const match=url.pathname.match(/^\/api\/companies\/([^/]+)$/);
   if(match&&req.method==='GET'){const company=db.prepare('SELECT * FROM companies WHERE id=?').get(decodeURIComponent(match[1]));if(!company||!userCompanyIds(user).includes(company.id))return send(res,404,{error:'Company not found.'});return send(res,200,mapCompany(company));}
   if(match&&req.method==='PATCH'){
    const company=db.prepare('SELECT * FROM companies WHERE id=?').get(decodeURIComponent(match[1]));
    if(!company)return send(res,404,{error:'Company not found.'});
    if(!userCompanyIds(user).includes(company.id)||!canManageCompany(user,company.id))return send(res,403,{error:'You cannot update this company.'});
    const input=await bodyJson(req),required=['name','legalName','type','status','industry','location','owner'],logo=input.logoData===undefined?{valid:true,data:company.logo_data||null}:normalizeCompanyLogoData(input.logoData);
    if(!logo.valid)return send(res,400,{error:'Choose a PNG, JPG, or WebP company logo under 512 KB.'});
    for(const field of required){if(input[field]!==undefined&&(typeof input[field]!=='string'||!input[field].trim()))return send(res,400,{error:`${field} cannot be blank.`});}
    if(input.description!==undefined&&typeof input.description!=='string')return send(res,400,{error:'Description must be text.'});
    if(input.profileConfirmed!==undefined&&![true,false,'true','false'].includes(input.profileConfirmed))return send(res,400,{error:'Choose whether these company details have been confirmed.'});
    const next={name:input.name?.trim()??company.name,legalName:input.legalName?.trim()??company.legal_name,type:input.type??company.type,status:input.status??company.status,industry:input.industry?.trim()??company.industry,location:input.location?.trim()??company.location,owner:input.owner?.trim()??company.owner,description:input.description?.trim()??company.description,employees:input.employees===undefined?company.employees:Number(input.employees),parentId:input.parentId===undefined?company.parent_id:input.parentId,timeZone:input.timeZone===undefined?company.time_zone:validTimeZone(input.timeZone),logoData:logo.data};
    if(!next.timeZone)return send(res,400,{error:'Choose a valid IANA time zone.'});
    const profileFactsChanged=next.name!==company.name||next.legalName!==company.legal_name||next.industry!==company.industry||next.location!==company.location||next.owner!==company.owner||next.employees!==company.employees;
    next.profileConfirmed=input.profileConfirmed===undefined?(profileFactsChanged?0:company.profile_confirmed):(input.profileConfirmed===true||input.profileConfirmed==='true'?1:0);
    if(!TYPES.includes(next.type))return send(res,400,{error:'Choose a valid company type.'});
    if(!['Active','In setup','Inactive'].includes(next.status))return send(res,400,{error:'Choose a valid status.'});
    if(!Number.isInteger(next.employees)||next.employees<0||next.employees>1000000)return send(res,400,{error:'Team size must be a whole number from 0 to 1,000,000.'});
    if(next.name.length>120||next.legalName.length>160||next.industry.length>100||next.location.length>120||next.owner.length>120||next.description.length>4000)return send(res,400,{error:'One or more company fields are too long.'});
    if(company.parent_id===null&&next.parentId!==null)return send(res,400,{error:'The organization root cannot be moved under another company.'});
    if(company.parent_id!==null&&!next.parentId)return send(res,400,{error:'A subsidiary must have a parent company.'});
    if(next.parentId!==company.parent_id){
     if(next.parentId===company.id||!userCompanyIds(user).includes(next.parentId)||!canManageCompany(user,next.parentId))return send(res,400,{error:'Choose a parent company in your management scope.'});
     const makesCycle=db.prepare(`WITH RECURSIVE children(id) AS (SELECT id FROM companies WHERE parent_id=? UNION ALL SELECT c.id FROM companies c JOIN children s ON c.parent_id=s.id) SELECT 1 FROM children WHERE id=?`).get(company.id,next.parentId);
     if(makesCycle)return send(res,400,{error:'That parent would create an invalid company hierarchy.'});
    }
    const now=new Date().toISOString();
    db.prepare('UPDATE companies SET name=?,legal_name=?,type=?,status=?,industry=?,location=?,employees=?,owner=?,description=?,parent_id=?,updated_at=?,profile_confirmed=?,time_zone=?,logo_data=? WHERE id=?').run(next.name,next.legalName,next.type,next.status,next.industry,next.location,next.employees,next.owner,next.description,next.parentId,now,next.profileConfirmed,next.timeZone,next.logoData,company.id);
    const updated=mapCompany(db.prepare('SELECT * FROM companies WHERE id=?').get(company.id));
    addActivity(`${updated.name} profile updated`,`Company details updated by ${user.name}`,'update',company.id);
    if(!company.profile_confirmed&&updated.profileConfirmed)addActivity(`${updated.name} profile confirmed`,`Company details reviewed by ${user.name}`,'update',company.id);
    return send(res,200,updated);
   }
   return send(res,404,{error:'API route not found.'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed.'});
  const decodedPath=decodeURIComponent(url.pathname),pathname=/^\/portal\/[^/]+\/?$/.test(decodedPath)?'/index.html':decodedPath==='/'?'/index.html':decodedPath,file=path.resolve(PUBLIC,`.${pathname}`);
  if(!file.startsWith(PUBLIC+path.sep))return send(res,403,{error:'Forbidden.'});
  try{return await sendStaticAsset(req,res,file,url);}
  catch(error){
   const isPageNavigation=String(req.headers.accept||'').includes('text/html')&&!path.extname(pathname);
   if(error.code==='ENOENT'&&isPageNavigation)return await sendStaticAsset(req,res,path.join(PUBLIC,'index.html'),new URL('/index.html',url.origin));
   throw error;
  }
 }catch(error){if(error instanceof SyntaxError)return send(res,400,{error:'Invalid JSON request.'});if(error.message==='Request body too large')return send(res,413,{error:'Request is too large. Individual files are limited to 10 MB.'});if(error.code==='ENOENT')return send(res,404,{error:'Not found.'});console.error(error);return send(res,500,{error:'The portal encountered an unexpected error.'});}
 finally{if(countedMutation)inFlightApiMutations=Math.max(0,inFlightApiMutations-1);}
});

initializeData().then(()=>server.listen(PORT,LISTEN_HOST,()=>{
 const displayHost=LISTEN_HOST==='0.0.0.0'?'127.0.0.1':LISTEN_HOST;
 const address=`http://${displayHost}:${PORT}`;console.log(`Aspect Companies Portal available at ${address} (bound to ${LISTEN_HOST})`);
 calendarReminderTimer=setInterval(runCalendarReminderCycle,60000);calendarReminderTimer.unref();const initialReminderCheck=setTimeout(runCalendarReminderCycle,3000);initialReminderCheck.unref();
 if(process.env.ASPECT_OPEN_BROWSER==='1'&&process.platform==='win32')execFile('cmd.exe',['/c','start','',address],{windowsHide:true},error=>{if(error)console.error(`Could not open a browser automatically: ${error.message}`);});
})).catch(error=>{console.error('Portal database could not be initialized:',error);process.exit(1);});

let shuttingDown=false;
function shutdown(signal){
 if(shuttingDown)return;
 shuttingDown=true;console.log(`Aspect Companies Portal received ${signal}; waiting for active requests to finish.`);
 if(calendarReminderTimer){clearInterval(calendarReminderTimer);calendarReminderTimer=null;}
 closeAllLiveUpdateClients();
 const timeout=setTimeout(()=>{try{db.close();}catch{}process.exit(1);},30000);timeout.unref();
 server.close(error=>{clearTimeout(timeout);try{db.close();}catch(closeError){console.error('Could not close the portal database cleanly:',closeError.message);}if(error){console.error('Portal shutdown failed:',error.message);process.exitCode=1;}else console.log('Aspect Companies Portal stopped cleanly.');});
}
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));



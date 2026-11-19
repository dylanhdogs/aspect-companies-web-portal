import { useEffect, useMemo, useRef, useState } from "react";

const TODAY = "2026-10-17";
const NEXT_WEEK = "2026-10-23";

const INQUIRIES = [
  {
    id: "inq-101",
    contact: "Sarah Kim",
    email: "sarah.kim@example.com",
    phone: "602-555-0143",
    company: "Aspen Properties",
    companyType: "Property Management",
    requestType: "Maintenance",
    summary: "Leaking kitchen faucet in Unit 3B",
    source: "Resident portal",
    nextStep: "Reach out to schedule a service visit.",
    owner: "Dylan Sluyter",
    status: "New",
    followUpDate: "2026-10-15",
  },
  {
    id: "inq-102",
    contact: "Tom Brand",
    email: "tom.brand@example.com",
    phone: "480-555-0184",
    company: "Aspect Accounting",
    companyType: "Bookkeeping",
    requestType: "Monthly bookkeeping",
    summary: "2 years cleanup and ongoing monthly bookkeeping",
    source: "Website",
    nextStep: "Call to discuss scope and pricing.",
    owner: "Dylan Sluyter",
    status: "New",
    followUpDate: TODAY,
  },
  {
    id: "inq-103",
    contact: "Michael James",
    email: "michael.james@example.com",
    phone: "555-555-0155",
    company: "Signature Exteriors",
    companyType: "Exterior Design",
    requestType: "Design consultation",
    summary: "Pool shell and excavation",
    source: "Referral",
    nextStep: "Send the project intake form and sample plans.",
    owner: "Alex Carter",
    status: "In review",
    followUpDate: "2026-10-20",
  },
  {
    id: "inq-104",
    contact: "Emily Carter",
    email: "emily.carter@example.com",
    phone: "480-555-7721",
    company: "Rio Verde Living",
    companyType: "Outdoor Living",
    requestType: "Residential project",
    summary: "Outdoor kitchen and patio renovation",
    source: "Website",
    nextStep: "Call to review design goals and budget.",
    owner: "Morgan King",
    status: "Follow-up",
    followUpDate: "2026-10-22",
  },
  {
    id: "inq-105",
    contact: "David Nguyen",
    email: "david.nguyen@example.com",
    phone: "602-555-2987",
    company: "Sunridge Properties",
    companyType: "Property Management",
    requestType: "Facilities",
    summary: "Common area landscape update",
    source: "Email",
    nextStep: "Confirm scope and request a proposal.",
    owner: "Dylan Sluyter",
    status: "Follow-up",
    followUpDate: "2026-10-24",
  },
  {
    id: "inq-106",
    contact: "Lisa Morales",
    email: "lisa.morales@example.com",
    phone: "480-555-6630",
    company: "Desert Creek HOA",
    companyType: "HOA Management",
    requestType: "Facilities",
    summary: "Gate system not working",
    source: "Phone",
    nextStep: "Follow up with vendor and provide an update to the board.",
    owner: "Morgan King",
    status: "Qualified",
    followUpDate: "2026-10-27",
  },
  {
    id: "inq-107",
    contact: "Kevin Patel",
    email: "kevin.patel@example.com",
    phone: "602-555-4421",
    company: "Boulder Creek Homes",
    companyType: "Residential Building",
    requestType: "Home purchase",
    summary: "Spec home availability and pricing",
    source: "Website",
    nextStep: "Send current inventory and pricing details.",
    owner: "Dylan Sluyter",
    status: "New",
    followUpDate: "",
  },
];

const STATUS_ORDER = ["New", "In review", "Follow-up", "Qualified", "Closed"];
const OWNERS = [...new Set(INQUIRIES.map((item) => item.owner))].sort();
const COMPANIES = [...new Set(INQUIRIES.map((item) => item.company))].sort();
const SOURCES = [...new Set(INQUIRIES.map((item) => item.source))].sort();
const REQUEST_TYPES = [...new Set(INQUIRIES.map((item) => item.requestType))].sort();

const EMPTY_FILTERS = {
  search: "",
  company: "all",
  status: "all",
  owner: "all",
  source: "all",
  requestType: "all",
  from: "",
  through: "",
  followUp: "all",
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <use href={`/icons.svg#aspect-icon-${name}`} />
    </svg>
  );
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(date) {
  if (!date) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${date}T12:00:00-04:00`));
}

function daysFromToday(date) {
  if (!date) return null;
  const start = Date.parse(`${TODAY}T12:00:00Z`);
  const target = Date.parse(`${date}T12:00:00Z`);
  return Math.round((target - start) / 86_400_000);
}

function followUpKind(date) {
  if (!date) return "none";
  if (date < TODAY) return "overdue";
  if (date === TODAY) return "today";
  if (date <= NEXT_WEEK) return "upcoming";
  return "later";
}

function followUpText(date) {
  const kind = followUpKind(date);
  if (kind === "overdue") {
    const days = Math.abs(daysFromToday(date));
    return `${days} ${days === 1 ? "day" : "days"} overdue`;
  }
  if (kind === "today") return "Due today";
  if (kind === "none") return "Not scheduled";
  const days = daysFromToday(date);
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

function CompanyMark({ company }) {
  const companyCode = company
    .split(" ")
    .filter((part) => !["of", "the", "and"].includes(part.toLowerCase()))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return <span className={`company-mark company-mark-${companyCode}`}>{companyCode}</span>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

function FollowUpBadge({ date }) {
  const kind = followUpKind(date);
  const iconName = kind === "none" ? "calendar-days" : "clock-3";
  const sublabel = followUpText(date);

  return (
    <span className={`followup-badge followup-${kind}`}>
      <Icon name={iconName} size={15} />
      <span>
        <time dateTime={date || undefined}>{formatDate(date)}</time>
        <small>{sublabel}</small>
      </span>
    </span>
  );
}

function FilterSelect({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`filter-select ${className}`}>
      <span className="visually-hidden">{label}</span>
      <select aria-label={label} value={value} onChange={onChange}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
      <Icon name="chevron-down" size={15} />
    </label>
  );
}

function App() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activePhase, setActivePhase] = useState("All inquiries");
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setSelectedInquiry(null);
        setSidebarOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const attentionCounts = useMemo(() => ({
    overdue: INQUIRIES.filter((item) => followUpKind(item.followUpDate) === "overdue").length,
    today: INQUIRIES.filter((item) => followUpKind(item.followUpDate) === "today").length,
    upcoming: INQUIRIES.filter((item) => followUpKind(item.followUpDate) === "upcoming").length,
  }), []);

  const phaseCounts = useMemo(() => ({
    "All inquiries": INQUIRIES.filter((item) => item.status !== "Closed").length,
    ...Object.fromEntries(STATUS_ORDER.map((status) => [
      status,
      INQUIRIES.filter((item) => item.status === status).length,
    ])),
  }), []);

  const filteredInquiries = useMemo(() => {
    const chosenStatus = activePhase === "All inquiries" ? filters.status : activePhase;
    const normalizedSearch = filters.search.trim().toLowerCase();

    return INQUIRIES.filter((item) => {
      const searchable = [
        item.contact,
        item.email,
        item.phone,
        item.company,
        item.companyType,
        item.summary,
        item.requestType,
        item.source,
        item.nextStep,
        item.owner,
      ].join(" ").toLowerCase();
      const kind = followUpKind(item.followUpDate);

      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (filters.company !== "all" && item.company !== filters.company) return false;
      if (chosenStatus !== "all" && item.status !== chosenStatus) return false;
      if (filters.owner !== "all" && item.owner !== filters.owner) return false;
      if (filters.source !== "all" && item.source !== filters.source) return false;
      if (filters.requestType !== "all" && item.requestType !== filters.requestType) return false;
      if (filters.from && (!item.followUpDate || item.followUpDate < filters.from)) return false;
      if (filters.through && (!item.followUpDate || item.followUpDate > filters.through)) return false;
      if (filters.followUp !== "all" && kind !== filters.followUp) return false;
      return true;
    });
  }, [activePhase, filters]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key === "status") setActivePhase("All inquiries");
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setActivePhase("All inquiries");
    setToast("Filters cleared");
  }

  function selectAttention(kind) {
    setFilters((current) => ({ ...current, followUp: current.followUp === kind ? "all" : kind }));
    setActivePhase("All inquiries");
  }

  function openCompanyPortal(company) {
    setFilters((current) => ({ ...current, company }));
    setActivePhase("All inquiries");
    setSelectedInquiry(null);
    setToast(`Showing inquiries for ${company}`);
  }

  function showPreviewToast(name) {
    setToast(`${name} is available in the live portal; this preview has sample records only.`);
  }

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => (
    key === "search" || key === "from" || key === "through"
      ? Boolean(value)
      : value !== "all"
  )) || activePhase !== "All inquiries";

  const phaseItems = ["All inquiries", ...STATUS_ORDER];

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="#top" aria-label="Aspect Companies home">
          <span className="brand-mark">A</span>
          <span className="brand-wordmark"><strong>ASPECT</strong><small>COMPANIES</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className="nav-link" onClick={() => showPreviewToast("Overview")}><Icon name="layout-dashboard" /><span>Overview</span></button>
          <div className="nav-section-label">CLIENTS</div>
          <button className="nav-link" onClick={() => showPreviewToast("Clients")}><Icon name="users" /><span>Clients</span></button>
          <div className="nav-section-label">MARKETING</div>
          <button className="nav-link active" aria-current="page"><Icon name="clipboard-list" /><span>Reception Intake</span></button>
          <div className="nav-section-label">TEAM PROJECTS</div>
          <button className="nav-link" onClick={() => showPreviewToast("Projects")}><Icon name="sliders-horizontal" /><span>Projects</span></button>
          <div className="nav-section-label">WORKSPACE</div>
          <button className="nav-link" onClick={() => showPreviewToast("Collaborative Team")}><Icon name="users" /><span>Collaborative Team</span></button>
          <button className="nav-link" onClick={() => showPreviewToast("Current work tasks")}><Icon name="list-checks" /><span>Current work tasks</span><span className="nav-count">09</span></button>
          <button className="nav-link" onClick={() => showPreviewToast("Activity")}><Icon name="activity" /><span>Activity</span></button>
          <button className="nav-link" onClick={() => showPreviewToast("Calendar")}><Icon name="calendar-days" /><span>Calendar</span></button>
          <div className="nav-section-label">PORTAL ADMINISTRATION</div>
          <button className="nav-link" onClick={() => showPreviewToast("Portal settings")}><Icon name="sliders-horizontal" /><span>Portal settings</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="help-card" onClick={() => showPreviewToast("Help") }>
            <span className="help-icon"><Icon name="circle-help" size={18} /></span>
            <span className="help-copy"><strong>Need a hand?</strong><small>Get help with your workspace</small></span>
            <span className="help-arrow" aria-hidden="true">↗</span>
          </button>
          <button className="profile-button" onClick={() => showPreviewToast("Account settings")}>
            <span className="avatar">DS</span>
            <span className="profile-copy"><strong>Dylan Sluyter</strong><small>Platform administrator</small></span>
            <span className="profile-menu" aria-hidden="true">···</span>
          </button>
        </div>
      </aside>

      <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" tabIndex="-1" />

      <main className="main-content" id="top">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={sidebarOpen}>
            <span /><span /><span />
          </button>
          <div className="topbar-context">Aspect Companies</div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => searchRef.current?.focus()}>
              <Icon name="search" size={16} /><span>Search</span><kbd>Ctrl / ⌘ K</kbd>
            </button>
            <button className="icon-button has-badge" aria-label="Notifications" onClick={() => showPreviewToast("Notifications")}>
              <Icon name="bell" size={19} /><span className="notification-badge">5</span>
            </button>
            <button className="icon-button" aria-label="Recent activity" onClick={() => showPreviewToast("Recent activity")}><Icon name="clock-3" size={19} /></button>
            <button className="switch-portal" onClick={() => showPreviewToast("Portal switcher")}>Switch portal</button>
            <span className="top-avatar">DS</span>
            <button className="sign-out" onClick={() => showPreviewToast("Sign out")}>Sign out</button>
          </div>
        </header>

        <section className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="status-dot" />YOUR ORGANIZATION</div>
              <h1>Reception Intake</h1>
              <p>Review inquiries and follow-ups across the Aspect Companies portfolio.</p>
            </div>
            <div className="heading-actions">
              <button className="button button-secondary" onClick={() => showPreviewToast("Backups")}>Backups</button>
              <button className="button button-secondary" onClick={() => showPreviewToast("Manage access")}>Manage access</button>
            </div>
          </div>

          <section className="attention-panel" aria-label="Follow-ups needing attention">
            <div className="attention-intro">
              <h2>Needs attention</h2>
              <p>Inquiries with a follow-up due soon or overdue.</p>
            </div>
            <button className={`attention-item attention-overdue ${filters.followUp === "overdue" ? "selected" : ""}`} onClick={() => selectAttention("overdue")} aria-pressed={filters.followUp === "overdue"}>
              <strong>{attentionCounts.overdue}</strong><span><b>Overdue</b><small>{attentionCounts.overdue === 1 ? "1 inquiry needs a follow-up" : "No overdue follow-ups"}</small></span>
            </button>
            <button className={`attention-item attention-today ${filters.followUp === "today" ? "selected" : ""}`} onClick={() => selectAttention("today")} aria-pressed={filters.followUp === "today"}>
              <strong>{attentionCounts.today}</strong><span><b>Due today</b><small>Oct 17, 2026</small></span>
            </button>
            <button className={`attention-item attention-upcoming ${filters.followUp === "upcoming" ? "selected" : ""}`} onClick={() => selectAttention("upcoming")} aria-pressed={filters.followUp === "upcoming"}>
              <strong>{attentionCounts.upcoming}</strong><span><b>Upcoming</b><small>Next 7 days</small></span>
            </button>
          </section>

          <nav className="phase-rail" aria-label="Filter inquiries by status" role="tablist">
            {phaseItems.map((phase) => {
              const count = phaseCounts[phase] ?? 0;
              return (
                <button
                  key={phase}
                  type="button"
                  role="tab"
                  aria-selected={activePhase === phase && filters.status === "all"}
                  className={activePhase === phase && filters.status === "all" ? "selected" : ""}
                  onClick={() => { setActivePhase(phase); setFilters((current) => ({ ...current, status: "all" })); }}
                >
                  <span>{phase}</span><strong>{count}</strong>
                </button>
              );
            })}
          </nav>

          <section className="filter-panel" aria-label="Search and filter inquiries">
            <label className="search-field">
              <Icon name="search" size={17} />
              <span className="visually-hidden">Search contacts, requests, or notes</span>
              <input ref={searchRef} value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search contacts, requests, or notes..." />
            </label>
            <FilterSelect label="Company" value={filters.company} onChange={(event) => updateFilter("company", event.target.value)} options={[["all", "All companies"], ...COMPANIES.map((company) => [company, company])]} />
            <FilterSelect label="Status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} options={[["all", "All statuses"], ...STATUS_ORDER.map((status) => [status, status])]} />
            <FilterSelect label="Owner" value={filters.owner} onChange={(event) => updateFilter("owner", event.target.value)} options={[["all", "All owners"], ...OWNERS.map((owner) => [owner, owner])]} />
            <FilterSelect label="Source" value={filters.source} onChange={(event) => updateFilter("source", event.target.value)} options={[["all", "All sources"], ...SOURCES.map((source) => [source, source])]} />
            <FilterSelect label="Request type" value={filters.requestType} onChange={(event) => updateFilter("requestType", event.target.value)} options={[["all", "All request types"], ...REQUEST_TYPES.map((type) => [type, type])]} />
            <label className="date-filter"><span>Follow-up from</span><input aria-label="Follow-up from" type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
            <label className="date-filter"><span>Follow-up through</span><input aria-label="Follow-up through" type="date" value={filters.through} onChange={(event) => updateFilter("through", event.target.value)} /></label>
            <FilterSelect label="Follow-up state" value={filters.followUp} onChange={(event) => updateFilter("followUp", event.target.value)} options={[["all", "All follow-ups"], ["overdue", "Overdue"], ["today", "Due today"], ["upcoming", "Upcoming · 7 days"], ["later", "Later"], ["none", "No follow-up"]]} />
            <button className="clear-filters" onClick={clearFilters} disabled={!hasActiveFilters}>Clear filters</button>
          </section>

          <div className="results-heading">
            <span>{filters.company === "all" ? "ASPECT COMPANIES · ALL PORTALS" : filters.company.toUpperCase()}</span>
            <strong>{filteredInquiries.length} {filteredInquiries.length === 1 ? "inquiry" : "inquiries"}</strong>
          </div>

          <section className="inquiry-list" aria-label="Reception inquiries">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Contact</th>
                    <th scope="col">Company</th>
                    <th scope="col">Request / source</th>
                    <th scope="col">Next step</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Follow-up due</th>
                    <th scope="col"><span className="visually-hidden">Company portal</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInquiries.map((item) => (
                    <tr key={item.id}>
                      <td className="contact-cell">
                        <button className="contact-link" onClick={() => setSelectedInquiry(item)}>{item.contact}</button>
                        <small>{item.email}</small>
                        <small>{item.phone}</small>
                      </td>
                      <td className="company-cell">
                        <CompanyMark company={item.company} />
                        <span><strong>{item.company}</strong><small>{item.companyType}</small></span>
                      </td>
                      <td className="request-cell">
                        <button onClick={() => setSelectedInquiry(item)} className="request-link">{item.summary}</button>
                        <small>{item.source} · {item.requestType}</small>
                      </td>
                      <td className="next-step-cell">{item.nextStep}</td>
                      <td className="owner-cell"><span className={`owner-avatar owner-${initials(item.owner).toLowerCase()}`}>{initials(item.owner)}</span><span>{item.owner}</span></td>
                      <td><FollowUpBadge date={item.followUpDate} /></td>
                      <td className="portal-cell"><button onClick={() => openCompanyPortal(item.company)}>Open {item.company} portal <span aria-hidden="true">→</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInquiries.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon"><Icon name="search" size={22} /></span>
                  <h2>No inquiries match these filters</h2>
                  <p>Try changing your search or clearing a filter.</p>
                  <button className="button button-secondary" onClick={clearFilters}>Clear filters</button>
                </div>
              )}
            </div>
            <footer className="list-footer"><span>Sample inquiries for this preview</span><span>Showing {filteredInquiries.length} of {INQUIRIES.length}</span></footer>
          </section>
        </section>
      </main>

      {selectedInquiry && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedInquiry(null)}>
          <aside className="inquiry-drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" onMouseDown={(event) => event.stopPropagation()}>
            <header className="drawer-header">
              <div><span className="drawer-eyebrow">INQUIRY DETAILS</span><h2 id="drawerTitle">{selectedInquiry.contact}</h2></div>
              <button className="drawer-close" onClick={() => setSelectedInquiry(null)} aria-label="Close inquiry details">×</button>
            </header>
            <div className="drawer-company"><CompanyMark company={selectedInquiry.company} /><span><strong>{selectedInquiry.company}</strong><small>{selectedInquiry.companyType}</small></span></div>
            <StatusBadge status={selectedInquiry.status} />
            <section className="drawer-section"><span>REQUEST</span><h3>{selectedInquiry.requestType}</h3><p>{selectedInquiry.summary}</p></section>
            <section className="drawer-section"><span>CONTACT</span><p><a href={`mailto:${selectedInquiry.email}`}>{selectedInquiry.email}</a><br />{selectedInquiry.phone}</p></section>
            <section className="drawer-section"><span>NEXT STEP</span><p>{selectedInquiry.nextStep}</p></section>
            <section className="drawer-details-grid">
              <div><span>OWNER</span><strong>{selectedInquiry.owner}</strong></div>
              <div><span>FOLLOW-UP</span><strong>{formatDate(selectedInquiry.followUpDate)}</strong><small>{followUpText(selectedInquiry.followUpDate)}</small></div>
              <div><span>SOURCE</span><strong>{selectedInquiry.source}</strong></div>
            </section>
            <footer className="drawer-footer">
              <button className="button button-secondary" onClick={() => setSelectedInquiry(null)}>Close details</button>
              <button className="button button-primary" onClick={() => openCompanyPortal(selectedInquiry.company)}>Open company portal <span aria-hidden="true">→</span></button>
            </footer>
          </aside>
        </div>
      )}

      {toast && <div className="toast" role="status"><Icon name="circle-check" size={18} />{toast}</div>}
    </div>
  );
}

export { App };

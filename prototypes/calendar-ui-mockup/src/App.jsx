import { useMemo, useState } from "react";
import {
  IconActivity, IconArrowLeft, IconArrowRight, IconBell, IconBriefcase2,
  IconCalendar, IconCalendarEvent, IconCalendarWeek, IconCheck, IconChevronDown,
  IconChevronLeft, IconChevronRight, IconClock, IconDots, IconEdit, IconFilter,
  IconLayoutDashboard, IconMapPin, IconPlus, IconSearch, IconSettings,
  IconUsers, IconX, IconVideo,
} from "@tabler/icons-react";

const initialEvents = [
  { id: 1, day: 1, top: 58, height: 148, start: "9:00 AM", end: "10:00 AM", title: "Chris & Dylan · System building", company: "Aspect Companies", owner: "Dylan Sluyter", owners: ["DS", "CN"], category: "Project planning", tone: "gold", location: "Aspect office" },
  { id: 2, day: 1, top: 212, height: 116, start: "11:00 AM", end: "11:45 AM", title: "Phone call · Roger", company: "Aspect Accounting", owner: "Christy Phillips", owners: ["CP"], category: "Client check-in", tone: "coral", location: "Phone" },
  { id: 3, day: 2, top: 58, height: 136, start: "9:00 AM", end: "10:00 AM", title: "GNEC training", company: "Aspect Accounting", owner: "Dylan Sluyter", owners: ["DS"], category: "Training", tone: "green", location: "Training room" },
  { id: 4, day: 2, top: 212, height: 125, start: "11:00 AM", end: "11:45 AM", title: "Virtual call · LeanLaw", company: "Aspect Accounting", owner: "Christy Phillips", owners: ["CP"], category: "Virtual meeting", tone: "plum", location: "Google Meet" },
  { id: 5, day: 3, top: 136, height: 172, start: "10:00 AM", end: "11:30 AM", title: "Phone call · Megan & Ross", company: "Aspect Accounting", owner: "Christy Phillips", owners: ["CP"], category: "Client check-in", tone: "coral", location: "Phone" },
  { id: 6, day: 3, top: 328, height: 114, start: "12:45 PM", end: "1:30 PM", title: "Review payroll setup", company: "Aspect Accounting", owner: "Dylan Sluyter", owners: ["DS", "CN"], category: "Client work", tone: "gold", location: "Aspect office" },
  { id: 7, day: 4, top: 58, height: 152, start: "9:00 AM", end: "10:00 AM", title: "QuickBooks training · Casa", company: "Aspect Accounting", owner: "Christy Phillips", owners: ["CP"], category: "Training", tone: "green", location: "Aspect office" },
  { id: 8, day: 4, top: 218, height: 126, start: "11:15 AM", end: "12:00 PM", title: "GNEC training", company: "Aspect Accounting", owner: "Dylan Sluyter", owners: ["DS"], category: "Training", tone: "green", location: "Training room" },
  { id: 9, day: 5, top: 58, height: 180, start: "10:00 AM", end: "11:00 AM", title: "Meeting · Prime Tax Refunds", company: "Aspect Accounting", owner: "Dylan Sluyter", owners: ["DS"], category: "Client check-in", tone: "gold", location: "Google Meet" },
  { id: 10, day: 5, top: 260, height: 146, start: "1:00 PM", end: "2:00 PM", title: "Client reporting review", company: "Aspect Accounting", owner: "Christy Phillips", owners: ["CP", "CN"], category: "Client work", tone: "plum", location: "Aspect office" },
  { id: 11, day: 6, top: 98, height: 145, start: "9:30 AM", end: "10:30 AM", title: "Quarterly client check-in", company: "Aspect Consulting Group", owner: "Chris Newington", owners: ["CN"], category: "Client check-in", tone: "coral", location: "Video call" },
  { id: 12, day: 6, top: 268, height: 124, start: "1:00 PM", end: "1:45 PM", title: "Planning session", company: "Aspect Companies", owner: "Dylan Sluyter", owners: ["DS", "CN"], category: "Project planning", tone: "gold", location: "Aspect office" },
];
const people = [
  { initials: "DS", name: "Dylan Sluyter", color: "gold" },
  { initials: "CN", name: "Chris Newington", color: "green" },
  { initials: "CP", name: "Christy Phillips", color: "rose" },
];
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabels = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const categories = [
  { name: "Client check-ins", count: "5h 30m", percent: 74, tone: "coral" },
  { name: "Client work", count: "4h 15m", percent: 61, tone: "gold" },
  { name: "Training", count: "3h", percent: 45, tone: "green" },
  { name: "Project planning", count: "2h 30m", percent: 36, tone: "plum" },
];

function fmtWeek(offset) {
  const start = new Date(2026, 9, 11 + offset * 7);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)}, ${end.getFullYear()}`;
}
function weekDate(offset, dayIndex) { return new Date(2026, 9, 11 + offset * 7 + dayIndex); }
function Person({ initials, color = "gold", small = false }) {
  return <span className={`person-avatar person-${color} ${small ? "person-small" : ""}`} aria-hidden="true">{initials}</span>;
}
function MiniCalendar({ offset, setOffset, selectedDay, setSelectedDay }) {
  const monthDate = new Date(2026, 9 + offset, 1);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(monthDate);
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
  const count = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const prevCount = new Date(monthDate.getFullYear(), monthDate.getMonth(), 0).getDate();
  const cells = Array.from({ length: 35 }, (_, i) => {
    const date = i - firstDay + 1;
    if (date < 1) return { number: prevCount + date, outside: true };
    if (date > count) return { number: date - count, outside: true };
    return { number: date, outside: false };
  });
  return <section className="mini-calendar" aria-label="Mini calendar">
    <header className="mini-calendar-head"><h2>{monthName}</h2><div><button aria-label="Previous month" onClick={() => setOffset(offset - 1)}><IconChevronLeft size={17}/></button><button aria-label="Next month" onClick={() => setOffset(offset + 1)}><IconChevronRight size={17}/></button></div></header>
    <div className="mini-days">{"SMTWTFS".split("").map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="mini-dates">{cells.map((d, i) => <button key={i} className={`${d.outside ? "outside" : ""} ${!d.outside && d.number === selectedDay ? "selected" : ""}`} onClick={() => !d.outside && setSelectedDay(d.number)} aria-label={`${monthName} ${d.number}`}>{d.number}</button>)}</div>
  </section>;
}
function EventCard({ event, onClick, compact = false }) {
  return <button className={`event-card tone-${event.tone} ${compact ? "event-compact" : ""}`} style={compact ? {"--event-top": `${event.top}px`, "--event-height": `${event.height}px`} : undefined} onClick={() => onClick(event)} aria-label={`${event.title}, ${event.start} to ${event.end}, ${event.company}`}>
    <span className="event-time">{event.start} – {event.end}</span><strong>{event.title}</strong><small>{event.company}</small><span className="event-people">{event.owners.map((p) => { const user = people.find((person) => person.initials === p) || people[0]; return <Person key={p} initials={p} color={user.color} small/>; })}</span>
  </button>;
}
function EventDetails({ event, onClose, onEdit }) {
  const eventDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(2026, 9, 11 + event.day));
  return <section className="event-details" aria-label="Selected event details">
    <header><div><span className="eyebrow">{event.company}</span><h2>{event.title}</h2></div><div className="detail-actions"><button aria-label="Edit event" onClick={onEdit}><IconEdit size={18}/></button><button aria-label="Close event details" onClick={onClose}><IconX size={18}/></button></div></header>
    <div className="detail-date"><IconCalendarEvent size={17}/><span>{eventDate}</span><IconChevronDown size={15}/></div>
    <div className="detail-times"><span><IconClock size={16}/> {event.start}</span><span>to</span><span><IconClock size={16}/> {event.end}</span></div>
    <div className="detail-location">{event.location.toLowerCase().includes("meet") || event.location.toLowerCase().includes("video") ? <IconVideo size={18}/> : <IconMapPin size={18}/>}<span>{event.location}</span></div>
    <div className="detail-tags"><span className={`tag tone-${event.tone}`}>{event.category}</span><span className="tag tag-company">{event.company}</span></div>
    <div className="detail-attendees"><div><small>People</small><div className="attendee-list">{event.owners.map((p) => { const user = people.find((person) => person.initials === p) || people[0]; return <Person key={p} initials={p} color={user.color}/>; })}<button className="add-person" aria-label="Add attendee"><IconPlus size={16}/></button></div></div><button className="attendee-count"><IconUsers size={15}/> {event.owners.length} invited</button></div>
    <button className="detail-save" onClick={onClose}><IconCheck size={17}/> Done</button>
  </section>;
}
function EventModal({ onClose, onAdd }) {
  const [title, setTitle] = useState(""); const [day, setDay] = useState("Friday, October 16"); const [start, setStart] = useState("10:00 AM"); const [category, setCategory] = useState("Client check-in");
  return <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="new-event-modal" onSubmit={(e) => { e.preventDefault(); onAdd({ title: title || "New company event", day, start, category }); }}>
    <header><div><span className="eyebrow">ASPECT COMPANIES · CALENDAR</span><h2>Create event</h2><p>Add an item to your company schedule.</p></div><button type="button" aria-label="Close create event" onClick={onClose}><IconX size={19}/></button></header>
    <label>Event name<input autoFocus placeholder="e.g. Client review" value={title} onChange={(e) => setTitle(e.target.value)}/></label>
    <div className="modal-row"><label>Date<input value={day} onChange={(e) => setDay(e.target.value)}/></label><label>Start time<select value={start} onChange={(e) => setStart(e.target.value)}><option>9:00 AM</option><option>10:00 AM</option><option>11:00 AM</option><option>1:00 PM</option><option>2:00 PM</option></select></label></div>
    <div className="modal-row"><label>Company<select><option>Aspect Accounting</option><option>Aspect Companies</option><option>Signature Exteriors</option></select></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Client check-in</option><option>Client work</option><option>Training</option><option>Project planning</option></select></label></div>
    <label>Location<input placeholder="Office, phone, or meeting link"/></label>
    <div className="modal-attendees"><span>Invite people</span><div>{people.map((p) => <label key={p.initials}><input type="checkbox" defaultChecked={p.initials === "DS"}/><Person initials={p.initials} color={p.color}/><small>{p.name.split(" ")[0]}</small></label>)}</div></div>
    <footer><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-dark"><IconPlus size={16}/> Add event</button></footer>
  </form></div>;
}

export function App() {
  const [view, setView] = useState("Week"); const [weekOffset, setWeekOffset] = useState(0); const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(16); const [events, setEvents] = useState(initialEvents); const [selected, setSelected] = useState(initialEvents[8]);
  const [showModal, setShowModal] = useState(false); const [company, setCompany] = useState("All companies"); const [person, setPerson] = useState("All people"); const [response, setResponse] = useState(""); const [toast, setToast] = useState("");
  const filteredEvents = useMemo(() => events.filter((event) => (company === "All companies" || event.company === company) && (person === "All people" || event.owner === person)), [events, company, person]);
  const goToToday = () => { setWeekOffset(0); setMonthOffset(0); setSelectedDay(16); };
  const shiftPeriod = (delta) => {
    if (view === "Month") { setMonthOffset((value) => value + delta); return; }
    const nextWeekOffset = weekOffset + delta;
    setWeekOffset(nextWeekOffset);
    const nextFriday = new Date(2026, 9, 16 + nextWeekOffset * 7);
    setMonthOffset((nextFriday.getFullYear() - 2026) * 12 + nextFriday.getMonth() - 9);
    setSelectedDay(nextFriday.getDate());
  };
  const changeView = (newView) => { setView(newView); setSelected(null); };
  const handleAdd = ({ title, day, start, category }) => {
    const tone = category === "Client check-in" ? "coral" : category === "Training" ? "green" : category === "Client work" ? "gold" : "plum";
    const event = { id: Date.now(), day: 5, top: 450, height: 102, start, end: "11:00 AM", title, company: "Aspect Accounting", owner: "Dylan Sluyter", owners: ["DS"], category, tone, location: "Aspect office" };
    setEvents((current) => [...current, event]); setSelected(event); setShowModal(false); setToast(`${title} added to the calendar`); window.setTimeout(() => setToast(""), 2600);
  };
  const currentMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(2026, 9 + monthOffset, 1));
  const sideUpcoming = filteredEvents.find((event) => event.day >= 5) || filteredEvents[0];
  const visibleDays = view === "Day" ? [5] : [0, 1, 2, 3, 4, 5, 6];
  return <div className="calendar-app">
    <aside className="app-nav">
      <div className="brand"><span className="brand-mark">A</span><span>ASPECT<small>COMPANIES</small></span></div>
      <span className="nav-label">WORKSPACE</span><nav>
        <button><IconLayoutDashboard/><span>Overview</span></button><button><IconUsers/><span>Clients</span></button><button><IconBriefcase2/><span>Projects</span></button><button><IconUsers/><span>Team</span></button><button><IconCalendar/><span>Tasks</span><i>09</i></button><button><IconActivity/><span>Activity</span></button><button className="active"><IconCalendarWeek/><span>Calendar</span></button>
      </nav>
      <div className="nav-footer"><IconSettings size={17}/><span>Portal settings</span></div>
      <div className="nav-user"><Person initials="DS" color="gold"/><div><strong>Dylan Sluyter</strong><small>Platform administrator</small></div><IconDots size={18}/></div>
    </aside>

    <aside className="calendar-rail">
      <div className="rail-profile"><Person initials="DS" color="gold"/><span><strong>Dylan Sluyter</strong><small>Company workspace</small></span><button aria-label="Add personal calendar"><IconPlus size={17}/></button></div>
      <section className="upcoming-card"><div className="section-kicker">UP NEXT <span>Today</span></div><div className="upcoming-main"><span className={`upcoming-mark tone-${sideUpcoming?.tone || "gold"}`}><IconCalendarEvent size={18}/></span><div><strong>{sideUpcoming?.title || "No events today"}</strong><small>{sideUpcoming ? `${sideUpcoming.start} · ${sideUpcoming.company}` : "Your schedule is clear"}</small></div></div><button className="upcoming-open" onClick={() => sideUpcoming && setSelected(sideUpcoming)}>View event <IconArrowRight size={15}/></button></section>
      <MiniCalendar offset={monthOffset} setOffset={setMonthOffset} selectedDay={selectedDay} setSelectedDay={(d) => {setSelectedDay(d);setSelected(null);}}/>
      <section className="attendance-card"><div className="attendance-top"><span className="section-kicker">NEEDS YOUR RESPONSE</span><span className="duration"><IconClock size={14}/> 45 min</span></div><strong>Weekly accounting sync</strong><small>Today · 2:00 PM · Aspect Accounting</small><div className="response-options"><button className={response === "Yes" ? "chosen" : ""} onClick={() => setResponse("Yes")}>{response === "Yes" && <IconCheck size={13}/>}Yes</button><button className={response === "Maybe" ? "chosen" : ""} onClick={() => setResponse("Maybe")}>Maybe</button><button className={response === "No" ? "chosen" : ""} onClick={() => setResponse("No")}>No</button></div></section>
      <section className="time-breakdown"><header><div><span className="section-kicker">THIS WEEK</span><h2>Time breakdown</h2></div><button aria-label="More time options"><IconDots size={18}/></button></header><div className="time-total"><strong>15h 15m</strong><small>scheduled team time</small></div>{categories.map((item) => <div className="time-category" key={item.name}><div><span className={`category-dot ${item.tone}`}></span><span>{item.name}</span><strong>{item.count}</strong></div><div className="time-track"><i className={item.tone} style={{ width: `${item.percent}%` }}></i></div></div>)}</section>
      <div className="rail-footnote">Times shown in Eastern Time</div>
    </aside>

    <main className="calendar-main">
      <header className="main-topbar"><div className="crumbs"><span>Aspect Companies</span><IconChevronRight size={14}/><strong>Calendar</strong></div><div className="top-actions"><button aria-label="Search"><IconSearch size={17}/><span>Search</span><kbd>Ctrl K</kbd></button><button aria-label="Notifications"><IconBell size={17}/></button><button className="button-dark" onClick={() => setShowModal(true)}><IconPlus size={16}/> New event</button></div></header>
      <div className="calendar-content">
        <header className="calendar-heading"><div><span className="eyebrow">YOUR ORGANIZATION</span><h1>Company calendar</h1><p>Team schedule across all Aspect companies.</p></div></header>
        <section className="schedule-toolbar"><div className="period-controls"><div className="arrow-pair"><button aria-label="Previous period" onClick={() => shiftPeriod(-1)}><IconChevronLeft size={18}/></button><button aria-label="Next period" onClick={() => shiftPeriod(1)}><IconChevronRight size={18}/></button></div><h2>{view === "Week" ? fmtWeek(weekOffset) : view === "Month" ? currentMonth : view === "Day" ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(2026, 9, 16 + weekOffset * 7)) : fmtWeek(weekOffset)}</h2><button className="today-button" onClick={goToToday}>Today</button></div><div className="toolbar-right"><div className="view-switch" role="tablist" aria-label="Calendar view">{["Month", "Week", "Day", "Agenda"].map((v) => <button role="tab" aria-selected={view === v} className={view === v ? "selected" : ""} onClick={() => changeView(v)} key={v}>{v}</button>)}</div><label className="filter-select"><span>Company</span><select value={company} onChange={(e) => setCompany(e.target.value)}><option>All companies</option><option>Aspect Accounting</option><option>Aspect Companies</option><option>Aspect Consulting Group</option></select></label><label className="filter-select people-filter"><span>People</span><select value={person} onChange={(e) => setPerson(e.target.value)}><option>All people</option>{people.map((p) => <option key={p.initials}>{p.name}</option>)}</select></label></div></section>
        <div className="calendar-legend">{people.map((p) => <span key={p.initials}><Person initials={p.initials} color={p.color}/>{p.name}</span>)}</div>
        {view === "Agenda" ? <section className="agenda-list">{filteredEvents.map((event) => <EventCard key={event.id} event={event} onClick={setSelected}/>)}</section> : view === "Month" ? <section className="month-grid"><div className="month-header">{days.map((d) => <strong key={d}>{d}</strong>)}</div><div className="month-days">{Array.from({length:35},(_,i)=> {const dayNum=i-3;const label=dayNum<1?27+dayNum:dayNum>31?dayNum-31:dayNum;const outside=dayNum<1||dayNum>31;const dateNum=outside?null:dayNum;const todays=dayNum===16;return <div className={`month-cell ${outside?"outside":""} ${todays?"today":""}`} key={i}><span>{label}</span>{!outside&&filteredEvents.filter(e=>e.day===(dateNum%7)).slice(0,2).map(e=><button key={e.id} className={`month-event tone-${e.tone}`} onClick={()=>setSelected(e)}>{e.start} {e.title}</button>)}</div>;})}</div></section> : <section className={`week-grid ${view === "Day" ? "day-view" : ""}`} aria-label={`${view} calendar`}>
          <div className="week-head"><div className="timezone">ET</div>{visibleDays.map((dayIndex) => { const date = weekDate(weekOffset, dayIndex); return <div className={`week-day-head ${weekOffset === 0 && dayIndex === 5 ? "current-day" : ""}`} key={dayIndex}><small>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase()}</small><strong>{date.getDate()}</strong></div>; })}</div>
          <div className="week-body"><div className="time-axis">{hourLabels.map((hour) => <span key={hour}>{hour}</span>)}</div><div className="day-columns">{visibleDays.map((dayIndex) => <div className={`day-lane ${weekOffset === 0 && dayIndex === 5 ? "current-day" : ""}`} key={dayIndex}>{hourLabels.slice(0,-1).map((hour) => <i className="hour-rule" key={hour} />)}{filteredEvents.filter((event) => event.day === dayIndex).map((event) => <EventCard key={event.id} event={event} onClick={setSelected} compact/>)}{weekOffset === 0 && dayIndex === 5 && <div className="now-line"><span>NOW</span></div>}{dayIndex === 2 && <button className="empty-slot" onClick={() => setShowModal(true)} aria-label="Create event Tuesday at 10 AM"><IconPlus size={16}/></button>}</div>)}</div></div>
        </section>}
        <footer className="calendar-foot"><span><i className="online-dot"/> Calendar is up to date</span><button onClick={() => setShowModal(true)}><IconPlus size={15}/> Add event</button></footer>
      </div>
      {selected && <EventDetails event={selected} onClose={() => setSelected(null)} onEdit={() => setShowModal(true)}/>}
      {showModal && <EventModal onClose={() => setShowModal(false)} onAdd={handleAdd}/>}
      {toast && <div className="toast"><IconCheck size={16}/>{toast}</div>}
    </main>
  </div>;
}

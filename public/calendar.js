(function () {
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const HOUR_START = 8, HOUR_END = 18, HOUR_HEIGHT = 72;
  let view = window.matchMedia?.('(max-width: 820px), (max-width: 1024px) and (max-height: 520px)')?.matches?'agenda':'month', cursor = null, data = { companies: [], people: [], events: [] }, activeTimeZone='';
  let requestSequence = 0, loadedRange = '', loadedScope = '', previousView = null, previousCalendarScope = '', previousCalendarActive = false, renderedCurrentTimeDate = '';
  const selectedAttendeeIds = new Set();let externalGuests=[],calendarSelectedClientId='',autoFilledClientPhone='',pendingCalendarCreate=null,editingCalendarEventId=null,editingCalendarUpdatedAt=null;
  const attendeePeopleByCompany = new Map();
  const calendarClientsByCompany = new Map();let clientLoadSequence=0;
  const CALENDAR_USER_COLORS = ['gold','green','coral','blue','violet','teal','rose','orange'];
  const calendarModalNotificationContext=document.createElement('div');calendarModalNotificationContext.id='calendarNotificationContext';calendarModalNotificationContext.className='calendar-notification-context';calendarModalNotificationContext.hidden=true;$('#calendarForm')?.insertAdjacentElement('beforebegin',calendarModalNotificationContext);
  const calendarPageNotificationContext=document.createElement('div');calendarPageNotificationContext.id='calendarPageNotificationContext';calendarPageNotificationContext.className='calendar-page-notification-context';calendarPageNotificationContext.hidden=true;$('#calendarView')?.insertAdjacentElement('afterbegin',calendarPageNotificationContext);
  const calendarEventDetails=document.createElement('section');calendarEventDetails.id='calendarEventDetails';calendarEventDetails.className='calendar-event-details';calendarEventDetails.hidden=true;calendarEventDetails.setAttribute('role','dialog');calendarEventDetails.setAttribute('aria-modal','false');calendarEventDetails.setAttribute('aria-label','Selected event details');$('#calendarView')?.append(calendarEventDetails);
  const CALENDAR_TIME_CATEGORY_COLORS = {'Client check-in':'#96730f','Discovery':'#4f8963','Project planning':'#547aa5','Status review':'#b55c5c','Proposal review':'#8068a8','Training':'#16847c','Internal planning':'#c17245','System building':'#3f6f9e','Virtual Meeting':'#b25f7c','Other':'#77808d','Lunch Break':'#aa8746','Time Off':'#8b78a8'};
  const pad = value => String(value).padStart(2,'0');
  const userColor = person => CALENDAR_USER_COLORS.includes(person?.calendarColor)?person.calendarColor:'gold';
  function eventDisplayColor(event){
    const viewerId=state.user?.id;
    if(viewerId&&viewerId!==event.createdBy){
      const viewerAttendee=event.attendees?.find(person=>person.id===viewerId);
      if(viewerAttendee)return userColor(viewerAttendee);
    }
    return CALENDAR_USER_COLORS.includes(event?.color)?event.color:'gold';
  }
  const timeZone = () => window.displayTimeZone?.()||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const carrier = (year,month,day) => new Date(Date.UTC(year,month-1,day,12));
  const key = date => date.getUTCFullYear()+'-'+pad(date.getUTCMonth()+1)+'-'+pad(date.getUTCDate());
  const parseKey = value => {const [y,m,d]=value.split('-').map(Number);return carrier(y,m,d);};
  const addDays = (date,n) => {const result=new Date(date);result.setUTCDate(result.getUTCDate()+n);return result;};
  const weekStart = date => {const result=carrier(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());result.setUTCDate(result.getUTCDate()-result.getUTCDay());return result;};
  const zonedFormatters=new Map(),timeLabelFormatters=new Map(),timeZoneNameFormatters=new Map(),zonedPartsCache=new Map(),wallTimeCache=new Map(),dayBoundaryCache=new Map();
  function cachedValue(cache,key,create,limit){if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}const value=create();cache.set(key,value);if(cache.size>limit)cache.delete(cache.keys().next().value);return value;}
  const zonedFormatter = zone => cachedValue(zonedFormatters,zone,()=>new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),64);
  const timeZoneNameFormatter = zone => cachedValue(timeZoneNameFormatters,zone,()=>new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longGeneric'}),64);
  const zonedParts = (instant,zone=timeZone()) => {const timestamp=new Date(instant).getTime();return cachedValue(zonedPartsCache,zone+'|'+timestamp,()=>Object.fromEntries(zonedFormatter(zone).formatToParts(new Date(timestamp)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)])),1024);};
  const instantKey = (instant,zone=timeZone()) => {const parts=zonedParts(instant,zone);return parts.year+'-'+pad(parts.month)+'-'+pad(parts.day);};
  const todayInZone = () => parseKey(instantKey(Date.now()));
  function pastCalendarDate(date){return key(date)<key(todayInZone());}
  function showPastCreateNotice(){showToast('Calendar items can only be created for today or a future date.','error');}
  function defaultCalendarCreateDate(date){return date&&!pastCalendarDate(date)?date:todayInZone();}
  function wallTimeToInstant(date,time,zone=timeZone()){return cachedValue(wallTimeCache,zone+'|'+date+'|'+time,()=>{
    const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),wall=Date.UTC(year,month-1,day,hour,minute),offsets=new Set();
    for(let step=-48;step<=48;step+=6){const sample=wall+step*3600000,parts=zonedParts(sample,zone);offsets.add(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-sample);}
    const candidates=[];for(const offset of offsets){const instant=wall-offset,parts=zonedParts(instant,zone);if(parts.year===year&&parts.month===month&&parts.day===day&&parts.hour===hour&&parts.minute===minute)candidates.push(instant);}
    return candidates.length?Math.min(...candidates):NaN;
  },512);}
  function startOfDate(date){return cachedValue(dayBoundaryCache,timeZone()+'|'+date,()=>{
    const midnight=wallTimeToInstant(date,'00:00');
    if(Number.isFinite(midnight))return midnight;
    for(let minute=1;minute<=360;minute++){const instant=wallTimeToInstant(date,pad(Math.floor(minute/60))+':'+pad(minute%60));if(Number.isFinite(instant))return instant;}
    return NaN;
  },256);}
  const localDate = (date,hour=0,minute=0) => new Date(wallTimeToInstant(key(date),pad(hour)+':'+pad(minute)));
  const initials = name => String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const dateLabel = (date,options) => date.toLocaleDateString(undefined,{...options,timeZone:'UTC'});
  const timeLabel = date => {const parts=zonedParts(date,timeZone()),hour=parts.hour%12||12,minute=parts.minute?':'+pad(parts.minute):'',meridiem=parts.hour<12?'AM':'PM';return hour+minute+' '+meridiem;};
  function updateCurrentTimeIndicators(){
    const now=Date.now(),parts=zonedParts(now,timeZone()),minutes=parts.hour*60+parts.minute+parts.second/60-HOUR_START*60,visible=minutes>=0&&minutes<(HOUR_END-HOUR_START)*60,top=Math.max(0,minutes*(HOUR_HEIGHT/60))+'px';
    document.querySelectorAll('[data-calendar-current-time]').forEach(indicator=>{indicator.style.top=top;indicator.hidden=!visible;});
    const label=document.querySelector('[data-calendar-now-label]');if(label){label.style.top=top;label.textContent=timeLabel(new Date(now));label.hidden=!visible;}
  }
  function tickCurrentTimeIndicators(){
    if(document.hidden)return;
    const active=state.view==='calendar'||state.view==='companyWorkspace'&&state.activeCompanyWorkspaceTab==='calendar';if(!active)return;
    const today=instantKey(Date.now());if(today!==renderedCurrentTimeDate){render();return;}
    updateCurrentTimeIndicators();
  }
  function calendarCompanyContext(){if(document.body.classList.contains('company-portal-mode'))return state.user?.activeCompanyId||'';return state.view==='companyWorkspace'?state.activeCompanyWorkspaceId||'':'';}

  function setupCalendarWizard(){
    const grid=$('#calendarForm .calendar-form-grid'),basics=document.createElement('div'),schedule=document.createElement('div'),details=document.createElement('div'),actions=$('#calendarForm .calendar-form-actions');
    basics.id='calendarBasicsStep';basics.className='calendar-wizard-step calendar-wizard-step-basics full-field';
    basics.innerHTML='<div class="calendar-wizard-heading"><span>MEETING SETUP</span><h3>Choose the calendar and meeting nature</h3><p>Select the company calendar and nature of meeting before scheduling it.</p></div>';
    schedule.id='calendarScheduleStep';schedule.className='calendar-wizard-step calendar-wizard-step-schedule full-field';
    schedule.innerHTML='<div class="calendar-wizard-heading"><span>SCHEDULE</span><h3>Set the date and time</h3><p>Choose when the meeting will take place.</p></div>';
    details.id='calendarDetailsStep';details.className='calendar-wizard-step calendar-wizard-step-details full-field';
    details.innerHTML='<div class="calendar-wizard-heading"><span>OPTIONAL DETAILS</span><h3>Add meeting details</h3><p>Add a client, team members, guests, a location, or notes.</p></div>';
    const progress=document.createElement('div');progress.id='calendarWizardProgress';progress.className='calendar-wizard-progress full-field';progress.innerHTML='<span id="calendarWizardStepLabel">Step 1 of 3</span><div><i id="calendarWizardProgressBar"></i></div>';
    grid.insertBefore(details,grid.firstChild);grid.insertBefore(schedule,details);grid.insertBefore(basics,schedule);grid.insertBefore(progress,basics);
    const basicNames=new Set(['eventType','title','companyId','meetingType']);
    const scheduleNames=new Set(['blockLength','startDate','endDate','allDay','startTime','endTime','timeZone']);
    for(const node of [...grid.children]){
      if(node===progress||node===basics||node===schedule||node===details||node===actions||node.id==='calendarError')continue;
      const name=node.querySelector?.('[name]')?.name;
      (basicNames.has(name)?basics:scheduleNames.has(name)||node.id==='calendarBlockNote'?schedule:details).append(node);
    }
    const back=document.createElement('button');back.type='button';back.id='calendarStepBack';back.className='button button-secondary';back.textContent='Back';back.hidden=true;
    const next=document.createElement('button');next.type='button';next.id='calendarStepContinue';next.className='button button-primary';next.textContent='Continue';next.hidden=true;
    const cancel=$('#calendarCancel'),saveButton=$('#calendarSave'),spacer=actions.querySelector(':scope > span');actions.insertBefore(back,spacer||cancel);actions.insertBefore(next,saveButton);
  }
  function setCalendarWizardStep(step=1){
    const form=$('#calendarForm'),enabled=form.dataset.wizardCreate==='true',hasDetails=form.elements.eventType.value==='event',basics=$('#calendarBasicsStep'),schedule=$('#calendarScheduleStep'),details=$('#calendarDetailsStep');
    basics.hidden=enabled&&(!hasDetails||step!==1);schedule.hidden=enabled&&hasDetails&&step!==2;details.hidden=enabled&&(!hasDetails||step!==3);
    $('#calendarStepBack').hidden=!enabled||!hasDetails||step===1;
    $('#calendarStepContinue').hidden=!enabled||!hasDetails||step===3;
    $('#calendarStepContinue').textContent=step===1?'Continue to schedule':'Add meeting details';
    $('#calendarSave').hidden=enabled&&hasDetails&&step!==3;
    $('#calendarWizardProgress').hidden=!enabled||!hasDetails;
    if(enabled&&hasDetails){$('#calendarWizardStepLabel').textContent=`Step ${step} of 3`;$('#calendarWizardProgressBar').style.width=(step*100/3)+'%';}
  }
  function validateCalendarWizardStep(step){
    const form=$('#calendarForm'),section=$(step===1?'#calendarBasicsStep':'#calendarScheduleStep');$('#calendarError').textContent='';
    for(const field of section.querySelectorAll('input,select,textarea'))if(!field.disabled&&field.required&&!field.checkValidity()){if(field.name==='companyId')$('#calendarError').textContent='Choose a company calendar before continuing.';else if(field.name==='meetingType')$('#calendarError').textContent='Choose a nature of meeting before continuing.';field.reportValidity();return false;}
    if(step===1){if(!form.elements.companyId.value){$('#calendarError').textContent='Choose a company calendar before continuing.';return false;}if(!form.elements.meetingType.value){$('#calendarError').textContent='Choose a nature of meeting before continuing.';form.elements.meetingType.focus();return false;}return true;}
    try{payload();return true;}catch(error){$('#calendarError').textContent=error.message;return false;}
  }
  function closeEventDetails(){calendarEventDetails.hidden=true;calendarEventDetails.innerHTML='';}
  function openEventDetails(event,anchor=null){
    if(!event)return;
    closeOverlapStack();
    const people=event.attendees?.length?event.attendees:[{id:event.createdBy,name:event.createdByName,calendarColor:event.color||'gold'}],zone=event.timeZone||timeZone(),start=event.allDay?null:zonedParts(Date.parse(event.startsAt),zone),eventDate=event.allDay?(event.startDate||event.startsAt.slice(0,10)):start.year+'-'+pad(start.month)+'-'+pad(start.day),dateText=dateLabel(parseKey(eventDate),{weekday:'long',month:'long',day:'numeric',year:'numeric'}),when=event.allDay?'All day':timeLabel(Date.parse(event.startsAt))+' to '+timeLabel(Date.parse(event.endsAt)),manage=mayManageEvent(event),attendee=event.attendees?.find(person=>person.id===state.user?.id),showRsvp=!manage&&Boolean(attendee),category=event.eventType==='lunch'?'Lunch Break':event.eventType==='unavailable'?'Time Off':event.meetingType||'Meeting';
    const avatars=people.map(person=>'<i class="calendar-person-avatar calendar-user-color-'+userColor(person)+'" title="'+escapeHtml(person.name)+'" aria-hidden="true">'+escapeHtml(initials(person.name))+'</i>').join('');
    calendarEventDetails.innerHTML='<header class="calendar-event-details-head"><div><span class="eyebrow">'+escapeHtml(event.companyName||'Company calendar')+'</span><h2>'+escapeHtml(event.title)+'</h2></div><div class="calendar-event-details-actions">'+(manage?'<button type="button" class="calendar-details-icon" data-calendar-details-edit aria-label="Edit event">✎</button>':'')+'<button type="button" class="calendar-details-icon" data-calendar-details-close aria-label="Close event details">×</button></div></header><div class="calendar-event-details-info"><p><svg class="ui-icon calendar-event-info-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="/icons.svg?v=20261016-calendar-event-info-icons-1#aspect-icon-calendar-days"></use></svg>'+escapeHtml(dateText)+'</p><p><svg class="ui-icon calendar-event-info-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="/icons.svg?v=20261016-calendar-event-info-icons-1#aspect-icon-clock-3"></use></svg>'+escapeHtml(when)+'</p><p><svg class="ui-icon calendar-event-info-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="/icons.svg?v=20261016-calendar-event-info-icons-1#aspect-icon-map-pin"></use></svg>'+escapeHtml(event.location||'Location not set')+'</p></div><div class="calendar-event-details-tags"><span>'+escapeHtml(category)+'</span><span>'+escapeHtml(event.companyName||'Company calendar')+'</span></div><div class="calendar-event-details-people"><small>People</small><div>'+avatars+(showRsvp?'<span class="calendar-invite-state">'+escapeHtml(attendee.response==='awaiting'?'Invited':attendee.response)+'</span>':'')+'</div></div>'+(showRsvp?'<div class="calendar-details-rsvp"><button type="button" data-calendar-details-rsvp="accepted">Accept</button><button type="button" data-calendar-details-rsvp="maybe">Maybe</button><button type="button" data-calendar-details-rsvp="declined">Decline</button></div>':'')+'<button type="button" class="calendar-details-done" data-calendar-details-close>Done</button>';
    calendarEventDetails.dataset.eventId=event.id;
    if(anchor){const rect=anchor.getBoundingClientRect(),width=Math.min(350,window.innerWidth-24),left=Math.max(12,Math.min(rect.left-width-12,window.innerWidth-width-12)),top=Math.max(76,Math.min(rect.top-34,window.innerHeight-470));calendarEventDetails.style.setProperty('--event-details-left',left+'px');calendarEventDetails.style.setProperty('--event-details-top',top+'px');}
    calendarEventDetails.hidden=false;calendarEventDetails.querySelector('[data-calendar-details-close]')?.focus();
  }
  async function respondToCalendarInvite(eventId,response,button){
    const selected=data.events.find(item=>item.id===eventId);if(!selected)return;
    button.disabled=true;
    try{const result=await api('/api/calendar/events/'+encodeURIComponent(eventId)+'/rsvp',{method:'POST',body:JSON.stringify({response})}),person=selected.attendees.find(item=>item.id===state.user?.id);if(person)person.response=result.response;showToast('Your calendar response was saved.');openEventDetails(selected);render();}
    catch(error){showToast(error.message,'error');button.disabled=false;}
  }

  function rangeForView(){
    if(view==='month'){const start=weekStart(carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1));return{start,end:addDays(start,42)};}
    if(view==='week'||view==='agenda'){const start=weekStart(cursor);return{start,end:addDays(start,7)};}
    const start=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,cursor.getUTCDate());return{start,end:addDays(start,1)};
  }
  function filteredEvents(){
    const companyId=$('#calendarCompanyFilter').value,personId=$('#calendarPeopleFilter').value;
    return data.events.filter(event=>(!companyId||!event.companyId||event.companyId===companyId)&&(!personId||event.attendees.some(person=>person.id===personId)));
  }
  function fillFilters(previousScope=''){
    const companyContext=calendarCompanyContext(),scoped=Boolean(companyContext),companyOptions=data.companies.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join(''),filterOptions='<option value="">All companies</option>'+companyOptions,formOptions=scoped?companyOptions:'<option value="" disabled>Select a company</option>'+companyOptions;
    const people='<option value="">All people</option>'+data.people.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+'</option>').join('');
    const companyFilter=$('#calendarCompanyFilter'),formCompany=$('#calendarForm [name="companyId"]'),peopleFilter=$('#calendarPeopleFilter'),companyField=$('#calendarCompanyField'),companyFilterField=companyFilter.closest('.calendar-filter');
    const selectedCompany=companyFilter.value,formSelection=formCompany.value,selectedPerson=peopleFilter.value;
    companyFilter.innerHTML=filterOptions;formCompany.innerHTML=formOptions;peopleFilter.innerHTML=people;
    companyFilter.value=previousScope!==companyContext?(scoped?companyContext:''):(selectedCompany===''||data.companies.some(company=>company.id===selectedCompany)?selectedCompany:(scoped?companyContext:''));
    formCompany.value=scoped?companyContext:previousScope?'':(data.companies.some(company=>company.id===formSelection)?formSelection:(data.companies.some(company=>company.id===selectedCompany)?selectedCompany:''));
    const zoneField=$('#calendarForm [name="timeZone"]'),companyZone=data.companies.find(company=>company.id===formCompany.value)?.timeZone||timeZone(),desiredZone=previousScope!==companyContext?companyZone:(zoneField.value||companyZone);zoneField.innerHTML=window.timeZoneOptionsHtml?.(desiredZone)||'';zoneField.value=desiredZone;
    companyFilter.disabled=false;companyFilterField.hidden=false;companyField.hidden=false;formCompany.required=!scoped;formCompany.disabled=scoped;peopleFilter.value=selectedPerson;
    const scopedCompany=data.companies.find(company=>company.id===companyContext);$('#calendarCompanyHelp').textContent=scopedCompany?'This event will be added to the '+scopedCompany.name+' calendar.':'Select which company calendar this event belongs to.';
    if(!$('#calendarBackdrop').hidden)renderAttendeeOptions();
  }
  function attendeesForCompany(companyId){
    if(attendeePeopleByCompany.has(companyId))return attendeePeopleByCompany.get(companyId);
    const people=data.people.filter(person=>person.role==='Platform administrator'||person.id===state.user?.id||!Array.isArray(person.companyIds)||person.companyIds.includes(companyId));
    attendeePeopleByCompany.set(companyId,people);if(attendeePeopleByCompany.size>8)attendeePeopleByCompany.delete(attendeePeopleByCompany.keys().next().value);return people;
  }
  function syncSelectedAttendees(){
    $('#calendarAttendeeOptions').querySelectorAll('input[name="attendeeIds"]').forEach(input=>{if(input.checked)selectedAttendeeIds.add(input.value);else selectedAttendeeIds.delete(input.value);});
  }
  function renderAttendeeOptions(selectedIds=null){
    const form=$('#calendarForm'),companyId=form.elements.companyId.value||calendarCompanyContext(),options=$('#calendarAttendeeOptions'),status=$('#calendarAttendeeStatus');
    if(Array.isArray(selectedIds)){selectedAttendeeIds.clear();selectedIds.forEach(id=>selectedAttendeeIds.add(String(id)));}
    else syncSelectedAttendees();
    if(!companyId){options.innerHTML='<p class="calendar-empty">Choose a company to see its team members.</p>';status.textContent='';return;}
    const people=attendeesForCompany(companyId);
    options.innerHTML=people.map(person=>'<label class="calendar-attendee-chip"><input type="checkbox" name="attendeeIds" value="'+escapeHtml(person.id)+'" '+(selectedAttendeeIds.has(person.id)?'checked':'')+'><span class="calendar-person-avatar calendar-user-color-'+userColor(person)+'">'+escapeHtml(initials(person.name))+'</span><span><strong>'+escapeHtml(person.name)+'</strong><small>'+escapeHtml(person.role)+(person.response&&person.response!=='awaiting'?' · '+escapeHtml(person.response):'')+'</small></span></label>').join('')||'<p class="calendar-empty">No team members are available for this company yet.</p>';
    status.textContent=selectedAttendeeIds.size+' selected';
  }
  function calendarClientCanManage(companyId){return Boolean(data.companies.find(company=>company.id===companyId)?.canManageClients);}
  function renderCalendarClients(companyId){
    const select=$('#calendarClientSelect'),status=$('#calendarClientStatus'),toggle=$('#calendarQuickAddToggle');if(!select)return;
    const clients=calendarClientsByCompany.get(companyId)||[],selected=clients.find(client=>client.id===calendarSelectedClientId);
    select.innerHTML='<option value="">No client selected</option>'+clients.map(client=>'<option value="'+escapeHtml(client.id)+'" data-search-text="'+escapeHtml([client.name,client.contactName,client.email,client.phone].filter(Boolean).join(' '))+'">'+escapeHtml(client.name+(client.contactName?' · '+client.contactName:''))+'</option>').join('');
    if(selected)select.value=selected.id;else if(calendarSelectedClientId&&clients.length){calendarSelectedClientId='';select.value='';}
    select.searchableUi?.refresh();
    const canAdd=calendarClientCanManage(companyId);toggle.hidden=!canAdd;
    if(!clients.length)status.textContent=canAdd?'No clients yet. Add one here or in Clients.':'No clients have been added for this company yet.';
    else status.textContent=(selected?'Selected: '+selected.name+' · ':'')+clients.length+' client'+(clients.length===1?'':'s')+' available.';
  }
  async function loadCalendarClients(companyId,selectedId=''){
    const sequence=++clientLoadSequence,select=$('#calendarClientSelect'),status=$('#calendarClientStatus');calendarSelectedClientId=selectedId||'';
    if(!companyId){calendarClientsByCompany.delete('__empty__');select.innerHTML='<option value="">No client selected</option>';select.searchableUi?.refresh();status.textContent='Choose a company to load its clients.';$('#calendarQuickAddToggle').hidden=true;return;}
    if(calendarClientsByCompany.has(companyId)){renderCalendarClients(companyId);return;}
    status.textContent='Loading clients…';select.innerHTML='<option value="">Loading clients…</option>';select.searchableUi?.refresh();
    try{const clients=await api('/api/clients?companyId='+encodeURIComponent(companyId));if(sequence!==clientLoadSequence||$('#calendarBackdrop').hidden||$('#calendarForm').elements.companyId.value!==companyId)return;calendarClientsByCompany.set(companyId,clients);renderCalendarClients(companyId);}
    catch(error){if(sequence===clientLoadSequence){select.innerHTML='<option value="">No client selected</option>';select.searchableUi?.refresh();status.textContent='Clients could not be loaded. '+error.message;$('#calendarQuickAddToggle').hidden=true;}}
  }
  function resetCalendarQuickAdd(){const panel=$('#calendarQuickAddPanel');if(panel)panel.hidden=true;$('#calendarQuickAddName').value='';$('#calendarQuickAddContact').value='';$('#calendarQuickAddEmail').value='';$('#calendarQuickAddError').textContent='';}
  async function saveCalendarQuickAddedClient(){
    const companyId=$('#calendarForm').elements.companyId.value,name=$('#calendarQuickAddName').value.trim(),contactName=$('#calendarQuickAddContact').value.trim(),email=$('#calendarQuickAddEmail').value.trim(),button=$('#calendarQuickAddSave'),error=$('#calendarQuickAddError');error.textContent='';
    if(!companyId){error.textContent='Choose a company calendar first.';return;}if(name.length<2){error.textContent='Enter a client name with at least two characters.';return;}if(email&&!$('#calendarQuickAddEmail').checkValidity()){error.textContent='Enter a valid client email address.';return;}
    button.disabled=true;try{const client=await api('/api/clients',{method:'POST',body:JSON.stringify({companyId,name,contactName,email,phone:'',location:'',notes:''})}),clients=calendarClientsByCompany.get(companyId)||[];clients.push(client);clients.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));calendarClientsByCompany.set(companyId,clients);calendarSelectedClientId=client.id;const select=$('#calendarClientSelect');select.value=client.id;select.dispatchEvent(new Event('change',{bubbles:true}));resetCalendarQuickAdd();showToast('Client added and selected for this event.');}
    catch(saveError){error.textContent=saveError.message;}finally{button.disabled=false;}
  }
  function externalGuestStatusLabels(guest){
    const emailStatus=guest.emailStatus==='sent'?{className:'sent',label:'Invitation sent'}:guest.emailStatus==='failed'?{className:'failed',label:'Email not sent'}:{className:'pending',label:'Invitation pending'};
    const response=guest.response==='accepted'?{className:'accepted',label:'Accepted'}:guest.response==='maybe'?{className:'maybe',label:'Maybe'}:guest.response==='declined'?{className:'declined',label:'Declined'}:{className:'awaiting',label:'Awaiting response'};
    return '<div class="calendar-external-statuses" aria-label="Invitation status"><span class="calendar-status-badge calendar-email-status is-'+emailStatus.className+'">'+emailStatus.label+'</span><span class="calendar-status-badge calendar-response-status is-'+response.className+'">'+response.label+'</span></div>';
  }
  function renderExternalGuests(readonly=false){
    const list=$('#calendarExternalList');if(!list)return;list.innerHTML=externalGuests.map((guest,index)=>'<div class="calendar-external-guest"><div class="calendar-external-guest-info"><strong>'+escapeHtml(guest.name||guest.email||'External guest')+'</strong><small>'+escapeHtml(guest.email||'Email hidden')+'</small>'+externalGuestStatusLabels(guest)+(guest.emailError?'<small class="calendar-email-error">'+escapeHtml(guest.emailError)+'</small>':'')+'</div>'+(readonly?'':'<button type="button" class="text-button" data-calendar-remove-external="'+index+'" aria-label="Remove '+escapeHtml(guest.name||guest.email)+'">Remove</button>')+'</div>').join('');
    const status=$('#calendarGuestStatus');if(status)status.innerHTML=externalGuests.map(guest=>'<div class="calendar-external-guest"><div class="calendar-external-guest-info"><strong>'+escapeHtml(guest.name||'External guest')+'</strong><small>'+escapeHtml(guest.email||'')+'</small>'+externalGuestStatusLabels(guest)+(guest.emailError?'<small class="calendar-email-error">'+escapeHtml(guest.emailError)+'</small>':'')+'</div></div>').join('');
  }
  function syncCalendarClientPhone(){const form=$('#calendarForm'),location=form.elements.location;if(form.elements.locationType.value!=='Phone'){if(autoFilledClientPhone&&location.value===autoFilledClientPhone)location.value='';autoFilledClientPhone='';return;}const client=(calendarClientsByCompany.get(form.elements.companyId.value)||[]).find(item=>item.id===calendarSelectedClientId),phone=String(client?.phone||'').trim();if(autoFilledClientPhone&&location.value===autoFilledClientPhone){location.value=phone;autoFilledClientPhone=phone;return;}if(phone&&!location.value.trim()){location.value=phone;autoFilledClientPhone=phone;}}
  function updateCalendarLocationHint(){const form=$('#calendarForm'),type=form.elements.locationType.value,label=$('#calendarLocationDetailsLabel'),input=form.elements.location;if(type==='Phone'){label.firstChild.textContent='Client Phone Number';input.placeholder='Enter a client phone number';syncCalendarClientPhone();}else if(type==='Virtual meeting'){label.firstChild.textContent='Meeting link or platform';input.placeholder='Add the meeting link or platform';syncCalendarClientPhone();}else{label.firstChild.textContent='On-site address';input.placeholder='Add the building, room, or address';syncCalendarClientPhone();}}
  async function loadCalendar(force=false){
    const active=state.view==='calendar'||state.view==='companyWorkspace'&&state.activeCompanyWorkspaceTab==='calendar';if(!active||!state.user)return;
    if(activeTimeZone!==timeZone()){activeTimeZone=timeZone();cursor=todayInZone();loadedRange='';}
    if(!cursor)cursor=todayInZone();
    const range=rangeForView(),rangeKey=key(range.start)+':'+key(range.end),scope=calendarCompanyContext(),previousScope=loadedScope;
    if(!force&&loadedRange===rangeKey&&loadedScope===scope){render();return;}
    const sequence=++requestSequence;$('#calendarGrid').innerHTML='<p class="calendar-empty">Loading your calendar…</p>';
    try{
      const from=encodeURIComponent(new Date(startOfDate(key(range.start))).toISOString()),to=encodeURIComponent(new Date(startOfDate(key(range.end))).toISOString()),fromDate=encodeURIComponent(key(range.start)),toDate=encodeURIComponent(key(range.end));
      const result=await api('/api/calendar?from='+from+'&to='+to+'&fromDate='+fromDate+'&toDate='+toDate);
      if(sequence!==requestSequence||!(state.view==='calendar'||state.view==='companyWorkspace'&&state.activeCompanyWorkspaceTab==='calendar'))return;
      data=result;attendeePeopleByCompany.clear();loadedRange=rangeKey;loadedScope=scope;fillFilters(previousScope);render();
    }catch(error){if(sequence===requestSequence)$('#calendarGrid').innerHTML='<p class="calendar-empty calendar-error">'+escapeHtml(error.message)+' <button type="button" class="text-button" data-calendar-retry>Try again</button></p>';}
  }
  function eventTime(event){
    if(event.allDay)return'All day';
    const start=new Date(event.startsAt),end=new Date(event.endsAt);
    if(instantKey(start)!==instantKey(end))return dateLabel(parseKey(instantKey(start)),{month:'short',day:'numeric'})+' '+timeLabel(start)+' – '+dateLabel(parseKey(instantKey(end)),{month:'short',day:'numeric'})+' '+timeLabel(end);
    return timeLabel(start)+' – '+timeLabel(end);
  }
  function eventButton(event,compact=false){
    const participants=event.attendees?.length?event.attendees:[{id:event.createdBy,name:event.createdByName,calendarColor:event.color||'gold'}],participantNames=participants.map(person=>person.name).filter(Boolean),selectedPersonId=$('#calendarPeopleFilter')?.value,selectedParticipant=participants.find(person=>person.id===selectedPersonId),participantSummary=selectedParticipant?selectedParticipant.name+(participants.length>1?' +'+(participants.length-1):''):participants.length<=2?participantNames.join(', '):(participantNames[0]||'Team')+' +'+(participants.length-1),teamLabel=participants.length>1?'With '+participantSummary:participants[0]?.id===event.createdBy?'Organizer: '+event.createdByName:'With '+(participantNames[0]||event.createdByName),avatars=participants.slice(0,3).map(person=>'<i class="calendar-team-avatar calendar-user-color-'+userColor(person)+'" title="'+escapeHtml(person.name)+'" aria-hidden="true">'+escapeHtml(initials(person.name))+'</i>').join('')+(participants.length>3?'<i class="calendar-team-avatar calendar-team-overflow" aria-hidden="true">+'+(participants.length-3)+'</i>':'');
    const displayColor=eventDisplayColor(event),fullParticipants=participantNames.join(', '),when=eventTime(event),clientLabel=event.clientName?' · Client: '+event.clientName:'',canceled=event.status==='canceled',displayTitle=(canceled?'CANCELED · ':'')+event.title,label=displayTitle+clientLabel+', '+when+', organized by '+event.createdByName+', with '+fullParticipants;
    let html='<button type="button" class="calendar-event calendar-event-'+displayColor+(event.eventType&&event.eventType!=='event'?' calendar-event-'+escapeHtml(event.eventType):'')+(canceled?' is-canceled':'')+(compact?' is-compact':'')+'" data-calendar-event="'+escapeHtml(event.id)+'" aria-label="'+escapeHtml(label)+'" title="'+escapeHtml(displayTitle+clientLabel+' · '+when+' · Organized by '+event.createdByName+' · Participants: '+fullParticipants)+'">';
    html+='<span class="calendar-event-dot"></span><span class="calendar-event-copy"><strong>'+escapeHtml(displayTitle)+'</strong><small>'+escapeHtml(when)+'</small>'+(event.clientName?'<small class="calendar-event-client">Client: '+escapeHtml(event.clientName)+'</small>':'')+'<span class="calendar-event-team"><span class="calendar-event-team-avatars">'+avatars+'</span><small class="calendar-event-owner">'+escapeHtml(teamLabel)+'</small></span>';
    return html+'</span></button>';
  }
  function mayManageEvent(event){return event?.canManage===true;}
  function buildDayIndex(events,dates){
    const buckets=new Map(dates.map(date=>{const dateKey=key(date),nextKey=key(addDays(date,1));return[dateKey,{date,dateKey,nextKey,events:[],start:NaN,end:NaN,workStart:NaN,workEnd:NaN}];}));
    const entries=events.map(event=>event.allDay?{event,allDay:true,startDate:event.startDate||event.startsAt.slice(0,10),endDateExclusive:event.endDateExclusive||event.endsAt.slice(0,10)}:{event,allDay:false,start:Date.parse(event.startsAt),end:Date.parse(event.endsAt)});
    if(entries.some(entry=>!entry.allDay))for(const bucket of buckets.values()){
      bucket.start=startOfDate(bucket.dateKey);bucket.end=startOfDate(bucket.nextKey);
      if(view!=='month'){bucket.workStart=localDate(bucket.date,HOUR_START).getTime();bucket.workEnd=localDate(bucket.date,HOUR_END).getTime();}
    }
    for(const entry of entries){
      if(entry.allDay){for(const bucket of buckets.values())if(entry.startDate<bucket.nextKey&&entry.endDateExclusive>bucket.dateKey)bucket.events.push(entry);continue;}
      if(!Number.isFinite(entry.start)||!Number.isFinite(entry.end)||entry.end<=entry.start)continue;
      for(const bucket of buckets.values())if(entry.start<bucket.end&&entry.end>bucket.start)bucket.events.push(entry);
    }
    return buckets;
  }
  function eventsOnDay(dayIndex,date){return dayIndex.get(key(date))?.events||[];}
  function overlapGroups(entries,bucket){
    const dateKeyFromParts=parts=>parts.year+'-'+pad(parts.month)+'-'+pad(parts.day);
    const items=entries.filter(entry=>!entry.allDay).map(entry=>{
      const startParts=zonedParts(entry.start),endParts=zonedParts(entry.end),startDate=dateKeyFromParts(startParts),endDate=dateKeyFromParts(endParts),startMinute=startParts.hour*60+startParts.minute+startParts.second/60,endMinute=endParts.hour*60+endParts.minute+endParts.second/60;
      return{event:entry.event,start:Math.max(startDate===bucket.dateKey?startMinute:HOUR_START*60,HOUR_START*60),end:Math.min(endDate===bucket.dateKey?endMinute:HOUR_END*60,HOUR_END*60)};
    }).filter(item=>item.end>item.start).sort((a,b)=>a.start-b.start||a.end-b.end);
    const groups=[];
    for(const item of items){
      let group=groups[groups.length-1];
      if(!group||item.start>=group.end){group={start:item.start,end:item.end,items:[]};groups.push(group);}
      group.items.push(item);group.end=Math.max(group.end,item.end);
    }
    for(const group of groups){
      const columnEnds=[];
      for(const item of group.items){
        let column=columnEnds.findIndex(end=>end<=item.start);
        if(column<0)column=columnEnds.length;
        item.column=column;columnEnds[column]=item.end;
      }
      group.columns=columnEnds.length;
    }
    return groups;
  }
  function openOverlapStack(ids){
    const events=ids.split(',').map(id=>data.events.find(event=>event.id===id)).filter(Boolean);
    if(!events.length)return;
    $('#calendarStackTitle').textContent=events.length+' overlapping events';
    $('#calendarStackIntro').textContent='Choose an event to view its details. Only its creator can make changes.';
    $('#calendarStackEvents').innerHTML=events.map(event=>'<button type="button" class="calendar-stack-row'+(event.status==='canceled'?' is-canceled':'')+'" data-calendar-stack-event="'+escapeHtml(event.id)+'"><i class="calendar-event-dot '+eventDisplayColor(event)+'"></i><span><strong>'+(event.status==='canceled'?'CANCELED · ':'')+escapeHtml(event.title)+'</strong><small>'+escapeHtml(eventTime(event))+(event.clientName?' · Client: '+event.clientName:'')+' · '+escapeHtml(event.createdByName)+(event.companyId?' · '+escapeHtml(event.companyName):'')+'</small></span><b>›</b></button>').join('');
    $('#calendarStackBackdrop').hidden=false;document.body.classList.add('calendar-modal-open');$('#calendarStackClose').focus();
  }
  function closeOverlapStack(){ $('#calendarStackBackdrop').hidden=true;if($('#calendarBackdrop').hidden)document.body.classList.remove('calendar-modal-open'); }
  function renderMonth(events,dayIndex){
    const start=weekStart(carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1)),today=key(todayInZone());
    const heads='<div class="calendar-month-weekdays">'+WEEKDAYS.map(day=>'<div>'+day+'</div>').join('')+'</div>';
    const cells=Array.from({length:42},(_,i)=>{
      const day=addDays(start,i),dateKey=key(day),items=eventsOnDay(dayIndex,day),classes=['calendar-day',day.getUTCMonth()!==cursor.getUTCMonth()?'is-outside':'',dateKey<today?'is-past':'',dateKey===today?'is-today':''].filter(Boolean).join(' ');
      const cards=items.slice(0,2).map(({event})=>eventButton(event,true)).join('');
      const more=items.length>2?'<button type="button" class="calendar-overflow" data-calendar-open-day="'+key(day)+'">+'+(items.length-2)+' more</button>':'';
      return'<div class="'+classes+'" data-calendar-create-date="'+dateKey+'"><button type="button" class="calendar-day-number" data-calendar-create-date="'+dateKey+'" '+(dateKey<today?'disabled title="Past dates cannot be selected for new calendar items"':'')+' aria-label="Create event on '+escapeHtml(dateLabel(day,{month:'long',day:'numeric',year:'numeric'}))+'">'+day.getUTCDate()+'</button><div class="calendar-day-events">'+cards+more+'</div></div>';
    }).join('');
    return'<div class="calendar-month">'+heads+'<div class="calendar-month-days">'+cells+'</div></div>';
  }
  function renderAgenda(dayIndex){
    const start=weekStart(cursor),today=key(todayInZone()),days=Array.from({length:7},(_,index)=>addDays(start,index)),hasEvents=days.some(date=>eventsOnDay(dayIndex,date).length);
    if(!hasEvents)return'<div class="calendar-empty calendar-agenda-empty">No calendar items this week. Use Add event to schedule a time with your team.</div>';
    return'<div class="calendar-agenda">'+days.map(date=>{const dateKey=key(date),items=eventsOnDay(dayIndex,date).slice().sort((left,right)=>{const startOf=entry=>entry.allDay?startOfDate(entry.startDate).getTime():entry.start;return startOf(left)-startOf(right);});return'<section class="calendar-agenda-day'+(dateKey<today?' is-past':'')+(dateKey===today?' is-today':'')+'"><header><div><strong>'+escapeHtml(dateLabel(date,{weekday:'long',month:'short',day:'numeric'}))+'</strong>'+(dateKey===today?'<span>Today</span>':'')+'</div><button type="button" class="calendar-agenda-add" data-calendar-create-date="'+dateKey+'" '+(dateKey<today?'disabled title="Past dates cannot be selected for new calendar items"':'')+' aria-label="Add event on '+escapeHtml(dateLabel(date,{month:'long',day:'numeric',year:'numeric'}))+'">＋ Add event</button></header><div class="calendar-agenda-events">'+(items.length?items.map(({event})=>eventButton(event)).join(''):'<p class="calendar-agenda-empty-day">No items scheduled</p>')+'</div></section>';}).join('')+'</div>';
  }
  function renderTimeline(events,dayIndex){
    const isDay=view==='day';let lanes;
    const todayKey=instantKey(Date.now());
    if(isDay){
      const personId=$('#calendarPeopleFilter').value,participantIds=new Set();
      for(const {event} of eventsOnDay(dayIndex,cursor)){participantIds.add(event.createdBy);for(const attendee of event.attendees||[])participantIds.add(attendee.id);}
      const people=personId?data.people.filter(p=>p.id===personId):data.people.filter(p=>participantIds.has(p.id));
      lanes=people.map(person=>({date:cursor,person}));
    }else{const start=weekStart(cursor);lanes=Array.from({length:7},(_,i)=>({date:addDays(start,i),person:null}));}
    const count=Math.max(1,lanes.length);
    const head='<div class="calendar-timeline-head" style="--calendar-lanes:'+count+'"><div class="calendar-time-gutter"></div>'+lanes.map(({date,person})=>'<div class="calendar-timeline-heading'+(key(date)<todayKey?' is-past':'')+'">'+(person?'<span class="calendar-person-avatar calendar-user-color-'+userColor(person)+'">'+escapeHtml(initials(person.name))+'</span><span><strong>'+escapeHtml(person.name)+'</strong><small>Participant</small></span>':'<span class="calendar-timeline-weekday">'+WEEKDAYS[date.getUTCDay()]+'</span><strong>'+date.getUTCDate()+'</strong>')+'</div>').join('')+'</div>';
    const labels=Array.from({length:HOUR_END-HOUR_START},(_,i)=>'<div class="calendar-time-label" style="grid-row:'+(i+1)+'">'+new Date(Date.UTC(2000,0,1,HOUR_START+i)).toLocaleTimeString(undefined,{hour:'numeric',timeZone:'UTC'})+'</div>').join('');
    const laneViews=lanes.map(({date,person},laneIndex)=>{
      const bucket=dayIndex.get(key(date))||{dateKey:key(date),events:[]},dayEvents=eventsOnDay(dayIndex,date).filter(({event})=>!person||event.createdBy===person.id||event.attendees.some(attendee=>attendee.id===person.id));
      const allDay=dayEvents.filter(entry=>entry.allDay).map(({event})=>eventButton(event)).join('');
      const groups=overlapGroups(dayEvents,bucket);
      const timed=groups.map(group=>group.items.map(item=>{
        const top=(item.start-HOUR_START*60)*(HOUR_HEIGHT/60),height=Math.max(34,(item.end-item.start)*(HOUR_HEIGHT/60));
        const width=100/group.columns,left=item.column*width;
        return'<div class="calendar-timeline-event '+(group.columns>1?'is-overlapping':'')+'" style="top:'+top+'px;height:'+height+'px;left:calc('+left+'% + 3px);width:calc('+width+'% - 6px);right:auto">'+eventButton(item.event,group.columns>1)+'</div>';
      }).join('')+(group.items.length>2?'<button type="button" class="calendar-overlap-trigger" style="top:'+((group.start-HOUR_START*60)*(HOUR_HEIGHT/60)+4)+'px" data-calendar-overlap="'+group.items.map(item=>escapeHtml(item.event.id)).join(',')+'" aria-label="View all '+group.items.length+' overlapping events">'+group.items.length+' events</button>':'')).join('');
      const laneClass=(person?' is-person-lane':'')+(key(date)<todayKey?' is-past':'')+(laneIndex===lanes.length-1?' is-last-lane':'');
      const currentTime=key(date)===todayKey?'<div class="calendar-now-indicator'+(view==='week'||laneIndex===0?' has-dot':'')+'" data-calendar-current-time hidden aria-hidden="true"></div>':'';
      return{date,laneIndex,laneClass,allDay,timed,currentTime};
    });
    const allDayContents=laneViews.map(lane=>'<div class="calendar-all-day-lane'+lane.laneClass+'" style="grid-column:'+(lane.laneIndex+1)+'" data-calendar-create-date="'+key(lane.date)+'">'+lane.allDay+'</div>').join('');
    const timedContents=laneViews.map(lane=>'<div class="calendar-hour-lane'+lane.laneClass+'" style="grid-column:'+(lane.laneIndex+1)+'" data-calendar-create-date="'+key(lane.date)+'" data-calendar-create-time="'+key(lane.date)+'">'+lane.timed+lane.currentTime+'</div>').join('');
    const empty=isDay&&!lanes.length?'<div class="calendar-empty-lanes">No events on this day yet. Create an event to add a person lane.</div>':'';
    const currentTimeLabel=laneViews.some(lane=>key(lane.date)===todayKey)?'<div class="calendar-now-time-label" data-calendar-now-label hidden aria-hidden="true"></div>':'';
    return head+'<div class="calendar-timeline-body" style="--calendar-lanes:'+count+'"><div class="calendar-all-day-gutter"></div><div class="calendar-all-day-lanes">'+allDayContents+'</div><div class="calendar-time-labels">'+labels+currentTimeLabel+'</div><div class="calendar-lanes">'+empty+timedContents+'</div></div>';
  }
  function renderLegend(events){
    const peopleById=new Map();for(const event of events){for(const person of event.attendees||[])peopleById.set(person.id,person);if(!peopleById.has(event.createdBy))peopleById.set(event.createdBy,{id:event.createdBy,name:event.createdByName,calendarColor:event.color});}
    $('#calendarPeopleLegend').innerHTML=[...peopleById.values()].map(person=>{const color=userColor(person);return'<span class="calendar-legend-person"><i class="calendar-legend-dot '+color+'"></i><span class="calendar-person-avatar calendar-user-color-'+color+'">'+escapeHtml(initials(person.name))+'</span>'+escapeHtml(person.name)+'</span>';}).join('');
  }
  function renderCalendarSidebar(events,dayIndex){
    const miniTitle=$('#calendarMiniTitle'),miniDays=$('#calendarMiniDays');
    if(miniTitle&&miniDays){
      miniTitle.textContent=dateLabel(cursor,{month:'long',year:'numeric'});
      const monthStart=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1),start=weekStart(monthStart),today=key(todayInZone());
      miniDays.innerHTML=Array.from({length:42},(_,index)=>{
        const date=addDays(start,index),dateKey=key(date),items=eventsOnDay(dayIndex,date),colors=[...new Set(items.map(({event})=>eventDisplayColor(event)))].slice(0,3),classes=['calendar-mini-day',date.getUTCMonth()!==cursor.getUTCMonth()?'is-outside':'',dateKey===today?'is-today':'',dateKey===key(cursor)?'is-selected':''].filter(Boolean).join(' ');
        return'<button type="button" class="'+classes+'" data-calendar-mini-date="'+dateKey+'" aria-label="View '+escapeHtml(dateLabel(date,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))+'"><span>'+date.getUTCDate()+'</span>'+(colors.length?'<i aria-hidden="true">'+colors.map(color=>'<b class="calendar-user-color-'+color+'"></b>').join('')+'</i>':'')+'</button>';
      }).join('');
    }
    const now=Date.now(),upcoming=events.filter(event=>event.status!=='canceled'&&(event.allDay?(event.startDate||event.startsAt.slice(0,10))>=instantKey(now):Date.parse(event.endsAt)>now)).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0],upcomingTitle=$('#calendarUpcomingTitle'),upcomingMeta=$('#calendarUpcomingMeta'),upcomingOpen=$('#calendarUpcomingOpen');
    if(upcomingTitle){
      if(upcoming){const startDate=instantKey(upcoming.startsAt),today=instantKey(now);upcomingTitle.textContent=upcoming.title;upcomingMeta.textContent=(startDate===today?'Today · ':dateLabel(parseKey(startDate),{weekday:'short',month:'short',day:'numeric'})+' · ')+eventTime(upcoming)+(upcoming.companyName?' · '+upcoming.companyName:'');upcomingTitle.classList.remove('is-empty');upcomingOpen.hidden=false;upcomingOpen.dataset.calendarSideEvent=upcoming.id;upcomingOpen.setAttribute('aria-label','View '+upcoming.title);}
      else{upcomingTitle.textContent='No upcoming events';upcomingMeta.textContent='Your schedule is clear for this period.';upcomingTitle.classList.add('is-empty');upcomingOpen.hidden=true;delete upcomingOpen.dataset.calendarSideEvent;}
    }
    const responseCard=$('#calendarResponseCard');
    if(responseCard){
      const pending=events.filter(event=>event.status!=='canceled'&&event.createdBy!==state.user?.id&&event.attendees?.some(person=>person.id===state.user?.id&&person.response==='awaiting')).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0];
      if(!pending){responseCard.hidden=true;responseCard.innerHTML='';}
      else{const attendee=pending.attendees.find(person=>person.id===state.user.id),color=userColor(attendee),date=instantKey(pending.startsAt);responseCard.hidden=false;responseCard.innerHTML='<div class="calendar-response-heading"><span class="calendar-side-eyebrow">NEEDS YOUR RESPONSE</span><span class="calendar-response-duration">'+escapeHtml(eventTime(pending))+'</span></div><strong>'+escapeHtml(pending.title)+'</strong><p>'+escapeHtml(dateLabel(parseKey(date),{weekday:'short',month:'short',day:'numeric'}))+' · '+escapeHtml(pending.companyName||'Company calendar')+'</p><div class="calendar-response-actions" role="group" aria-label="Respond to invitation"><button type="button" data-calendar-quick-rsvp="accepted" data-event-id="'+escapeHtml(pending.id)+'" class="is-primary"><span class="calendar-user-color-'+color+'" aria-hidden="true">'+escapeHtml(initials(attendee.name))+'</span> Yes</button><button type="button" data-calendar-quick-rsvp="maybe" data-event-id="'+escapeHtml(pending.id)+'">Maybe</button><button type="button" data-calendar-quick-rsvp="declined" data-event-id="'+escapeHtml(pending.id)+'">No</button></div>';}
    }
  }
  function periodTitle(){
    if(view==='month')return dateLabel(cursor,{month:'long',year:'numeric'});
    if(view==='day')return dateLabel(cursor,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const start=weekStart(cursor),end=addDays(start,6);
    const range=start.getUTCMonth()===end.getUTCMonth()?dateLabel(start,{month:'long'})+' '+start.getUTCDate()+' – '+end.getUTCDate()+', '+end.getUTCFullYear():dateLabel(start,{month:'short',day:'numeric'})+' – '+dateLabel(end,{month:'short',day:'numeric',year:'numeric'});
    return view==='agenda'?'Agenda · '+range:range;
  }
  function selectedPeriodBounds(){
    let start,end;
    if(view==='month'){start=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1);end=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+2,1);}
    else if(view==='week'||view==='agenda'){start=weekStart(cursor);end=addDays(start,7);}
    else{start=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,cursor.getUTCDate());end=addDays(start,1);}
    return{fromDate:key(start),toDate:key(end),from:startOfDate(key(start)),to:startOfDate(key(end))};
  }
  function durationLabel(milliseconds){
    const minutes=Math.round(milliseconds/60000),hours=Math.floor(minutes/60),remainder=minutes%60;
    return hours?hours+'h'+(remainder?' '+remainder+'m':''):remainder+'m';
  }
  function timeByMeetingType(events,bounds){
    const totals=new Map();
    for(const event of events){
      const category=event.eventType==='unavailable'?'Time Off':event.eventType==='lunch'?'Lunch Break':event.meetingType||'Other';
      let milliseconds=0;
      if(event.allDay){
        const eventStart=event.startDate||event.startsAt?.slice(0,10),eventEnd=event.endDateExclusive||event.endsAt?.slice(0,10);
        if(!eventStart||!eventEnd)continue;
        const clippedStart=eventStart>bounds.fromDate?eventStart:bounds.fromDate,clippedEnd=eventEnd<bounds.toDate?eventEnd:bounds.toDate;
        const startDate=Date.parse(clippedStart+'T00:00:00Z'),endDate=Date.parse(clippedEnd+'T00:00:00Z');
        if(!Number.isFinite(startDate)||!Number.isFinite(endDate)||endDate<=startDate)continue;
        milliseconds=(endDate-startDate)/86400000*8*60*60*1000;
      }else{
        const start=Date.parse(event.startsAt),end=Date.parse(event.endsAt);
        if(!Number.isFinite(start)||!Number.isFinite(end))continue;
        const clippedStart=Math.max(start,bounds.from),clippedEnd=Math.min(end,bounds.to);
        if(clippedEnd<=clippedStart)continue;
        milliseconds=clippedEnd-clippedStart;
      }
      totals.set(category,(totals.get(category)||0)+milliseconds);
    }
    return[...totals.entries()].map(([category,milliseconds])=>({category,milliseconds})).sort((a,b)=>b.milliseconds-a.milliseconds||a.category.localeCompare(b.category));
  }
  function renderTimeTracker(events){
    const root=$('#calendarTimeTracker');if(!root)return;
    const totals=timeByMeetingType(events,selectedPeriodBounds()),total=totals.reduce((sum,item)=>sum+item.milliseconds,0);
    const heading='<div class="calendar-time-tracker-heading"><div><h3 id="calendarTimeTrackerTitle">Scheduled time by category</h3><p>Event time for '+escapeHtml(periodTitle())+'; follows the selected company and people filters.</p></div></div>';
    if(!total){root.innerHTML=heading+'<p class="calendar-time-tracker-empty">No scheduled calendar items in this period.</p>';return;}
    const circumference=2*Math.PI*43;let offset=0;
    const arcs=totals.map(item=>{const length=item.milliseconds/total*circumference,color=CALENDAR_TIME_CATEGORY_COLORS[item.category]||'#77808d',arc='<circle cx="60" cy="60" r="43" fill="none" stroke="'+color+'" stroke-width="18" stroke-dasharray="'+length.toFixed(2)+' '+(circumference-length).toFixed(2)+'" stroke-dashoffset="'+(-offset).toFixed(2)+'" transform="rotate(-90 60 60)"/>';offset+=length;return arc;}).join('');
    const legend=totals.map(item=>{const color=CALENDAR_TIME_CATEGORY_COLORS[item.category]||'#77808d';return'<li><span class="calendar-time-category"><i style="--calendar-time-color:'+color+'"></i>'+escapeHtml(item.category)+'</span><strong>'+durationLabel(item.milliseconds)+'</strong></li>';}).join('');
    root.innerHTML=heading+'<div class="calendar-time-tracker-content"><div class="calendar-time-donut" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="43" fill="none" stroke="#ece9e0" stroke-width="18"/>'+arcs+'</svg><div class="calendar-time-donut-total"><strong>'+durationLabel(total)+'</strong><span>scheduled</span></div></div><ul class="calendar-time-legend" aria-label="Scheduled time by category">'+legend+'</ul></div><p class="calendar-time-tracker-note">Timed events use their scheduled duration. Each all-day date, including time off, counts as 8 work hours.</p>';
  }
  function render(){
    const events=filteredEvents();$('#calendarPeriodTitle').textContent=periodTitle();
    const start=view==='month'?weekStart(carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1)):view==='week'||view==='agenda'?weekStart(cursor):carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,cursor.getUTCDate()),dayCount=view==='month'?42:view==='week'||view==='agenda'?7:1,dates=Array.from({length:dayCount},(_,index)=>addDays(start,index)),dayIndex=buildDayIndex(events,dates);
    const zoneLabel=window.timeZoneLabel?.(timeZone())||timeZone();$('#calendarTimeZoneLabel').textContent='Times shown in '+zoneLabel;$('#calendarSideTimeZoneLabel').textContent=zoneLabel;
    document.querySelectorAll('[data-calendar-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.calendarView===view)));
    renderLegend(events);renderCalendarSidebar(events,dayIndex);$('#calendarGrid').innerHTML=view==='month'?renderMonth(events,dayIndex):view==='agenda'?renderAgenda(dayIndex):renderTimeline(events,dayIndex);renderedCurrentTimeDate=instantKey(Date.now());updateCurrentTimeIndicators();
    let summaryEvents=events;
    if(view==='month'){
      const start=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1),end=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+2,1),fromDate=key(start),toDate=key(end),from=startOfDate(fromDate),to=startOfDate(toDate);
      summaryEvents=events.filter(event=>event.allDay?(event.startDate||event.startsAt.slice(0,10))<toDate&&(event.endDateExclusive||event.endsAt.slice(0,10))>fromDate:new Date(event.startsAt)<to&&new Date(event.endsAt)>from);
    }
    const companies=new Set(summaryEvents.map(event=>event.companyId).filter(Boolean));
    const companyFilter=$('#calendarCompanyFilter').value,selectedCompany=data.companies.find(company=>company.id===companyFilter);$('#calendarSummary').innerHTML='<article><span class="calendar-summary-icon">'+window.aspectIcon('calendar-days')+'</span><strong>'+summaryEvents.length+'</strong><span>calendar items in this '+(view==='month'?'month':view==='agenda'?'week':view)+'</span><small>'+(selectedCompany?'In '+selectedCompany.name+' calendar':'Across all company calendars')+'</small></article><article><span class="calendar-summary-icon">'+window.aspectIcon('building-2')+'</span><strong>'+companies.size+'</strong><span>'+(companies.size===1?'company':'companies')+' with calendar items</span><small>'+(selectedCompany?'Visible to authorized portal users':'Combined organization schedule')+'</small></article>';
    renderTimeTracker(events);
  }
  async function setView(value){if(!['month','week','day','agenda'].includes(value))return;view=value;loadedRange='';render();await loadCalendar();}
  function updateAllDay(){
    const checked=$('#calendarForm').elements.allDay.checked;
    document.querySelectorAll('[data-calendar-time]').forEach(label=>{label.hidden=checked;label.querySelector('input').required=!checked;});
  }
  function setBlockLength(length){
    const form=$('#calendarForm'),startField=form.elements.startDate,endField=form.elements.endDate;if(!startField.value)return;
    let start=parseKey(startField.value),end=start;
    if(length==='week')end=addDays(start,6);
    else if(length==='month'){const monthStart=carrier(start.getUTCFullYear(),start.getUTCMonth()+1,1);if(key(monthStart)>=key(todayInZone())){start=monthStart;startField.value=key(start);}end=carrier(start.getUTCFullYear(),start.getUTCMonth()+2,0);}
    endField.value=key(end);if(!editingCalendarEventId)endField.min=startField.value;
  }
  function inferBlockLength(startValue,endValue){
    if(!startValue||!endValue)return'custom';const start=parseKey(startValue),end=parseKey(endValue),days=Math.round((Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate())-Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()))/86400000);
    if(days===0)return'day';if(days===6)return'week';const last=carrier(start.getUTCFullYear(),start.getUTCMonth()+2,0);if(start.getUTCDate()===1&&key(last)===endValue)return'month';return'custom';
  }
  function updateCalendarItemType(initialize=false,isExisting=false,readonly=false){
    const form=$('#calendarForm'),eventType=form.elements.eventType.value,isBlock=eventType!=='event',isLunch=eventType==='lunch',isUnavailable=eventType==='unavailable';
    document.querySelectorAll('[data-calendar-event-only]').forEach(section=>{section.hidden=isBlock;section.querySelectorAll('input,select,textarea,button').forEach(field=>{field.disabled=isBlock||readonly;});});
    form.elements.eventType.disabled=readonly||isExisting;form.elements.blockLength.disabled=readonly;$('#calendarBlockLengthField').hidden=!isUnavailable;$('#calendarBlockNote').hidden=!isBlock;
    $('#calendarBlockNote').textContent=isLunch?'Lunch Break blocks are timed items on the shared company calendar.':isUnavailable?'Time Off appears as an all-day item on the shared company calendar. Choose one day, one week, one month, or custom dates.':'';
    $('#calendarEndDateField').hidden=isLunch;form.elements.endDate.required=!isLunch;form.elements.endDate.disabled=readonly||isLunch||(isUnavailable&&form.elements.blockLength.value!=='custom');
    $('#calendarAllDayField').hidden=isBlock;form.elements.allDay.disabled=readonly||isBlock;
    if(initialize){
      if(isLunch){form.elements.allDay.checked=false;form.elements.endDate.value=form.elements.startDate.value;form.elements.startTime.value='12:00';form.elements.endTime.value='13:00';}
      else if(isUnavailable){form.elements.allDay.checked=true;if(!isExisting)setBlockLength(form.elements.blockLength.value||'day');}
      else if(!isExisting){form.elements.allDay.checked=false;form.elements.startTime.value='09:00';form.elements.endTime.value='10:00';form.elements.title.value='';}
    }
    if(isBlock){form.elements.title.value=isLunch?'Lunch Break':'Time Off';form.elements.title.required=false;form.elements.title.disabled=true;}
    else{form.elements.title.required=true;form.elements.title.disabled=readonly;}
    if(isUnavailable)form.elements.allDay.checked=true;else if(isLunch)form.elements.allDay.checked=false;
    $('#calendarOwnerColorLabel').textContent=isBlock?(event?'Block color follows the organizer.':'This block uses your assigned calendar color.'):'Invitees see the event in their own color; other viewers see the organizer’s color.';
    const blockLabel=isLunch?'Lunch Break':'Time Off';
    $('#calendarModalTitle').textContent=isExisting?(readonly?(isBlock?blockLabel+' details':'Event details'):(isBlock?'Update '+blockLabel:'Update event')):(isBlock?'Create '+blockLabel:'Create event');
    $('#calendarSave').textContent=isExisting?'Save changes':(isBlock?'＋ Add '+blockLabel:'＋ Create event');
    updateAllDay();
  }
  function updateCalendarEmailSetupNote(){
    const note=$('#calendarEmailSetupNote');if(!note)return;
    note.textContent=state.settings.calendarEmails===false?'External invitation emails are disabled in Portal settings.':state.settingsMeta.calendarEmailConfigured?'External emails use the server’s configured mail service.':'Email invitations need server mail settings before they can be delivered.';
  }
  async function refreshCalendarEmailSetupNote(){
    const note=$('#calendarEmailSetupNote');if(!note)return;
    note.textContent='Checking email setup…';
    try{await window.loadPortalSettings?.();}catch{}
    if(!$('#calendarBackdrop').hidden)updateCalendarEmailSetupNote();
  }
  function openModal(event=null,date=cursor,readonly=false,time=null,initialEventType='event'){
    closeEventDetails();
    calendarModalNotificationContext.hidden=true;calendarModalNotificationContext.innerHTML='';calendarPageNotificationContext.hidden=true;calendarPageNotificationContext.innerHTML='';
    editingCalendarEventId=event?.id||null;editingCalendarUpdatedAt=event?.updatedAt||null;
    const form=$('#calendarForm');form.reset();
    $('#calendarTypeStep').hidden=true;form.hidden=false;form.elements.eventType.closest('label').hidden=!event;
    const eventZone=event?.timeZone||data.companies.find(company=>company.id===(event?.companyId||calendarCompanyContext()||$('#calendarCompanyFilter').value))?.timeZone||timeZone();
    if(!event&&time){const clickedInstant=wallTimeToInstant(key(date),time,eventZone),parts=zonedParts(clickedInstant,eventZone);date=carrier(parts.year,parts.month,parts.day);time=pad(parts.hour)+':'+pad(parts.minute);}
    const startParts=event&&!event.allDay?zonedParts(Date.parse(event.startsAt),eventZone):null,endParts=event&&!event.allDay?zonedParts(Date.parse(event.endsAt),eventZone):null;
    const start=event?(event.allDay?parseKey(event.startDate||event.startsAt.slice(0,10)):carrier(startParts.year,startParts.month,startParts.day)):date,end=event?(event.allDay?parseKey(event.endDateExclusive||event.endsAt.slice(0,10)):carrier(endParts.year,endParts.month,endParts.day)):date;
    form.elements.eventId.value=event?.id||'';form.elements.title.value=event?.title||'';form.elements.eventType.value=event?.eventType||initialEventType;
    form.elements.startDate.value=key(start);form.elements.endDate.value=event?.allDay?key(addDays(end,-1)):key(end);form.elements.startDate.min=event?'':key(todayInZone());form.elements.endDate.min=event?'':form.elements.startDate.value;
    form.elements.startTime.value=event&&!event.allDay?pad(startParts.hour)+':'+pad(startParts.minute):time||'09:00';
    form.elements.endTime.value=event&&!event.allDay?pad(endParts.hour)+':'+pad(endParts.minute):time?pad(Math.min(Number(time.slice(0,2))+1,23))+':'+time.slice(3,5):'10:00';
    form.elements.allDay.checked=Boolean(event?.allDay);form.elements.companyId.value=event?.companyId||calendarCompanyContext()||'';
    form.elements.timeZone.innerHTML=window.timeZoneOptionsHtml?.(eventZone)||'';form.elements.timeZone.value=eventZone;
    calendarSelectedClientId=event?.clientId||'';autoFilledClientPhone='';resetCalendarQuickAdd();
    loadCalendarClients(form.elements.companyId.value,calendarSelectedClientId);
    form.elements.location.value=event?.location||'';form.elements.locationType.value=event?.locationType||'On-site';form.elements.meetingType.value=event?(event.meetingType||'Other'):'';form.elements.description.value=event?.description||'';
    updateCalendarLocationHint();
    form.elements.blockLength.value=event?.eventType==='unavailable'?inferBlockLength(form.elements.startDate.value,form.elements.endDate.value):'day';
    externalGuests=(event?.externalAttendees||[]).map(guest=>({...guest}));const eventColor=event?eventDisplayColor(event):userColor(state.user),viewerIsAttendee=Boolean(event?.attendees?.some(person=>person.id===state.user?.id)),colorOwner=event&&state.user?.id!==event.createdBy&&viewerIsAttendee?state.user?.name:event?.createdByName||state.user?.name,colorDescription=event&&state.user?.id!==event.createdBy&&viewerIsAttendee?'your calendar color':'organizer color';$('#calendarOwnerColorSwatch').className='calendar-color-swatch '+eventColor;$('#calendarOwnerColor').textContent=(colorOwner||'Assigned to you')+' · '+(event?colorDescription:'assigned color');
    const newItemTypeLabel=form.elements.eventType.value==='lunch'?'Lunch Break':form.elements.eventType.value==='unavailable'?'Time Off':'Meeting or event';
    $('#calendarModalIntro').textContent=event?event.createdByName+' · '+event.companyName+' · '+eventZone+(readonly?' · Only the creator or a platform administrator can make changes.':''):'Add an item to your company schedule.';
    const canceled=event?.status==='canceled',cancellationNotice=$('#calendarCancellationNotice');cancellationNotice.hidden=!canceled;cancellationNotice.textContent=canceled?'CANCELED'+(event.canceledByName?' by '+event.canceledByName:'')+(event.canceledAt?' · '+new Date(event.canceledAt).toLocaleString():'')+'. This notice is visible to company members.':'';
    $('#calendarSave').hidden=readonly;$('#calendarDelete').hidden=!event||readonly;$('#calendarStatusAction').hidden=!event||readonly||event.eventType!=='event';$('#calendarStatusAction').textContent=canceled?'Reinstate event':'Cancel event';$('#calendarCancel').textContent=readonly?'Close':'Cancel';$('#calendarError').textContent='';
    renderAttendeeOptions(event?event.attendees.map(person=>person.id):[state.user.id]);
    updateCalendarEmailSetupNote();refreshCalendarEmailSetupNote();
    renderExternalGuests(readonly);const attendee=event?.attendees.find(person=>person.id===state.user?.id),mayRespond=Boolean(readonly&&event&&event.createdBy!==state.user?.id&&attendee);$('#calendarRsvpActions').hidden=!mayRespond;$('#calendarRsvpCurrent').textContent=mayRespond?'Current response: '+(attendee.response==='awaiting'?'Awaiting response':attendee.response):'';$('#calendarGuestStatus').hidden=!(readonly&&event?.createdBy===state.user?.id&&externalGuests.length);if(!$('#calendarGuestStatus').hidden)renderExternalGuests(true);$('#calendarAddExternal').disabled=readonly;$('#calendarExternalName').disabled=readonly;$('#calendarExternalEmail').disabled=readonly;
    form.querySelectorAll('input:not([type="hidden"]),select,textarea').forEach(field=>{field.disabled=readonly;});
    form.elements.companyId.required=!calendarCompanyContext();form.elements.companyId.disabled=readonly||Boolean(calendarCompanyContext())||Boolean(event);
    form.classList.toggle('calendar-create-mode',!event&&!readonly&&form.elements.eventType.value==='event');form.classList.remove('calendar-create-more');$('#calendarCreateMore')?.setAttribute('aria-expanded','false');form.dataset.wizardCreate='false';form.dataset.wizardStep='1';const calendarEyebrow=$('#calendarBackdrop .modal-header .eyebrow');if(calendarEyebrow)calendarEyebrow.textContent='ASPECT COMPANIES · CALENDAR';if(form.classList.contains('calendar-create-mode')){const titleLabel=$('#calendarEventNameField .calendar-field-label');if(titleLabel)titleLabel.textContent='Event name';['#calendarCompanyField .calendar-field-label','#calendarCategoryField .calendar-field-label','#calendarStartDateField .calendar-field-label','#calendarStartTimeField .calendar-field-label','#calendarEndTimeField .calendar-field-label'].forEach((selector,index)=>{const label=$(selector);if(label)label.textContent=['Company','Category','Date','Start time','End time'][index];});$('#calendarCompanyHelp').hidden=true;const teamLegend=$('#calendarTeamField legend');if(teamLegend)teamLegend.textContent='Invite people';const locationLabel=$('#calendarLocationDetailsLabel');if(locationLabel)locationLabel.firstChild.textContent='Location';}else{const titleLabel=$('#calendarEventNameField .calendar-field-label'),companyLabel=$('#calendarCompanyField .calendar-field-label'),categoryLabel=$('#calendarCategoryField .calendar-field-label'),dateLabel=$('#calendarStartDateField .calendar-field-label'),teamLegend=$('#calendarTeamField legend');if(titleLabel)titleLabel.textContent='Event title';if(companyLabel)companyLabel.textContent='Company calendar';if(categoryLabel)categoryLabel.textContent='Nature of meeting';if(dateLabel)dateLabel.textContent='Start date';if(teamLegend)teamLegend.textContent='Team members';$('#calendarCompanyHelp').hidden=false;}$('#calendarBackdrop').hidden=false;document.body.classList.add('calendar-modal-open');updateCalendarItemType(!event&&form.elements.eventType.value!=='event',Boolean(event),readonly);setCalendarWizardStep(1);
    if(!readonly&&form.elements.eventType.value==='event')form.elements.title.focus();else $('#calendarClose').focus();
  }
  function beginCalendarCreate(date=cursor,time=null){
    date=date||cursor||todayInZone();if(pastCalendarDate(date)){showPastCreateNotice();return;}
    editingCalendarEventId=null;$('#calendarForm').elements.eventId.value='';
    pendingCalendarCreate={date,time};
    $('#calendarTypeStep').hidden=false;$('#calendarForm').hidden=true;$('#calendarModalTitle').textContent='Create calendar item';$('#calendarModalIntro').textContent='Choose the type of calendar item to create.';$('#calendarCreateType').value='';$('#calendarTypeContinue').disabled=true;$('#calendarBackdrop').hidden=false;document.body.classList.add('calendar-modal-open');$('#calendarCreateType').focus();
  }
  function continueCalendarCreate(){
    const eventType=$('#calendarCreateType').value;if(!eventType)return;
    const pending=pendingCalendarCreate||{date:defaultCalendarCreateDate(cursor),time:null};if(pastCalendarDate(pending.date)){closeModal();showPastCreateNotice();return;}pendingCalendarCreate=null;openModal(null,pending.date,false,pending.time,eventType);
  }
  function closeModal(){$('#calendarClientSelect').searchableUi?.close();clientLoadSequence++;pendingCalendarCreate=null;editingCalendarEventId=null;$('#calendarForm').elements.eventId.value='';$('#calendarBackdrop').hidden=true;document.body.classList.remove('calendar-modal-open');editingCalendarUpdatedAt=null;window.portalLiveUpdatesModalClosed?.();}
  function payload(){
    const form=$('#calendarForm'),eventType=form.elements.eventType.value,startDate=form.elements.startDate.value,endDate=eventType==='lunch'?startDate:form.elements.endDate.value;
    if(!editingCalendarEventId&&startDate&&startDate<key(todayInZone()))throw new Error('Calendar items can only be created for today or a future date.');
    if(eventType==='event'&&!form.elements.companyId.value)throw new Error('Choose a company calendar for this meeting.');
    if(eventType==='event'&&!form.elements.meetingType.value)throw new Error('Choose a nature of meeting for this event.');
    if(!startDate||!endDate||endDate<startDate)throw new Error('Choose an end date on or after the start date.');
    const allDay=eventType==='unavailable'?true:eventType==='lunch'?false:form.elements.allDay.checked,startTime=form.elements.startTime.value,endTime=form.elements.endTime.value;
    if(!allDay&&endDate===startDate&&endTime<=startTime)throw new Error('Choose an end time after the start time.');
    return{expectedUpdatedAt:editingCalendarEventId?editingCalendarUpdatedAt:undefined,eventType,title:form.elements.title.value.trim(),startDate,endDate,startTime:allDay?null:startTime,endTime:allDay?null:endTime,allDay,timeZone:form.elements.timeZone.value,companyId:form.elements.companyId.value||null,clientId:eventType==='event'?calendarSelectedClientId||null:null,location:eventType==='event'?form.elements.location.value.trim():'',locationType:form.elements.locationType.value,meetingType:form.elements.meetingType.value,description:eventType==='event'?form.elements.description.value.trim():'',attendeeIds:eventType==='event'?[...selectedAttendeeIds]:[state.user.id],externalAttendees:eventType==='event'?externalGuests.map(({name,email})=>({name,email})):[]};
  }
  async function save(event){
    event.preventDefault();const form=$('#calendarForm');if(!editingCalendarEventId&&form.dataset.wizardCreate==='true'&&form.elements.eventType.value==='event'&&Number(form.dataset.wizardStep||1)!==3){$('#calendarError').textContent='Complete all three steps before creating this event.';return;}const button=$('#calendarSave');button.disabled=true;$('#calendarError').textContent='';
    try{const form=$('#calendarForm'),id=editingCalendarEventId;if(id&&form.elements.eventId.value!==id)throw new Error('The calendar event changed while this form was open. Close it and reopen the event before saving.');if(!id)form.elements.eventId.value='';const body=payload(),result=await api(id?'/api/calendar/events/'+encodeURIComponent(id):'/api/calendar/events',{method:id?'PATCH':'POST',body:JSON.stringify(body)});closeModal();loadedRange='';await loadCalendar(true);let listRefreshFailed=false;try{await window.refreshWorkItems?.();}catch{listRefreshFailed=true;}await window.refreshActivity();const delivery=result.inviteDelivery,queuedMail=[delivery?.invitations?`${delivery.invitations} external invitation${delivery.invitations===1?'':'s'} queued.`:'',delivery?.updates?`${delivery.updates} external guest update${delivery.updates===1?'':'s'} queued.`:''].filter(Boolean).join(' '),mailNotice=delivery?.suppressed?` ${delivery.suppressed} external email${delivery.suppressed===1?' was':'s were'} not sent; invitations are disabled in Portal settings.`:delivery?.queued?delivery.configured?' '+queuedMail:` ${delivery.queued} external email${delivery.queued===1?' was':'s were'} not sent; configure outgoing mail settings.`:'';showToast((id?'Calendar event updated.':'Calendar event created.')+mailNotice+(listRefreshFailed?' Tasks may need a refresh.':''),delivery?.queued&&!delivery.configured?'error':'success');}
    catch(error){$('#calendarError').textContent=error.message;}finally{button.disabled=false;}
  }
  async function removeEvent(){
    const id=$('#calendarForm').elements.eventId.value;if(!id||!window.confirm('Delete this calendar event? This cannot be undone.'))return;
    const button=$('#calendarDelete');button.disabled=true;
    try{await api('/api/calendar/events/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({expectedUpdatedAt:editingCalendarUpdatedAt})});closeModal();loadedRange='';await loadCalendar(true);let listRefreshFailed=false;try{await window.refreshWorkItems?.();}catch{listRefreshFailed=true;}await window.refreshActivity();showToast('Calendar event deleted.'+(listRefreshFailed?' Tasks may need a refresh.':''));}
    catch(error){$('#calendarError').textContent=error.message;}finally{button.disabled=false;}
  }
  async function changeCancellationStatus(){
    const form=$('#calendarForm'),id=form.elements.eventId.value,event=data.events.find(item=>item.id===id),canceled=event?.status==='canceled';if(!id)return;
    const message=canceled?'Reinstate this calendar event? It will return to the shared schedule.':'Cancel this calendar event? It will remain visible on the shared calendar with a CANCELED label.';if(!window.confirm(message))return;
    const button=$('#calendarStatusAction');button.disabled=true;$('#calendarError').textContent='';
    try{await api('/api/calendar/events/'+encodeURIComponent(id)+'/cancellation',{method:'POST',body:JSON.stringify({canceled:!canceled,expectedUpdatedAt:editingCalendarUpdatedAt})});closeModal();loadedRange='';await loadCalendar(true);let listRefreshFailed=false;try{await window.refreshWorkItems?.();}catch{listRefreshFailed=true;}await window.refreshActivity();showToast((canceled?'Calendar event reinstated.':'Calendar event canceled. Everyone with access to this company calendar can see the update.')+(listRefreshFailed?' Tasks may need a refresh.':''));}
    catch(error){$('#calendarError').textContent=error.message;}finally{button.disabled=false;}
  }
  function shift(amount){
    if(view==='month')cursor=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1+amount,1);else cursor=addDays(cursor,amount*(view==='week'||view==='agenda'?7:1));
    loadedRange='';loadCalendar();
  }
  window.refreshCalendarForTimezone=()=>{activeTimeZone=timeZone();cursor=todayInZone();loadedRange='';render();loadCalendar(true);};
  function integrate(){
    const originalSync=window.syncWorkspaceView;
    if(typeof originalSync==='function')window.syncWorkspaceView=function(){
      originalSync.apply(this,arguments);const companyPortalCalendar=state.view==='companyWorkspace'&&state.activeCompanyWorkspaceTab==='calendar',active=state.view==='calendar'||companyPortalCalendar;
      $('#dashboardContent').hidden=active||state.view!=='overview';$('#tasksView').hidden=active||state.view!=='tasks';$('#activityView').hidden=active||state.view!=='activity';$('#companyWorkspaceView').hidden=state.view!=='companyWorkspace';$('#companyWorkspacePanel').hidden=companyPortalCalendar;$('#calendarView').hidden=!active;$('#newCalendarEvent').hidden=!active;
      const company=companyPortalCalendar?state.companies.find(item=>item.id===state.activeCompanyWorkspaceId)||state.companies.find(item=>item.id===state.user?.activeCompanyId):null,rootCompany=state.companies.find(item=>!item.parentId);
      if(active){$('#breadcrumbCurrent').textContent=companyPortalCalendar&&company?company.name+' · Calendar':'Calendar';$('#pageTitle').textContent=companyPortalCalendar&&company?company.name+' calendar':'Company calendar';$('#pageSubtitle').textContent=companyPortalCalendar&&company?'Team schedule for '+company.name+'.':'Team schedule across all companies.';$('#addCompany').hidden=true;$('#newTask').hidden=true;}
      const scope=calendarCompanyContext();if(active&&(!previousCalendarActive||previousView!==state.view||previousCalendarScope!==scope))loadCalendar();
      previousCalendarActive=active;previousCalendarScope=scope;previousView=state.view;
    };
  }
  $('#newCalendarEvent').addEventListener('click',()=>openModal(null,defaultCalendarCreateDate(cursor)));
  $('#calendarCreateType').addEventListener('change',()=>{$('#calendarTypeContinue').disabled=!$('#calendarCreateType').value;});
  $('#calendarTypeContinue').addEventListener('click',continueCalendarCreate);
  setupCalendarWizard();
  $('#calendarForm .calendar-form-grid').insertAdjacentHTML('beforeend','<button type="button" class="calendar-create-more-toggle full-field" id="calendarCreateMore" aria-expanded="false">More options <span aria-hidden="true">⌄</span></button>');
  $('#calendarForm').addEventListener('click',event=>{if(event.target.closest('#calendarCreateMore')){const form=$('#calendarForm');form.classList.toggle('calendar-create-more');$('#calendarCreateMore').setAttribute('aria-expanded',String(form.classList.contains('calendar-create-more')));}});
  const calendarForm=$('#calendarForm'),calendarFieldLabel=(name,id)=>{const field=calendarForm.elements.namedItem(name),wrapper=field?.closest('.form-field');if(wrapper)wrapper.id=id;};calendarFieldLabel('title','calendarEventNameField');calendarFieldLabel('startDate','calendarStartDateField');calendarFieldLabel('startTime','calendarStartTimeField');calendarFieldLabel('endTime','calendarEndTimeField');calendarFieldLabel('timeZone','calendarTimeZoneField');calendarFieldLabel('locationType','calendarLocationTypeField');calendarFieldLabel('meetingType','calendarCategoryField');calendarFieldLabel('description','calendarDescriptionField');const calendarTeamField=$('#calendarAttendeeOptions')?.closest('fieldset');if(calendarTeamField)calendarTeamField.id='calendarTeamField';
  calendarForm.elements.startTime.addEventListener('change',()=>{if(!calendarForm.classList.contains('calendar-create-mode'))return;const [hour,minute]=calendarForm.elements.startTime.value.split(':').map(Number),startMinutes=hour*60+minute,endMinutes=(startMinutes+60)%1440;calendarForm.elements.endTime.value=pad(Math.floor(endMinutes/60))+':'+pad(endMinutes%60);calendarForm.elements.endDate.value=endMinutes<=startMinutes?key(addDays(parseKey(calendarForm.elements.startDate.value),1)):calendarForm.elements.startDate.value;});
  $('#calendarStepContinue').addEventListener('click',()=>{const form=$('#calendarForm'),step=Number(form.dataset.wizardStep||1);if(!validateCalendarWizardStep(step))return;const nextStep=step+1;form.dataset.wizardStep=String(nextStep);setCalendarWizardStep(nextStep);(nextStep===2?$('#calendarScheduleStep'):$('#calendarDetailsStep')).scrollIntoView({block:'nearest'});});
  $('#calendarStepBack').addEventListener('click',()=>{const form=$('#calendarForm'),previousStep=Math.max(1,Number(form.dataset.wizardStep||1)-1);form.dataset.wizardStep=String(previousStep);$('#calendarError').textContent='';setCalendarWizardStep(previousStep);(previousStep===1?$('#calendarBasicsStep'):$('#calendarScheduleStep')).scrollIntoView({block:'nearest'});});
  $('#calendarTypeCancel').addEventListener('click',closeModal);
  $('#calendarForm [name="eventType"]').addEventListener('change',()=>updateCalendarItemType(true,false,false));
  $('#calendarForm [name="blockLength"]').addEventListener('change',event=>{if(event.target.value!=='custom')setBlockLength(event.target.value);$('#calendarForm').elements.endDate.disabled=event.target.value!=='custom';});
  $('#calendarPrevious').addEventListener('click',()=>shift(-1));$('#calendarNext').addEventListener('click',()=>shift(1));
  $('#calendarToday').addEventListener('click',()=>{cursor=todayInZone();loadedRange='';loadCalendar();});
  $('#calendarMiniDays').addEventListener('click',event=>{const button=event.target.closest('[data-calendar-mini-date]');if(!button)return;cursor=parseKey(button.dataset.calendarMiniDate);setView('day');});
  $('.calendar-mini-month header').addEventListener('click',event=>{const button=event.target.closest('[data-calendar-mini-step]');if(!button)return;const month=carrier(cursor.getUTCFullYear(),cursor.getUTCMonth()+1+Number(button.dataset.calendarMiniStep),1);cursor=month;setView('month');});
  $('#calendarUpcomingOpen').addEventListener('click',event=>{const id=event.currentTarget.dataset.calendarSideEvent,selected=data.events.find(item=>item.id===id);if(selected)openEventDetails(selected,event.currentTarget);});
  $('#calendarResponseCard').addEventListener('click',async event=>{const button=event.target.closest('[data-calendar-quick-rsvp]');if(!button)return;button.disabled=true;try{const result=await api('/api/calendar/events/'+encodeURIComponent(button.dataset.eventId)+'/rsvp',{method:'POST',body:JSON.stringify({response:button.dataset.calendarQuickRsvp})}),selected=data.events.find(item=>item.id===button.dataset.eventId),attendee=selected?.attendees.find(person=>person.id===state.user?.id);if(attendee)attendee.response=result.response;showToast('Your calendar response was saved.');render();}catch(error){showToast(error.message,'error');}finally{button.disabled=false;}});
  document.querySelectorAll('[data-calendar-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.calendarView)));
  $('#calendarCompanyFilter').addEventListener('change',event=>{if(!calendarCompanyContext()){const formCompany=$('#calendarForm').elements.companyId;formCompany.value=event.target.value;const company=data.companies.find(item=>item.id===event.target.value),zoneField=$('#calendarForm [name="timeZone"]'),zone=company?.timeZone||timeZone();zoneField.innerHTML=window.timeZoneOptionsHtml?.(zone)||'';zoneField.value=zone;if(!$('#calendarBackdrop').hidden){renderAttendeeOptions(event.target.value?[state.user.id]:[]);calendarSelectedClientId='';syncCalendarClientPhone();loadCalendarClients(event.target.value);resetCalendarQuickAdd();}}render();});$('#calendarPeopleFilter').addEventListener('change',render);
  $('#calendarForm [name="companyId"]').addEventListener('change',event=>{const company=data.companies.find(item=>item.id===event.target.value),zone=company?.timeZone||timeZone(),zoneField=$('#calendarForm [name="timeZone"]');zoneField.innerHTML=window.timeZoneOptionsHtml?.(zone)||'';zoneField.value=zone;renderAttendeeOptions([state.user.id]);calendarSelectedClientId='';syncCalendarClientPhone();loadCalendarClients(event.target.value);resetCalendarQuickAdd();});
  $('#calendarQuickAddToggle').addEventListener('click',()=>{const panel=$('#calendarQuickAddPanel');panel.hidden=!panel.hidden;if(!panel.hidden)$('#calendarQuickAddName').focus();});
  $('#calendarQuickAddCancel').addEventListener('click',resetCalendarQuickAdd);
  $('#calendarQuickAddSave').addEventListener('click',saveCalendarQuickAddedClient);
  $('#calendarAttendeeOptions').addEventListener('change',event=>{const input=event.target.closest('input[name="attendeeIds"]');if(input){if(input.checked)selectedAttendeeIds.add(input.value);else selectedAttendeeIds.delete(input.value);}});
  $('#calendarAddExternal').addEventListener('click',()=>{const name=$('#calendarExternalName').value.trim(),email=$('#calendarExternalEmail').value.trim();if(!email||!$('#calendarExternalEmail').checkValidity()){$('#calendarError').textContent='Enter a valid email address for the external invitee.';return;}if(externalGuests.some(guest=>guest.email.toLowerCase()===email.toLowerCase())){$('#calendarError').textContent='That email is already on the invitation list.';return;}externalGuests.push({name,email});$('#calendarExternalName').value='';$('#calendarExternalEmail').value='';$('#calendarError').textContent='';renderExternalGuests();});
  $('#calendarExternalList').addEventListener('click',event=>{const button=event.target.closest('[data-calendar-remove-external]');if(!button)return;externalGuests.splice(Number(button.dataset.calendarRemoveExternal),1);renderExternalGuests();});
  $('#calendarRsvpActions').addEventListener('click',async event=>{const button=event.target.closest('[data-calendar-rsvp]');if(!button)return;button.disabled=true;try{const id=$('#calendarForm').elements.eventId.value,result=await api('/api/calendar/events/'+encodeURIComponent(id)+'/rsvp',{method:'POST',body:JSON.stringify({response:button.dataset.calendarRsvp})}),selected=data.events.find(item=>item.id===id),attendee=selected?.attendees.find(person=>person.id===state.user.id);if(attendee)attendee.response=result.response;$('#calendarRsvpCurrent').textContent='Current response: '+result.response;showToast('Your calendar response was saved.');}catch(error){$('#calendarError').textContent=error.message;}finally{button.disabled=false;}});
  $('#calendarClientSelect').addEventListener('change',event=>{calendarSelectedClientId=event.target.value;renderCalendarClients($('#calendarForm').elements.companyId.value);syncCalendarClientPhone();});
  $('#calendarForm [name="locationType"]').addEventListener('change',updateCalendarLocationHint);
  $('#calendarForm [name="location"]').addEventListener('input',event=>{if(autoFilledClientPhone&&event.target.value!==autoFilledClientPhone)autoFilledClientPhone='';});
  $('#calendarForm').addEventListener('submit',save);$('#calendarDelete').addEventListener('click',removeEvent);$('#calendarStatusAction').addEventListener('click',changeCancellationStatus);
  calendarEventDetails.addEventListener('click',event=>{const close=event.target.closest('[data-calendar-details-close]');if(close){closeEventDetails();return;}const edit=event.target.closest('[data-calendar-details-edit]');if(edit){const selected=data.events.find(item=>item.id===calendarEventDetails.dataset.eventId);closeEventDetails();if(selected)openModal(selected,cursor,false);return;}const response=event.target.closest('[data-calendar-details-rsvp]');if(response)respondToCalendarInvite(calendarEventDetails.dataset.eventId,response.dataset.calendarDetailsRsvp,response);});
  document.addEventListener('click',event=>{if(!calendarEventDetails.hidden&&!calendarEventDetails.contains(event.target)&&!event.target.closest('[data-calendar-event],[data-calendar-stack-event],#calendarUpcomingOpen'))closeEventDetails();});
  $('#calendarCancel').addEventListener('click',closeModal);$('#calendarClose').addEventListener('click',closeModal);
  $('#calendarBackdrop').addEventListener('click',event=>{if(event.target===$('#calendarBackdrop'))closeModal();});
  $('#calendarStackClose').addEventListener('click',closeOverlapStack);
  $('#calendarStackBackdrop').addEventListener('click',event=>{if(event.target===$('#calendarStackBackdrop'))closeOverlapStack();});
  $('#calendarStackEvents').addEventListener('click',event=>{
    const stackedEvent=event.target.closest('[data-calendar-stack-event]');
    if(!stackedEvent)return;
    const selected=data.events.find(item=>item.id===stackedEvent.dataset.calendarStackEvent);
    closeOverlapStack();
    if(selected)openEventDetails(selected);
  });
  $('#calendarForm').elements.allDay.addEventListener('change',updateAllDay);
  updateCalendarLocationHint();
  $('#calendarForm [name="startDate"]').addEventListener('change',event=>{const form=$('#calendarForm'),type=form.elements.eventType.value,length=form.elements.blockLength.value,end=form.elements.endDate;if(!editingCalendarEventId&&event.target.value<key(todayInZone())){event.target.value=key(todayInZone());$('#calendarError').textContent='Calendar items can only be created for today or a future date.';}form.elements.endDate.min=editingCalendarEventId?'':event.target.value;if(type==='lunch')end.value=event.target.value;else if(type==='unavailable'&&length!=='custom')setBlockLength(length);else if(!end.value||end.value<event.target.value)end.value=event.target.value;});
  $('#calendarForm [name="endDate"]').addEventListener('change',()=>{const form=$('#calendarForm');if(form.elements.eventType.value==='unavailable'){form.elements.blockLength.value='custom';form.elements.endDate.disabled=false;}});
  $('#calendarGrid').addEventListener('click',event=>{
    if(event.target.closest('[data-calendar-retry]')){loadedRange='';loadCalendar(true);return;}
    const openDay=event.target.closest('[data-calendar-open-day]');
    if(openDay){cursor=parseKey(openDay.dataset.calendarOpenDay);setView('day');return;}
    const overlap=event.target.closest('[data-calendar-overlap]');
    if(overlap){event.stopPropagation();openOverlapStack(overlap.dataset.calendarOverlap);return;}
    const eventButtonElement=event.target.closest('[data-calendar-event]');
    if(eventButtonElement){event.stopPropagation();const selected=data.events.find(item=>item.id===eventButtonElement.dataset.calendarEvent);if(selected)openEventDetails(selected,eventButtonElement);return;}
    const timeLane=event.target.closest('[data-calendar-create-time]');
    if(timeLane){const rect=timeLane.getBoundingClientRect(),offset=Math.max(0,Math.min(HOUR_END-HOUR_START-1,Math.floor((event.clientY-rect.top)/HOUR_HEIGHT)));beginCalendarCreate(parseKey(timeLane.dataset.calendarCreateTime),pad(HOUR_START+offset)+':00');return;}
    const day=event.target.closest('[data-calendar-create-date]');if(day)beginCalendarCreate(parseKey(day.dataset.calendarCreateDate));
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!calendarEventDetails.hidden)closeEventDetails();if(!$('#calendarBackdrop').hidden)closeModal();if(!$('#calendarStackBackdrop').hidden)closeOverlapStack();}});
  integrate();
  setInterval(tickCurrentTimeIndicators,15_000);
  window.openCalendarSearchResult = async (eventId,notification=null) => {
    const notificationCompany=(state.companies||[]).find(company=>company.id===notification?.companyId);
    if(notificationCompany?.parentId&&(!document.body.classList.contains('company-portal-mode')||state.portalCompany?.id!==notificationCompany.id)){
      try{sessionStorage.setItem('aspectPendingCalendarNotification',JSON.stringify({eventId,notification}));}catch{}
      location.assign('/portal/'+encodeURIComponent(notificationCompany.slug));return;
    }
    let event=(state.calendarEvents||[]).find(item=>item.id===eventId);
    if(!event){try{const result=await api('/api/calendar/events/'+encodeURIComponent(eventId));event=result.event;}catch(error){window.switchView('calendar');calendarPageNotificationContext.innerHTML=window.notificationContextMarkup?.(notification)||'';calendarPageNotificationContext.hidden=!notification;showToast(notification?'This calendar item is unavailable in this company portal. Its update details are shown above the calendar.':error.message,'error');return;}}
    window.switchView('calendar');
    cursor = parseKey(event.allDay?(event.startDate||event.startsAt.slice(0,10)):instantKey(event.startsAt));
    view = 'day';
    loadedRange = '';
    await loadCalendar(true);
    const selected = data.events.find(item => item.id === eventId);
    if (selected) {if(notification)openModal(selected,cursor,!mayManageEvent(selected));else openEventDetails(selected);calendarModalNotificationContext.innerHTML=window.notificationContextMarkup?.(notification)||'';calendarModalNotificationContext.hidden=!notification;}
    else {calendarPageNotificationContext.innerHTML=window.notificationContextMarkup?.(notification)||'';calendarPageNotificationContext.hidden=!notification;showToast('That calendar item is outside your current company access. Its update details are shown above the calendar.','error');}
  };
  window.addEventListener('portal-workspace-ready',()=>{let pending;try{pending=JSON.parse(sessionStorage.getItem('aspectPendingCalendarNotification')||'null');}catch{}if(!pending||pending.notification?.companyId!==state.portalCompany?.id)return;try{sessionStorage.removeItem('aspectPendingCalendarNotification');}catch{}window.openCalendarSearchResult(pending.eventId,pending.notification);});
  window.refreshCalendar=()=>{loadedRange='';return loadCalendar(true);};
})();

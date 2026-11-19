(function(){
  let clients=[],companyClients=[],companyClientsCompanyId='',editing=null,profileClient=null,profileTrigger=null,profileReturnClientId=null,profileReturnWorkspace=null,activeProfileTab='details',request=0,companyClientRequest=0,assigneeRequest=0,importFileData=null,importBusy=false;
  const $=selector=>document.querySelector(selector),esc=value=>escapeHtml(value);
  function manageableCompanies(){const user=state.user;if(user?.role!=='admin')return[];if(state.portalCompany?.parentId)return state.companies.filter(company=>company.id===user.activeCompanyId);return state.companies;}
  function companyOptions(selected='',manageableOnly=false){const companies=manageableOnly?manageableCompanies():state.companies;return companies.map(company=>`<option value="${esc(company.id)}" ${company.id===selected?'selected':''}>${esc(company.name)}</option>`).join('');}
  function assignedUsersText(client){return client.assignedUsers?.length?client.assignedUsers.map(person=>person.name).join(', '):'No assigned users';}
  function clientRowMarkup(client,companyScoped=false){const profileAttribute=companyScoped?'data-company-client-profile':'data-client-profile',editAttribute=companyScoped?'data-company-client-edit':'data-client-edit';return`<article class="client-row"><div class="client-row-identity"><span class="client-avatar">${esc(initials(client.name))}</span><div><h2>${esc(client.name)}</h2><small class="client-row-company">${esc(client.companyName)}</small></div></div><div class="client-row-contact">${client.contactName?`<strong>${esc(client.contactName)}</strong>`:''}<span class="client-row-contact-links">${client.email?'<a href="mailto:'+esc(client.email)+'">'+esc(client.email)+'</a>':''}${client.phone?'<a href="tel:'+esc(client.phone)+'">'+esc(client.phone)+'</a>':''}</span>${client.location?`<small>${esc(client.location)}</small>`:''}</div><div class="client-row-assigned"><small>Assigned users</small><span>${esc(assignedUsersText(client))}</span></div><div class="client-row-actions">${client.canManage?`<button type="button" class="text-button" ${editAttribute}="${esc(client.id)}">Edit</button>`:''}<button type="button" class="client-open-profile" ${profileAttribute}="${esc(client.id)}">View profile <span aria-hidden="true">→</span></button></div></article>`;}
  function render(){
    const grid=$('#clientGrid');if(!grid)return;
    const query=($('#clientSearch').value||'').trim().toLocaleLowerCase(),company=$('#clientCompanyFilter').value;
    const visible=clients.filter(client=>(!company||client.companyId===company)&&(!query||[client.name,client.contactName,client.email,client.phone,client.location,client.notes,client.companyName].join(' ').toLocaleLowerCase().includes(query)));
    const canAdd=manageableCompanies().length>0;$('#newClient').hidden=!canAdd;$('#importClients').hidden=!canAdd||state.settings.clientImports===false;
    if(!visible.length){grid.innerHTML='<div class="client-empty"><strong>'+ (clients.length?'No clients match this search.':'No clients have been added yet.')+'</strong><p>Clients stay in the directory for the company that manages the relationship.</p></div>';return;}
    grid.innerHTML=visible.map(client=>clientRowMarkup(client)).join('');
  }
  function renderCompanyClientRows(){const grid=$('#companyClientGrid');if(!grid)return;const query=($('#companyClientSearch')?.value||'').trim().toLocaleLowerCase(),visible=companyClients.filter(client=>!query||[client.name,client.contactName,client.email,client.phone,client.location,client.notes,client.companyName,...(client.assignedUsers||[]).map(person=>person.name)].join(' ').toLocaleLowerCase().includes(query));if(!visible.length){grid.innerHTML=`<div class="client-empty"><strong>${companyClients.length?'No clients match this search.':'No clients have been added to this company yet.'}</strong><p>Clients created in Aspect Companies and assigned to this company appear here for everyone with company access.</p></div>`;return;}grid.innerHTML=visible.map(client=>clientRowMarkup(client,true)).join('');}
  window.loadCompanyWorkspaceClients = async function(companyId, canManage = false) {
    const current = ++companyClientRequest;
    const panel = $('#companyWorkspacePanel');
    if (!panel) return;
    const companyName = state.companies.find(company => company.id === companyId)?.name || 'Company';
    const heading = `<header class="company-client-toolbar"><div><span class="eyebrow">${esc(companyName)}</span><h3>Clients</h3><p>Clients assigned to this company are shared with its users.</p></div>${canManage ? `<button type="button" class="button button-primary" data-company-client-add="${esc(companyId)}">＋ Add client</button>` : ''}</header>`;
    const search = `<div class="company-client-searchbar"><label class="clients-search"><span class="sr-only">Search company clients</span><input id="companyClientSearch" type="search" placeholder="Search this company’s clients…" aria-label="Search this company’s clients"></label></div>`;
    panel.innerHTML = `<div class="company-client-directory">${heading}${search}<div class="client-grid" id="companyClientGrid"><p class="people-empty">Loading clients…</p></div></div>`;
    try {
      const records = await api('/api/clients?companyId=' + encodeURIComponent(companyId));
      if (current !== companyClientRequest || state.view !== 'companyWorkspace' || state.activeCompanyWorkspaceTab !== 'clients' || state.activeCompanyWorkspaceId !== companyId) return;
      companyClients = records;
      companyClientsCompanyId = companyId;
      renderCompanyClientRows();
    } catch (error) {
      if (current === companyClientRequest && state.activeCompanyWorkspaceId === companyId) {
        panel.innerHTML = `<div class="company-client-directory">${heading}<div class="client-empty"><strong>Clients could not be loaded.</strong><p>${esc(error.message)}</p></div></div>`;
      }
    }
  };
  async function refreshCurrentClientView(){if(state.view==='clients')await load();else if(state.view==='companyWorkspace'&&state.activeCompanyWorkspaceTab==='clients')await window.loadCompanyWorkspaceClients?.(state.activeCompanyWorkspaceId,manageableCompanies().some(company=>company.id===state.activeCompanyWorkspaceId));}
  async function load(){
    const id=++request,grid=$('#clientGrid');if(!grid||state.view!=='clients')return;grid.innerHTML='<p class="people-empty">Loading clients…</p>';
    try{clients=await api('/api/clients');if(id!==request)return;const filter=$('#clientCompanyFilter'),previous=filter.value;filter.innerHTML='<option value="">All accessible companies</option>'+companyOptions(previous);if(previous&&!state.companies.some(item=>item.id===previous))filter.value='';const formCompany=$('#clientCompany'),manageable=manageableCompanies(),selected=formCompany.value||state.user?.activeCompanyId||manageable[0]?.id;formCompany.innerHTML=companyOptions(selected,true);$('#clientCompanyFilter').hidden=state.companies.length<2;render();}
    catch(error){if(id===request)grid.innerHTML='<div class="client-empty"><strong>Clients could not be loaded.</strong><p>'+esc(error.message)+'</p></div>';}
  }
  function open(client=null,preferredCompanyId=''){
    editing=client;const form=$('#clientForm');form.reset();form.elements.clientId.value=client?.id||'';const allowed=client?state.companies:manageableCompanies(),selected=client?.companyId||preferredCompanyId||state.user?.activeCompanyId||allowed[0]?.id;
    form.elements.companyId.innerHTML=allowed.map(company=>`<option value="${esc(company.id)}" ${company.id===selected?'selected':''}>${esc(company.name)}</option>`).join('');form.elements.companyId.disabled=Boolean(client);
    for(const key of ['name','contactName','email','phone','location','notes'])form.elements[key].value=client?.[key]||'';
    for(const key of ['contactName','email','phone','location','notes']){const field=form.elements[key];field.required=!client;const marker=field.closest('.form-field')?.querySelector('.required-marker');if(marker)marker.hidden=Boolean(client);}const companyMarker=form.elements.companyId.closest('.form-field')?.querySelector('.required-marker');if(companyMarker)companyMarker.hidden=Boolean(client);
    $('#clientAssigneeHelp').textContent=client?'Clients remain visible to everyone with company access. Assign users to show who is responsible for the relationship.':'You will be assigned automatically as the creator. Fill in every field before saving.';
    $('#clientModalTitle').textContent=client?'Edit client':'Add client';$('#saveClient').textContent=client?'Save changes':'Save client';$('#clientError').textContent='';$('#clientBackdrop').hidden=false;loadClientAssignees(selected,client?.assignedUsers?.map(person=>person.id)||[state.user?.id].filter(Boolean));if(!client)form.elements.name.focus();
  }
  async function loadClientAssignees(companyId,selectedIds=[]){const picker=$('#clientAssigneeOptions'),current=++assigneeRequest;if(!picker)return;if(!companyId){picker.innerHTML='<small>Choose a company to load its users.</small>';return;}picker.innerHTML='<small>Loading company users…</small>';try{const people=await api('/api/clients/assignees?companyId='+encodeURIComponent(companyId));if(current!==assigneeRequest||$('#clientCompany').value!==companyId||$('#clientBackdrop').hidden)return;picker.innerHTML=people.length?people.map(person=>{const isCreator=!editing&&person.id===state.user?.id;return`<label class="client-assignee-option"><input type="checkbox" name="assignedUserIds" value="${esc(person.id)}" ${selectedIds.includes(person.id)||isCreator?'checked':''} ${isCreator?'disabled':''}><span><strong>${esc(person.name)}</strong><small>${esc(person.role||'Company user')}${isCreator?' · Creator, assigned automatically':''}</small></span></label>`;}).join(''):'<small>No active users are connected to this company.</small>';}catch(error){if(current===assigneeRequest)picker.innerHTML=`<small class="client-assignee-error">Users could not be loaded: ${esc(error.message)}</small>`;}}
  function close(restoreProfile=true){ $('#clientBackdrop').hidden=true;editing=null;if(restoreProfile&&profileReturnClientId){const client=clients.find(item=>item.id===profileReturnClientId)||companyClients.find(item=>item.id===profileReturnClientId);profileReturnClientId=null;if(client)openProfile(client,$('#clientProfileEdit'));}}
  function profileDate(value){if(!value)return'—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(date);}
  function profileCalendarDate(event){
    const timeZone=event.timeZone||'America/New_York';
    try{
      if(event.allDay){const start=new Date((event.startDate||event.startsAt.slice(0,10))+'T00:00:00Z'),end=new Date(Date.parse((event.endDateExclusive||event.endsAt.slice(0,10))+'T00:00:00Z')-86400000),format=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}),startLabel=format.format(start),endLabel=format.format(end);return startLabel===endLabel?`All day · ${startLabel}`:`All day · ${startLabel} – ${endLabel}`;}
      const start=new Date(event.startsAt),end=new Date(event.endsAt),dateFormat=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone}),timeFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone}),startDate=dateFormat.format(start),endDate=dateFormat.format(end);return`${startDate}${startDate===endDate?'':` – ${endDate}`} · ${timeFormat.format(start)} – ${timeFormat.format(end)}`;
    }catch{return profileDate(event.startsAt);}
  }
  function profileField(label,value,wide=false){return`<div class="client-profile-detail${wide?' client-profile-detail-wide':''}"><dt>${esc(label)}</dt><dd>${value||'—'}</dd></div>`;}
  function renderProfileTab(){
    if(!profileClient)return;const client=profileClient,panel=$('#clientProfileTabPanel');
    const content={
      details:`<div class="client-profile-section-heading"><div><span class="eyebrow">CLIENT INFORMATION</span><h3>Contact details</h3></div></div><dl class="client-profile-details">${profileField('Client name',esc(client.name))}${profileField('Company',esc(client.companyName||'—'))}${profileField('Primary contact',esc(client.contactName||'—'))}${profileField('Email',client.email?`<a href="mailto:${esc(client.email)}">${esc(client.email)}</a>`:'—')}${profileField('Phone',client.phone?`<a href="tel:${esc(client.phone)}">${esc(client.phone)}</a>`:'—')}${profileField('Location',esc(client.location||'—'))}${profileField('Assigned users',esc(assignedUsersText(client)),true)}${profileField('Added',profileDate(client.createdAt))}${profileField('Last updated',profileDate(client.updatedAt))}${profileField('Notes',esc(client.notes||'—'),true)}</dl>`,
      communications:`<div class="client-profile-placeholder"><span class="eyebrow">COMMUNICATIONS</span><h3>Client conversations will live here</h3><p>Use this section as the home for call notes, emails, meetings, and follow-ups connected to ${esc(client.name)}.</p><small>Communication history is not set up yet.</small></div>`,
      calendar:client.calendarLoading?`<div class="client-profile-placeholder"><span class="eyebrow">CALENDAR</span><h3>Loading linked events…</h3><p>Checking the company calendar for events connected to ${esc(client.name)}.</p></div>`:client.calendarError?`<div class="client-profile-placeholder"><span class="eyebrow">CALENDAR</span><h3>Calendar events could not be loaded</h3><p>${esc(client.calendarError)}</p><button type="button" class="button button-secondary" data-client-calendar-retry>Try again</button></div>`:client.calendarEvents?.length?`<div class="client-profile-section-heading"><div><span class="eyebrow">CONNECTED CALENDAR</span><h3>${client.calendarEvents.length} event${client.calendarEvents.length===1?'':'s'}</h3></div></div><div class="client-calendar-event-list">${client.calendarEvents.map(event=>{const category=event.eventType==='lunch'?'Lunch Break':event.eventType==='unavailable'?'Time Off':event.meetingType||'Meeting or event';return`<article class="client-calendar-event${event.status==='canceled'?' is-canceled':''}"><div class="client-calendar-event-heading"><div><h4>${esc(event.title)}</h4><small>${esc(event.companyName)}${event.location?' · '+esc(event.location):''}</small></div>${event.status==='canceled'?'<span class="client-calendar-event-canceled">Canceled</span>':''}</div><div class="client-calendar-event-meta"><span class="client-calendar-event-date">${esc(profileCalendarDate(event))}</span><span class="client-calendar-event-category">${esc(category)}</span></div></article>`;}).join('')}</div>`:`<div class="client-profile-placeholder"><span class="eyebrow">CALENDAR</span><h3>No calendar events linked</h3><p>Choose ${esc(client.name)} in the Client field when creating a company calendar event to have it appear here.</p></div>`,
      invoices:`<div class="client-profile-placeholder"><span class="eyebrow">INVOICES</span><h3>Invoice records will live here</h3><p>This tab is ready for future invoice tracking connected to ${esc(client.name)}.</p><small>Invoice tracking is not set up yet.</small></div>`
    };
    const tab=$(`#clientProfileTabs [data-client-profile-tab="${activeProfileTab}"]`);panel.setAttribute('aria-labelledby',tab.id);panel.innerHTML=content[activeProfileTab]||content.details;
  }
  function setProfileTab(tabName,focus=false){
    const tab=$(`#clientProfileTabs [data-client-profile-tab="${tabName}"]`);if(!tab)return;activeProfileTab=tabName;
    $('#clientProfileTabs').querySelectorAll('[role="tab"]').forEach(item=>{const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;});renderProfileTab();if(tabName==='calendar')loadProfileCalendar();if(focus)tab.focus();
  }
  async function loadProfileCalendar(){
    const client=profileClient;if(!client||client.calendarLoading)return;client.calendarLoading=true;client.calendarError='';renderProfileTab();
    try{client.calendarEvents=await api('/api/clients/'+encodeURIComponent(client.id)+'/calendar-events');}
    catch(error){client.calendarError=error.message;}
    finally{client.calendarLoading=false;if(profileClient?.id===client.id&&activeProfileTab==='calendar')renderProfileTab();}
  }
  function openProfile(client,trigger){
    if(state.view==='companyWorkspace')profileReturnWorkspace={view:'companyWorkspace',companyId:state.activeCompanyWorkspaceId,tab:state.activeCompanyWorkspaceTab};else if(!profileReturnWorkspace)profileReturnWorkspace=null;
    profileClient=client;profileTrigger=trigger||document.activeElement;$('#clientProfileAvatar').textContent=initials(client.name);$('#clientProfileName').textContent=client.name;$('#clientProfileCompany').textContent=client.companyName||'';$('#clientProfileEdit').hidden=!client.canManage;
    if(profileReturnWorkspace){state.view='clients';window.syncWorkspaceView?.();}else{$('#clientsView').hidden=true;$('#clientProfileView').hidden=false;$('.page-heading').hidden=true;$('.heading-actions').hidden=true;}
    setProfileTab('details');$('#clientProfileClose').focus();
  }
  function closeProfile(restoreFocus=true,syncView=true,preserveReturn=false){const trigger=profileTrigger,returnWorkspace=profileReturnWorkspace;$('#clientProfileView').hidden=true;profileClient=null;profileTrigger=null;if(returnWorkspace){state.view=returnWorkspace.view;state.activeCompanyWorkspaceId=returnWorkspace.companyId;state.activeCompanyWorkspaceTab=returnWorkspace.tab;}if(!preserveReturn)profileReturnWorkspace=null;if(syncView)window.syncWorkspaceView?.();if(restoreFocus){if(trigger?.isConnected&&!trigger.closest('[hidden]'))trigger.focus();else if(returnWorkspace)$('#companyModuleTabs [data-company-tab="clients"]')?.focus();else if(state.view==='clients')$('#clientSearch')?.focus();}}
  window.isClientProfileOpen=()=>Boolean(profileClient);
  window.dismissClientProfile=()=>{profileReturnWorkspace=null;closeProfile(false,false);};
  function clearImport(){
    const form=$('#clientImportForm');form.reset();importFileData=null;$('#clientImportError').textContent='';$('#clientImportPreview').hidden=true;$('#clientImportSummary').textContent='';$('#clientImportRows').textContent='';$('#clientImportCommit').disabled=true;$('#clientImportCommit').textContent='Import clients';
  }
  function openImport(){if(importBusy)return;clearImport();$('#clientImportBackdrop').hidden=false;$('#clientImportFile').focus();}
  function closeImport(){if(importBusy)return;$('#clientImportBackdrop').hidden=true;clearImport();}
  async function base64File(file){
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
    return btoa(binary);
  }
  function showImportPreview(preview){
    $('#clientImportSummary').innerHTML=`<strong>${preview.readyCount} ready</strong><span>${preview.duplicateCount} duplicates skipped</span><span>${preview.invalidCount} rows need correction</span><small>${esc(preview.fileName)} · ${preview.rows.length} rows found</small>`;
    $('#clientImportRows').innerHTML=preview.rows.map(row=>{
      const note=row.notes.length>100?row.notes.slice(0,100)+'…':row.notes,assigned=(row.assignedUserNames||[]).join(', '),statusLabel=row.status==='ready'?'Ready':row.status==='duplicate'?'Duplicate':'Needs correction';
      return`<tr class="client-import-row-${row.status}"><td>${row.rowNumber}</td><td title="${esc(row.companyName)}">${esc(row.companyName||'—')}</td><td title="${esc(row.name)}">${esc(row.name||'—')}</td><td title="${esc(row.contactName)}">${esc(row.contactName||'—')}</td><td title="${esc(row.email)}">${esc(row.email||'—')}</td><td title="${esc(row.phone)}">${esc(row.phone||'—')}</td><td title="${esc(row.location)}">${esc(row.location||'—')}</td><td title="${esc(note)}">${esc(note||'—')}</td><td title="${esc(assigned)}">${esc(assigned||'—')}</td><td><span class="client-import-status ${row.status}" title="${esc(row.issue)}">${statusLabel}${row.issue?` · ${esc(row.issue)}`:''}</span></td></tr>`;
    }).join('');
    $('#clientImportPreview').hidden=false;const commit=$('#clientImportCommit');commit.disabled=preview.readyCount===0;commit.textContent=preview.readyCount?`Import ${preview.readyCount} valid client${preview.readyCount===1?'':'s'}`:'No valid clients to import';
  }
  async function previewImport(){
    const file=$('#clientImportFile').files?.[0],review=$('#clientImportReview'),input=$('#clientImportFile');$('#clientImportError').textContent='';
    if(!file){$('#clientImportError').textContent='Choose an Excel workbook or CSV file first.';return;}
    if(file.size>4*1024*1024){$('#clientImportError').textContent='The spreadsheet must be 4 MB or smaller.';return;}
    importBusy=true;review.disabled=true;input.disabled=true;review.textContent='Reading spreadsheet…';$('#clientImportCommit').disabled=true;
    try{importFileData={fileName:file.name,fileData:await base64File(file)};const preview=await api('/api/clients/import/preview',{method:'POST',body:JSON.stringify(importFileData)});showImportPreview(preview);}
    catch(error){importFileData=null;$('#clientImportPreview').hidden=true;$('#clientImportError').textContent=error.message;}
    finally{importBusy=false;review.disabled=false;input.disabled=false;review.textContent='Preview spreadsheet';}
  }
  async function commitImport(){
    if(!importFileData||importBusy)return;const commit=$('#clientImportCommit'),review=$('#clientImportReview'),input=$('#clientImportFile');importBusy=true;commit.disabled=true;review.disabled=true;input.disabled=true;commit.textContent='Importing clients…';$('#clientImportError').textContent='';
    try{const result=await api('/api/clients/import',{method:'POST',body:JSON.stringify(importFileData)});$('#clientImportBackdrop').hidden=true;clearImport();await load();let activityRefreshFailed=false;try{await window.refreshActivity?.();}catch{activityRefreshFailed=true;}showToast(`Imported ${result.imported} client${result.imported===1?'':'s'}; skipped ${result.skippedDuplicates} duplicates and ${result.skippedInvalid} invalid rows.`+(activityRefreshFailed?' Activity may need a refresh.':''));}
    catch(error){$('#clientImportError').textContent=error.message;commit.disabled=false;commit.textContent='Try import again';}
    finally{importBusy=false;review.disabled=false;input.disabled=false;}
  }
  window.loadClients=load;
  $('#clientSearch').addEventListener('input',render);$('#clientCompanyFilter').addEventListener('change',render);$('#newClient').addEventListener('click',()=>open());$('#importClients').addEventListener('click',openImport);
  $('#clientClose').addEventListener('click',close);$('#clientCancel').addEventListener('click',close);$('#clientBackdrop').addEventListener('click',event=>{if(event.target===$('#clientBackdrop'))close();});
  $('#clientGrid').addEventListener('click',event=>{const profileButton=event.target.closest('[data-client-profile]');if(profileButton){const client=clients.find(item=>item.id===profileButton.dataset.clientProfile);if(client)openProfile(client,profileButton);return;}const button=event.target.closest('[data-client-edit]');if(button){const client=clients.find(item=>item.id===button.dataset.clientEdit);if(client?.canManage)open(client);}});
  $('#companyWorkspacePanel').addEventListener('click',event=>{const add=event.target.closest('[data-company-client-add]');if(add){open(null,add.dataset.companyClientAdd);return;}const profile=event.target.closest('[data-company-client-profile]');if(profile){const client=companyClients.find(item=>item.id===profile.dataset.companyClientProfile);if(client)openProfile(client,profile);return;}const edit=event.target.closest('[data-company-client-edit]');if(edit){const client=companyClients.find(item=>item.id===edit.dataset.companyClientEdit);if(client?.canManage)open(client,companyClientsCompanyId);}});
  $('#companyWorkspacePanel').addEventListener('input',event=>{if(event.target.id==='companyClientSearch')renderCompanyClientRows();});
  $('#clientProfileTabs').addEventListener('click',event=>{const tab=event.target.closest('[data-client-profile-tab]');if(tab)setProfileTab(tab.dataset.clientProfileTab);});
  $('#clientProfileTabPanel').addEventListener('click',event=>{if(event.target.closest('[data-client-calendar-retry]'))loadProfileCalendar();});
  $('#clientProfileTabs').addEventListener('keydown',event=>{const tabs=[...$('#clientProfileTabs').querySelectorAll('[role="tab"]')],current=tabs.indexOf(event.target.closest('[role="tab"]'));if(current<0)return;let next=current;if(event.key==='ArrowRight')next=(current+1)%tabs.length;else if(event.key==='ArrowLeft')next=(current+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setProfileTab(tabs[next].dataset.clientProfileTab,true);});
  $('#clientProfileClose').addEventListener('click',()=>closeProfile());
  $('#clientProfileEdit').addEventListener('click',()=>{const client=profileClient;if(!client?.canManage)return;profileReturnClientId=client.id;closeProfile(false,true,true);open(client);});
  $('#clientCompany').addEventListener('change',event=>loadClientAssignees(event.currentTarget.value,editing?[]:[state.user?.id].filter(Boolean)));
  $('#clientForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,id=form.elements.clientId.value,button=$('#saveClient'),body=Object.fromEntries(new FormData(form).entries());body.assignedUserIds=[...form.querySelectorAll('[name="assignedUserIds"]:checked')].map(input=>input.value);delete body.clientId;button.disabled=true;$('#clientError').textContent='';try{await api(id?'/api/clients/'+encodeURIComponent(id):'/api/clients',{method:id?'PATCH':'POST',body:JSON.stringify(body)});close(false);await refreshCurrentClientView();await window.refreshActivity?.();if(profileReturnClientId){const updated=clients.find(item=>item.id===profileReturnClientId)||companyClients.find(item=>item.id===profileReturnClientId);profileReturnClientId=null;if(updated)openProfile(updated,$('#clientProfileEdit'));}showToast(id?'Client updated.':'Client added.');}catch(error){$('#clientError').textContent=error.message;}finally{button.disabled=false;}});
  $('#clientImportClose').addEventListener('click',closeImport);$('#clientImportCancel').addEventListener('click',closeImport);$('#clientImportBackdrop').addEventListener('click',event=>{if(event.target===$('#clientImportBackdrop'))closeImport();});
  $('#clientImportForm').addEventListener('submit',event=>event.preventDefault());$('#clientImportFile').addEventListener('change',()=>{importFileData=null;$('#clientImportPreview').hidden=true;$('#clientImportError').textContent='';$('#clientImportCommit').disabled=true;$('#clientImportCommit').textContent='Import clients';});
  $('#clientImportReview').addEventListener('click',previewImport);$('#clientImportCommit').addEventListener('click',commitImport);
})();

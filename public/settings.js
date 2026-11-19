(function(){
  const categories={
    basic:[
      {key:'workspaceTeammates',title:'Collaborative Team',description:'Show the team directory and team search results.'},
      {key:'workspaceTasks',title:'Current work tasks',description:'Allow teams to create and review current work across companies.'},
      {key:'workspaceActivity',title:'Activity',description:'Show organization and company activity histories.'},
      {key:'workspaceCalendar',title:'Calendar',description:'Show calendars, event details, and RSVP controls.'},
      {key:'workspaceClients',title:'Clients',description:'Show the client directory and client records.'},
      {key:'workspaceReception',title:'Reception Intake',description:'Show inquiry intake and follow-up tools across company portals.'},
      {key:'workspaceSystemDevelopment',title:'Projects',description:'Show team projects, discussions, files, and shared work. Project access is managed separately.'}
    ],
    advanced:[
      {key:'clientImports',title:'Client spreadsheet imports',description:'Allow portal administrators to preview and import client spreadsheets.'},
      {key:'meetingPdfPreview',title:'Project PDF preview',description:'Allow inline previews of PDFs shared in projects. Downloads remain available.'},
      {key:'calendarEmails',title:'External calendar invitations',description:'Send email invitations and updates to external guests when server email is configured.'},
      {key:'calendarReminders',title:'Upcoming event reminders',description:'Email event owners and connected internal attendees at their profile addresses before timed events begin.'},
      {key:'calendarSlackReminders',title:'Slack calendar reminders',description:'Post upcoming event reminders to the connected Slack channel.'},
      {key:'documentUploads',title:'Document uploads',description:'Allow new documents to be uploaded to companies and projects.'}
    ]
  };
  let activeCategory='basic',renderSequence=0;
  const $=selector=>document.querySelector(selector),esc=value=>escapeHtml(value);
  function row(setting){
    const enabled=state.settings[setting.key]!==false;
    return `<label class="portal-setting-row"><span class="portal-setting-copy"><strong>${esc(setting.title)}</strong><small>${esc(setting.description)}</small></span><span class="portal-setting-control"><input type="checkbox" role="switch" aria-label="${esc(setting.title)}" aria-checked="${enabled}" data-portal-setting="${setting.key}" ${enabled?'checked':''}><span class="portal-setting-track" aria-hidden="true"></span></span><span class="portal-setting-status" data-setting-status="${setting.key}" aria-live="polite">${enabled?'On':'Off'}</span></label>`;
  }
  function renderToggleCategory(category){
    const items=categories[category];
    const subtitle=category==='basic'?'Turn complete work areas on or off for every company portal. Existing records stay saved while a section is off.':'Control optional workflows that sit on top of the main work areas.';
    return `<article class="panel portal-settings-card"><div class="settings-card-heading"><div><h2>${category==='basic'?'Workspace sections':'Optional workflows'}</h2><p>${subtitle}</p></div></div><div class="portal-setting-list">${items.map(row).join('')}</div></article>`;
  }
  function bytesLabel(bytes){if(!bytes)return'—';return bytes>=1024*1024?`${Math.round(bytes/1024/1024)} MB`:`${Math.round(bytes/1024)} KB`;}
  function renderOther(){
    const meta=state.settingsMeta||{},limits=meta.limits||{};
    const reminderMinutes=Number(state.settings.calendarReminderMinutes)||30,channel=state.settings.calendarSlackChannel||'';
    return `<div class="settings-other-grid"><article class="panel settings-operational-card"><div class="settings-card-heading"><div><span class="eyebrow">ADMIN TOOLS</span><h2>Access and recovery</h2><p>Manage account permissions and restore a saved portal snapshot.</p></div></div><div class="settings-tool-links"><button type="button" class="button button-secondary" data-settings-action="access">Manage access <span aria-hidden="true">→</span></button><button type="button" class="button button-secondary" data-settings-action="backups">Backups <span aria-hidden="true">→</span></button></div></article><article class="panel settings-operational-card"><div class="settings-card-heading"><div><span class="eyebrow">SERVER STATUS</span><h2>Hosting and limits</h2><p>Connection and file limits for this portal.</p></div></div><dl class="settings-facts"><div><dt>External email</dt><dd><span class="settings-health-dot ${meta.calendarEmailConfigured?'ready':''}"></span>${meta.calendarEmailConfigured?'Configured':'Not configured'}</dd></div><div><dt>Slack channel</dt><dd><span class="settings-health-dot ${meta.calendarSlackConfigured?'ready':''}"></span>${meta.calendarSlackConfigured?'Connected':'Not connected'}</dd></div><div><dt>Public portal URL</dt><dd><span class="settings-health-dot ${meta.portalUrlConfigured?'ready':''}"></span>${meta.portalUrlConfigured?'Configured':'Not configured'}</dd></div><div><dt>Document upload limit</dt><dd>${bytesLabel(limits.documentUploadBytes)} per file</dd></div><div><dt>Spreadsheet import limit</dt><dd>${bytesLabel(limits.clientImportBytes)} · ${Number(limits.clientImportRows)||0} rows</dd></div><div><dt>Sign-in session</dt><dd>${Number(limits.sessionDays)||0} days</dd></div></dl></article></div><div class="settings-calendar-grid"><article class="panel settings-operational-card calendar-sender-card"><div class="settings-card-heading"><div><span class="eyebrow">CALENDAR INVITATIONS</span><h2>Sender email address</h2><p>Choose the address guests see on invitations and updates.</p></div></div><form class="calendar-sender-form" id="calendarSenderForm"><label class="form-field">Email address<input type="email" id="calendarSenderEmail" maxlength="254" autocomplete="email" required value="${esc(meta.calendarSenderEmail||'')}" placeholder="calendar@example.com"><small>This address must be approved by your email provider.</small></label><div class="calendar-sender-actions"><button type="submit" class="button button-primary" id="saveCalendarSenderEmail">Save address</button><button type="button" class="button button-secondary" id="resetCalendarSenderEmail" ${meta.calendarSenderOverride?'':'disabled'}>Use server default</button></div><p class="calendar-sender-state" id="calendarSenderState" role="status" aria-live="polite">${meta.calendarSenderOverride?'A portal sender address is active.':'Using the sender address configured on the server.'}</p></form></article><article class="panel settings-operational-card calendar-reminder-card"><div class="settings-card-heading"><div><span class="eyebrow">EVENT REMINDERS</span><h2>Reminder timing</h2><p>Choose how early event owners receive an email reminder.</p></div></div><form class="calendar-reminder-form" id="calendarReminderForm"><label class="form-field">Send reminders<select id="calendarReminderMinutes">${[[5,'5 minutes before'],[10,'10 minutes before'],[15,'15 minutes before'],[30,'30 minutes before'],[60,'1 hour before'],[120,'2 hours before'],[1440,'1 day before']].map(([value,label])=>`<option value="${value}" ${reminderMinutes===value?'selected':''}>${label}</option>`).join('')}</select></label><button type="submit" class="button button-primary" id="saveCalendarReminderMinutes">Save timing</button><p class="calendar-sender-state" id="calendarReminderState" role="status" aria-live="polite">Sent to the email address on the event owner's profile.</p></form></article></div><article class="panel settings-operational-card slack-calendar-card"><div class="settings-card-heading"><div><span class="eyebrow">SLACK CONNECTION</span><h2>Calendar reminder channel</h2><p>Connect one Slack channel with an Incoming Webhook. The private address is hidden after saving.</p></div><span class="settings-connection-badge ${meta.calendarSlackConfigured?'ready':''}">${meta.calendarSlackConfigured?'Connected':'Not connected'}</span></div><form class="slack-calendar-form" id="slackCalendarForm"><label class="form-field">Channel name<input type="text" id="calendarSlackChannel" maxlength="80" value="${esc(channel)}" placeholder="team-calendar"></label><label class="form-field slack-webhook-field">Incoming Webhook address<input type="password" id="calendarSlackWebhookUrl" autocomplete="new-password" placeholder="${meta.calendarSlackConfigured?'Saved securely — enter a new address to replace it':'https://hooks.slack.com/services/…'}"><small>Create the webhook in Slack for the channel that should receive calendar reminders.</small></label><div class="calendar-sender-actions"><button type="submit" class="button button-primary" id="saveSlackCalendar">${meta.calendarSlackConfigured?'Save changes':'Connect channel'}</button><button type="button" class="button button-secondary" id="testSlackCalendar" ${meta.calendarSlackConfigured?'':'disabled'}>Send test</button><button type="button" class="button button-secondary" id="disconnectSlackCalendar" ${meta.calendarSlackConfigured?'':'disabled'}>Disconnect</button></div><p class="calendar-sender-state" id="slackCalendarState" role="status" aria-live="polite">${meta.calendarSlackConfigured?`Connected${channel?` to #${esc(channel)}`:''}. ${state.settings.calendarSlackReminders!==false?'Slack reminders are on.':'Turn them on under Optional workflows.'}`:'No Slack channel is connected yet.'}</p></form></article><article class="panel settings-data-note"><span class="settings-note-mark" aria-hidden="true">i</span><div><strong>Personal reminders stay personal.</strong><p>Portal-created events notify only their owner by profile email. Events imported from an external calendar may notify their linked users. Slack receives one shared channel message.</p></div></article>`;
  }
  async function saveCalendarSender(value){
    const input=$('#calendarSenderEmail'),save=$('#saveCalendarSenderEmail'),reset=$('#resetCalendarSenderEmail'),status=$('#calendarSenderState');if(!input||!save||!reset||!status)return;
    save.disabled=true;reset.disabled=true;input.disabled=true;status.textContent='Saving sender address…';
    try{
      const result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key:'calendarSenderEmail',value})});
      state.settings=Object.fromEntries(Object.entries(result).filter(([name])=>name!=='meta'));state.settingsMeta=result.meta||{};input.value=state.settingsMeta.calendarSenderEmail||'';reset.disabled=!state.settingsMeta.calendarSenderOverride;status.textContent=state.settingsMeta.calendarSenderOverride?'Saved. New invitations and updates will use this address.':'Using the sender address configured on the server.';showToast('Calendar invite sender address saved.');
    }catch(error){status.textContent=error.message;showToast(error.message,'error');}
    finally{input.disabled=false;save.disabled=false;reset.disabled=!state.settingsMeta?.calendarSenderOverride;}
  }
  async function testCalendarEmail(){
    const button=$('#testCalendarEmail'),status=$('#calendarSenderState');if(!button||!status)return;button.disabled=true;status.textContent='Sending a test email to your profile address…';
    try{const result=await api('/api/settings/calendar-email-test',{method:'POST',body:'{}'});status.textContent=result.message;showToast(result.message);}
    catch(error){status.textContent=error.message;showToast(error.message,'error');}
    finally{button.disabled=false;}
  }
  function applySettingsResult(result){state.settings=Object.fromEntries(Object.entries(result).filter(([name])=>name!=='meta'));state.settingsMeta=result.meta||{};}
  async function saveReminderTiming(){
    const select=$('#calendarReminderMinutes'),save=$('#saveCalendarReminderMinutes'),status=$('#calendarReminderState');if(!select||!save||!status)return;
    select.disabled=true;save.disabled=true;status.textContent='Saving reminder time…';
    try{const result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key:'calendarReminderMinutes',value:Number(select.value)})});applySettingsResult(result);status.textContent='Saved. Event owners will be emailed at this time.';showToast('Calendar reminder timing saved.');}
    catch(error){status.textContent=error.message;showToast(error.message,'error');}
    finally{select.disabled=false;save.disabled=false;}
  }
  async function saveSlackConnection(){
    const channel=$('#calendarSlackChannel'),webhook=$('#calendarSlackWebhookUrl'),save=$('#saveSlackCalendar'),status=$('#slackCalendarState');if(!channel||!webhook||!save||!status)return;
    const webhookValue=webhook.value.trim();if(!state.settingsMeta?.calendarSlackConfigured&&!webhookValue){status.textContent='Paste a Slack Incoming Webhook address to connect the channel.';webhook.focus();return;}
    channel.disabled=true;webhook.disabled=true;save.disabled=true;status.textContent='Saving Slack connection…';
    try{
      let result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key:'calendarSlackChannel',value:channel.value.trim()})});
      if(webhookValue)result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key:'calendarSlackWebhookUrl',value:webhookValue})});
      if(webhookValue)result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key:'calendarSlackReminders',value:true})});
      applySettingsResult(result);webhook.value='';await window.renderAdminSettings();showToast('Slack calendar channel connected.');
    }catch(error){status.textContent=error.message;showToast(error.message,'error');}
    finally{channel.disabled=false;webhook.disabled=false;save.disabled=false;}
  }
  async function testSlackConnection(){
    const button=$('#testSlackCalendar'),status=$('#slackCalendarState');if(!button||!status)return;button.disabled=true;status.textContent='Sending a test message…';
    try{const result=await api('/api/settings/calendar-slack-test',{method:'POST',body:'{}'});status.textContent=result.message;showToast(result.message);}
    catch(error){status.textContent=error.message;showToast(error.message,'error');}
    finally{button.disabled=false;}
  }
  async function disconnectSlackConnection(){
    const button=$('#disconnectSlackCalendar'),status=$('#slackCalendarState');if(!button||!status)return;button.disabled=true;status.textContent='Disconnecting Slack…';
    try{const result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key:'calendarSlackWebhookUrl',value:''})});applySettingsResult(result);await window.renderAdminSettings();showToast('Slack calendar channel disconnected.');}
    catch(error){status.textContent=error.message;showToast(error.message,'error');button.disabled=false;}
  }
  function applyCategory(category){
    activeCategory=category;
    document.querySelectorAll('[data-settings-tab]').forEach(tab=>{const selected=tab.dataset.settingsTab===category;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
    document.querySelectorAll('[data-settings-panel]').forEach(panel=>{panel.hidden=panel.dataset.settingsPanel!==category;});
  }
  window.renderAdminSettings=async function(){
    if(state.user?.role!=='admin'||state.portalCompany?.parentId)return;
    const sequence=++renderSequence;
    if(!Object.keys(state.settings||{}).length)try{await window.loadPortalSettings();}catch(error){$('#settingsPanelBasic').innerHTML=`<p class="settings-load-error">Settings could not be loaded: ${esc(error.message)}</p>`;return;}
    if(sequence!==renderSequence||state.view!=='settings')return;
    $('#settingsPanelBasic').innerHTML=renderToggleCategory('basic');
    $('#settingsPanelAdvanced').innerHTML=renderToggleCategory('advanced');
    $('#settingsPanelOther').innerHTML=renderOther();
    const reminderNote=[...$('#settingsPanelOther').querySelectorAll('.settings-data-note')].find(note=>note.textContent.includes('Personal reminders stay personal.'));
    if(reminderNote){const heading=reminderNote.querySelector('strong'),copy=reminderNote.querySelector('p');if(heading)heading.textContent='Reminders go to event participants.';if(copy)copy.textContent='Event owners and connected internal attendees receive email at their profile address. Declined attendees are skipped. Slack receives one shared channel message.';}
    const reminderIntro=$('#settingsPanelOther .calendar-reminder-card .settings-card-heading p');if(reminderIntro)reminderIntro.textContent='Choose how early event owners and connected internal attendees receive email reminders.';
    const reminderTimingCopy=$('#calendarReminderForm .calendar-sender-state');if(reminderTimingCopy)reminderTimingCopy.textContent='Sent to the owner and connected internal attendees at their profile email addresses.';
    const senderActions=$('#calendarSenderForm .calendar-sender-actions');if(senderActions&&!$('#testCalendarEmail')){const testButton=document.createElement('button');testButton.type='button';testButton.className='button button-secondary';testButton.id='testCalendarEmail';testButton.textContent='Send test email';senderActions.append(testButton);}
    applyCategory(activeCategory);
  };
  $('#settingsTabs').addEventListener('click',event=>{const tab=event.target.closest('[data-settings-tab]');if(tab)applyCategory(tab.dataset.settingsTab);});
  $('#settingsTabs').addEventListener('keydown',event=>{const tabs=[...document.querySelectorAll('[data-settings-tab]')],current=tabs.indexOf(event.target.closest('[data-settings-tab]'));if(current<0)return;let next=current;if(event.key==='ArrowRight')next=(current+1)%tabs.length;else if(event.key==='ArrowLeft')next=(current+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();applyCategory(tabs[next].dataset.settingsTab);});
  document.addEventListener('change',async event=>{
    const input=event.target.closest('[data-portal-setting]');if(!input)return;
    const key=input.dataset.portalSetting,value=input.checked,status=$(`[data-setting-status="${key}"]`);input.disabled=true;if(status)status.textContent='Saving…';
    try{
      const result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({key,value})});
      state.settings=Object.fromEntries(Object.entries(result).filter(([name])=>name!=='meta'));state.settingsMeta=result.meta||{};input.setAttribute('aria-checked',String(value));if(status)status.textContent=value?'On':'Off';
      if(key==='clientImports'){const button=$('#importClients');if(button)button.hidden=!value;}
      window.syncWorkspaceView?.();showToast(`${input.getAttribute('aria-label')} ${value?'enabled':'disabled'}.`);
    }catch(error){input.checked=!value;input.setAttribute('aria-checked',String(!value));if(status)status.textContent=!value?'On':'Off';showToast(error.message,'error');}
    finally{input.disabled=false;}
  });
  document.addEventListener('submit',event=>{if(event.target.id==='calendarSenderForm'){event.preventDefault();const input=$('#calendarSenderEmail');if(input?.reportValidity())saveCalendarSender(input.value.trim());}else if(event.target.id==='calendarReminderForm'){event.preventDefault();saveReminderTiming();}else if(event.target.id==='slackCalendarForm'){event.preventDefault();saveSlackConnection();}});
  document.addEventListener('click',event=>{if(event.target.closest('#resetCalendarSenderEmail'))saveCalendarSender('');});
  document.addEventListener('click',event=>{if(event.target.closest('#testCalendarEmail'))testCalendarEmail();});
  document.addEventListener('click',event=>{if(event.target.closest('#testSlackCalendar'))testSlackConnection();else if(event.target.closest('#disconnectSlackCalendar'))disconnectSlackConnection();});
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-settings-action]')?.dataset.settingsAction;if(!action)return;
    if(action==='access')$('#managePeople').click();else if(action==='backups')$('#manageBackups').click();
  });
})();

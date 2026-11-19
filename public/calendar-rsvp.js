(function(){
  const $=selector=>document.querySelector(selector),escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),token=new URLSearchParams(location.search).get('token')||'';
  const responses={accepted:{label:'Accepted',className:'accepted'},maybe:{label:'Maybe',className:'maybe'},declined:{label:'Declined',className:'declined'}};
  async function api(path,options){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options?.headers||{})}});let data;try{data=await response.json();}catch{throw new Error('The portal returned an unreadable response.');}if(!response.ok)throw new Error(data.error||'Request failed.');return data;}
  function dateLine(event){if(event.allDay)return event.startDate+' · All day';const formatter=new Intl.DateTimeFormat('en-US',{timeZone:event.timeZone||'America/New_York',weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'});return formatter.format(new Date(event.startsAt))+' – '+formatter.format(new Date(event.endsAt))+' ('+escape(event.timeZone||'America/New_York')+')';}
  function showRsvpMessage(kind,title,detail,response=''){
    const message=$('#rsvpMessage'),icon=kind==='success'?'✓':kind==='error'?'!':kind==='warning'?'!':'i',responseInfo=responses[response];
    message.className='calendar-rsvp-message is-'+kind;message.hidden=false;
    message.innerHTML='<span class="calendar-rsvp-message-icon" aria-hidden="true">'+icon+'</span><span class="calendar-rsvp-message-copy"><strong>'+escape(title)+'</strong><small>'+escape(detail)+'</small>'+(responseInfo?'<span class="calendar-rsvp-response is-'+responseInfo.className+'">'+responseInfo.label+'</span>':'')+'</span>';
  }
  async function load(){
    if(token.length<32){$('#rsvpTitle').textContent='Invitation unavailable';showRsvpMessage('error','This response link cannot be used','The invitation link is invalid or expired.');return;}
    try{
      const result=await api('/api/calendar/external-rsvp?token='+encodeURIComponent(token)),event=result.event;
      $('#rsvpTitle').textContent=event.title;
      $('#rsvpDetails').innerHTML='<p><strong>'+escape(event.companyName)+'</strong></p><p>'+dateLine(event)+'</p><p>'+escape([event.locationType,event.location].filter(Boolean).join(' · '))+'</p><p>'+escape(event.meetingType)+'</p>'+(event.description?'<p><strong>Decisions &amp; follow-ups</strong><br>'+escape(event.description).replace(/\n/g,'<br>')+'</p>':'');
      $('#rsvpActions').hidden=event.status==='canceled';
      if(event.status==='canceled')showRsvpMessage('warning','This meeting was canceled','Responses are closed for this invitation.');
      else if(result.response==='awaiting')showRsvpMessage('info','Please choose your response',result.guestName?'Hello '+result.guestName+'. Select an option below.':'Select an option below.');
      else showRsvpMessage('success','Your response is saved','You can change your answer below.',result.response);
    }catch(error){$('#rsvpTitle').textContent='Invitation unavailable';showRsvpMessage('error','We could not open this invitation',error.message);}
  }
  $('#rsvpActions').addEventListener('click',async event=>{
    const button=event.target.closest('[data-rsvp]');if(!button)return;
    const buttons=$('#rsvpActions').querySelectorAll('button');showRsvpMessage('info','Saving your response','Please wait while we record your choice.');buttons.forEach(item=>item.disabled=true);
    try{const result=await api('/api/calendar/external-rsvp',{method:'POST',body:JSON.stringify({token,response:button.dataset.rsvp})});showRsvpMessage('success','Your response is saved','Thanks for letting the organizer know.',result.response);}
    catch(error){showRsvpMessage('error','We could not save your response',error.message);}
    finally{buttons.forEach(item=>item.disabled=false);}
  });
  load();
})();

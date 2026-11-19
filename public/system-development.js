(function(){
  let projects=[],archivedProjects=[],members=[],companies=[],currentProjectId=null,activeDevelopmentTab='dashboard',activeProjectTab='details',checklistDraft=[],replyingToId=null,projectFocusReturnTarget=null,itemFocusReturnTarget=null,pdfFocusReturnTarget=null;
  const DEVELOPMENT_STATUSES=['Planned','In progress','Blocked','Complete'];
  const $=selector=>document.querySelector(selector),esc=value=>escapeHtml(value);
  const newRequestId=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,character=>{const value=Math.random()*16|0;return(character==='x'?value:value&3|8).toString(16);});

  function dateLabel(value){
    return value?new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Date not set';
  }

  function todayLocal(){const date=new Date();date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,10);}

  function activateDevelopmentTab(tab,focus=false){
    const selected=$('#systemDevelopmentTabs [data-development-tab="'+tab+'"]');if(!selected)return;
    activeDevelopmentTab=tab;
    document.querySelectorAll('#systemDevelopmentTabs [data-development-tab]').forEach(button=>{const active=button===selected;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
    document.querySelectorAll('[data-development-panel]').forEach(panel=>{panel.hidden=panel.dataset.developmentPanel!==tab;});
    if(focus)selected.focus();
  }

  function statusCounts(items){return Object.fromEntries(DEVELOPMENT_STATUSES.map(status=>[status,items.filter(item=>item.status===status).length]));}

  function focusIfAvailable(target){if(!target?.isConnected||target.disabled||target.closest('[hidden]')||!target.getClientRects().length)return false;target.focus({preventScroll:true});return true;}

  function restoreDevelopmentFocus(target){
    if(focusIfAvailable(target))return;
    const fallback=[document.querySelector('#systemDevelopmentNav:not([hidden])'),document.querySelector('#primaryNav [data-view="overview"]:not([hidden])'),document.querySelector('#pageTitle')].find(element=>element&&!element.closest('[hidden]')&&element.getClientRects().length);
    if(fallback?.id==='pageTitle'&&!fallback.hasAttribute('tabindex'))fallback.tabIndex=-1;
    focusIfAvailable(fallback);
  }

  function activeDevelopmentDialog(){
    for(const backdropId of ['developmentPdfPreviewBackdrop','systemDevelopmentBackdrop','developmentProjectBackdrop']){
      const backdrop=$('#'+backdropId),dialog=backdrop?.querySelector('[role="dialog"][aria-modal="true"]');
      if(backdrop&&!backdrop.hidden&&dialog?.getClientRects().length)return dialog;
    }
    return null;
  }

  function developmentDialogControls(dialog){
    return [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])')].filter(element=>!element.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(element).visibility!=='hidden'&&element.getClientRects().length);
  }

  document.addEventListener('focusin',event=>{
    const dialog=activeDevelopmentDialog();if(!dialog||dialog.contains(event.target))return;
    const controls=developmentDialogControls(dialog),fallback=controls.at(-1)||dialog;
    fallback.focus({preventScroll:true});
    if(!dialog.contains(document.activeElement))(controls[0]||dialog).focus({preventScroll:true});
  });

  document.addEventListener('keydown',event=>{
    const dialog=activeDevelopmentDialog();if(!dialog)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      if(dialog.closest('#developmentPdfPreviewBackdrop'))closePdfPreview();
      else if(dialog.closest('#systemDevelopmentBackdrop'))closeItem();
      else closeProject();
      return;
    }
    if(event.key!=='Tab')return;
    const focusable=developmentDialogControls(dialog);
    if(!focusable.length){event.preventDefault();dialog.tabIndex=-1;dialog.focus({preventScroll:true});return;}
    const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
    if(active===dialog||!dialog.contains(active)||!focusable.includes(active)){event.preventDefault();(event.shiftKey?last:first).focus();}
    else if(event.shiftKey&&active===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
  });

  function progressStats(items){const total=items.length,done=items.filter(item=>item.status==='Complete').length;return{done,total,percent:total?Math.round(done/total*100):0};}
  function progressLabel(stats){return stats.done+' of '+stats.total+' work '+(stats.total===1?'item':'items')+' complete';}

  function statusStrip(items,label){
    if(!items.length)return '<div class="development-progress-empty">No assigned work with target dates</div>';
    const counts=statusCounts(items),visibleStatuses=['Complete','In progress','Planned','Blocked'],summary=visibleStatuses.map(status=>status+': '+counts[status]).join(', ');
    return '<div class="development-status-circles" role="group" aria-label="'+esc(label+' status counts. '+summary)+'">'+visibleStatuses.map(status=>'<div class="development-status-circle-item status-count-'+esc(status.toLowerCase().replaceAll(' ','-'))+'" aria-label="'+esc(counts[status]+' '+status)+'"><span class="development-status-circle" aria-hidden="true">'+counts[status]+'</span><span class="development-status-circle-label">'+esc(status)+'</span></div>').join('')+'</div>';
  }

  function dashboardProgressCircles(items,label){
    const counts=statusCounts(items),entries=['Complete','In progress','Planned','Blocked'],summary=entries.map(name=>name+': '+counts[name]).join(', ');
    return '<div class="development-status-circles" role="group" aria-label="'+esc(label+' work status. '+summary)+'"><span class="development-status-circles-heading">Work status</span>'+entries.map(status=>'<div class="development-status-circle-item status-count-'+esc(status.toLowerCase().replaceAll(' ','-'))+'" aria-label="'+esc(counts[status]+' '+status)+'"><span class="development-status-circle" aria-hidden="true">'+counts[status]+'</span><span class="development-status-circle-label">'+esc(status)+'</span></div>').join('')+'</div>';
  }

  function phaseLabel(phase){return phase==='review'?'Waiting for input':phase==='completed'?'Complete':'Active';}

  function historyDetail(detail){
    return String(detail||'')
      .replaceAll('Collaboration space','Collaboration project')
      .replaceAll('collaboration space','collaboration project')
      .replaceAll('Space name','Project name')
      .replaceAll('Space purpose','Project purpose')
      .replaceAll('this space','this project')
      .replaceAll('Moved to Needs review','Moved to Waiting for input')
      .replaceAll('Moved to Resolved','Moved to Complete')
      .replaceAll('Marked resolved.','Marked complete.')
      .replaceAll('Marked as a priority item.','Marked as a team priority.')
      .replaceAll('Marked as a priority','Marked as a team priority')
      .replaceAll('Priority marker removed','Team priority removed')
      .replaceAll('Related date changed to','Project due date changed to');
  }

  function phaseAction(phase,projectId,compact=false,canArchive=false){
    const actions={
      work:{next:'review',label:compact?'Request input':'Move project to Waiting for input',style:'button-primary'},
      review:{next:'completed',label:compact?'Complete project':'Mark project complete',style:'button-primary'},
      completed:{next:'work',label:'Reopen project',style:'button-secondary'}
    };
    const config=actions[phase]||actions.work;
    return '<button type="button" class="button '+config.style+'" data-development-project-move="'+esc(projectId)+'" data-next-phase="'+config.next+'">'+esc(config.label)+'</button>'+
      (phase==='review'?'<button type="button" class="button button-secondary" data-development-project-move="'+esc(projectId)+'" data-next-phase="work">← Return to Active</button>':'')+
      (!compact&&canArchive?'<button type="button" class="button button-secondary development-project-delete-button" data-development-project-archive="'+esc(projectId)+'">Delete project</button>':'');
  }

  function renderProjectCard(project){
    const items=project.items||[],priorityItems=items.filter(item=>item.focusItem),counts=statusCounts(items),latest=(project.posts||[]).slice(-1)[0];
    return '<article class="development-project-card">'+
      '<div class="development-project-card-head"><div><span class="development-status status-'+esc(project.phase)+'">'+esc(phaseLabel(project.phase))+'</span>'+(project.companyName?'<span class="development-company">Company · '+esc(project.companyName)+'</span>':'')+'</div><span class="development-project-count">'+items.length+' work item'+(items.length===1?'':'s')+'</span></div>'+
      '<h4>'+esc(project.title)+'</h4>'+
      '<p class="development-project-preview">'+esc(project.purpose||'No shared purpose added yet.')+'</p>'+
      '<div class="development-project-meta"><span>'+priorityItems.length+' team priority item'+(priorityItems.length===1?'':'s')+'</span><span>'+((project.documents||[]).length)+' shared file'+((project.documents||[]).length===1?'':'s')+'</span>'+(counts.Blocked?'<span class="development-blocked-count">'+counts.Blocked+' blocked</span>':'')+(project.meetingDate?'<span>Project due date · '+esc(dateLabel(project.meetingDate))+'</span>':'')+'</div>'+
      (latest?'<div class="development-project-latest-post"><strong>'+esc(latest.authorName||'Teammate')+' · '+esc(new Date(latest.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}))+'</strong><p>'+esc(latest.body)+'</p></div>':'<div class="development-project-focus-empty">No discussion updates yet.</div>')+
      '<div class="development-project-card-actions"><button type="button" class="button button-secondary" data-development-project-open="'+esc(project.id)+'">Open project</button>'+phaseAction(project.phase,project.id,true)+'</div></article>';
  }

  function render(){
    const config={work:['#developmentWorkList','#developmentWorkCount'],review:['#developmentReviewList','#developmentReviewCount'],completed:['#developmentCompletedList','#developmentCompletedCount']};
    const empty={work:['No active projects yet.','Create a project for an ongoing topic, goal, or team effort.'],review:['No projects waiting for input.','Move a project here when the team needs feedback or a decision.'],completed:['No completed projects yet.','Completed projects stay here for future reference.']};
    for(const phase of Object.keys(config)){
      const rows=projects.filter(project=>project.phase===phase),[list,count]=config[phase];
      $(count).textContent=String(rows.length);
      $(list).innerHTML=rows.length?rows.map(renderProjectCard).join(''):'<div class="development-empty"><strong>'+esc(empty[phase][0])+'</strong><p>'+esc(empty[phase][1])+'</p></div>';
    }
  }

  function renderArchivedProjects(){
    const count=$('#developmentArchivedCount'),list=$('#developmentArchivedList');
    if(count)count.textContent=String(archivedProjects.length);
    if(!list)return;
    list.innerHTML=archivedProjects.length?archivedProjects.map(project=>'<article class="development-archived-card"><div><h4>'+esc(project.title)+'</h4><p>'+(project.purpose?esc(project.purpose)+' · ':'')+(project.companyName?'Company · '+esc(project.companyName)+' · ':'')+(project.itemCount||0)+' shared work item'+((project.itemCount||0)===1?'':'s')+' · '+(project.documentCount||0)+' file'+((project.documentCount||0)===1?'':'s')+'</p><small>Deleted '+esc(project.archivedAt?new Date(project.archivedAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric'}):'date unavailable')+(project.archivedByName?' by '+esc(project.archivedByName):'')+'. Project contents are saved.</small></div>'+(project.canManageMembers?'<button type="button" class="button button-secondary" data-development-project-restore="'+esc(project.id)+'">Restore project</button>':'<small>Only the project creator or an administrator can restore it.</small>')+'</article>').join(''):'<div class="development-empty"><strong>No archived projects</strong><p>Projects you delete will be kept here so they can be restored.</p></div>';
  }

  function renderProjectProgress(){
    const phaseFilter=$('#developmentProgressPhaseFilter').value,ownerFilter=$('#developmentProgressOwnerFilter').value;
    const visibleProjects=projects.filter(project=>phaseFilter==='all'||(phaseFilter==='active'?project.phase!=='completed':project.phase===phaseFilter)).map(project=>({...project,visibleItems:(project.items||[]).filter(item=>ownerFilter==='all'||item.ownerUserId===ownerFilter)})).filter(project=>ownerFilter==='all'||project.visibleItems.length>0);
    const allItems=visibleProjects.flatMap(project=>project.visibleItems),overall=progressStats(allItems),overallPercent=overall.percent;
    $('#developmentProgressSummary').innerHTML=allItems.length?'<div class="development-progress-overall"><div class="development-progress-overall-heading"><strong>Work item completion · '+overallPercent+'%</strong><span>'+visibleProjects.length+' '+(visibleProjects.length===1?'project':'projects')+' · '+progressLabel(overall)+'</span></div><div class="development-completion-track" role="progressbar" aria-label="Overall work item completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+overallPercent+'"><span style="width:'+overallPercent+'%"></span></div>'+dashboardProgressCircles(allItems,'All projects')+'</div>':'<div class="development-progress-overall development-progress-overall-empty"><strong>'+esc(projects.length?'No work items match these filters.':'No collaboration projects yet.')+'</strong><p>'+esc(projects.length?'Try another stage or owner, or add shared work to a project.':'Create a project to start sharing updates and follow-up work.')+'</p></div>';
    $('#developmentProjectProgressList').innerHTML=visibleProjects.length?visibleProjects.map(project=>{
      const items=project.visibleItems,summary=items.length?progressLabel(progressStats(items)):'No shared work yet';
      return '<article class="development-project-progress-row"><div class="development-project-progress-main"><div class="development-project-progress-row-head"><div><h4>'+esc(project.title)+'</h4><span class="development-status status-'+esc(project.phase)+'">'+esc(phaseLabel(project.phase))+'</span></div><button type="button" class="development-work-item-open" data-development-work-open="'+esc(project.id)+'">Open project</button></div><div class="development-project-progress-details"><span>'+esc(summary)+'</span></div></div></article>';
    }).join(''):'<div class="development-workload-empty">No collaboration projects match these filters.</div>';
  }

  function renderRecentUpdates(){
    const updates=projects.flatMap(project=>(project.posts||[]).map(post=>({...post,projectId:project.id,projectTitle:project.title}))).sort((left,right)=>right.createdAt.localeCompare(left.createdAt)).slice(0,12);
    $('#developmentRecentUpdates').innerHTML=updates.length?updates.map(post=>'<article class="development-recent-update"><div><strong>'+esc(post.authorName||'Teammate')+'</strong><span>'+esc(new Date(post.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'</span></div><p>'+esc(post.body)+'</p><button type="button" class="text-button" data-development-open-discussion="'+esc(post.projectId)+'">'+esc(post.projectTitle)+' · Open discussion →</button></article>').join(''):'<div class="development-empty development-empty-small"><strong>No updates yet</strong><p>Open a project to share a progress update, ask a question, or record a decision.</p></div>';
  }

  function renderWorkload(){
    const today=todayLocal(),dueFilter=$('#developmentWorkloadDueFilter').value,statusFilter=$('#developmentWorkloadStatusFilter').value;
    const membersForWorkload=members.slice().sort((left,right)=>{
      const leftIsCurrent=left.id===state.user?.id,rightIsCurrent=right.id===state.user?.id;
      return Number(rightIsCurrent)-Number(leftIsCurrent)||left.name.localeCompare(right.name);
    });
    const memberIds=new Set(membersForWorkload.map(member=>member.id));
    const datedItems=projects.filter(project=>project.phase!=='completed').flatMap(project=>(project.items||[]).filter(item=>memberIds.has(item.ownerUserId)&&item.targetDate).map(item=>({...item,projectTitle:project.title,projectId:project.id})));
    const nextWeek=new Date(today+'T12:00:00');nextWeek.setDate(nextWeek.getDate()+7);const nextWeekDate=nextWeek.toISOString().slice(0,10);
    const dueMatches=item=>dueFilter==='overdue'?item.targetDate<today:dueFilter==='today'?item.targetDate===today:dueFilter==='next7'?item.targetDate>today&&item.targetDate<=nextWeekDate:dueFilter==='later'?item.targetDate>nextWeekDate:true;
    const statusMatches=item=>statusFilter==='open'?item.status!=='Complete':item.status===statusFilter;
    const visibleItems=datedItems.filter(item=>dueMatches(item)&&statusMatches(item)).sort((left,right)=>left.targetDate.localeCompare(right.targetDate)||left.title.localeCompare(right.title));
    $('#developmentWorkloadTotal').textContent=visibleItems.length+' '+(visibleItems.length===1?'item':'items');
    if(!membersForWorkload.length){$('#developmentWorkloadGrid').innerHTML='<div class="development-workload-empty">No teammates have access to Collaboration yet.</div>';return;}
    $('#developmentWorkloadGrid').innerHTML=membersForWorkload.map(member=>{
      const memberDated=datedItems.filter(item=>item.ownerUserId===member.id&&dueMatches(item)),assigned=visibleItems.filter(item=>item.ownerUserId===member.id);
      const rows=assigned.map(item=>{
        const isOverdue=item.targetDate<today,isDueToday=item.targetDate===today;
        const dueText=isOverdue?'Overdue · '+dateLabel(item.targetDate):isDueToday?'Due today':'Due '+dateLabel(item.targetDate);
        const dueClass=isOverdue?'development-work-item-due-overdue':isDueToday?'development-work-item-due-today':'';
      return '<article class="development-work-item"><div class="development-work-item-copy"><h4>'+esc(item.title)+'</h4><p>'+esc(item.projectTitle)+'</p></div><div class="development-work-item-meta"><span class="development-work-item-status status-'+esc(item.status.toLowerCase().replaceAll(' ','-'))+'">'+esc(item.status)+'</span><time class="development-work-item-due '+dueClass+'" datetime="'+esc(item.targetDate)+'">'+esc(dueText)+'</time><button type="button" class="development-work-item-open" aria-label="Open '+esc(item.title)+' in '+esc(item.projectTitle)+'" data-development-work-open="'+esc(item.projectId)+'" data-development-work-item="'+esc(item.id)+'">↗</button></div></article>';
      }).join('');
      const emptyText=statusFilter==='Complete'?'No completed due items match these filters.':'No open due items match these filters.';
      return '<section class="development-workload-person" aria-label="'+esc(member.name)+' due items"><header><div><h4>'+esc(member.name)+'</h4><p>'+assigned.length+' shown · '+memberDated.length+' dated items</p></div><span class="development-count">'+assigned.length+'</span></header>'+statusStrip(memberDated,member.name+' due items')+'<div class="development-workload-items">'+(rows||'<div class="development-workload-empty">'+esc(emptyText)+'</div>')+'</div></section>';
    }).join('');
  }

  function renderPosts(project){
    const posts=project.posts||[],rootPosts=posts.filter(post=>!post.parentId);
    if(!rootPosts.length){$('#developmentPostList').innerHTML='<div class="development-empty development-empty-small"><strong>No discussion yet</strong><p>Share an update or question to start the conversation for this project.</p></div>';return;}
    $('#developmentPostList').innerHTML=rootPosts.map(post=>{
      const replies=posts.filter(reply=>reply.parentId===post.id);
      const replyForm=replyingToId===post.id?'<form class="development-reply-form" data-development-post-form data-parent-id="'+esc(post.id)+'"><label class="form-field">Reply<textarea name="body" rows="2" maxlength="4000" required placeholder="Write a reply..."></textarea></label><div class="form-error" role="alert"></div><div><button type="button" class="text-button" data-development-cancel-reply>Cancel</button><button type="submit" class="button button-secondary">Post reply</button></div></form>':'';
      return '<article class="development-post" data-development-post="'+esc(post.id)+'"><header><strong>'+esc(post.authorName||'Former teammate')+'</strong><time datetime="'+esc(post.createdAt)+'">'+esc(new Date(post.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))+'</time></header><p>'+esc(post.body)+'</p><button type="button" class="text-button development-reply-button" data-development-reply="'+esc(post.id)+'">Reply</button>'+replies.map(reply=>'<article class="development-post development-post-reply" data-development-post="'+esc(reply.id)+'"><header><strong>'+esc(reply.authorName||'Former teammate')+'</strong><time datetime="'+esc(reply.createdAt)+'">'+esc(new Date(reply.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))+'</time></header><p>'+esc(reply.body)+'</p></article>').join('')+replyForm+'</article>';
    }).join('');
  }

  function renderProjectDetails(project){
    const items=project.items||[],docs=project.documents||[];
    $('#developmentProjectItems').innerHTML=items.length?items.map(item=>{const checklist=Array.isArray(item.checklist)?item.checklist.filter(step=>step?.text?.trim()):[],checked=checklist.filter(step=>step.checked).length;return '<article class="development-item-row" data-development-item-row="'+esc(item.id)+'">'+
      '<div class="development-item-main"><div class="development-item-labels">'+(item.focusItem?'<span class="development-focus-tag">★ Team Priority</span>':'')+'<span class="development-status status-'+String(item.status).toLowerCase().replaceAll(' ','-')+'">'+esc(item.status)+'</span>'+(project.companyName||item.companyName?'<span class="development-company">Company · '+esc(project.companyName||item.companyName)+'</span>':'')+'</div><h4>'+esc(item.title)+'</h4>'+(checklist.length?'<div class="development-item-checklist-summary"><span>'+checked+' of '+checklist.length+' steps complete</span><div class="development-completion-track" role="progressbar" aria-label="'+esc(item.title+' checklist progress')+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(checked/checklist.length*100)+'"><span style="width:'+Math.round(checked/checklist.length*100)+'%"></span></div><ul>'+checklist.map((step,index)=>'<li class="'+(step.checked?'is-checked':'')+'"><label><input type="checkbox" data-development-check-toggle="'+esc(item.id)+'" data-checklist-index="'+index+'" '+(step.checked?'checked':'')+' aria-label="Mark '+esc(step.text)+' '+(step.checked?'incomplete':'complete')+'">'+esc(step.text)+'</label></li>').join('')+'</ul></div>':'')+'<div class="development-card-meta"><span>'+esc(item.ownerName||'Unassigned')+'</span><span>'+esc(item.targetDate?dateLabel(item.targetDate):'No target date')+'</span></div>'+(item.history?.length?'<div class="development-history">'+item.history.slice(0,2).map(entry=>'<span>'+esc(entry.actor)+' · '+esc(historyDetail(entry.detail))+'</span>').join('')+'</div>':'')+'</div><button type="button" class="button button-secondary" data-development-edit="'+esc(item.id)+'">Edit work</button></article>';}).join(''):'<div class="development-empty development-empty-small"><strong>No shared work yet</strong><p>Add a follow-up item when the team agrees on a next step.</p></div>';
    $('#developmentDocumentList').innerHTML=docs.length?docs.map(doc=>'<article class="development-document-row" data-development-document-row="'+esc(doc.id)+'"><span class="development-document-icon">▤</span><div><a href="'+esc(doc.downloadUrl)+'">'+esc(doc.originalName)+'</a><small>'+esc(doc.uploader||'Team member')+' · '+esc(new Date(doc.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))+'</small></div><div class="development-document-actions-inline">'+(doc.mimeType==='application/pdf'&&state.settings.meetingPdfPreview!==false?'<button type="button" class="button button-secondary" data-development-document-preview="'+esc(doc.id)+'">Preview</button>':'')+'<button type="button" class="text-button" data-development-document-delete="'+esc(doc.id)+'">Remove</button></div></article>').join(''):'<div class="development-document-empty">No shared files uploaded yet.</div>';
    $('#developmentDocumentUploadForm').hidden=state.settings.documentUploads===false;
    $('#developmentProjectHistory').innerHTML=project.history?.length?project.history.slice(0,12).map(entry=>'<div><span>'+esc(entry.actor)+' · '+esc(new Date(entry.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))+'</span><p>'+esc(historyDetail(entry.detail))+'</p></div>').join(''):'<p>No project changes have been recorded yet.</p>';
    renderPosts(project);
  }
  function renderProjectMemberPicker(project=null){
    const root=$('#developmentProjectMemberPicker'),creatorId=project?.createdByUserId||state.user?.id||'',creatorName=project?.createdByName||state.user?.name||'Project creator',candidateMap=new Map(members.map(member=>[member.id,member]));
    if(creatorId&&!candidateMap.has(creatorId))candidateMap.set(creatorId,{id:creatorId,name:creatorName});
    const candidates=[...candidateMap.values()].sort((left,right)=>left.id===creatorId?-1:right.id===creatorId?1:left.name.localeCompare(right.name)),selectedIds=new Set(project?.memberUserIds||[]),canManage=!project||project.canManageMembers,workOwners=new Set((project?.items||[]).map(item=>item.ownerUserId).filter(Boolean));if(creatorId)selectedIds.add(creatorId);
    root.innerHTML=candidates.length?candidates.map(member=>{const isCreator=member.id===creatorId,ownsWork=!isCreator&&workOwners.has(member.id),disabled=!canManage||isCreator||ownsWork;return '<label class="development-project-member-option"'+(ownsWork?' title="Reassign this teammate’s work before removing project access."':'')+'><input type="checkbox" data-development-project-member value="'+esc(member.id)+'" '+(selectedIds.has(member.id)?'checked ':'')+(disabled?'disabled ':'')+'aria-label="'+esc(member.name)+' has access to this project"><span>'+esc(member.name)+'</span>'+(ownsWork?'<small>Work assigned</small>':'')+'</label>';}).join(''):'<p class="development-project-member-empty">No teammates have Collaboration access yet.</p>';
    const help=$('#developmentProjectMemberHelp');help.textContent=project&&!canManage?'Only the creator or an administrator can update access.':project&&workOwners.size?'Select teammates who can access this project. Reassign work before removing its owner.':candidates.length===1?'No other teammates have Collaboration access yet. Enable them in Manage access.':'Select teammates who can access this project. The creator is always included.';
  }
  function renderProjectWorkOwners(project,selectedId=''){
    const allowedIds=new Set(project?.memberUserIds||[]),creatorId=project?.createdByUserId||'',ownerOptions=members.filter(member=>allowedIds.has(member.id));
    if(creatorId&&allowedIds.has(creatorId)&&!ownerOptions.some(member=>member.id===creatorId))ownerOptions.unshift({id:creatorId,name:project.createdByName||'Project creator'});
    $('#developmentOwner').innerHTML='<option value="">Unassigned</option>'+ownerOptions.map(member=>'<option value="'+esc(member.id)+'">'+esc(member.name)+'</option>').join('');
    $('#developmentOwner').value=allowedIds.has(selectedId)?selectedId:'';
  }
  function activateProjectTab(tab,focus=false){
    const buttons=[...document.querySelectorAll('#developmentProjectTabs [data-development-project-tab]')],hasProject=Boolean(currentProjectId),selectedTab=hasProject||tab==='details'?tab:'details';
    activeProjectTab=selectedTab;
    for(const button of buttons){const disabled=!hasProject&&button.dataset.developmentProjectTab!=='details',selected=button.dataset.developmentProjectTab===selectedTab;button.disabled=disabled;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    $('#developmentProjectDetailsPanel').hidden=selectedTab!=='details';
    $('#developmentProjectDetailsActions').hidden=selectedTab!=='details';
    $('#developmentProjectContent').hidden=!hasProject||selectedTab==='details';
    document.querySelectorAll('#developmentProjectContent [data-development-project-panel]').forEach(panel=>{panel.hidden=panel.dataset.developmentProjectPanel!==selectedTab;});
    const selectedButton=buttons.find(button=>button.dataset.developmentProjectTab===selectedTab);if(selectedButton){if(focus)selectedButton.focus();selectedButton.scrollIntoView({block:'nearest',inline:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});}
  }

  function syncProjectModal(){
    if(!currentProjectId)return;
    const project=projects.find(candidate=>candidate.id===currentProjectId);if(!project)return;
    $('#developmentProjectTitle').textContent=project.title||'Collaboration project';
    $('#developmentProjectActions').innerHTML=phaseAction(project.phase,project.id,false,project.canManageMembers);
    renderProjectMemberPicker(project);
    renderProjectDetails(project);
    activateProjectTab(activeProjectTab);
  }

  async function load(){
    if(state.view!=='systemDevelopment')return;
    for(const selector of ['#developmentWorkList','#developmentReviewList','#developmentCompletedList'])$(selector).innerHTML='<p class="people-empty">Loading projects…</p>';
    try{
      const result=await api('/api/system-development');projects=result.projects||[];archivedProjects=result.archivedProjects||[];members=result.members||[];companies=result.companies||[];
      if(currentProjectId&&!projects.some(project=>project.id===currentProjectId)){const movedToArchive=archivedProjects.some(project=>project.id===currentProjectId);closeProject();if(!document.hidden)showToast(movedToArchive?'This project was moved to Archived. Its contents are saved.':'This project is no longer available.','info');}
      $('#developmentOwner').innerHTML='<option value="">Unassigned</option>'+members.map(member=>'<option value="'+esc(member.id)+'">'+esc(member.name)+'</option>').join('');
      const projectCompany=$('#developmentProjectCompany'),selectedProjectCompany=projectCompany.value;projectCompany.innerHTML='<option value="">No company link</option>'+companies.map(company=>'<option value="'+esc(company.id)+'">'+esc(company.name)+'</option>').join('');projectCompany.value=selectedProjectCompany;
      const progressOwner=$('#developmentProgressOwnerFilter'),selectedOwner=progressOwner.value||'all';progressOwner.innerHTML='<option value="all">All owners</option>'+members.map(member=>'<option value="'+esc(member.id)+'">'+esc(member.name)+'</option>').join('');progressOwner.value=members.some(member=>member.id===selectedOwner)?selectedOwner:'all';
      renderWorkload();renderProjectProgress();renderRecentUpdates();render();renderArchivedProjects();syncProjectModal();
    }catch(error){if(error.status===404){window.applyCollaborationAccessLiveUpdate?.({hasAccess:false});return;}$('#developmentWorkloadTotal').textContent='—';$('#developmentWorkloadGrid').innerHTML='<div class="development-workload-empty">Team workload could not be loaded.</div>';$('#developmentProgressSummary').innerHTML='<div class="development-workload-empty">Project progress could not be loaded.</div>';$('#developmentProjectProgressList').innerHTML='';$('#developmentRecentUpdates').innerHTML='<div class="development-workload-empty">Recent updates could not be loaded.</div>';for(const selector of ['#developmentWorkList','#developmentReviewList','#developmentCompletedList'])$(selector).innerHTML='<div class="development-empty"><strong>Collaboration could not be loaded.</strong><p>'+esc(error.message)+'</p></div>';}
  }

  window.applyProjectAccessLiveUpdate=update=>{
    if(!update?.projectId)return;
    if(update.archived){if(state.view==='systemDevelopment')void load();return;}
    if(update.accessible===false){
      projects=projects.filter(project=>project.id!==update.projectId);archivedProjects=archivedProjects.filter(project=>project.id!==update.projectId);
      const wasOpen=currentProjectId===update.projectId;if(wasOpen){closeProject();$('#systemDevelopmentNav')?.focus({preventScroll:true});}
      if(state.view==='systemDevelopment'){render();renderProjectProgress();renderRecentUpdates();renderWorkload();if(wasOpen&&!document.hidden)showToast('Your access to this project was removed.','info');}
      return;
    }
    if(update.accessible===true&&state.view==='systemDevelopment')void load();
  };

  window.applyCollaborationAccessLiveUpdate=update=>{
    if(update?.hasAccess!==false)return;
    const hadAccess=Boolean(state.user?.canAccessSystemDevelopment);
    projects=[];archivedProjects=[];members=[];companies=[];state.user.canAccessSystemDevelopment=false;
    if(currentProjectId)closeProject();
    if(state.view==='systemDevelopment')window.switchView?.('overview');
    window.render?.();
    if(!document.hidden&&hadAccess){$('[data-view="overview"]')?.focus({preventScroll:true});showToast('Your Projects access was removed.','info');}
  };

  function renderProjectPostsPreservingDraft(project){
    const replyForm=$('#developmentPostList [data-development-post-form]'),replyTextarea=replyForm?.querySelector('textarea');
    const replyDraft=replyTextarea?.value||'',selectionStart=replyTextarea?.selectionStart,selectionEnd=replyTextarea?.selectionEnd,hadFocus=replyTextarea===document.activeElement,parentId=replyForm?.dataset.parentId,requestId=replyForm?.dataset.requestId||'';
    const modal=$('#developmentProjectBackdrop'),modalScrollTop=modal?.scrollTop||0,modalBody=$('.development-project-modal'),modalBodyScrollTop=modalBody?.scrollTop||0;
    renderPosts(project);
    if(parentId){const restored=[...document.querySelectorAll('#developmentPostList [data-parent-id]')].find(form=>form.dataset.parentId===parentId);const textarea=restored?.querySelector('textarea');if(textarea){textarea.value=replyDraft;if(requestId)restored.dataset.requestId=requestId;if(hadFocus){textarea.focus();if(Number.isInteger(selectionStart)&&Number.isInteger(selectionEnd))textarea.setSelectionRange(selectionStart,selectionEnd);}}}
    if(modal)modal.scrollTop=modalScrollTop;if(modalBody)modalBody.scrollTop=modalBodyScrollTop;
  }

  async function refreshActiveProjectDiscussion(){
    if(!currentProjectId||state.view!=='systemDevelopment'||$('#developmentProjectBackdrop').hidden)return;
    const projectId=currentProjectId,project=projects.find(item=>item.id===projectId);if(!project)return;
    const posts=project.posts||[],since=posts.reduce((latest,post)=>!latest||post.createdAt>latest?post.createdAt:latest,'');
    let response;try{response=await api('/api/system-development/projects/'+encodeURIComponent(projectId)+'/posts'+(since?'?since='+encodeURIComponent(since):''));}
    catch(error){if(error.status===404){try{await api('/api/system-development');}catch(accessError){if(accessError.status===404)window.applyCollaborationAccessLiveUpdate?.({hasAccess:false});return;}window.applyProjectAccessLiveUpdate?.({projectId,accessible:false});}return;}
    if(currentProjectId!==projectId||state.view!=='systemDevelopment'||$('#developmentProjectBackdrop').hidden)return;
    const merged=new Map((project.posts||[]).map(post=>[post.id,post]));let added=false;
    for(const post of response.posts||[]){if(!merged.has(post.id))added=true;merged.set(post.id,post);}
    if(!added)return;
    project.posts=[...merged.values()].sort((left,right)=>left.createdAt.localeCompare(right.createdAt)||left.id.localeCompare(right.id));
    const latest=project.posts.at(-1);if(latest&&(!project.updatedAt||latest.createdAt>project.updatedAt))project.updatedAt=latest.createdAt;
    render();renderRecentUpdates();renderProjectProgress();renderProjectPostsPreservingDraft(project);
  }

  window.refreshActiveProjectDiscussion=refreshActiveProjectDiscussion;
  window.applyProjectDiscussionLiveUpdate=update=>{
    if(!update?.projectId||!update?.postId||state.view!=='systemDevelopment')return;
    const project=projects.find(item=>item.id===update.projectId);if(!project)return;
    project.posts=project.posts||[];if(project.posts.some(post=>post.id===update.postId))return;
    project.posts.push({id:update.postId,projectId:update.projectId,parentId:update.parentId||null,authorUserId:update.authorUserId||null,authorName:update.authorName||'Teammate',body:update.body||'',createdAt:update.createdAt||new Date().toISOString()});
    project.updatedAt=update.createdAt||project.updatedAt;
    render();renderRecentUpdates();
    if(currentProjectId!==project.id||$('#developmentProjectBackdrop').hidden)return;
    renderProjectPostsPreservingDraft(project);
  };

  function openProject(project=null,selectedItemId=null,requestedTab=null,notification=null,selectedPostId=null,selectedDocumentId=null){
    if($('#developmentProjectBackdrop').hidden)projectFocusReturnTarget=document.activeElement;
    const targetProjectId=project?.id||null;if(developmentDocumentForm.dataset.projectId&&developmentDocumentForm.dataset.projectId!==targetProjectId)resetDevelopmentDocumentUpload();const selectedItem=selectedItemId?project?.items?.find(item=>item.id===selectedItemId):null;currentProjectId=targetProjectId;activeProjectTab=requestedTab||(selectedItem?'items':'details');replyingToId=null;const form=$('#developmentProjectForm');form.reset();form.elements.projectId.value=project?.id||'';form.elements.title.value=project?.title||'';form.elements.purpose.value=project?.purpose||'';form.elements.companyId.value=project?.companyId||'';form.elements.meetingDate.value=project?.meetingDate||'';$('#developmentUpdateForm').reset();
    let notificationContext=$('#developmentProjectNotificationContext');if(!notificationContext){notificationContext=document.createElement('div');notificationContext.id='developmentProjectNotificationContext';notificationContext.className='development-project-notification-context';$('#developmentProjectActions').insertAdjacentElement('beforebegin',notificationContext);}notificationContext.innerHTML=window.notificationContextMarkup?.(notification)||'';notificationContext.hidden=!notification;
    $('#developmentProjectTitle').textContent=project?.title||'New Project';$('#developmentProjectActions').innerHTML=project?phaseAction(project.phase,project.id,false,project.canManageMembers):'';$('#developmentProjectError').textContent='';$('#developmentUpdateError').textContent='';$('#developmentProjectBackdrop').hidden=false;renderProjectMemberPicker(project);
    activateProjectTab(activeProjectTab);
    if(project){renderProjectDetails(project);$('#developmentProjectTitle').focus({preventScroll:true});}else form.elements.title.focus();
    if(selectedItem)requestAnimationFrame(()=>{const row=[...document.querySelectorAll('[data-development-item-row]')].find(element=>element.dataset.developmentItemRow===selectedItem.id);if(row){row.scrollIntoView({block:'center',behavior:'smooth'});row.classList.add('development-item-row-highlight');setTimeout(()=>row.classList.remove('development-item-row-highlight'),1800);}});
    if(selectedPostId)requestAnimationFrame(()=>{const post=[...document.querySelectorAll('[data-development-post]')].find(element=>element.dataset.developmentPost===selectedPostId);if(post){post.scrollIntoView({block:'center',behavior:'smooth'});post.classList.add('notification-change-highlight');setTimeout(()=>post.classList.remove('notification-change-highlight'),2400);}});
    if(selectedDocumentId)requestAnimationFrame(()=>{const row=[...document.querySelectorAll('[data-development-document-row]')].find(element=>element.dataset.developmentDocumentRow===selectedDocumentId);if(row){row.scrollIntoView({block:'center',behavior:'smooth'});row.classList.add('notification-change-highlight');setTimeout(()=>row.classList.remove('notification-change-highlight'),2400);}});
  }

  function closeProject(){
    if(developmentUploadController)developmentUploadController.abort();
    closePdfPreview(false);closeItem(false);$('#developmentProjectBackdrop').hidden=true;currentProjectId=null;
    const returnTarget=projectFocusReturnTarget;projectFocusReturnTarget=null;restoreDevelopmentFocus(returnTarget);
  }

  function openItem(item=null){
    if(!currentProjectId)return;
    if($('#systemDevelopmentBackdrop').hidden)itemFocusReturnTarget=document.activeElement;
    const form=$('#systemDevelopmentForm'),project=projects.find(candidate=>candidate.id===currentProjectId);form.reset();form.elements.itemId.value=item?.id||'';form.elements.projectId.value=currentProjectId;form.elements.title.value=item?.title||'';form.elements.status.value=item?.status||'Planned';renderProjectWorkOwners(project,item?.ownerUserId||'');form.elements.targetDate.value=item?.targetDate||'';form.elements.focusItem.checked=Boolean(item?.focusItem);form.elements.focusItem.disabled=false;checklistDraft=Array.isArray(item?.checklist)?item.checklist.map(step=>({text:step.text||'',checked:Boolean(step.checked)})):[];renderChecklistEditor();
    $('#developmentFocusHelp').textContent='Bring this work forward for the team.';
    $('#developmentModalTitle').textContent=item?'Edit work item':'Add work item';$('#saveDevelopmentItem').textContent=item?'Save changes':'Save work item';$('#developmentError').textContent='';$('#systemDevelopmentBackdrop').hidden=false;
    form.elements.title.focus({preventScroll:true});
  }

  function closeItem(restoreFocus=true){
    $('#systemDevelopmentBackdrop').hidden=true;
    if(restoreFocus){const returnTarget=itemFocusReturnTarget;itemFocusReturnTarget=null;restoreDevelopmentFocus(returnTarget);}
    else itemFocusReturnTarget=null;
  }

  function renderChecklistEditor(){
    const root=$('#developmentChecklistEditor'),done=checklistDraft.filter(step=>step.checked&&step.text.trim()).length,total=checklistDraft.filter(step=>step.text.trim()).length;
    $('#developmentChecklistProgress').textContent=total?done+' of '+total+' steps complete':'No checklist steps yet';
    root.innerHTML=checklistDraft.map((step,index)=>'<div class="development-checklist-edit-row"><label><input type="checkbox" data-checklist-checked="'+index+'" '+(step.checked?'checked':'')+' aria-label="Mark checklist step '+(index+1)+' complete"></label><input type="text" maxlength="240" data-checklist-text="'+index+'" value="'+esc(step.text)+'" placeholder="Checklist step '+(index+1)+'"><button type="button" class="text-button" data-checklist-remove="'+index+'" aria-label="Remove checklist step '+(index+1)+'">Remove</button></div>').join('');
    $('#addDevelopmentChecklistItem').disabled=checklistDraft.length>=30;
    syncChecklistWorkStatus();
  }

  function syncChecklistWorkStatus(){
    const form=$('#systemDevelopmentForm'),status=form.elements.status,steps=checklistDraft.filter(step=>step.text.trim()),done=steps.filter(step=>step.checked).length,allChecked=steps.length>0&&done===steps.length;
    $('#developmentCompleteStatusOption').disabled=steps.length>0&&!allChecked;
    if(!steps.length)return;
    if(allChecked){status.value='Complete';return;}
    if(status.value==='Blocked')return;
    status.value=done?'In progress':'Planned';
  }

  async function moveProject(projectId,phase,button){
    button.disabled=true;
    try{await api('/api/system-development/projects/'+encodeURIComponent(projectId),{method:'PATCH',body:JSON.stringify({phase})});await load();showToast(phase==='review'?'Moved to Waiting for input.':phase==='completed'?'Project marked complete.':'Project reopened.');}
    catch(error){showToast(error.message,'error');button.disabled=false;}
  }

  async function archiveProject(projectId,button){
    const project=projects.find(candidate=>candidate.id===projectId);if(!project?.canManageMembers)return;
    if(!window.confirm('Delete “'+project.title+'” from the Projects page? It will move to Archived, where its shared work, discussion, and files stay saved. You or an administrator can restore it later.'))return;
    button.disabled=true;button.textContent='Deleting…';
    try{await api('/api/system-development/projects/'+encodeURIComponent(projectId)+'/archive',{method:'POST',body:'{}'});closeProject();await load();activateDevelopmentTab('archived');showToast('Project moved to Archived. Its contents are saved.');}
    catch(error){showToast(error.message,'error');button.disabled=false;button.textContent='Delete project';}
  }

  async function restoreArchivedProject(projectId,button){
    const project=archivedProjects.find(candidate=>candidate.id===projectId);if(!project?.canManageMembers)return;
    button.disabled=true;button.textContent='Restoring…';
    try{await api('/api/system-development/projects/'+encodeURIComponent(projectId)+'/restore',{method:'POST',body:'{}'});await load();activateDevelopmentTab('projects');showToast('Project restored to the Projects page.');}
    catch(error){showToast(error.message,'error');button.disabled=false;button.textContent='Restore project';}
  }

  function fileAsBase64(file,onProgress,signal){
    return new Promise((resolve,reject)=>{const reader=new FileReader(),cleanup=()=>signal?.removeEventListener('abort',abort),abort=()=>reader.abort();reader.onload=()=>{cleanup();onProgress?.(100);resolve(String(reader.result).split(',')[1]||'');};reader.onerror=()=>{cleanup();reject(new Error('The selected file could not be read.'));};reader.onabort=()=>{cleanup();reject(new Error('The file preparation was cancelled.'));};reader.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.min(100,Math.round(event.loaded/event.total*100)));};if(signal){if(signal.aborted){reject(new Error('The file preparation was cancelled.'));return;}signal.addEventListener('abort',abort,{once:true});}reader.readAsDataURL(file);});
  }

  function openPdfPreview(doc){
    pdfFocusReturnTarget=document.activeElement;$('#developmentPdfPreviewTitle').textContent=doc.originalName;$('#developmentPdfDownload').href=doc.downloadUrl;$('#developmentPdfFrame').src='/api/system-development/documents/'+encodeURIComponent(doc.id)+'/preview';$('#developmentPdfPreviewBackdrop').hidden=false;$('#developmentPdfPreviewClose').focus({preventScroll:true});
  }

  function closePdfPreview(restoreFocus=true){
    $('#developmentPdfPreviewBackdrop').hidden=true;$('#developmentPdfFrame').src='about:blank';
    if(restoreFocus){const returnTarget=pdfFocusReturnTarget;pdfFocusReturnTarget=null;restoreDevelopmentFocus(returnTarget);}
    else pdfFocusReturnTarget=null;
  }

  async function postUpdate(form,parentId=null){
    if(!currentProjectId)return;
    const projectId=currentProjectId,button=form.querySelector('[type="submit"]'),errorBox=form.querySelector('.form-error'),requestId=form.dataset.requestId||(form.dataset.requestId=newRequestId()),body={body:form.elements.body.value,parentId,requestId};button.disabled=true;if(errorBox)errorBox.textContent='';
    try{await api('/api/system-development/projects/'+encodeURIComponent(projectId)+'/posts',{method:'POST',body:JSON.stringify(body)});replyingToId=null;if(!parentId){form.reset();form.dataset.requestId='';}await load();showToast(parentId?'Reply posted.':'Update shared with the team.');}
    catch(error){if(errorBox)errorBox.textContent=!error?.status||error.status>=500?'Could not confirm this update. Check your connection and try again. Retrying will not post it twice.':error.message;}
    finally{button.disabled=false;}
  }

  window.loadSystemDevelopment=load;
  window.openSystemDevelopmentProject=async (projectId,notification=null)=>{window.switchView?.('systemDevelopment');await load();const project=projects.find(item=>item.id===projectId);if(project){const title=String(notification?.title||''),message=String(notification?.message||'').toLocaleLowerCase(),separator=message.indexOf(' · '),messageDetail=separator>=0?message.slice(separator+3):message,matchedItem=['Work item updated','Work item added'].includes(title)?project.items?.find(item=>item.title&&message.includes(item.title.toLocaleLowerCase())):null,matchedPost=notification?.postId?project.posts?.find(post=>post.id===notification.postId):['New collaboration update','New reply'].includes(title)?project.posts?.find(post=>post.body&&messageDetail&&post.body.toLocaleLowerCase().startsWith(messageDetail)):null,matchedDocument=title==='Shared file uploaded'?project.documents?.find(doc=>doc.originalName&&message.includes(doc.originalName.toLocaleLowerCase())):null,tab=matchedItem?'items':matchedPost?'updates':matchedDocument?'files':title==='Collaboration project updated'?'history':title==='Collaboration project created'?'details':'updates';openProject(project,matchedItem?.id||null,tab,notification,matchedPost?.id||notification?.postId||null,matchedDocument?.id||null);}else if(archivedProjects.some(item=>item.id===projectId)){activateDevelopmentTab('archived');showToast('This project is in Archived. Restore it to return it to the Projects page.','info');}else showToast('That collaboration project could not be found.','error');};
  $('#systemDevelopmentTabs').addEventListener('click',event=>{const tab=event.target.closest('[data-development-tab]');if(tab)activateDevelopmentTab(tab.dataset.developmentTab);});
  $('#systemDevelopmentTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('#systemDevelopmentTabs [data-development-tab]')],index=tabs.findIndex(tab=>tab.dataset.developmentTab===activeDevelopmentTab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];activateDevelopmentTab(next.dataset.developmentTab,true);});
  activateDevelopmentTab(activeDevelopmentTab);
  $('#newSystemDevelopmentProject').addEventListener('click',()=>openProject());
  $('#systemDevelopmentBoard').addEventListener('click',event=>{
    const openButton=event.target.closest('[data-development-project-open]');if(openButton){const project=projects.find(item=>item.id===openButton.dataset.developmentProjectOpen);if(project)openProject(project);return;}
    const moveButton=event.target.closest('[data-development-project-move]');if(moveButton)moveProject(moveButton.dataset.developmentProjectMove,moveButton.dataset.nextPhase,moveButton);
  });
  $('#developmentWorkloadGrid').addEventListener('click',event=>{const button=event.target.closest('[data-development-work-open]');if(!button)return;const project=projects.find(candidate=>candidate.id===button.dataset.developmentWorkOpen);if(project)openProject(project,button.dataset.developmentWorkItem||null,'items');});
  $('#developmentProjectProgressList').addEventListener('click',event=>{const button=event.target.closest('[data-development-work-open]');if(!button)return;const project=projects.find(candidate=>candidate.id===button.dataset.developmentWorkOpen);if(project)openProject(project,null,'items');});
  $('#developmentRecentUpdates').addEventListener('click',event=>{const button=event.target.closest('[data-development-open-discussion]');if(!button)return;const project=projects.find(candidate=>candidate.id===button.dataset.developmentOpenDiscussion);if(project)openProject(project,null,'updates');});
  $('#developmentWorkloadDueFilter').addEventListener('change',renderWorkload);$('#developmentWorkloadStatusFilter').addEventListener('change',renderWorkload);
  $('#developmentProgressPhaseFilter').addEventListener('change',renderProjectProgress);$('#developmentProgressOwnerFilter').addEventListener('change',renderProjectProgress);
  $('#developmentProjectActions').addEventListener('click',event=>{const archiveButton=event.target.closest('[data-development-project-archive]');if(archiveButton){archiveProject(archiveButton.dataset.developmentProjectArchive,archiveButton);return;}const button=event.target.closest('[data-development-project-move]');if(button)moveProject(button.dataset.developmentProjectMove,button.dataset.nextPhase,button);});
  $('#developmentArchivedList').addEventListener('click',event=>{const button=event.target.closest('[data-development-project-restore]');if(button)restoreArchivedProject(button.dataset.developmentProjectRestore,button);});
  $('#developmentProjectClose').addEventListener('click',closeProject);$('#developmentProjectCancel').addEventListener('click',closeProject);
  $('#developmentProjectBackdrop').addEventListener('click',event=>{if(event.target===$('#developmentProjectBackdrop'))closeProject();});
  $('#developmentProjectTabs').addEventListener('click',event=>{const button=event.target.closest('[data-development-project-tab]');if(button&&!button.disabled)activateProjectTab(button.dataset.developmentProjectTab);});
  $('#developmentProjectTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('#developmentProjectTabs [data-development-project-tab]:not(:disabled)')];if(!tabs.length)return;event.preventDefault();const index=tabs.findIndex(tab=>tab.dataset.developmentProjectTab===activeProjectTab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];activateProjectTab(next.dataset.developmentProjectTab,true);});

  $('#developmentProjectForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,projectId=form.elements.projectId.value,existing=projectId?projects.find(item=>item.id===projectId):null,body={title:form.elements.title.value,purpose:form.elements.purpose.value,companyId:form.elements.companyId.value,meetingDate:form.elements.meetingDate.value||null};if(!projectId||existing?.canManageMembers)body.memberUserIds=[...document.querySelectorAll('#developmentProjectMemberPicker [data-development-project-member]:checked')].map(input=>input.value);const button=$('#saveDevelopmentProject');button.disabled=true;$('#developmentProjectError').textContent='';
    try{const saved=await api(projectId?'/api/system-development/projects/'+encodeURIComponent(projectId):'/api/system-development/projects',{method:projectId?'PATCH':'POST',body:JSON.stringify(body)});await load();const project=projects.find(item=>item.id===saved.id)||saved;currentProjectId=saved.id;form.elements.projectId.value=saved.id;form.elements.companyId.value=project.companyId||'';form.elements.title.value=project.title||'';form.elements.purpose.value=project.purpose||'';form.elements.meetingDate.value=project.meetingDate||'';$('#developmentProjectTitle').textContent=project.title||'Collaboration project';$('#developmentProjectActions').innerHTML=phaseAction(project.phase||'work',saved.id,false,project.canManageMembers);renderProjectMemberPicker(project);renderProjectDetails(project);activeProjectTab=projectId?activeProjectTab:'updates';activateProjectTab(activeProjectTab);if(!projectId)$('#developmentUpdateForm textarea').focus({preventScroll:true});showToast(projectId?'Project details saved.':'Project created. Share an update or add follow-up work.');}
    catch(error){$('#developmentProjectError').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('#developmentUpdateForm').addEventListener('submit',event=>{event.preventDefault();postUpdate(event.currentTarget);});
  $('#developmentPostList').addEventListener('click',event=>{
    if(event.target.closest('[data-development-cancel-reply]')){replyingToId=null;const project=projects.find(candidate=>candidate.id===currentProjectId);if(project)renderPosts(project);return;}
    const button=event.target.closest('[data-development-reply]');if(button){replyingToId=button.dataset.developmentReply;const project=projects.find(candidate=>candidate.id===currentProjectId);if(project){renderPosts(project);[...document.querySelectorAll('#developmentPostList [data-parent-id]')].find(form=>form.dataset.parentId===replyingToId)?.querySelector('textarea')?.focus();}}
  });
  $('#developmentPostList').addEventListener('submit',event=>{if(!event.target.matches('[data-development-post-form]'))return;event.preventDefault();postUpdate(event.target,event.target.dataset.parentId||null);});
  $('#addDevelopmentItem').addEventListener('click',()=>openItem());
  $('#developmentProjectItems').addEventListener('click',event=>{const button=event.target.closest('[data-development-edit]');if(button){const project=projects.find(candidate=>candidate.id===currentProjectId),item=project?.items.find(candidate=>candidate.id===button.dataset.developmentEdit);if(item)openItem(item);}});
  $('#developmentProjectItems').addEventListener('change',async event=>{const checkbox=event.target.closest('[data-development-check-toggle]');if(!checkbox)return;const itemId=checkbox.dataset.developmentCheckToggle,index=Number(checkbox.dataset.checklistIndex),project=projects.find(candidate=>candidate.id===currentProjectId),item=project?.items.find(candidate=>candidate.id===itemId),checklist=Array.isArray(item?.checklist)?item.checklist.map(step=>({...step})):[];if(!item||!checklist[index])return;checkbox.disabled=true;checklist[index].checked=checkbox.checked;try{await api('/api/system-development/items/'+encodeURIComponent(itemId),{method:'PATCH',body:JSON.stringify({checklist})});await load();}catch(error){checkbox.checked=!checkbox.checked;checkbox.disabled=false;showToast(error.message,'error');}});
  $('#developmentClose').addEventListener('click',closeItem);$('#developmentCancel').addEventListener('click',closeItem);
  $('#systemDevelopmentForm').elements.status.addEventListener('change',syncChecklistWorkStatus);
  $('#systemDevelopmentBackdrop').addEventListener('click',event=>{if(event.target===$('#systemDevelopmentBackdrop'))closeItem();});
  $('#addDevelopmentChecklistItem').addEventListener('click',()=>{if(checklistDraft.length>=30)return;checklistDraft.push({text:'',checked:false});renderChecklistEditor();$('#developmentChecklistEditor input[data-checklist-text="'+(checklistDraft.length-1)+'"]').focus();});
  $('#developmentChecklistEditor').addEventListener('input',event=>{const index=Number(event.target.dataset.checklistText);if(Number.isInteger(index)&&checklistDraft[index]){checklistDraft[index].text=event.target.value;$('#developmentChecklistProgress').textContent=checklistDraft.filter(step=>step.checked&&step.text.trim()).length+' of '+checklistDraft.filter(step=>step.text.trim()).length+' steps complete';syncChecklistWorkStatus();}});
  $('#developmentChecklistEditor').addEventListener('change',event=>{const index=Number(event.target.dataset.checklistChecked);if(Number.isInteger(index)&&checklistDraft[index]){checklistDraft[index].checked=event.target.checked;renderChecklistEditor();}});
  $('#developmentChecklistEditor').addEventListener('click',event=>{const button=event.target.closest('[data-checklist-remove]');if(!button)return;checklistDraft.splice(Number(button.dataset.checklistRemove),1);renderChecklistEditor();});
  $('#systemDevelopmentForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,itemId=form.elements.itemId.value,projectId=form.elements.projectId.value,button=$('#saveDevelopmentItem'),body={title:form.elements.title.value,status:form.elements.status.value,ownerUserId:form.elements.ownerUserId.value||null,targetDate:form.elements.targetDate.value||null,checklist:checklistDraft.map(step=>({text:step.text.trim(),checked:step.checked})).filter(step=>step.text),focusItem:form.elements.focusItem.checked};button.disabled=true;$('#developmentError').textContent='';
    try{const saved=await api(itemId?'/api/system-development/items/'+encodeURIComponent(itemId):'/api/system-development/projects/'+encodeURIComponent(projectId)+'/items',{method:itemId?'PATCH':'POST',body:JSON.stringify(body)});closeItem(false);activeProjectTab='items';await load();const savedId=saved?.id||itemId,returnTarget=savedId?[...document.querySelectorAll('#developmentProjectItems [data-development-edit]')].find(button=>button.dataset.developmentEdit===savedId):null;restoreDevelopmentFocus(returnTarget||$('#addDevelopmentItem'));showToast(itemId?'Work item updated.':'Work item added to the project.');}
    catch(error){$('#developmentError').textContent=error.message;}
    finally{button.disabled=false;}
  });
  const developmentDocumentForm=$('#developmentDocumentUploadForm'),developmentDocumentInput=$('#developmentDocumentFile'),developmentDocumentUploadActions=$('#developmentDocumentUploadActions'),developmentDocumentSubmit=$('#uploadDevelopmentDocument'),developmentDocumentCancel=$('#cancelDevelopmentDocumentUpload'),developmentDocumentSelectedFile=$('#developmentDocumentSelectedFile'),developmentDocumentError=$('#developmentDocumentError'),developmentDocumentProgress=$('#developmentDocumentUploadProgress'),developmentDocumentStatus=$('#developmentDocumentUploadStatus'),developmentDocumentProgressId='developmentDocumentUploadProgress';let developmentUploadController=null;
  function syncDevelopmentDocumentSelection(clearError=false){
    const file=developmentDocumentInput.files[0],valid=Boolean(file&&file.size<=10*1024*1024);developmentDocumentSelectedFile.textContent=file?file.name:'';developmentDocumentSelectedFile.hidden=!file;developmentDocumentUploadActions.hidden=!file;developmentDocumentSubmit.disabled=!valid||developmentDocumentInput.disabled;
    if(file&&file.size>10*1024*1024)developmentDocumentError.textContent='Files must be 10 MB or smaller.';else if(clearError)developmentDocumentError.textContent='';
  }
  function resetDevelopmentDocumentUpload(){
    if(developmentUploadController)developmentUploadController.abort();
    developmentDocumentForm.reset();developmentDocumentForm.dataset.requestId='';developmentDocumentForm.dataset.projectId='';developmentDocumentInput.disabled=false;developmentDocumentSubmit.textContent='Confirm upload';developmentDocumentCancel.disabled=false;developmentDocumentCancel.textContent='Cancel';developmentDocumentError.textContent='';developmentDocumentStatus.textContent='';developmentDocumentStatus.hidden=true;updateUploadProgress(developmentDocumentProgressId,null);syncDevelopmentDocumentSelection(true);
  }
  developmentDocumentInput.addEventListener('change',()=>{developmentDocumentForm.dataset.requestId=developmentDocumentInput.files[0]?newRequestId():'';developmentDocumentForm.dataset.projectId=developmentDocumentInput.files[0]?(currentProjectId||''):'';developmentDocumentStatus.hidden=true;updateUploadProgress(developmentDocumentProgressId,null);syncDevelopmentDocumentSelection(true);});
  developmentDocumentCancel.addEventListener('click',()=>{if(developmentUploadController){developmentDocumentCancel.disabled=true;developmentDocumentCancel.textContent='Cancelling…';developmentUploadController.abort();return;}developmentDocumentForm.reset();developmentDocumentForm.dataset.requestId='';developmentDocumentForm.dataset.projectId='';developmentDocumentStatus.hidden=true;updateUploadProgress(developmentDocumentProgressId,null);syncDevelopmentDocumentSelection(true);});
  developmentDocumentForm.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,file=developmentDocumentInput.files[0],projectId=currentProjectId,button=developmentDocumentSubmit;if(!projectId){developmentDocumentError.textContent='Save the project before uploading a file.';return;}if(!file||file.size>10*1024*1024){syncDevelopmentDocumentSelection(true);return;}const controller=new AbortController(),requestId=form.dataset.requestId||(form.dataset.requestId=newRequestId());form.dataset.projectId=projectId;developmentUploadController=controller;button.disabled=true;button.textContent='Preparing file…';developmentDocumentInput.disabled=true;developmentDocumentCancel.disabled=false;developmentDocumentCancel.textContent='Cancel upload';developmentDocumentError.textContent='';developmentDocumentStatus.hidden=false;developmentDocumentStatus.textContent='Preparing file…';updateUploadProgress(developmentDocumentProgressId,0);
    try{await window.uploadProjectDocument({getProjectId:()=>currentProjectId,file,requestId,signal:controller.signal,readFile:fileAsBase64,sendRequest:apiWithUploadProgress,onReadProgress:percent=>{if(form.dataset.projectId!==projectId)return;updateUploadProgress(developmentDocumentProgressId,Math.round(percent*.2));developmentDocumentStatus.textContent='Preparing file… '+percent+'%';},onUploadProgress:percent=>{if(form.dataset.projectId!==projectId)return;updateUploadProgress(developmentDocumentProgressId,20+Math.round(percent*.8));button.textContent=percent>=100?'Finishing…':'Uploading '+percent+'%';developmentDocumentStatus.textContent=percent>=100?'Finishing upload…':'Uploading file… '+percent+'%';}});form.reset();form.dataset.requestId='';syncDevelopmentDocumentSelection(true);updateUploadProgress(developmentDocumentProgressId,100);developmentDocumentProgress.classList.add('is-complete');developmentDocumentStatus.textContent='File uploaded.';await load();showToast('Shared file uploaded.');setTimeout(()=>{if(developmentDocumentStatus.isConnected){developmentDocumentStatus.hidden=true;updateUploadProgress(developmentDocumentProgressId,null);}},2400);}
    catch(error){if(form.dataset.projectId===projectId){if(controller.signal.aborted){developmentDocumentError.textContent='';developmentDocumentStatus.textContent='Upload cancelled. Your selected file is ready to retry.';}else{developmentDocumentError.textContent=error.message;developmentDocumentStatus.textContent='Upload interrupted. Retry is safe; the same upload will not be added twice.';}updateUploadProgress(developmentDocumentProgressId,null);}}
    finally{if(developmentUploadController===controller)developmentUploadController=null;if(form.dataset.projectId===projectId){developmentDocumentInput.disabled=false;button.textContent='Confirm upload';developmentDocumentCancel.disabled=false;developmentDocumentCancel.textContent='Cancel';if(!developmentDocumentInput.files[0])form.dataset.projectId='';syncDevelopmentDocumentSelection();}}
  });
  $('#developmentDocumentList').addEventListener('click',async event=>{
    const previewButton=event.target.closest('[data-development-document-preview]');if(previewButton){const project=projects.find(candidate=>candidate.id===currentProjectId),doc=project?.documents.find(candidate=>candidate.id===previewButton.dataset.developmentDocumentPreview);if(doc)openPdfPreview(doc);return;}
    const button=event.target.closest('[data-development-document-delete]');if(!button)return;const docId=button.dataset.developmentDocumentDelete;if(!confirm('Remove this shared file?'))return;button.disabled=true;
    try{await api('/api/system-development/documents/'+encodeURIComponent(docId),{method:'DELETE'});await load();showToast('Shared file removed.');}
    catch(error){showToast(error.message,'error');button.disabled=false;}
  });
  $('#developmentPdfPreviewClose').addEventListener('click',closePdfPreview);
  $('#developmentPdfPreviewBackdrop').addEventListener('click',event=>{if(event.target===$('#developmentPdfPreviewBackdrop'))closePdfPreview();});
})();

(function () {
  const SIGNATURE_ID = 'aspect-property';
  const calendarPortalView=$('#calendarView'),calendarOriginalParent=calendarPortalView?.parentNode,calendarOriginalNext=calendarPortalView?.nextSibling;
  window.setCompanyPortalLayout=function(enabled){if(!calendarPortalView||!calendarOriginalParent)return;if(enabled)$('#companyModuleTabs').insertAdjacentElement('afterend',calendarPortalView);else calendarOriginalParent.insertBefore(calendarPortalView,calendarOriginalNext);};
  let intakeNotificationFocus = null;
  let centralIntakeDetailId = null;
  state.people = [];
  state.peopleQuery = '';
  state.peopleCompanyFilter = '';
  let dashboardWeekOffset = 0;
  let dashboardWeekCompanyId = '';

  function companyDepthLocal(company) {
    let depth = 0, parentId = company.parentId;
    while (parentId) {
      const parent = state.companies.find(item => item.id === parentId);
      if (!parent) break;
      depth += 1;
      parentId = parent.parentId;
      if (depth > 10) break;
    }
    return depth;
  }

  function companyScopeIds(person) {
    return person?.companyIds || person?.memberships?.map(item => item.id) || (person?.companyId ? [person.companyId] : []);
  }

  function canManageCompanyLocal(companyId) {
    return state.user?.role === 'admin';
  }
  function canUseCompanyLocal(companyId) {
    return state.user?.role==='admin'||Boolean(state.user?.memberships?.some(item=>item.id===companyId&&item.active));
  }
  function canEditSignatureDesignInquiryLocal(record) {
    return record?.companyId === SIGNATURE_ID && record.origin?.sourceSystem === 'signature-exteriors-design' && canUseCompanyLocal(SIGNATURE_ID);
  }

  function companyOptions(selectedIds = []) {
    const selected = new Set(selectedIds);
    return state.companies.map(company => {
      const prefix = companyDepthLocal(company) ? `${'— '.repeat(companyDepthLocal(company))}` : '';
      return `<label class="company-access-option"><input type="checkbox" name="companyIds" value="${escapeHtml(company.id)}" ${selected.has(company.id) ? 'checked' : ''}><span>${prefix}${escapeHtml(company.name)}</span></label>`;
    }).join('');
  }

  function companyMembershipOptions(person) {
    const existing = new Map((person.companyMemberships || []).map(item => [item.companyId, item]));
    return state.companies.map(company => {
      const membership = existing.get(company.id);
      const prefix = companyDepthLocal(company) ? `${'— '.repeat(companyDepthLocal(company))}` : '';
      return `<label class="company-access-option company-membership-option" data-membership-option><input type="checkbox" value="${escapeHtml(company.id)}" ${membership?.active ? 'checked' : ''}><span>${prefix}${escapeHtml(company.name)}</span><small>Member</small></label>`;
    }).join('');
  }

  function syncCompanyScope(form) {
    const isAdmin = form.elements.role?.value === 'admin';
    form.querySelectorAll('[name="companyIds"]').forEach(input => { input.disabled = isAdmin; });
    form.querySelectorAll('[data-membership-option]').forEach(row => row.querySelectorAll('input,select').forEach(input => { input.disabled = isAdmin; }));
    const note = form.querySelector('[data-company-scope-note]');
    if (note) note.textContent = isAdmin
      ? 'Platform administrators can enter every company portal.'
      : 'Select one or more direct company memberships. No child or sibling access is added automatically.';
  }

  window.populateParentSelects = function () {
    const options = state.companies.map(company => `<option value="${escapeHtml(company.id)}">${'· '.repeat(companyDepthLocal(company))}${escapeHtml(company.name)}</option>`).join('');
    const parent = $('#parentCompany');
    if (parent) parent.innerHTML = options;
    const scopes = $('#userCompanies');
    if (scopes) scopes.innerHTML = companyOptions();
    const userForm = $('#userForm');
    if (userForm) syncCompanyScope(userForm);
  };

  window.renderUsers = function (users = state.portalUsers || [], editingId = state.editingUserId) {
    state.portalUsers = users;
    $('#userList').innerHTML = users.map(person => {
      const editing = person.id === editingId;
      const scopeSummary = person.role === 'admin' ? 'All companies' : (person.companies || 'No company scope');
      const accountRole=person.role;
      return `<div class="managed-user ${person.active ? '' : 'is-inactive'}"><div class="user-row"><span class="mini-avatar">${escapeHtml(initials(person.name))}</span><span class="user-info"><strong>${escapeHtml(person.name)} ${person.id === state.user.id ? '<em>You</em>' : ''}</strong><small>${escapeHtml(person.email)} · ${escapeHtml(scopeSummary)}</small></span><span class="role-chip">${escapeHtml(person.role==='admin'?'Platform administrator':'Member')}</span><span class="account-state ${person.active ? '' : 'inactive'}">${person.active ? 'Active' : 'Inactive'}</span></div><div class="user-actions"><button type="button" data-user-action="edit" data-user-id="${escapeHtml(person.id)}" ${person.id === state.user.id ? 'disabled title="Another administrator must edit your account"' : ''}>${editing ? 'Close' : 'Edit access'}</button><button type="button" data-user-action="reset" data-user-id="${escapeHtml(person.id)}" ${!person.active || person.id === state.user.id ? 'disabled' : ''}>Reset password</button><button type="button" class="${person.active ? 'deactivate-action' : 'activate-action'}" data-user-action="toggle" data-user-id="${escapeHtml(person.id)}" ${person.id === state.user.id ? 'disabled' : ''}>${person.active ? 'Deactivate' : 'Reactivate'}</button></div>${editing ? `<form class="user-editor" data-edit-user="${escapeHtml(person.id)}"><label class="form-field">Platform role<select name="role"><option value="member" ${accountRole!=='admin'?'selected':''}>Member · selected companies below</option><option value="admin" ${accountRole === 'admin' ? 'selected' : ''}>Platform administrator · all companies</option></select></label><div class="form-field"><span>Direct company memberships</span><div class="company-access-picker compact">${companyMembershipOptions(person)}</div><small data-company-scope-note>Select each company this member can enter. Parent and child access does not carry over.</small></div><div class="user-editor-actions"><button type="button" class="button button-secondary" data-user-action="edit" data-user-id="${escapeHtml(person.id)}">Cancel</button><button type="submit" class="button button-primary">Save access</button></div></form>` : ''}</div>`;
    }).join('');
    $('#userList').querySelectorAll('[data-edit-user]').forEach(syncCompanyScope);
    $('#userList').querySelectorAll('.managed-user').forEach((row,index)=>{const person=users[index],status=row.querySelector('.account-state'),info=row.querySelector('.user-info small');if(person?.jobTitle&&info)info.textContent=`${person.jobTitle} · ${info.textContent}`;if(person?.active&&person.mustChangePassword&&status){status.textContent='Setup pending';status.classList.add('pending');}});
  };

  function formPayload(form) {
    const data = new FormData(form), payload = Object.fromEntries(data.entries());
    const membershipRows = [...form.querySelectorAll('[data-membership-option]')];
    if (membershipRows.length) {
      if (data.get('role') === 'admin') delete payload.companyMemberships;
      else payload.companyMemberships = membershipRows.filter(row => row.querySelector('input[type="checkbox"]').checked).map(row => ({ companyId: row.querySelector('input[type="checkbox"]').value, role: 'member' }));
    }
    if (form.querySelector('[name="companyIds"]')) {
      if (data.get('role') === 'admin') delete payload.companyIds;
      else payload.companyIds = data.getAll('companyIds');
    }
    return payload;
  }

  document.addEventListener('change', event => {
    if (event.target.matches('form#userForm select[name="role"], form.user-editor select[name="role"]')) syncCompanyScope(event.target.form);
  });

  $('#userForm').addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.currentTarget;
    setError('#userError', '');
    $('#temporaryCredential').hidden = true;
    const button = $('#createUser');
    button.disabled = true;
    try {
      const account = await api('/api/users', { method: 'POST', body: JSON.stringify(formPayload(form)) });
      $('#temporaryCredential').innerHTML = `<strong>Copy this temporary password now</strong><code>${escapeHtml(account.temporaryPassword)}</code><small>It is shown once. Share it with ${escapeHtml(account.name)} using a secure method; they must change it at first sign-in.</small>`;
      $('#temporaryCredential').hidden = false;
      form.reset();
      syncCompanyScope(form);
      window.renderUsers(await api('/api/users'));
      await window.refreshActivity();
    } catch (error) {
      setError('#userError', error.message);
    } finally {
      button.disabled = false;
    }
  }, true);

  window.renderSystemDevelopmentAccess = function (accounts = []) {
    const list = $('#systemDevelopmentAccessList');
    if (!list) return;
    if (!accounts.length) { list.innerHTML = '<p class="people-empty">No accounts found.</p>'; return; }
    list.className = 'system-development-access-list';
    list.innerHTML = accounts.map(account => `<div class="system-development-access-row"><span><strong>${escapeHtml(account.name)}${account.active ? '' : ' · inactive'}</strong><small>${escapeHtml(account.email)}</small></span><button type="button" data-system-development-user="${escapeHtml(account.id)}" data-access="${account.hasAccess}" ${!account.active && !account.hasAccess ? 'disabled' : ''}>${account.hasAccess ? 'Remove access' : 'Grant access'}</button></div>`).join('');
  };

  $('#systemDevelopmentAccessList')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-system-development-user]');
    if (!button) return;
    const targetId = button.dataset.systemDevelopmentUser, access = button.dataset.access !== 'true';
    button.disabled = true; setError('#systemDevelopmentAccessError', '');
    try {
      const result = await api(`/api/admin/system-development-members/${encodeURIComponent(targetId)}`, { method: 'PATCH', body: JSON.stringify({ access }) });
      if (targetId === state.user?.id) {
        state.user.canAccessSystemDevelopment = result.hasAccess;
        if (result.hasAccess) window.syncWorkspaceView?.();
        else window.applyCollaborationAccessLiveUpdate?.({ hasAccess: false });
      }
      window.renderSystemDevelopmentAccess(await api('/api/admin/system-development-members'));
      await window.refreshActivity();
    } catch (error) {
      setError('#systemDevelopmentAccessError', error.message);
      button.disabled = false;
    }
  });

  $('#userList').addEventListener('submit', async event => {
    if (!event.target.matches('[data-edit-user]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setError('#userError', '');
    const targetId = event.target.dataset.editUser, button = event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api(`/api/users/${encodeURIComponent(targetId)}`, { method: 'PATCH', body: JSON.stringify(formPayload(event.target)) });
      state.editingUserId = null;
      if (targetId === state.user.id) {
        const result = await api('/api/auth/me');
        state.user = result.user;
        updateProfile();
        await loadWorkspace();
        if (state.user.role !== 'admin') closeAccess();
      }
      if (!$('#accessBackdrop').hidden) window.renderUsers(await api('/api/users'));
      await window.refreshActivity();
      showToast('Account access updated.');
    } catch (error) {
      setError('#userError', error.message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }, true);

  function renderProfileReadiness() {
    const panel = $('#profileReadiness');
    if (!panel) return;
    panel.hidden = state.user?.role === 'member';
    if (panel.hidden) return;
    const pending = state.companies.filter(company => !company.profileConfirmed);
    const count = $('#profileReadinessCount');
    count.textContent = pending.length ? `${pending.length} to review` : 'All confirmed';
    count.classList.toggle('is-complete', pending.length === 0);
    $('#profileReviewList').innerHTML = pending.length
      ? pending.map(company => `<button type="button" class="profile-review-item" data-review-company="${escapeHtml(company.id)}"><span class="profile-review-icon">!</span><span><strong>${escapeHtml(company.name)}</strong><small>Legal name, location, owner, and team size need confirmation</small></span><span class="profile-review-arrow">Review →</span></button>`).join('')
      : '<p class="profile-review-complete">Company profiles have been reviewed. You can update them at any time from Companies.</p>';
  }

  $('#profileReviewList').addEventListener('click', async event => {
    const button = event.target.closest('[data-review-company]');
    if (!button) return;
    await openCompanyDetail(button.dataset.reviewCompany);
    if (state.detailCompany && canManageCompanyLocal(state.detailCompany.id)) renderCompanyDetail(state.detailCompany, true);
  });

  const companyDetailObserver = new MutationObserver(() => {
    const company = state.detailCompany, body = $('#companyDetailBody');
    if (!company || !body) return;
    const form = body.querySelector('#companyEditForm');
    if (form && !form.querySelector('.profile-confirm-field')) {
      const field = document.createElement('label');
      field.className = 'profile-confirm-field full-field';
      field.innerHTML = `<input type="hidden" name="profileConfirmed" value="false"><input type="checkbox" name="profileConfirmed" value="true" ${company.profileConfirmed ? 'checked' : ''}><span><strong>I reviewed and confirm these company details</strong><small>Check this after verifying the legal name, location, owner, and team size.</small></span>`;
      form.querySelector('.form-grid')?.append(field);
    }
    const summary = body.querySelector('.detail-summary');
    if (summary && !body.querySelector('.profile-review-status')) {
      const status = document.createElement('div');
      status.className = `profile-review-status ${company.profileConfirmed ? 'confirmed' : ''}`;
      status.textContent = company.profileConfirmed ? 'Profile details confirmed' : 'Profile details need review';
      summary.prepend(status);
    }
  });
  companyDetailObserver.observe($('#companyDetailBody'), { childList: true, subtree: true });
  $('#companyDetailBody').addEventListener('input', event => {
    if (!event.target.matches('#companyEditForm [name="name"], #companyEditForm [name="legalName"], #companyEditForm [name="industry"], #companyEditForm [name="location"], #companyEditForm [name="owner"], #companyEditForm [name="employees"]')) return;
    const confirmation = event.target.form?.querySelector('.profile-confirm-field input[type="checkbox"]');
    if (confirmation) confirmation.checked = false;
  });

  function moneyLabel(cents) {
    return cents === null || cents === undefined ? 'Not entered' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
  }

  function dateLabelLong(value) {
    return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';
  }

  const COMPANY_MODULES = [
    ['overview', 'Dashboard', 'layout-dashboard'], ['tasks', 'Current work tasks', 'list-checks'], ['clients', 'Clients', 'users'], ['intake', 'Reception', 'inbox'], ['calendar', 'Calendar', 'calendar-days'], ['activity', 'Activity', 'activity'], ['users', 'User Management', 'users']
  ];
  let activeMarketingSection = 'overview';

  function companyModulesForCurrentUser() {
    const settingByModule={tasks:'workspaceTasks',clients:'workspaceClients',intake:'workspaceReception',calendar:'workspaceCalendar',activity:'workspaceActivity'};
    return COMPANY_MODULES.filter(([id])=>id!=='activity'||state.user?.role==='admin'&&!state.portalCompany?.parentId).filter(([id])=>id!=='users'||state.user?.role==='admin').filter(([id])=>!settingByModule[id]||state.settings[settingByModule[id]]!==false);
  }

  function iconMarkup(name, className = 'nav-icon nav-icon-svg') {
    return window.aspectIcon(name, className);
  }

  function currentWorkspaceCompany() {
    return state.companies.find(company => company.id === state.activeCompanyWorkspaceId) || null;
  }

  function updatePrimaryNavIndicator(navigation) {
    const activeLink = navigation.querySelector('.nav-link.active');
    navigation.style.setProperty('--nav-indicator-offset', `${activeLink?.offsetTop || 0}px`);
  }

  function renderCompanyWorkspaceShell() {
    const company = currentWorkspaceCompany();
    const select = $('#companyWorkspaceSelect');
    if (!company || !select) return null;
    $('#pageTitle').textContent = company.name;
    $('#breadcrumbCurrent').textContent = company.name;
    $('#pageSubtitle').textContent = state.activeCompanyWorkspaceTab === 'overview' ? 'Today at a glance' : 'Company workspace';
    if (typeof window.renderOrg === 'function') window.renderOrg();
    select.innerHTML = state.companies.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    select.value = company.id;
    const statusClass = company.status === 'In setup' ? 'setup' : company.status === 'Inactive' ? 'inactive' : '';
    const parentName = state.companies.find(item => item.id === company.parentId)?.name || 'Organization root';
    $('#companyWorkspaceHero').innerHTML = `<div class="company-workspace-identity">${companyAvatarMarkup(company)}<div><span class="eyebrow">COMPANY WORKSPACE</span><h2>${escapeHtml(company.name)}</h2><p>${escapeHtml(company.description || `${company.industry} · ${company.location}`)}</p></div></div><div class="company-workspace-badges"><span class="status-pill ${statusClass}">${escapeHtml(company.status)}</span><span>${escapeHtml(company.type)}</span><span>Part of ${escapeHtml(parentName)}</span></div>`;
    const dueFollowUps = state.companyIntakes.filter(item => item.companyId === company.id && ['due', 'overdue'].includes(intakeDueState(item))).length;
    const tabMarkup = ([id, label, icon], sidebar = false) => {const visibleLabel=id==='intake'&&['aspect-ventures','aspect-property'].includes(company.id)?'Reception':label;return `<button type="button" ${sidebar ? `class="nav-link ${state.activeCompanyWorkspaceTab === id ? 'active' : ''}" role="tab"` : 'role="tab"'} id="${sidebar ? 'companyPortalTab' : 'companyTab'}-${id}" aria-selected="${state.activeCompanyWorkspaceTab === id}" aria-controls="companyWorkspacePanel" data-company-tab="${id}"${sidebar ? ` title="${visibleLabel}"` : ''}>${iconMarkup(icon)}<span class="nav-label">${visibleLabel}</span>${sidebar && id === 'intake' && dueFollowUps ? `<span class="nav-count">${dueFollowUps > 99 ? '99+' : String(dueFollowUps).padStart(2, '0')}</span>` : ''}</button>`;};
    const visibleModules = companyModulesForCurrentUser();
    $('#companyModuleTabs').innerHTML = visibleModules.map(module => tabMarkup(module)).join('');
    const companyPortalNavigation = $('#companyPortalNavigation');
    companyPortalNavigation.innerHTML = visibleModules.map(module => tabMarkup(module, true)).join('');
    updatePrimaryNavIndicator(companyPortalNavigation);
    return company;
  }

  function companyTasks(company) {
    return state.tasks.filter(task => task.companyId === company.id);
  }

  function renderCompanyOverview(company) {
    const counts = state.companyDashboard?.counts || {}, recent = state.companyDashboard?.recentActivity || [];
    const modules = new Set(companyModulesForCurrentUser().map(([id]) => id));
    const firstName = String(state.user?.name || 'team').trim().split(/\s+/)[0];
    if (dashboardWeekCompanyId !== company.id) { dashboardWeekCompanyId = company.id; dashboardWeekOffset = 0; }
    const timeZone = company.timeZone || state.user?.timeZone || 'America/New_York';
    const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    const localHour = Number(todayParts.hour);
    const greeting = localHour < 12 ? 'Good morning' : localHour < 18 ? 'Good afternoon' : 'Good evening';
    const companyDate = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
    const dateFromIso = iso => new Date(`${iso}T12:00:00.000Z`);
    const shiftIsoDate = (iso, days) => { const value = dateFromIso(iso); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
    const dateIsoInZone = (value, zone = timeZone) => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    };
    const todayUtc = dateFromIso(today), daysFromMonday = (todayUtc.getUTCDay() + 6) % 7;
    const weekStart = shiftIsoDate(today, -daysFromMonday + dashboardWeekOffset * 7);
    const weekEnd = shiftIsoDate(weekStart, 6);
    const monthDay = iso => dateFromIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const weekRange = dateFromIso(weekStart).getUTCFullYear() === dateFromIso(weekEnd).getUTCFullYear()
      ? `${monthDay(weekStart)} – ${monthDay(weekEnd)}, ${dateFromIso(weekEnd).getUTCFullYear()}`
      : `${dateFromIso(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} – ${dateFromIso(weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
    const metric = (label, value, note, icon, tab, dueOnly = false) => {
      const content = `<span class="foundation-dashboard-metric-icon">${iconMarkup(icon, 'ui-icon')}</span><span class="foundation-dashboard-metric-copy"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></span>${tab ? '<b aria-hidden="true">→</b>' : ''}`;
      return tab ? `<button type="button" class="foundation-dashboard-metric" data-company-tab-link="${tab}" ${dueOnly ? 'data-intake-dashboard-due' : ''}>${content}</button>` : `<article class="foundation-dashboard-metric">${content}</article>`;
    };
    const metrics = [];
    if (modules.has('intake')) {
      metrics.push(metric('Open inquiries', counts.openIntakes ?? 0, `${counts.intakes ?? 0} total recorded`, 'inbox', 'intake'));
      metrics.push(metric('Follow-ups due', counts.followupsDue ?? 0, 'Due today or overdue', 'list-checks', 'intake', true));
    }
    if (modules.has('calendar')) metrics.push(metric('Upcoming events', counts.upcomingEvents ?? 0, 'Next 7 days', 'calendar-days', 'calendar'));
    metrics.push(metric('Teammates', counts.teamMembers ?? 0, 'With company access', 'users', state.user?.role === 'admin' && modules.has('users') ? 'users' : ''));

    const activities = recent.length ? recent.slice(0, 3).map(item => `<article class="foundation-dashboard-activity-row"><span class="foundation-dashboard-activity-icon ${escapeHtml(item.kind)}">${window.activityIconMarkup(item.kind)}</span><span class="foundation-dashboard-activity-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><time>${escapeHtml(dateLabel(item.time))}</time></article>`).join('') : '<p class="foundation-dashboard-empty">Company updates will appear here as activity is recorded.</p>';
    const canViewActivity = state.user?.role === 'admin' && state.settings.workspaceActivity !== false;
    const activityPanel = canViewActivity ? `<section class="foundation-dashboard-module foundation-dashboard-activity" aria-labelledby="companyDashboardActivity"><header class="foundation-dashboard-module-heading"><span class="foundation-dashboard-module-icon">${iconMarkup('clock-3', 'ui-icon')}</span><span><h4 id="companyDashboardActivity">Recent activity</h4><p>A snapshot of recent updates from your company.</p></span><button type="button" class="foundation-dashboard-view-link" data-dashboard-activity>View all activity <span aria-hidden="true">→</span></button></header><div class="foundation-dashboard-activity-list">${activities}</div></section>` : '';

    const events = (state.calendarEvents || []).filter(item => {
      if (item.companyId !== company.id || item.status === 'canceled') return false;
      const eventDate = item.allDay ? item.startDate || item.startsAt?.slice(0, 10) : dateIsoInZone(item.startsAt, item.timeZone || timeZone);
      return eventDate >= weekStart && eventDate <= weekEnd;
    }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 5);
    const eventRows = events.length ? events.map((item, index) => {
      const eventDate = item.allDay ? item.startDate || item.startsAt.slice(0, 10) : dateIsoInZone(item.startsAt, item.timeZone || timeZone);
      const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).formatToParts(dateFromIso(eventDate)).map(part => [part.type, part.value]));
      const eventStart = item.allDay ? 'All day' : formatAtTimeZone(item.startsAt, { hour: 'numeric', minute: '2-digit' });
      const eventEnd = !item.allDay && item.endsAt && item.startsAt !== item.endsAt ? ` – ${formatAtTimeZone(item.endsAt, { hour: 'numeric', minute: '2-digit' })}` : '';
      return `<button type="button" class="foundation-dashboard-event-row" data-company-tab-link="calendar"><span class="foundation-dashboard-event-date"><strong>${escapeHtml(dateParts.weekday)}</strong><small>${escapeHtml(`${dateParts.month} ${dateParts.day}`)}</small></span><i class="foundation-dashboard-event-dot ${index % 2 ? 'blue' : 'gold'}" aria-hidden="true"></i><span class="foundation-dashboard-event-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.clientName || item.location || item.description || 'Company calendar event')}</small></span><span class="foundation-dashboard-event-time">${escapeHtml(eventStart + eventEnd)}</span></button>`;
    }).join('') : `<div class="foundation-dashboard-empty-wrap"><p class="foundation-dashboard-empty">No events are scheduled for this week.</p>${modules.has('calendar') ? '<button type="button" class="foundation-dashboard-text-link" data-company-tab-link="calendar">Open calendar →</button>' : ''}</div>`;
    const weekTitle = dashboardWeekOffset === 0 ? 'This week’s agenda' : 'Week’s agenda';
    const calendarPanel = modules.has('calendar') ? `<section class="foundation-dashboard-module foundation-dashboard-agenda" aria-labelledby="companyDashboardAgenda"><header class="foundation-dashboard-module-heading"><span class="foundation-dashboard-module-icon">${iconMarkup('calendar-days', 'ui-icon')}</span><span><h4 id="companyDashboardAgenda">${weekTitle}</h4><p>Your upcoming events and key dates.</p></span><span class="foundation-dashboard-week-controls"><button type="button" aria-label="Previous week" data-dashboard-week="-1">${iconMarkup('chevron-left')}</button><span aria-live="polite">${escapeHtml(weekRange)}</span><button type="button" aria-label="Next week" data-dashboard-week="1">${iconMarkup('chevron-right')}</button></span></header><div class="foundation-dashboard-event-list">${eventRows}</div></section>` : '';

    const priorityRank = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
    const tasks = companyTasks(company).filter(item => !['Completed', 'Cancelled', 'Declined'].includes(item.status)).sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4) || String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 5);
    const canUpdateTasks = canManageCompanyLocal(company.id);
    const taskRows = tasks.length ? tasks.map(item => {
      const overdue = Boolean(item.dueDate && item.dueDate < today);
      return `<article class="foundation-dashboard-task-row"><label class="foundation-dashboard-task-check-wrap"><input type="checkbox" data-dashboard-task-complete="${escapeHtml(item.id)}" aria-label="Mark ${escapeHtml(item.title)} complete" ${canUpdateTasks ? '' : 'disabled'}></label><button type="button" class="foundation-dashboard-task-title" data-workspace-task="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong></button><span class="foundation-dashboard-task-owner"><i>${escapeHtml(initials(item.assigneeName || 'Unassigned'))}</i><span>${escapeHtml(item.assigneeName || 'Unassigned')}</span></span><span class="foundation-dashboard-task-due ${overdue ? 'is-overdue' : ''}">${overdue ? 'Overdue · ' : ''}${escapeHtml(item.dueDate ? formatTaskDate(item.dueDate) : 'No due date')}</span><span class="foundation-dashboard-task-status task-status status-${String(item.status || 'Open').toLowerCase().replaceAll(' ', '-')}">${escapeHtml(item.status || 'Open')}</span></article>`;
    }).join('') : '<p class="foundation-dashboard-empty">No open tasks for this company right now.</p>';
    const taskPanel = modules.has('tasks') ? `<section class="foundation-dashboard-module foundation-dashboard-priorities" aria-labelledby="companyDashboardPriorities"><header class="foundation-dashboard-module-heading"><span class="foundation-dashboard-module-icon">${iconMarkup('list-checks', 'ui-icon')}</span><span><h4 id="companyDashboardPriorities">Today’s priorities</h4><p>Key tasks and follow-ups for your team.</p></span>${canUpdateTasks ? '<button type="button" class="foundation-dashboard-add-task" data-dashboard-add-task><span aria-hidden="true">＋</span> Add task</button>' : ''}</header><div class="foundation-dashboard-task-table"><div class="foundation-dashboard-task-header"><span aria-hidden="true"></span><span>Task</span><span>Owner</span><span>Due</span><span>Status</span></div><div class="foundation-dashboard-task-list">${taskRows}</div></div></section>` : '';

    const mainPanelCount = Number(Boolean(taskPanel)) + Number(Boolean(calendarPanel));
    return `<div class="foundation-dashboard"><header class="foundation-dashboard-welcome"><div><h2>${greeting}, ${escapeHtml(firstName)}.</h2><p>Here’s what’s happening with your company today.</p></div><div class="foundation-dashboard-date"><strong>${escapeHtml(companyDate)}</strong><span>Have a productive day.</span></div></header><section class="foundation-dashboard-metrics" aria-label="Company overview">${metrics.join('')}</section><div class="foundation-dashboard-work ${mainPanelCount === 1 ? 'is-single-panel' : ''}">${taskPanel}${calendarPanel}</div>${activityPanel}</div>`;
  }
  async function completeDashboardTask(taskId, checkbox) {
    const task = state.tasks.find(item => item.id === taskId && item.companyId === state.activeCompanyWorkspaceId);
    if (!task || !canManageCompanyLocal(task.companyId) || task.status === 'Completed') { checkbox.checked = false; return; }
    checkbox.disabled = true;
    try {
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'Completed', expectedUpdatedAt: task.updatedAt }) });
      await window.refreshWorkItems?.();
      await window.refreshActivity?.();
      showToast('Task completed.');
    } catch (error) {
      checkbox.checked = false;
      checkbox.disabled = false;
      showToast(error.message || 'Task could not be completed.', 'error');
    }
  }

  function renderCompanyActivity(company){const activities=state.companyActivities||[];return `<div class="company-module-heading"><div><span class="eyebrow">${escapeHtml(company.name)}</span><h3>Activity log</h3><p>Updates recorded for this company workspace.</p></div></div>${activities.length?`<div class="activity-list activity-history-list">${activities.map(item=>`<div class="activity-item"><span class="activity-icon ${escapeHtml(item.kind)}">${window.activityIconMarkup(item.kind)}</span><div class="activity-copy"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><div class="activity-time">${escapeHtml(new Date(item.time).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))}</div></div></div>`).join('')}</div>`:'<p class="company-workspace-empty">No activity has been recorded for this company yet.</p>'}`;}

  function renderCompanyWorkspaceUsers(company) {
    if (state.user?.role !== 'admin') return '<p class="company-workspace-empty">This section is available to platform administrators.</p>';
    const canManage=canManageCompanyLocal(company.id),users=state.companyUsers||[];
    const rows=users.length?users.map(person=>{
      const inactiveNotice=canManage&&!person.isPlatformAdmin&&!person.accountActive?'<span class="foundation-user-role">Account inactive · contact platform administrator</span>':'';
      const membershipLabel='Member';
      const actions=canManage&&!person.isPlatformAdmin&&person.accountActive?`<span class="foundation-user-actions"><button type="button" class="danger" data-company-user-action="toggle" data-company-user-id="${escapeHtml(person.id)}" ${person.id===state.user?.id?'disabled title="You cannot remove your own company access."':''}>${person.active?'Remove access':'Restore access'}</button></span>`:inactiveNotice;
      return `<article class="foundation-user-row"><span class="foundation-user-identity"><span class="mini-avatar">${escapeHtml(initials(person.name))}</span><span><strong>${escapeHtml(person.name)}${person.id===state.user?.id?' · You':''}</strong><small>${escapeHtml(person.email||'Company team member')}${person.mustChangePassword?' · Password update required':''}</small></span></span><span class="foundation-user-role">${membershipLabel}</span>${actions}</article>`;
    }).join(''):'<p class="foundation-notice">No company members are listed yet. A platform administrator can add the first member.</p>';
    const credential=state.companyUserCredential?`<div class="foundation-credential"><strong>Temporary password for ${escapeHtml(state.companyUserCredential.name)}</strong><span>${escapeHtml(state.companyUserCredential.password)}</span><small>Share it directly with this person. They must set a new password when they sign in.</small></div>`:'';
    const form=canManage?`<form class="foundation-add-user" id="companyUserForm"><h4>Add a member to ${escapeHtml(company.name)}</h4><div class="form-grid"><label class="form-field">Name <span>*</span><input name="name" required minlength="2" maxlength="120" placeholder="Full name"></label><label class="form-field">Work email <span>*</span><input name="email" type="email" required maxlength="254" placeholder="name@company.com"></label></div><small>A new account receives a temporary password. If this person already has an Aspect portal account, this adds company access to that identity.</small><div class="form-error" id="companyUserError" role="alert"></div><div class="document-upload-actions"><button type="submit" class="button button-primary" id="addCompanyUser">Add member</button></div>${credential}</form>`:'';
    return `<div class="company-module-heading"><div><span class="eyebrow">${escapeHtml(company.name)}</span><h3>Company members</h3><p>Platform administrators manage member access here. Shared account passwords and platform roles are managed centrally.</p></div></div><div class="foundation-user-list">${rows}</div>${form}`;
  }

  function renderCompanyWorkspaceTasks(company) {
    const tasks = companyTasks(company),events=(state.calendarEvents||[]).filter(item=>item.companyId===company.id),isOpen=item=>!['Completed','Cancelled'].includes(item.status);
    const counts=[['Active tasks',tasks.filter(isOpen).length],['Upcoming events',events.filter(item=>!eventIsPast(item)).length],['Blocked tasks',tasks.filter(item=>item.status==='Blocked').length]];
    const rows=[...tasks.map(item=>({...item,workType:'task'})),...events.map(item=>({...item,workType:'event'}))].sort((a,b)=>String(a.workType==='event'?a.startsAt:a.dueDate||a.updatedAt||'').localeCompare(String(b.workType==='event'?b.startsAt:b.dueDate||b.updatedAt||'')));
    const cards=rows.length?rows.map(item=>{
      if(item.workType==='event')return `<article class="company-task-card company-event-card"><span class="company-task-main"><small class="task-item-type">CALENDAR EVENT</small><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.location||item.description||'Company calendar event')}</small></span><span class="task-status status-open">${eventIsPast(item)?'Past event':'Scheduled'}</span><span class="company-task-meta"><span>${escapeHtml(formatEventDate(item))}</span><span>Created by ${escapeHtml(item.createdByName||'Company team')}</span></span></article>`;
      const due=item.dueDate?new Date(`${item.dueDate}T00:00:00`):null,overdue=Boolean(due&&due<new Date(new Date().setHours(0,0,0,0))&&isOpen(item)),statusClass=`status-${item.status.toLowerCase().replaceAll(' ','-')}`,priorityClass=`priority-${item.priority.toLowerCase()}`;
      return `<button type="button" class="company-task-card" data-workspace-task="${escapeHtml(item.id)}"><span class="company-task-main"><small class="task-item-type">TASK</small><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description||'No notes added.')}</small></span><span class="task-card-tags"><span class="task-status ${statusClass}">${escapeHtml(item.status)}</span><span class="task-priority ${priorityClass}">${escapeHtml(item.priority)}</span></span><span class="company-task-meta"><span>${escapeHtml(item.assigneeName||'Unassigned')}</span><span class="${overdue?'task-overdue':''}">${overdue?'Overdue · ':item.dueDate?'Due ':''}${escapeHtml(formatTaskDate(item.dueDate))}</span></span></button>`;
    }).join(''):'<p class="company-workspace-empty">No tasks or calendar events yet.</p>';
    return `<div class="company-module-heading"><div><span class="eyebrow">${escapeHtml(company.name)}</span><h3>Current work tasks</h3><p>Current work tasks and calendar events appear here.</p></div></div><div class="company-task-summary">${counts.map(([label,count])=>`<article><span>${label}</span><strong>${count}</strong></article>`).join('')}</div><div class="company-task-list">${cards}</div>`;
  }

  // Shared company queue and central oversight use the same data and filtering rules.
  function intakeToday(intake) {
    const timeZone = intake?.companyTimeZone || currentWorkspaceCompany()?.timeZone || state.user?.timeZone || 'UTC';
    try {
      const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    } catch {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
  }

  function intakeDueState(intake) {
    if (intake.status === 'Closed') return 'closed';
    if (intake.followUpCompletedAt) return 'completed';
    if (intake.linkedTaskId) return state.tasks.find(task => task.id === intake.linkedTaskId)?.status === 'Completed' ? 'completed' : 'handed-off';
    if (!intake.nextAction || !intake.nextActionDate) return 'none';
    if (intake.nextActionDate < intakeToday(intake)) return 'overdue';
    if (intake.nextActionDate === intakeToday(intake)) return 'due';
    return 'upcoming';
  }

  function accountingIntakeProgress(intake) {
    const detail = intake.accountingDetails || {};
    const checks = [
      Boolean(intake.organizationName), Boolean(intake.contactName), Boolean(intake.requestType), Boolean(intake.summary),
      detail.entityType, detail.entityCount, detail.monthlyTransactions, detail.accountCount, detail.accountingSoftware,
      detail.booksCurrentThrough, detail.desiredStartDate
    ];
    const complete = checks.filter(value => value !== undefined && value !== null && String(value).trim() !== '').length;
    return Math.round(complete / checks.length * 100);
  }

  function accountingWorkflowStages(statuses) {
    const groups = [
      { id: 'intake', label: 'Initial contact & review', description: 'Capture the request and confirm the basics.', ids: ['New', 'In review'] },
      { id: 'discovery', label: 'Scope & discovery', description: 'Gather records, deadlines, and operating detail.', ids: ['Discovery scheduled', 'Follow-up'] },
      { id: 'capacity', label: 'Capacity review', description: 'Compare the work with available team capacity.', ids: ['Qualified'] },
      { id: 'setup', label: 'Engagement setup', description: 'Move an approved engagement into setup.', ids: ['Setup in progress'] }
    ].map(stage => ({ ...stage, statusIds: statuses.filter(item => stage.ids.includes(item.id)).map(item => item.id) }));
    const assigned = new Set(groups.flatMap(stage => stage.statusIds));
    const custom = statuses.filter(item => item.id !== 'Closed' && !assigned.has(item.id));
    if (custom.length) groups.push({ id: 'additional', label: 'Additional stages', description: custom.map(item => item.label).join(' · '), statusIds: custom.map(item => item.id) });
    return groups;
  }

  function signatureWorkflowStages(statuses) {
    const groups = [
      { id: 'new-request', label: 'New pool requests', description: 'Capture the customer and the work they need.', ids: ['New'] },
      { id: 'site-scope', label: 'Contact & site scope', description: 'Clarify the property, pool condition, and project requirements.', ids: ['In review'] },
      { id: 'customer-follow-up', label: 'Waiting on information', description: 'Gather the details needed to prepare a recommendation or quote.', ids: ['Follow-up'] },
      { id: 'quote-ready', label: 'Ready to quote', description: 'The request has enough detail for a pool project proposal.', ids: ['Qualified'] }
    ].map(stage => ({ ...stage, statusIds: statuses.filter(item => stage.ids.includes(item.id)).map(item => item.id) }));
    const assigned = new Set(groups.flatMap(stage => stage.statusIds));
    const custom = statuses.filter(item => item.id !== 'Closed' && !assigned.has(item.id));
    if (custom.length) groups.push({ id: 'additional', label: 'Additional stages', description: custom.map(item => item.label).join(' · '), statusIds: custom.map(item => item.id) });
    return groups;
  }

  function signatureIntakeProgress(intake) {
    const checks = [intake.contactName, intake.email || intake.phone, intake.requestType, intake.summary, intake.nextAction, intake.nextActionDate, intake.assigneeUserId];
    return Math.round(checks.filter(value => value !== undefined && value !== null && String(value).trim() !== '').length / checks.length * 100);
  }

  const signatureDesignDiscoveryFields = ['projectType', 'primaryUse', 'decisionMakers', 'propertyAccess', 'siteConditions', 'utilities', 'surveyStatus', 'mustHaveFeatures', 'budgetRange', 'targetCompletion'];
  const signatureDesignDiscoverySentinels = new Set(['unknown', 'not yet determined', 'not sure yet', 'not decided yet', 'not discussed yet', 'not applicable', 'access needs site review', 'no known concerns yet', 'no known constraints yet', 'not determined yet']);
  const signatureDesignDiscoveryOptions = {
    projectType: new Set(['New pool and spa', 'New pool only', 'Pool renovation', 'Outdoor living addition']),
    primaryUse: new Set(['Family recreation', 'Entertainment', 'Exercise and wellness', 'Relaxation', 'Pool parties and guests']),
    decisionMakers: new Set(['Client only', 'Spouse or partner', 'Joint family decision', 'Property owner and representative', 'Multiple owners']),
    propertyAccess: new Set(['Easy equipment access', 'Through side yard', 'Through home or garage', 'Crane or special access may be needed']),
    siteConditions: new Set(['Flat grade', 'Sloped grade', 'Drainage concern', 'Rock or hard soil concern', 'Retaining wall concern', 'Existing pool or structure']),
    utilities: new Set(['City water', 'Well water', 'Septic system', 'Gas service', 'Overhead power lines', 'Easement or utility constraint']),
    surveyStatus: new Set(['Current survey available', 'Survey exists but needs verification', 'Survey must be ordered']),
    mustHaveFeatures: new Set(['Spa', 'Tanning ledge', 'Baja shelf', 'Water feature', 'Fire feature', 'Swim-up bar', 'Pool cover', 'Heating', 'Automation', 'Safety cover or fence', 'NONE_IDENTIFIED']),
    budgetRange: new Set(['Under $50,000', '$50,000-$75,000', '$75,000-$100,000', '$100,000-$150,000', '$150,000+']),
    targetCompletion: new Set(['As soon as possible', 'Within 3 months', '3-6 months', '6-12 months', '12+ months', 'Flexible'])
  };

  function signatureDesignDiscoveryComplete(discovery, field, criterionStates, readinessCriteria) {
    const tokens = String(discovery?.[field] || '').split(',').map(token => token.trim()).filter(Boolean);
    if (!tokens.length || tokens.some(token => signatureDesignDiscoverySentinels.has(token.toLocaleLowerCase('en-US')))) return false;
    if (field === 'surveyStatus' && tokens.length === 1 && tokens[0].toLocaleLowerCase('en-US') === 'not applicable') {
      const readinessSurvey = Array.isArray(readinessCriteria) ? readinessCriteria.find(item => item?.id === 'SURVEY_STATUS') : null;
      if (readinessSurvey) return readinessSurvey.answerState === 'NOT_APPLICABLE' && Boolean(readinessSurvey.complete);
      const survey = Array.isArray(criterionStates) ? criterionStates.find(item => item?.criterionId === 'SURVEY_STATUS') : null;
      return survey?.answerState === 'NOT_APPLICABLE' && Boolean(survey.reason && survey.updatedAt && survey.updatedByName);
    }
    if (field === 'mustHaveFeatures' && tokens.some(token => token.toLocaleLowerCase('en-US') === 'none_identified')) return tokens.length === 1;
    const options = signatureDesignDiscoveryOptions[field];
    return !options || tokens.every(token => [...options].some(option => option.toLocaleLowerCase('en-US') === token.toLocaleLowerCase('en-US')));
  }

  function signatureDesignIntakeProgress(intake) {
    const payload = intake?.origin?.sourcePayload || {}, contact = payload.contact || {}, inquiry = payload.inquiry || {}, property = inquiry.property || {}, sourceRecord = payload.sourceRecord || {};
    const discovery = sourceRecord.discoveryData && typeof sourceRecord.discoveryData === 'object' && !Array.isArray(sourceRecord.discoveryData) ? sourceRecord.discoveryData : {};
    const discoveryComplete = signatureDesignDiscoveryFields.every(field => signatureDesignDiscoveryComplete(discovery, field, sourceRecord.criterionStates, sourceRecord.readiness?.criteria));
    const checks = [Boolean(contact.name && (contact.email || contact.phone)), Boolean(property.address?.trim()), Boolean((inquiry.description || inquiry.projectVision || '').trim()), Boolean(inquiry.objectives?.trim()), Boolean(inquiry.preliminaryScope?.trim()), Boolean(inquiry.budgetExpectation?.trim()), Boolean(inquiry.desiredTiming?.trim()), Boolean(sourceRecord.ownerId), Boolean(sourceRecord.nextAction?.trim()), discoveryComplete];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }

  const accountingMarketingChannels = ['Website / organic search', 'Paid advertising', 'Social media', 'Email marketing', 'Referral / word of mouth', 'Networking event', 'Direct outreach', 'Other'];

  function newAccountingContactId() {
    return `contact-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
  }

  function accountingClientContactsForIntake(intake) {
    if (Array.isArray(intake?.accountingDetails?.contacts) && intake.accountingDetails.contacts.length) return intake.accountingDetails.contacts;
    if (intake?.contactName) return [{ id: intake.accountingDetails?.primaryContactId || newAccountingContactId(), name: intake.contactName, role: 'Primary contact', email: intake.email || '', phone: intake.phone || '' }];
    return [{ id: newAccountingContactId(), name: '', role: '', email: '', phone: '' }];
  }

  function accountingClientContactMarkup(contact = {}, index = 0) {
    const id = contact.id || newAccountingContactId();
    const roles = ['Primary contact', 'Owner', 'President / CEO', 'CFO / Controller', 'Bookkeeper', 'Accountant', 'Office manager', 'Payroll contact', 'Tax contact', 'Other'];
    const currentRole = contact.role || '';
    const savedRole = currentRole && !roles.includes(currentRole)
      ? `<option value="${escapeHtml(currentRole)}" selected>Saved role: ${escapeHtml(currentRole)}</option>` : '';
    return `<div class="accounting-client-contact" data-client-contact-row data-client-contact-id="${escapeHtml(id)}"><div class="accounting-client-contact-head"><strong>Contact ${index + 1}</strong><button type="button" class="text-button" data-client-contact-remove>Remove</button></div><div class="accounting-client-contact-fields"><label class="form-field">Name <span>*</span><input data-client-contact-field="name" maxlength="160" value="${escapeHtml(contact.name || '')}" placeholder="Full name"></label><label class="form-field">Role <span>*</span><select data-client-contact-field="role" required><option value="" disabled ${currentRole ? '' : 'selected'}>Choose a role</option>${savedRole}${roles.map(role => `<option value="${escapeHtml(role)}" ${role === currentRole ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('')}</select></label><label class="form-field">Email<input data-client-contact-field="email" type="email" maxlength="200" value="${escapeHtml(contact.email || '')}" placeholder="name@example.com"></label><label class="form-field">Phone<input data-client-contact-field="phone" maxlength="60" value="${escapeHtml(contact.phone || '')}" placeholder="Phone number"></label></div></div>`;
  }

  function collectAccountingClientContacts(form) {
    return [...form.querySelectorAll('[data-client-contact-row]')].map(row => ({
      id: row.dataset.clientContactId,
      name: row.querySelector('[data-client-contact-field="name"]')?.value.trim() || '',
      role: row.querySelector('[data-client-contact-field="role"]')?.value.trim() || '',
      email: row.querySelector('[data-client-contact-field="email"]')?.value.trim() || '',
      phone: row.querySelector('[data-client-contact-field="phone"]')?.value.trim() || ''
    })).filter(contact => contact.name || contact.role || contact.email || contact.phone);
  }

  function syncAccountingPrimaryContact(form) {
    const select = form?.querySelector('[data-primary-client-contact]');
    if (!select) return null;
    const previousId = select.value || select.dataset.selectedContactId || '';
    const contacts = collectAccountingClientContacts(form);
    const selectable = contacts.filter(contact => contact.name);
    select.replaceChildren(new Option('Choose a contact', ''));
    for (const contact of selectable) {
      const option = new Option(`${contact.name}${contact.role ? ` · ${contact.role}` : ''}`, contact.id);
      select.appendChild(option);
    }
    const selected = selectable.find(contact => contact.id === previousId) || selectable.find(contact => contact.role) || selectable[0] || null;
    select.value = selected?.id || '';
    select.dataset.selectedContactId = selected?.id || '';
    const name = form.querySelector('[data-primary-contact-name]');
    const email = form.querySelector('[data-primary-contact-email]');
    const phone = form.querySelector('[data-primary-contact-phone]');
    if (name) name.value = selected?.name || '';
    if (email) email.value = selected?.email || '';
    if (phone) phone.value = selected?.phone || '';
    return selected;
  }

  function renderIntakeQueue(company, { central = false } = {}) {
    const companyId = company?.id || null, scope = central ? 'central' : companyId || 'none';
    state.intakeFilters[scope] ||= {};
    const filters = state.intakeFilters[scope], canCreate = !central && canUseCompanyLocal(companyId), canManage = central || canManageCompanyLocal(companyId);
    const allIntakes = (central ? state.centralIntakes : state.companyIntakes).filter(intake => central || intake.companyId === companyId);
    const current = state.editingIntakeId === 'new' ? null : allIntakes.find(intake => intake.id === state.editingIntakeId);
    const mayEditCurrent = !current || canManage || current.createdBy === state.user?.id || current.assigneeUserId === state.user?.id || canEditSignatureDesignInquiryLocal(current);
    const intakeAssigneeOptions = current?.assigneeUserId && !state.intakeAssignees.some(person => person.id === current.assigneeUserId) ? [{ id: current.assigneeUserId, name: current.assigneeName || 'Current owner', role: 'current owner' }, ...state.intakeAssignees] : state.intakeAssignees;
    const receptionConfig = central ? null : state.companyReceptionConfig?.[companyId];
    const accountingPortal = !central && companyId === 'aspect-ventures';
    const signaturePortal = !central && companyId === 'aspect-property';
    const specializedReception = accountingPortal || signaturePortal;
    const clientContacts = accountingPortal ? accountingClientContactsForIntake(current) : [];
    const selectedPrimaryContactId = accountingPortal ? current?.accountingDetails?.primaryContactId || clientContacts[0]?.id || '' : '';
    const intakeSources = accountingPortal ? accountingMarketingChannels : receptionConfig?.sources || ['Phone', 'Email', 'Website', 'Referral', 'Walk-in', 'Other'];
    const sourceFilterOptions = [...new Set([...(receptionConfig?.sources || ['Phone', 'Email', 'Website', 'Referral', 'Walk-in', 'Other']), ...allIntakes.map(intake => intake.source).filter(Boolean)])];
    const legacyAccountingSource = accountingPortal && current?.source && !accountingMarketingChannels.includes(current.source)
      ? `<option value="${escapeHtml(current.source)}" selected>Saved source: ${escapeHtml(current.source)}</option>` : '';
    const poolServices = receptionConfig?.services?.length ? receptionConfig.services : ['New pool construction','Pool renovation or resurfacing','Pool repair','Pool maintenance','Safety inspection','Outdoor living','Other'];
    const configuredStatuses=receptionConfig?.statuses||['New','In review','Follow-up','Qualified','Closed'].map(id=>({id,label:id,active:true,terminal:id==='Closed'}));
    const centralExtraStatuses=central?[...new Map(allIntakes.filter(intake=>!configuredStatuses.some(item=>item.id===intake.status)).map(intake=>[intake.status,{id:intake.status,label:intake.statusLabel||intake.status,active:true}])).values()]:[];
    const statuses=[...configuredStatuses,...centralExtraStatuses].filter(item=>item.active||allIntakes.some(intake=>intake.status===item.id));
    const accountingStages=accountingPortal?accountingWorkflowStages(statuses):signaturePortal?signatureWorkflowStages(statuses):[];
    const dueState = intake => intakeDueState(intake);
    const ownerOptions = [...new Map(allIntakes.filter(item => item.assigneeUserId).map(item => [item.assigneeUserId, item.assigneeName || 'Team member'])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const requestTypeOptions = [...new Set([...(signaturePortal?poolServices:[]),...allIntakes.map(item => item.requestType).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const visible = intake => {
      const query = (filters.q || '').trim().toLocaleLowerCase();
      const haystack = [intake.organizationName,intake.contactName,intake.email,intake.phone,intake.source,intake.requestType,intake.summary,intake.assigneeName,intake.nextAction,intake.companyName,JSON.stringify(intake.accountingDetails||{}),accountingPortal?JSON.stringify(intake.workloadReview||{}):''].join(' ').toLocaleLowerCase();
      const followState = dueState(intake);
      const followUpOffset = intake.nextActionDate ? Math.round((Date.parse(`${intake.nextActionDate}T12:00:00Z`) - Date.parse(`${intakeToday(intake)}T12:00:00Z`)) / 86400000) : null;
      const followMatch = central && filters.followUp === 'next7' ? followState === 'upcoming' && followUpOffset >= 1 && followUpOffset <= 7
        : central && filters.followUp === 'later' ? followState === 'upcoming' && followUpOffset > 7
          : !filters.followUp || (filters.followUp === 'due' && ['due', 'overdue'].includes(followState)) || (filters.followUp === 'today' && followState === 'due') || filters.followUp === followState;
      const stage = specializedReception&&filters.accountingStage?accountingStages.find(item=>item.id===filters.accountingStage):null;
      return (!query || haystack.includes(query)) && (!filters.status || intake.status === filters.status) && (!accountingPortal||!filters.fitStatus||intake.workloadReview?.fitStatus===filters.fitStatus)
        && (!filters.mine || intake.assigneeUserId === state.user?.id) && (!stage || stage.statusIds.includes(intake.status))
        && (!filters.owner || (filters.owner === 'unassigned' ? !intake.assigneeUserId : intake.assigneeUserId === filters.owner))
        && (!central || !filters.company || intake.companyId === filters.company)
        && (!filters.source || intake.source === filters.source) && (!filters.requestType || intake.requestType === filters.requestType)
        && (!filters.dateFrom || Boolean(intake.nextActionDate && intake.nextActionDate >= filters.dateFrom))
        && (!filters.dateTo || Boolean(intake.nextActionDate && intake.nextActionDate <= filters.dateTo)) && followMatch;
    };
    const statusCounts = statuses.map(status => [status.id,status.label,allIntakes.filter(item => item.status === status.id).length]);
    const overdueCount = allIntakes.filter(item => dueState(item) === 'overdue').length;
    const dueTodayCount = allIntakes.filter(item => dueState(item) === 'due').length;
    const completedCount = allIntakes.filter(item => dueState(item) === 'completed').length;
    const myDueCount = allIntakes.filter(item => item.assigneeUserId === state.user?.id && ['due', 'overdue'].includes(dueState(item))).length;

    const editor = canCreate && state.editingIntakeId && mayEditCurrent ? `
      <div class="intake-modal-backdrop" id="intakeModalBackdrop">
        <section class="intake-modal" id="receptionIntakeDialog" role="dialog" aria-modal="true" aria-labelledby="intakeModalTitle" tabindex="-1">
          <header class="intake-modal-header"><div><span class="eyebrow">${escapeHtml(company.name)} · RECEPTION</span><h3 id="intakeModalTitle">${current ? 'Inquiry form' : 'New inquiry'}</h3></div><button type="button" class="intake-modal-close" data-cancel-intake aria-label="Close inquiry form">×</button></header>
          <form class="intake-editor" id="receptionIntakeForm" data-intake-id="${escapeHtml(current?.id || '')}">
            <div class="intake-form-grid">
              ${accountingPortal ? `<label class="form-field">Organization / business name <span>*</span><input name="organizationName" maxlength="160" required value="${escapeHtml(current?.organizationName || '')}" placeholder="Business or legal entity"></label>` : ''}
              ${accountingPortal ? `<label class="form-field" data-intake-form-section="client">Business address<textarea name="accountingDetails.businessAddress" rows="2" maxlength="500" autocomplete="street-address" placeholder="Street, city, state, ZIP code">${escapeHtml(current?.accountingDetails?.businessAddress || '')}</textarea></label><label class="form-field" data-intake-form-section="client">Mailing address<textarea name="accountingDetails.mailingAddress" rows="2" maxlength="500" autocomplete="billing street-address" placeholder="Street, city, state, ZIP code">${escapeHtml(current?.accountingDetails?.mailingAddress || '')}</textarea></label>` : ''}
              ${accountingPortal ? `<label class="form-field" data-intake-form-section="client">Primary contact · name / role <span>*</span><select data-primary-client-contact required><option value="">Choose a contact</option>${clientContacts.filter(contact => contact.name).map(contact => `<option value="${escapeHtml(contact.id)}" ${contact.id === selectedPrimaryContactId ? 'selected' : ''}>${escapeHtml(contact.name)}${contact.role ? ` · ${escapeHtml(contact.role)}` : ''}</option>`).join('')}</select></label><input type="hidden" name="contactName" data-primary-contact-name value="${escapeHtml(current?.contactName || '')}"><input type="hidden" name="email" data-primary-contact-email value="${escapeHtml(current?.email || '')}"><input type="hidden" name="phone" data-primary-contact-phone value="${escapeHtml(current?.phone || '')}"><fieldset class="intake-client-contacts full-field" data-intake-form-section="client"><legend>Company contacts</legend><p>Add the people connected to this organization. Select the primary contact above.</p><div class="accounting-client-contact-list">${clientContacts.map((contact, index) => accountingClientContactMarkup(contact, index)).join('')}</div><button type="button" class="button button-secondary" data-client-contact-add>＋ Add contact</button></fieldset><label class="form-field" data-intake-form-section="client">Entity type<input name="accountingDetails.entityType" value="${escapeHtml(current?.accountingDetails?.entityType||'')}" placeholder="Choose an entity type"></label>` : `<label class="form-field">${signaturePortal?'Property owner / contact':'Contact name'} <span>*</span><input name="contactName" maxlength="160" required value="${escapeHtml(current?.contactName || '')}" placeholder="Person’s name"></label>`}
              <label class="form-field">${accountingPortal?'How they found out about us':'How they reached us'}<select name="source" ${accountingPortal?'required':''}>${accountingPortal?`<option value="" disabled ${current?.source?'':'selected'}>Choose a marketing channel</option>`:''}${intakeSources.map(value => `<option value="${escapeHtml(value)}" ${value === (current?.source || (accountingPortal ? '' : 'Phone')) ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}${legacyAccountingSource}</select></label>
              ${accountingPortal ? '' : `<label class="form-field">Email<input name="email" type="email" maxlength="200" value="${escapeHtml(current?.email || '')}" placeholder="name@example.com"></label><label class="form-field">Phone<input name="phone" maxlength="60" value="${escapeHtml(current?.phone || '')}" placeholder="Phone number"></label>`}
              <label class="form-field">${accountingPortal?'Accounting service requested':signaturePortal?'Pool service requested':'Request type'}<select name="requestType" ${accountingPortal||signaturePortal?'required':''}><option value="">Choose a service</option>${(accountingPortal?(receptionConfig?.services||[]):signaturePortal?poolServices:requestTypeOptions).map(value => `<option value="${escapeHtml(value)}" ${value === (current?.requestType || '') ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}${current?.requestType&&(accountingPortal||signaturePortal)&&!(accountingPortal?(receptionConfig?.services||[]):poolServices).includes(current.requestType)?`<option selected>${escapeHtml(current.requestType)}</option>`:''}</select></label>
              <label class="form-field">Status<select name="status" data-intake-status ${!current || current.status === 'Closed' ? 'disabled' : ''}>${statuses.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === (current?.status || 'New') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>${current?.status === 'Closed' ? '<small>Use Reopen inquiry to restart a closed record.</small>' : ''}</label>
              ${accountingPortal ? `<fieldset class="intake-accounting-scope full-field"><legend>Accounting scope and readiness</legend><div class="intake-form-grid"><label class="form-field">Jurisdictions / states<input name="accountingDetails.jurisdictions" value="${escapeHtml(current?.accountingDetails?.jurisdictions||'')}" placeholder="Where the business operates"></label><label class="form-field">Number of entities<input type="number" min="0" name="accountingDetails.entityCount" value="${escapeHtml(current?.accountingDetails?.entityCount??'')}"></label><label class="form-field">Locations<input type="number" min="0" name="accountingDetails.locationCount" value="${escapeHtml(current?.accountingDetails?.locationCount??'')}"></label><label class="form-field">Monthly transactions (approx.)<input type="number" min="0" name="accountingDetails.monthlyTransactions" value="${escapeHtml(current?.accountingDetails?.monthlyTransactions??'')}"></label><label class="form-field">Bank / credit accounts<input type="number" min="0" name="accountingDetails.accountCount" value="${escapeHtml(current?.accountingDetails?.accountCount??'')}"></label><label class="form-field">Employees<input type="number" min="0" name="accountingDetails.employeeCount" value="${escapeHtml(current?.accountingDetails?.employeeCount??'')}"></label><label class="form-field">Payroll frequency<input name="accountingDetails.payrollFrequency" value="${escapeHtml(current?.accountingDetails?.payrollFrequency||'')}" placeholder="Weekly, biweekly, none"></label><label class="form-field">Accounting software<input name="accountingDetails.accountingSoftware" value="${escapeHtml(current?.accountingDetails?.accountingSoftware||'')}" placeholder="QuickBooks, Xero…"></label><label class="form-field">Payroll provider<input name="accountingDetails.payrollProvider" value="${escapeHtml(current?.accountingDetails?.payrollProvider||'')}"></label><label class="form-field">Books current through<input type="month" name="accountingDetails.booksCurrentThrough" value="${escapeHtml(current?.accountingDetails?.booksCurrentThrough||'')}"></label><label class="form-field">Catch-up / cleanup months<input type="number" min="0" name="accountingDetails.catchUpMonths" value="${escapeHtml(current?.accountingDetails?.catchUpMonths??'')}"></label><label class="form-field">Desired start date<input type="date" name="accountingDetails.desiredStartDate" value="${escapeHtml(current?.accountingDetails?.desiredStartDate||'')}"></label><label class="form-field">Hard deadline<input type="date" name="accountingDetails.hardDeadline" value="${escapeHtml(current?.accountingDetails?.hardDeadline||'')}"></label><label class="form-field">Sales tax jurisdictions<input name="accountingDetails.salesTaxJurisdictions" value="${escapeHtml(current?.accountingDetails?.salesTaxJurisdictions||'')}" placeholder="States / local jurisdictions"></label><label class="form-field">Records readiness<select name="accountingDetails.recordsReadiness">${['','Organized and available','Available but needs sorting','Incomplete','Unknown'].map(value=>`<option value="${escapeHtml(value)}" ${value===(current?.accountingDetails?.recordsReadiness||'')?'selected':''}>${value||'Choose'}</option>`).join('')}</select></label><label class="form-field">Prior accountant status<input name="accountingDetails.priorAccountantStatus" value="${escapeHtml(current?.accountingDetails?.priorAccountantStatus||'')}" placeholder="Current, transitioning, none…"></label><label class="form-field">Expected response time<input name="accountingDetails.clientResponseTime" value="${escapeHtml(current?.accountingDetails?.clientResponseTime||'')}" placeholder="e.g. within 2 business days"></label><label class="form-field full-field">Other systems<input name="accountingDetails.otherSystems" value="${escapeHtml(current?.accountingDetails?.otherSystems||'')}" placeholder="POS, ecommerce, inventory, other platforms"></label><div class="form-field full-field"><span>Complexity flags</span><div class="intake-checkbox-grid">${['Inventory','Job/project costing','Multiple currencies','Intercompany activity','Restricted or grant funds','Trusts','POS or e-commerce','Other'].map(flag=>`<label><input type="checkbox" name="complexityFlags" value="${escapeHtml(flag)}" ${(current?.accountingDetails?.complexityFlags||[]).includes(flag)?'checked':''}>${escapeHtml(flag)}</label>`).join('')}</div></div></div></fieldset>` : ''}
              ${accountingPortal?`<fieldset class="intake-choice-question full-field"><legend>What kind of help is requested? <span>*</span></legend><div class="intake-choice-grid">${['Ongoing monthly work','Cleanup or catch-up','New business setup','Payroll or sales tax','Financial reporting','Advisory or review','Not sure yet','Other'].map((choice,index)=>`<label class="intake-choice-card"><input type="radio" name="summary" value="${escapeHtml(choice)}" ${current?.summary===choice?'checked':''} ${index===0?'required':''}><span>${escapeHtml(choice)}</span></label>`).join('')}${current?.summary&&!['Ongoing monthly work','Cleanup or catch-up','New business setup','Payroll or sales tax','Financial reporting','Advisory or review','Not sure yet','Other'].includes(current.summary)?`<label class="intake-choice-card"><input type="radio" name="summary" value="${escapeHtml(current.summary)}" checked><span>Saved request</span></label>`:''}</div>${current?.summary&&!['Ongoing monthly work','Cleanup or catch-up','New business setup','Payroll or sales tax','Financial reporting','Advisory or review','Not sure yet','Other'].includes(current.summary)?`<details class="intake-saved-request"><summary>View saved request details</summary><p>${escapeHtml(current.summary)}</p></details>`:''}</fieldset>`:`<label class="form-field full-field">${signaturePortal?'Describe the pool or outdoor project':'What do they need?'} <span>*</span><textarea name="summary" rows="3" maxlength="4000" required placeholder="${signaturePortal?'Include the property address, current pool condition, requested work, and timing':'Briefly describe the request'}">${escapeHtml(current?.summary || '')}</textarea></label>`}
              ${accountingPortal&&canManage ? `<fieldset class="intake-workload-review full-field"><legend>Internal workload and fit review</legend><p>Compare the requested scope, timing, and estimated effort with current team capacity before committing.</p><div class="intake-form-grid"><label class="form-field">Capacity fit<select name="workloadReview.fitStatus">${['Likely fit','Need clarification','Capacity constrained','Outside services'].map(value=>`<option ${value===(current?.workloadReview?.fitStatus||'Need clarification')?'selected':''}>${value}</option>`).join('')}</select></label><label class="form-field">Decision<select name="workloadReview.decision">${['Undecided','Proceed to engagement','Request more information','Schedule a later start','Refer out','Decline'].map(value=>`<option ${value===(current?.workloadReview?.decision||'Undecided')?'selected':''}>${value}</option>`).join('')}</select></label><label class="form-field">Estimated effort (hours) / Work Cycle<input type="number" min="0" step="0.5" name="workloadReview.estimatedEffortHours" value="${escapeHtml(current?.workloadReview?.estimatedEffortHours??'')}"></label><label class="form-field">Work Cycle Type<select name="workloadReview.effortConfidence">${['Unknown','Low','Medium','High'].map(value=>`<option ${value===(current?.workloadReview?.effortConfidence||'Unknown')?'selected':''}>${value}</option>`).join('')}</select></label><label class="form-field">Required Timeframe<input name="workloadReview.capacityWindow" value="${escapeHtml(current?.workloadReview?.capacityWindow||'')}" placeholder="e.g. November start; 2 slots available"></label><label class="form-field full-field">Fit rationale<textarea name="workloadReview.rationale" rows="2" maxlength="2000" placeholder="Why is this workload realistic for the team now?">${escapeHtml(current?.workloadReview?.rationale||'')}</textarea></label><label class="form-field full-field">Decision notes<textarea name="workloadReview.decisionNotes" rows="2" maxlength="1000">${escapeHtml(current?.workloadReview?.decisionNotes||'')}</textarea></label></div></fieldset>` : ''}
              ${accountingPortal ? `<fieldset class="intake-accounting-scope full-field"><legend>Handoff and work period</legend><div class="intake-form-grid"><label class="form-field">Who currently keeps the books?<select name="accountingDetails.priorAccountantStatus">${['','Owner or internal team','Another accountant or bookkeeper','No one currently','Not sure','Current','Transitioning','No prior accountant'].map(value=>`<option value="${escapeHtml(value)}" ${value===(current?.accountingDetails?.priorAccountantStatus||'')?'selected':''}>${value||'Choose'}</option>`).join('')}</select></label><label class="form-field" data-accounting-transfer hidden>Can the current provider help transfer records?<select name="accountingDetails.recordTransferHelp">${['','Yes','No','Not sure'].map(value=>`<option value="${escapeHtml(value)}" ${value===(current?.accountingDetails?.recordTransferHelp||'')?'selected':''}>${value||'Choose'}</option>`).join('')}</select></label><label class="form-field">Is software access ready?<select name="accountingDetails.softwareAccess">${['','Access ready','Need to invite the team','Need help getting access','Not sure'].map(value=>`<option value="${escapeHtml(value)}" ${value===(current?.accountingDetails?.softwareAccess||'')?'selected':''}>${value||'Choose'}</option>`).join('')}</select></label><div class="accounting-period-range full-field" data-accounting-period-range hidden><span class="accounting-period-title">Which months or years need work?</span><label class="form-field">From<input type="month" name="accountingDetails.coverageFrom" value="${escapeHtml(current?.accountingDetails?.coverageFrom||'')}"></label><label class="form-field">Through<input type="month" name="accountingDetails.coverageThrough" value="${escapeHtml(current?.accountingDetails?.coverageThrough||'')}"></label></div><label class="form-field" data-accounting-sales-tax hidden>Sales tax filing frequency<select name="accountingDetails.salesTaxFrequency">${['','Monthly','Quarterly','Annually','Varies by state','Not sure'].map(value=>`<option value="${escapeHtml(value)}" ${value===(current?.accountingDetails?.salesTaxFrequency||'')?'selected':''}>${value||'Choose'}</option>`).join('')}</select></label><label class="form-field" data-accounting-payroll-states hidden>States where employees work<input name="accountingDetails.payrollEmployeeStates" value="${escapeHtml(current?.accountingDetails?.payrollEmployeeStates||'')}" placeholder="State(s)"></label></div></fieldset>` : ''}
              ${accountingPortal&&current&&mayEditCurrent ? `<fieldset class="intake-workload-review start-checklist full-field" data-accounting-start-checklist data-intake-form-section="review" hidden><legend>Before setup can begin</legend><p>Confirm each item before moving this inquiry into setup or active work.</p><div class="intake-checkbox-grid"><label><input type="checkbox" name="workloadReview.startChecklist.scope" ${current?.workloadReview?.startChecklist?.scope?'checked':''}> Scope and deliverables agreed</label><label><input type="checkbox" name="workloadReview.startChecklist.capacity" ${current?.workloadReview?.startChecklist?.capacity?'checked':''}> Effort and team capacity reviewed</label><label><input type="checkbox" name="workloadReview.startChecklist.terms" ${current?.workloadReview?.startChecklist?.terms?'checked':''}> Engagement terms approved</label><label><input type="checkbox" name="workloadReview.startChecklist.records" ${current?.workloadReview?.startChecklist?.records?'checked':''}> Records and software access received</label></div></fieldset>` : ''}
              <label class="form-field">Follow-up owner<select name="assigneeUserId" ${canManage ? '' : 'disabled'}><option value="">Unassigned</option>${intakeAssigneeOptions.map(person => `<option value="${escapeHtml(person.id)}" ${person.id === (current?.assigneeUserId || '') ? 'selected' : ''}>${escapeHtml(person.name)} · ${escapeHtml(person.role)}</option>`).join('')}</select></label>
              <label class="form-field">Follow-up date<input name="nextActionDate" type="date" value="${escapeHtml(current?.nextActionDate || '')}"></label>
              ${accountingPortal?`<label class="form-field">Next step<select name="nextAction"><option value="">Choose next step</option>${['Call to clarify scope','Request records','Schedule discovery','Check capacity','Send engagement terms','Refer out','Other'].map(value=>`<option ${value===(current?.nextAction||'')?'selected':''}>${escapeHtml(value)}</option>`).join('')}${current?.nextAction&&!['Call to clarify scope','Request records','Schedule discovery','Check capacity','Send engagement terms','Refer out','Other'].includes(current.nextAction)?`<option selected>${escapeHtml(current.nextAction)}</option>`:''}</select></label>`:`<label class="form-field full-field">Next step<input name="nextAction" maxlength="500" value="${escapeHtml(current?.nextAction || '')}" placeholder="Call back to clarify the request"></label>`}
              <div class="intake-closure-fields full-field" id="intakeClosureFields" ${current?.status === 'Closed' ? '' : 'hidden'}>
                <label class="form-field">Closure outcome <span>*</span><select name="closureOutcome" id="intakeClosureOutcome"><option value="">Choose an outcome</option>${(receptionConfig?.closureOutcomes||['Resolved', 'Referred', 'Not proceeding', 'Unable to reach', 'Duplicate', 'Other']).map(value => `<option ${value === (current?.closureOutcome || '') ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label>
                <label class="form-field">Closure notes<textarea name="closureNote" rows="2" maxlength="2000" placeholder="Optional outcome details">${escapeHtml(current?.closureNote || '')}</textarea></label>
              </div>
            </div>
            <div class="form-error full-field" id="receptionIntakeError" role="alert"></div><div class="intake-form-actions"><button type="button" class="button button-secondary" data-cancel-intake>Cancel</button><button type="submit" class="button button-primary" id="saveReceptionIntake">${current?.origin?.sourceSystem==='signature-exteriors-design'?'Save to both portals':current ? 'Save updates' : 'Save inquiry'}</button></div>
          </form>
        </section>
      </div>` : '';

    const accountingWorkflow=specializedReception?`<section class="accounting-workflow-panel" aria-labelledby="accountingWorkflowTitle"><header><span class="eyebrow" id="accountingWorkflowTitle">${signaturePortal?'Pool project pipeline':'Accounting workflow'}</span></header><div class="accounting-workflow-stages">${accountingStages.map((stage,index)=>`${index?'<span class="accounting-stage-arrow" aria-hidden="true">→</span>':''}<button type="button" class="accounting-stage-card ${filters.accountingStage===stage.id?'is-selected':''}" data-intake-accounting-stage="${escapeHtml(stage.id)}" aria-pressed="${filters.accountingStage===stage.id}" aria-label="${escapeHtml(stage.label)}: ${allIntakes.filter(item=>stage.statusIds.includes(item.status)).length} inquiries. View this phase. ${escapeHtml(stage.description)}"><span class="accounting-stage-title">${escapeHtml(stage.label)}</span><strong>${allIntakes.filter(item=>stage.statusIds.includes(item.status)).length}</strong><span class="accounting-stage-link">View phase</span></button>`).join('')}</div></section>`:'';
    const accountingQuickFilters=specializedReception?`<div class="accounting-intake-shortcuts" role="group" aria-label="Quick inquiry filters"><button type="button" class="${!filters.mine&&!filters.followUp&&!filters.accountingStage?'is-selected':''}" data-intake-accounting-quick="all">All inquiries</button><button type="button" class="${filters.mine?'is-selected':''}" data-intake-accounting-quick="mine">My inquiries</button><button type="button" class="${filters.followUp==='today'?'is-selected':''}" data-intake-accounting-quick="due">Due today</button><button type="button" class="${filters.followUp==='overdue'?'is-selected':''}" data-intake-accounting-quick="overdue">Overdue</button></div>`:'';
    const accountingMoreFilters=specializedReception?`<details class="accounting-more-filters"><summary>More filters</summary><div class="accounting-more-filter-grid"><select data-intake-filter="owner" aria-label="Filter by owner"><option value="">All owners</option><option value="unassigned" ${filters.owner==='unassigned'?'selected':''}>Unassigned</option>${ownerOptions.map(([id,name])=>`<option value="${escapeHtml(id)}" ${filters.owner===id?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select><select data-intake-filter="source" aria-label="${accountingPortal?'Filter by marketing channel':'Filter by contact source'}"><option value="">All sources</option>${sourceFilterOptions.map(value=>`<option ${filters.source===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select><select data-intake-filter="requestType" aria-label="Filter by ${signaturePortal?'pool service':'accounting service'}"><option value="">All ${signaturePortal?'pool services':'accounting services'}</option>${requestTypeOptions.map(value=>`<option ${filters.requestType===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select><label class="intake-date-filter"><span>Follow-up from</span><input type="date" data-intake-filter="dateFrom" value="${escapeHtml(filters.dateFrom||'')}" aria-label="Follow-up date on or after"></label><label class="intake-date-filter"><span>Follow-up through</span><input type="date" data-intake-filter="dateTo" value="${escapeHtml(filters.dateTo||'')}" aria-label="Follow-up date on or before"></label><select data-intake-filter="followUp" aria-label="Filter follow-ups"><option value="">All follow-ups</option><option value="due" ${filters.followUp==='due'?'selected':''}>Due or overdue</option><option value="overdue" ${filters.followUp==='overdue'?'selected':''}>Overdue</option><option value="upcoming" ${filters.followUp==='upcoming'?'selected':''}>Upcoming</option><option value="handed-off" ${filters.followUp==='handed-off'?'selected':''}>Tracked as a task</option><option value="completed" ${filters.followUp==='completed'?'selected':''}>Completed</option><option value="none" ${filters.followUp==='none'?'selected':''}>No date</option></select><button type="button" class="text-button" data-intake-clear-filters>Clear filters</button></div><details class="accounting-queue-summary"><summary>Queue summary</summary><div class="accounting-queue-metrics"><span><strong>${allIntakes.filter(item=>item.status!=='Closed').length}</strong> active</span><span><strong>${completedCount}</strong> completed</span><span><strong>${overdueCount+dueTodayCount}</strong> due</span><button type="button" class="intake-queue-filter-button ${filters.owner===state.user?.id&&filters.followUp==='due'?'is-selected':''}" data-intake-my-follow-ups>My due · ${myDueCount}</button></div></details></details>`:'';
    const accountingQueue=specializedReception?`<section class="accounting-queue-tools"><div class="accounting-queue-tools-heading"><h4>Search inquiries</h4></div><div class="accounting-queue-search-row"><label class="intake-search">${window.aspectIcon('search')}<input type="search" value="${escapeHtml(filters.q||'')}" data-intake-filter="q" placeholder="${signaturePortal?'Property owner, service, or location':'Business, contact, or service'}" aria-label="Search ${signaturePortal?'pool':'accounting'} inquiries"></label><select data-intake-filter="status" aria-label="Exact status"><option value="">All statuses</option>${statuses.map(item=>`<option value="${escapeHtml(item.id)}" ${filters.status===item.id?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select>${accountingPortal?`<select data-intake-filter="fitStatus" aria-label="Filter by workload fit"><option value="">All workload fits</option>${['Likely fit','Need clarification','Capacity constrained','Outside services'].map(value=>`<option ${filters.fitStatus===value?'selected':''}>${value}</option>`).join('')}</select>`:''}</div>${accountingQuickFilters}${accountingMoreFilters}</section>${overdueCount||dueTodayCount?`<aside class="intake-reminder" role="status"><span class="intake-reminder-icon">${window.aspectIcon('clock-3')}</span><span><strong>${overdueCount+dueTodayCount} follow-up${overdueCount+dueTodayCount===1?'':'s'} need attention</strong><small>${overdueCount?`${overdueCount} overdue`:''}${overdueCount&&dueTodayCount?' · ':''}${dueTodayCount?`${dueTodayCount} due today`:''}. Review the queue and mark completed follow-ups.</small></span><button type="button" class="text-button" data-intake-quick-follow="due">Review due</button></aside>`:''}`:'';
    const controls=specializedReception?accountingQueue:`
      <div class="intake-summary">${statusCounts.map(([id,label,count]) => `<button type="button" class="intake-summary-card ${filters.status === id ? 'is-selected' : ''}" data-intake-quick-status="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`).join('')}<button type="button" class="intake-summary-card ${filters.followUp === 'today' ? 'is-selected' : ''}" data-intake-quick-follow="today"><span>Due today</span><strong>${dueTodayCount}</strong></button><button type="button" class="intake-summary-card ${filters.followUp === 'overdue' ? 'is-selected' : ''}" data-intake-quick-follow="overdue"><span>Overdue</span><strong>${overdueCount}</strong></button></div>
      ${overdueCount || dueTodayCount ? `<aside class="intake-reminder" role="status"><span class="intake-reminder-icon">${window.aspectIcon('clock-3')}</span><span><strong>${overdueCount + dueTodayCount} follow-up${overdueCount + dueTodayCount === 1 ? '' : 's'} need attention</strong><small>${overdueCount ? `${overdueCount} overdue` : ''}${overdueCount && dueTodayCount ? ' · ' : ''}${dueTodayCount ? `${dueTodayCount} due today` : ''}. Review the queue and mark completed follow-ups.</small></span><button type="button" class="text-button" data-intake-quick-follow="due">Review due</button></aside>` : ''}
      <div class="intake-queue-metrics"><span><strong>${allIntakes.filter(item => item.status !== 'Closed').length}</strong> open inquiries</span><span><strong>${completedCount}</strong> follow-ups completed</span><span><strong>${overdueCount + dueTodayCount}</strong> need attention today</span><button type="button" class="intake-queue-filter-button ${filters.owner === state.user?.id && filters.followUp === 'due' ? 'is-selected' : ''}" data-intake-my-follow-ups>My due follow-ups · ${myDueCount}</button></div>
      <div class="intake-toolbar"><label class="intake-search">${window.aspectIcon('search')}<input type="search" value="${escapeHtml(filters.q || '')}" data-intake-filter="q" placeholder="Search contacts, requests, owners…" aria-label="Search reception intakes"></label>
        ${central ? `<select data-intake-filter="company" aria-label="Filter by company"><option value="">All companies</option>${state.companies.map(item => `<option value="${escapeHtml(item.id)}" ${filters.company === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>` : ''}
        <select data-intake-filter="status" aria-label="Filter by status"><option value="">All statuses</option>${statuses.map(item => `<option value="${escapeHtml(item.id)}" ${filters.status === item.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>
        ${accountingPortal?`<select data-intake-filter="fitStatus" aria-label="Filter by workload fit"><option value="">All workload fits</option>${['Likely fit','Need clarification','Capacity constrained','Outside services'].map(value=>`<option ${filters.fitStatus===value?'selected':''}>${value}</option>`).join('')}</select>`:''}
        <select data-intake-filter="owner" aria-label="Filter by owner"><option value="">All owners</option><option value="unassigned" ${filters.owner === 'unassigned' ? 'selected' : ''}>Unassigned</option>${ownerOptions.map(([id, name]) => `<option value="${escapeHtml(id)}" ${filters.owner === id ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>
        <select data-intake-filter="source" aria-label="${accountingPortal?'Filter by marketing channel':'Filter by contact source'}"><option value="">All sources</option>${sourceFilterOptions.map(value => `<option ${filters.source === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select>
        <select data-intake-filter="requestType" aria-label="Filter by request type"><option value="">All request types</option>${requestTypeOptions.map(value => `<option ${filters.requestType === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select>
        <label class="intake-date-filter"><span>Follow-up from</span><input type="date" data-intake-filter="dateFrom" value="${escapeHtml(filters.dateFrom || '')}" aria-label="Follow-up date on or after"></label>
        <label class="intake-date-filter"><span>Follow-up through</span><input type="date" data-intake-filter="dateTo" value="${escapeHtml(filters.dateTo || '')}" aria-label="Follow-up date on or before"></label>
        <select data-intake-filter="followUp" aria-label="Filter follow-ups"><option value="">All follow-ups</option><option value="due" ${filters.followUp === 'due' ? 'selected' : ''}>Due or overdue</option><option value="overdue" ${filters.followUp === 'overdue' ? 'selected' : ''}>Overdue</option><option value="upcoming" ${filters.followUp === 'upcoming' ? 'selected' : ''}>Upcoming</option><option value="handed-off" ${filters.followUp === 'handed-off' ? 'selected' : ''}>Tracked as a task</option><option value="completed" ${filters.followUp === 'completed' ? 'selected' : ''}>Completed</option><option value="none" ${filters.followUp === 'none' ? 'selected' : ''}>No date</option></select>
        <button type="button" class="text-button" data-intake-clear-filters>Clear filters</button></div>`;

    const cards = allIntakes.filter(visible).map(intake => {
      const stateName = dueState(intake), overdue = stateName === 'overdue';
      const canEdit = central ? false : (canEditSignatureDesignInquiryLocal(intake) || canManageCompanyLocal(intake.companyId) || intake.createdBy === state.user?.id || intake.assigneeUserId === state.user?.id);
      const contact = [intake.email, intake.phone].filter(Boolean).map(escapeHtml).join(' · ') || 'No contact details';
      const dueLabel = intake.linkedTaskId ? stateName === 'completed' ? 'Task completed' : '' : intake.nextActionDate ? intake.followUpCompletedAt ? `Done ${formatTaskDate(intake.nextActionDate)}` : `${overdue ? 'Overdue' : stateName === 'due' ? 'Due today' : 'Due'} ${formatTaskDate(intake.nextActionDate)}` : '';
      const designProjectVision = intake.origin?.sourceSystem === 'signature-exteriors-design' ? intake.origin.sourcePayload?.inquiry?.projectVision : '';
      const focusedByNotification = intakeNotificationFocus?.entityId === intake.id;
      const timeline = intake.history?.length ? `<details class="intake-history" ${focusedByNotification ? 'open' : ''}><summary>Timeline · ${intake.history.length}</summary><ol>${intake.history.slice().reverse().map(item => `<li class="${focusedByNotification && window.notificationDetailMatches?.(intakeNotificationFocus, item.detail) ? 'notification-change-highlight' : ''}"><span class="intake-event-type">${escapeHtml((item.type || 'update').replaceAll('-', ' '))}</span><span>${escapeHtml(item.detail)}</span><small>${escapeHtml(item.actor)} · ${escapeHtml(new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</small></li>`).join('')}</ol></details>` : '<p class="intake-history-empty">No activity has been logged yet.</p>';
      const companyAction = central ? state.companies.find(item => item.id === intake.companyId)?.status === 'Inactive' ? '<span class="intake-inactive-company">Company portal inactive</span>' : `<button type="button" class="text-button" data-central-intake-company="${escapeHtml(intake.companyId)}">Open ${escapeHtml(intake.companyName || 'company')} portal →</button>` : '';
      const actionButtons = central ? companyAction : `${canEdit ? `<button type="button" class="text-button" data-edit-intake="${escapeHtml(intake.id)}">Edit</button>` : ''}${canEdit && intake.status === 'Closed' ? `<button type="button" class="text-button" data-intake-reopen="${escapeHtml(intake.id)}">Reopen inquiry</button>` : ''}${canEdit && intake.status !== 'Closed' && intake.nextAction && !intake.linkedTaskId ? intake.followUpCompletedAt ? `<button type="button" class="text-button" data-intake-follow-action="reopen" data-intake-id="${escapeHtml(intake.id)}">Reopen follow-up</button>` : `<button type="button" class="text-button" data-intake-follow-action="complete" data-intake-id="${escapeHtml(intake.id)}">Mark follow-up done</button>` : ''}${canManage && intake.status !== 'Closed' && !intake.followUpCompletedAt && !intake.linkedTaskId ? `<button type="button" class="text-button" data-intake-create-task="${escapeHtml(intake.id)}">Create task</button>` : ''}${intake.linkedTaskId ? `<button type="button" class="text-button" data-intake-open-task="${escapeHtml(intake.linkedTaskId)}">Open linked task →</button>` : ''}`;
      const logForm = canEdit && intake.status !== 'Closed' ? `<details class="intake-log-contact"><summary>Log contact or note</summary><form data-intake-event-form="${escapeHtml(intake.id)}"><select name="type" aria-label="Contact method"><option>Call</option><option>Email</option><option>Text</option><option>Meeting</option><option>Note</option></select><textarea name="detail" rows="2" maxlength="2000" required placeholder="What happened or what was discussed?" aria-label="Contact notes"></textarea><button type="submit" class="button button-secondary">Add to timeline</button><div class="form-error" role="alert"></div></form></details>` : '';
      const closure = intake.status === 'Closed' ? `<div class="intake-closure-summary"><strong>${escapeHtml(intake.closureOutcome || 'Outcome not recorded')}</strong>${intake.closureNote ? `<span>${escapeHtml(intake.closureNote)}</span>` : ''}${intake.closedAt ? `<small>Closed ${escapeHtml(new Date(intake.closedAt).toLocaleDateString())}</small>` : ''}</div>` : '';
      const workload = accountingPortal ? `<div class="intake-accounting-meta"><span>Scope · ${escapeHtml(intake.accountingDetails?.monthlyTransactions!==''&&intake.accountingDetails?.monthlyTransactions!=null?`${intake.accountingDetails.monthlyTransactions} tx/mo`:'Volume not entered')}${intake.accountingDetails?.entityCount?` · ${escapeHtml(intake.accountingDetails.entityCount)} entities`:''}</span>${canManage?`<span>Fit · ${escapeHtml(intake.workloadReview?.fitStatus||'Need clarification')}</span><span>Decision · ${escapeHtml(intake.workloadReview?.decision||'Undecided')}</span>`:''}</div>` : '';
      const clientPeople = accountingPortal ? (Array.isArray(intake.accountingDetails?.contacts) && intake.accountingDetails.contacts.length ? intake.accountingDetails.contacts : intake.contactName ? [{ name: intake.contactName, role: 'Primary contact', email: intake.email, phone: intake.phone }] : []) : [];
      const clientPeopleMarkup = clientPeople.length ? `<section class="accounting-intake-contacts"><h5>Company contacts</h5><ul>${clientPeople.map(person => `<li><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role || 'Role not entered')}</small></span><small>${escapeHtml([person.email, person.phone].filter(Boolean).join(' · ') || 'No contact method')}</small></li>`).join('')}</ul></section>` : '';
      const created = intake.createdAt ? `Logged ${formatTaskDate(intake.createdAt.slice(0, 10))} · ${intake.createdByName || 'Team member'}` : '';
      const progress=accountingPortal?accountingIntakeProgress(intake):signaturePortal?(intake.origin?.sourceSystem==='signature-exteriors-design'?signatureDesignIntakeProgress(intake):signatureIntakeProgress(intake)):0;
            const accountingRow=specializedReception?`<details class="accounting-intake-details"${focusedByNotification?' open':''}>
        <summary class="accounting-intake-summary-row" ${canEdit?`data-edit-intake="${escapeHtml(intake.id)}" aria-label="Open inquiry form for ${escapeHtml(intake.organizationName||intake.contactName||'client')}"`:''}>
          <span class="accounting-intake-summary-lead"><strong>${escapeHtml(accountingPortal?(intake.organizationName||intake.contactName||'Unnamed business'):(intake.contactName||'Unnamed property owner'))}</strong><small>${escapeHtml(designProjectVision||intake.requestType||(signaturePortal?'Pool inquiry':'Accounting inquiry'))} · ${escapeHtml(signaturePortal?intake.source:(intake.contactName||'No contact entered'))}${intake.origin?.sourceSystem==='signature-exteriors-design'?' · From Design Portal':''}</small></span>
          <span class="accounting-status-pill intake-status-${intake.status.toLowerCase().replaceAll(' ','-')}">${escapeHtml(intake.statusLabel||intake.status)}</span>
          <span class="accounting-intake-summary-progress"><small><strong aria-label="${progress}% intake details recorded">${progress}%</strong></small><span class="accounting-intake-progress" role="progressbar" aria-label="Intake completeness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></span></span>
          <span class="accounting-intake-summary-next">${intake.nextAction?`<small title="${escapeHtml(intake.nextAction)}">${escapeHtml(intake.nextAction)}</small>`:''}${dueLabel?`<span class="${overdue?'task-overdue':''} ${stateName==='completed'?'intake-follow-up-complete':''}">${escapeHtml(dueLabel)}${stateName==='completed'?' · ✓':''}</span>`:''}</span>
          <span class="accounting-intake-summary-chevron" aria-hidden="true">→</span>
        </summary>
        <div class="accounting-intake-expanded">
          <div class="accounting-intake-expanded-grid">
            <div><span class="accounting-intake-detail-label">${signaturePortal?'Property owner / contact':'Contact'}</span><strong>${escapeHtml(intake.contactName||'Not entered')}</strong><small>${contact==='No contact details'?'No contact details':contact}</small></div>
            <div><span class="accounting-intake-detail-label">Source · owner</span><strong>${escapeHtml(intake.source)} · ${escapeHtml(intake.assigneeName||'Unassigned')}</strong><small>${escapeHtml(created)}${intake.linkedTaskId?' · Tracked as task':''}</small></div>
            <div class="accounting-intake-expanded-request"><span class="accounting-intake-detail-label">${signaturePortal?'Requested pool work':'Requested accounting work'}</span><p title="${escapeHtml(intake.summary)}">${escapeHtml(intake.summary||'No request summary entered.')}</p><div>${workload}</div></div>
            ${signaturePortal&&intake.origin?.sourceSystem==='signature-exteriors-design'?`<div class="signature-design-origin"><strong>From Signature Exteriors Design Portal</strong><span>Source inquiry ID · ${escapeHtml(intake.origin.sourceRecordId)}</span><small>Received ${escapeHtml(new Date(intake.origin.receivedAt).toLocaleString())}</small></div>`:''}
          </div>
          ${clientPeopleMarkup}
          <div class="accounting-intake-footer"><span>${escapeHtml(intake.nextAction||'No next step recorded')} · ${escapeHtml(dueLabel)}</span><div class="intake-row-actions">${actionButtons}</div></div>
          ${closure}${logForm}${timeline}
        </div>
      </details>`:'';
      if(specializedReception)return `<article class="intake-card accounting-intake-card${focusedByNotification ? ' notification-focus-card' : ''}" data-intake-card="${escapeHtml(intake.id)}">${focusedByNotification ? window.notificationContextMarkup?.(intakeNotificationFocus) || '' : ''}${accountingRow}</article>`;
      return `<article class="intake-card${focusedByNotification ? ' notification-focus-card' : ''}" data-intake-card="${escapeHtml(intake.id)}">${focusedByNotification ? window.notificationContextMarkup?.(intakeNotificationFocus) || '' : ''}<div class="intake-row-person"><span class="intake-source">${central ? `${escapeHtml(intake.companyName || 'Company')} · ` : ''}${escapeHtml(intake.source)}${intake.requestType ? ` · ${escapeHtml(intake.requestType)}` : ''}</span><h4>${escapeHtml(intake.contactName)}</h4><span class="intake-row-contact">${contact}</span></div><p class="intake-row-summary" title="${escapeHtml(intake.summary)}">${escapeHtml(intake.summary)}</p><div class="intake-row-followup"><span class="intake-row-owner">Owner · ${escapeHtml(intake.assigneeName || 'Unassigned')}</span><span class="intake-row-next-step" title="${escapeHtml(intake.nextAction || 'No next step recorded')}">${escapeHtml(intake.nextAction || 'No next step recorded')}</span><span class="intake-row-due ${overdue ? 'task-overdue' : ''} ${stateName === 'completed' ? 'intake-follow-up-complete' : ''}">${escapeHtml(dueLabel)}${stateName === 'completed' ? ' · ✓' : ''}</span></div>${closure}<div class="intake-row-status"><span class="intake-status intake-status-${intake.status.toLowerCase().replaceAll(' ', '-')}">${escapeHtml(intake.statusLabel||intake.status)}</span><span class="intake-created-meta">${escapeHtml(created)}</span><div class="intake-row-actions">${actionButtons}</div></div>${logForm}${timeline}</article>`;
    }).join('') || `<div class="company-workspace-empty intake-filter-empty"><strong>${allIntakes.length ? 'No inquiries match these filters.' : 'No inquiries yet.'}</strong><span>${allIntakes.length ? 'Clear or adjust the filters to see more records.' : 'Record the first call, email, referral, or other request.'}</span>${allIntakes.length ? '<button type="button" class="text-button" data-intake-clear-filters>Clear filters</button>' : ''}</div>`;
    if (intakeNotificationFocus && !central) requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-intake-card]')].find(card => card.dataset.intakeCard === intakeNotificationFocus?.entityId);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('notification-focus-motion');
      setTimeout(() => target.classList.remove('notification-focus-motion'), 2400);
      intakeNotificationFocus = null;
    });
    const heading = central ? 'ASPECT COMPANIES · ALL PORTALS' : company.name;
    const description = central ? 'Cross-company oversight of inquiries, owners, outcomes, and follow-ups. Select a company to work its intake queue.' : accountingPortal ? 'Qualify accounting engagements, capture service scope, and compare timing and estimated effort with team capacity.' : signaturePortal ? 'Capture pool construction, renovation, repair, and maintenance requests, then track each follow-up through completion. New inquiries appear automatically while Reception is open, with a 60-second recovery check if a live update is missed.' : 'Log inquiries, assign an owner, and keep follow-up work moving.';
    const intakeHeading=central?'':(accountingPortal||signaturePortal)?`<div class="accounting-reception-heading"><div><span class="eyebrow">Reception</span><h3>${signaturePortal?'Pool service intake':'Intake'}</h3><p>${escapeHtml(description)}</p></div>${canCreate?'<button type="button" class="button button-primary" id="companyWorkspaceNewIntake">＋ New inquiry</button>':''}</div>`:`<div class="company-module-heading"><div><span class="eyebrow">${escapeHtml(heading)}</span><h3>Reception Intake</h3><p>${escapeHtml(description)}</p></div>${canCreate ? '<button type="button" class="button button-primary" id="companyWorkspaceNewIntake">＋ New inquiry</button>' : ''}</div>`;
    if (central) {
      const filtered = allIntakes.filter(visible);
      const openDrawer = allIntakes.find(item => item.id === centralIntakeDetailId);
      const companyOptions = [...new Map([...state.companies.filter(item => item.parentId).map(item => [item.id, item.name]), ...allIntakes.map(item => [item.companyId, item.companyName || 'Company'])]).entries()].sort((a, b) => a[1].localeCompare(b[1]));
      const dueWithinSeven = allIntakes.filter(item => {
        const offset = item.nextActionDate ? Math.round((Date.parse(`${item.nextActionDate}T12:00:00Z`) - Date.parse(`${intakeToday(item)}T12:00:00Z`)) / 86400000) : null;
        return dueState(item) === 'upcoming' && offset >= 1 && offset <= 7;
      }).length;
      const allSelected = !filters.status && !filters.followUp;
      const statusTabs = `<button type="button" role="tab" aria-selected="${allSelected}" class="${allSelected ? 'is-selected' : ''}" data-intake-clear-status><span>All inquiries</span><strong>${allIntakes.length}</strong></button>${statusCounts.map(([id, label, count]) => `<button type="button" role="tab" aria-selected="${filters.status === id}" class="${filters.status === id ? 'is-selected' : ''}" data-intake-quick-status="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`).join('')}`;
      const companySelect = `<select data-intake-filter="company" aria-label="Filter by company"><option value="">All companies</option>${companyOptions.map(([id, name]) => `<option value="${escapeHtml(id)}" ${filters.company === id ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>`;
      const statusSelect = `<select data-intake-filter="status" aria-label="Filter by status"><option value="">All statuses</option>${statuses.map(item => `<option value="${escapeHtml(item.id)}" ${filters.status === item.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>`;
      const ownerSelect = `<select data-intake-filter="owner" aria-label="Filter by owner"><option value="">All owners</option><option value="unassigned" ${filters.owner === 'unassigned' ? 'selected' : ''}>Unassigned</option>${ownerOptions.map(([id, name]) => `<option value="${escapeHtml(id)}" ${filters.owner === id ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>`;
      const sourceSelect = `<select data-intake-filter="source" aria-label="Filter by source"><option value="">All sources</option>${sourceFilterOptions.map(value => `<option value="${escapeHtml(value)}" ${filters.source === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select>`;
      const requestSelect = `<select data-intake-filter="requestType" aria-label="Filter by request type"><option value="">All request types</option>${requestTypeOptions.map(value => `<option value="${escapeHtml(value)}" ${filters.requestType === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select>`;
      const followUpSelect = `<select data-intake-filter="followUp" aria-label="Filter by follow-up"><option value="">All follow-ups</option><option value="overdue" ${filters.followUp === 'overdue' ? 'selected' : ''}>Overdue</option><option value="today" ${filters.followUp === 'today' ? 'selected' : ''}>Due today</option><option value="next7" ${filters.followUp === 'next7' ? 'selected' : ''}>Next 7 days</option><option value="later" ${filters.followUp === 'later' ? 'selected' : ''}>Later</option><option value="none" ${filters.followUp === 'none' ? 'selected' : ''}>No follow-up</option><option value="handed-off" ${filters.followUp === 'handed-off' ? 'selected' : ''}>Tracked as a task</option><option value="completed" ${filters.followUp === 'completed' ? 'selected' : ''}>Completed</option></select>`;
      const followUpLabel = intake => {
        const due = dueState(intake);
        if (due === 'overdue') return ['Overdue', formatTaskDate(intake.nextActionDate), 'is-overdue'];
        if (due === 'due') return ['Due today', formatTaskDate(intake.nextActionDate), 'is-due'];
        if (due === 'upcoming') return ['Upcoming', formatTaskDate(intake.nextActionDate), 'is-upcoming'];
        if (due === 'handed-off') return ['Tracked as a task', '', 'is-tracked'];
        if (due === 'completed') return ['Completed', intake.nextActionDate ? formatTaskDate(intake.nextActionDate) : '', 'is-complete'];
        if (due === 'closed') return ['Inquiry closed', '', 'is-closed'];
        return ['No follow-up', '', 'is-empty'];
      };
      const rows = filtered.length ? filtered.map(intake => {
        const companyRecord = state.companies.find(item => item.id === intake.companyId);
        const companyName = intake.companyName || companyRecord?.name || 'Company';
        const companyType = [companyRecord?.industry, companyRecord?.location].filter(Boolean).join(' · ') || companyRecord?.type || 'Company portal';
        const [dueTitle, dueDate, dueClass] = followUpLabel(intake);
        const statusLabel = intake.statusLabel || intake.status || 'New';
        const contactName = intake.contactName || 'Unnamed contact';
        const requestSummary = intake.summary || intake.requestType || 'No request details';
        const companyAction = companyRecord?.status === 'Inactive'
          ? '<span class="central-v2-inactive">Company portal inactive</span>'
          : `<button type="button" data-central-intake-company="${escapeHtml(intake.companyId)}">Open ${escapeHtml(companyName)} portal <span aria-hidden="true">→</span></button>`;
        return `<tr class="${intakeNotificationFocus?.entityId === intake.id ? 'has-notification-focus' : ''}">
          <td class="central-v2-contact"><button type="button" class="central-v2-detail-trigger" data-central-intake-detail="${escapeHtml(intake.id)}">${escapeHtml(contactName)}</button>${intake.email ? `<small>${escapeHtml(intake.email)}</small>` : ''}${intake.phone ? `<small>${escapeHtml(intake.phone)}</small>` : ''}</td>
          <td><span class="central-v2-company"><span class="central-v2-company-mark">${escapeHtml(initials(companyName))}</span><span><strong>${escapeHtml(companyName)}</strong><small>${escapeHtml(companyType)}</small></span></span></td>
          <td class="central-v2-request"><button type="button" class="central-v2-detail-trigger" data-central-intake-detail="${escapeHtml(intake.id)}">${escapeHtml(requestSummary)}</button><small>${escapeHtml([intake.source, intake.requestType].filter(Boolean).join(' · ') || 'Request details')}</small></td>
          <td class="central-v2-next-step">${escapeHtml(intake.nextAction || 'No next step recorded')}</td>
          <td><span class="central-v2-owner"><i>${escapeHtml(initials(intake.assigneeName || 'Unassigned'))}</i>${escapeHtml(intake.assigneeName || 'Unassigned')}</span></td>
          <td><span class="central-v2-follow-up ${dueClass}"><strong>${escapeHtml(dueTitle)}</strong>${dueDate ? `<small>${escapeHtml(dueDate)}</small>` : ''}</span></td>
          <td class="central-v2-portal">${companyAction}</td>
        </tr>`;
      }).join('') : `<tr><td colspan="7"><div class="central-v2-empty"><strong>No inquiries match these filters</strong><span>Try changing your search or clearing a filter.</span>${allIntakes.length ? '<button type="button" data-intake-clear-filters>Clear filters</button>' : ''}</div></td></tr>`;
      const activeFilters = Object.entries(filters).some(([key, value]) => key === 'q' || key === 'dateFrom' || key === 'dateTo' ? Boolean(value) : Boolean(value));
      const drawer = openDrawer ? (() => {
        const companyRecord = state.companies.find(item => item.id === openDrawer.companyId);
        const history = openDrawer.history || [];
        const contactDetails = [openDrawer.email, openDrawer.phone].filter(Boolean);
        const drawerCompanyAction = companyRecord?.status === 'Inactive' ? '<span class="central-v2-inactive">Company portal inactive</span>' : `<button type="button" class="button button-primary" data-central-intake-company="${escapeHtml(openDrawer.companyId)}">Open company portal <span aria-hidden="true">→</span></button>`;
        return `<div class="central-v2-drawer-backdrop" data-central-intake-detail-backdrop>
          <aside class="central-v2-drawer" role="dialog" aria-modal="true" aria-labelledby="centralV2DrawerTitle" tabindex="-1">
            <header class="central-v2-drawer-header"><div><span>INQUIRY DETAILS</span><h2 id="centralV2DrawerTitle">${escapeHtml(openDrawer.contactName || 'Unnamed contact')}</h2></div><button type="button" data-central-intake-detail-close aria-label="Close inquiry details">×</button></header>
            <div class="central-v2-drawer-company"><span class="central-v2-company-mark">${escapeHtml(initials(openDrawer.companyName || companyRecord?.name || 'Company'))}</span><span><strong>${escapeHtml(openDrawer.companyName || companyRecord?.name || 'Company')}</strong><small>${escapeHtml([companyRecord?.industry, companyRecord?.location].filter(Boolean).join(' · ') || companyRecord?.type || 'Company portal')}</small></span></div>
            <span class="central-v2-status central-v2-status-${String(openDrawer.status || 'new').toLowerCase().replaceAll(' ', '-')}">${escapeHtml(openDrawer.statusLabel || openDrawer.status || 'New')}</span>
            <section class="central-v2-drawer-section"><span>REQUEST</span><h3>${escapeHtml(openDrawer.requestType || 'General inquiry')}</h3><p>${escapeHtml(openDrawer.summary || 'No request details were entered.')}</p></section>
            <section class="central-v2-drawer-section"><span>CONTACT</span><p>${contactDetails.length ? contactDetails.map((value, index) => index === 0 && openDrawer.email ? `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>` : escapeHtml(value)).join('<br>') : 'No contact details entered.'}</p></section>
            <section class="central-v2-drawer-section"><span>NEXT STEP</span><p>${escapeHtml(openDrawer.nextAction || 'No next step recorded.')}</p></section>
            <div class="central-v2-drawer-facts"><div><span>OWNER</span><strong>${escapeHtml(openDrawer.assigneeName || 'Unassigned')}</strong></div><div><span>FOLLOW-UP</span><strong>${escapeHtml(followUpLabel(openDrawer)[0])}</strong><small>${escapeHtml(openDrawer.nextActionDate ? formatTaskDate(openDrawer.nextActionDate) : 'No date set')}</small></div><div><span>SOURCE</span><strong>${escapeHtml(openDrawer.source || 'Not recorded')}</strong></div><div><span>REQUEST TYPE</span><strong>${escapeHtml(openDrawer.requestType || 'Not recorded')}</strong></div></div>
            <section class="central-v2-drawer-section central-v2-history"><span>ACTIVITY · ${history.length}</span>${history.length ? `<ol>${history.map(item => `<li class="${intakeNotificationFocus?.entityId === openDrawer.id && window.notificationDetailMatches?.(intakeNotificationFocus, item.detail) ? 'notification-change-highlight' : ''}"><b>${escapeHtml((item.type || 'update').replaceAll('-', ' '))}</b><span>${escapeHtml(item.detail)}</span><small>${escapeHtml(item.actor || 'Team member')} · ${escapeHtml(new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</small></li>`).join('')}</ol>` : '<p>No activity has been logged yet.</p>'}</section>
            <footer class="central-v2-drawer-footer"><button type="button" class="button button-secondary" data-central-intake-detail-close>Close details</button>${drawerCompanyAction}</footer>
          </aside>
        </div>`;
      })() : '';
      return `${intakeHeading}
        <section class="central-v2-attention" aria-label="Follow-ups needing attention"><div><h4>Needs attention</h4><p>Inquiries with a follow-up due soon or overdue.</p></div><button type="button" data-intake-quick-follow="overdue" class="central-v2-attention-item is-overdue"><strong>${overdueCount}</strong><span><b>Overdue</b><small>${overdueCount === 1 ? '1 inquiry needs a follow-up' : overdueCount ? `${overdueCount} inquiries need a follow-up` : 'No overdue follow-ups'}</small></span></button><button type="button" data-intake-quick-follow="today" class="central-v2-attention-item is-due"><strong>${dueTodayCount}</strong><span><b>Due today</b><small>Based on each company’s time zone</small></span></button><button type="button" data-intake-quick-follow="next7" class="central-v2-attention-item is-upcoming"><strong>${dueWithinSeven}</strong><span><b>Upcoming</b><small>Next 7 days</small></span></button></section>
        <nav class="central-v2-status-tabs" role="tablist" aria-label="Filter inquiries by status">${statusTabs}</nav>
        <div class="central-v2-filters" aria-label="Search and filter inquiries"><label class="central-v2-search">${window.aspectIcon('search')}<input type="search" value="${escapeHtml(filters.q || '')}" data-intake-filter="q" placeholder="Search contacts, requests, or notes…" aria-label="Search contacts, requests, or notes"></label>${companySelect}${statusSelect}${ownerSelect}${sourceSelect}${requestSelect}<label class="central-v2-date"><span>Follow-up from</span><input type="date" data-intake-filter="dateFrom" value="${escapeHtml(filters.dateFrom || '')}" aria-label="Follow-up from"></label><label class="central-v2-date"><span>Follow-up through</span><input type="date" data-intake-filter="dateTo" value="${escapeHtml(filters.dateTo || '')}" aria-label="Follow-up through"></label>${followUpSelect}<button type="button" class="central-v2-clear" data-intake-clear-filters ${activeFilters ? '' : 'disabled'}>Clear filters</button></div>
        <div class="central-v2-results-heading"><span>${filters.company ? escapeHtml(companyOptions.find(([id]) => id === filters.company)?.[1]?.toUpperCase() || 'COMPANY') : 'ASPECT COMPANIES · ALL PORTALS'}</span><strong>${filtered.length} ${filtered.length === 1 ? 'inquiry' : 'inquiries'}</strong></div>
        <section class="central-v2-list" aria-label="Reception inquiries"><div class="central-v2-table-scroll"><table><thead><tr><th scope="col">Contact</th><th scope="col">Company</th><th scope="col">Request / source</th><th scope="col">Next step</th><th scope="col">Owner</th><th scope="col">Follow-up due</th><th scope="col"><span class="visually-hidden">Company portal</span></th></tr></thead><tbody>${rows}</tbody></table></div><footer><span>Cross-company inquiries from your portal</span><span>Showing ${filtered.length} of ${allIntakes.length}</span></footer></section>${drawer}`;
    }
    return `${intakeHeading}${specializedReception?accountingWorkflow:''}${controls}<div class="intake-list${specializedReception?' accounting-intake-list':''}">${cards}</div>${editor}`;
  }

  function renderCompanyWorkspaceIntake(company) { return renderIntakeQueue(company); }

  function renderCompanyMarketing(company) {
    const intakes = (state.companyIntakes || []).filter(item => item.companyId === company.id);
    if(company.id==='aspect-ventures'){
      return `<div class="company-marketing accounting-reception accounting-reception-page">${renderCompanyWorkspaceIntake(company)}</div>`;
    }
    if(company.id==='aspect-property'){
      return `<div class="company-marketing accounting-reception accounting-reception-page signature-reception-page">${renderCompanyWorkspaceIntake(company)}</div>`;
    }
    const open = intakes.filter(item => item.status !== 'Closed').length;
    const qualified = intakes.filter(item => item.status === 'Qualified').length;
    const due = intakes.filter(item => ['due', 'overdue'].includes(intakeDueState(item))).length;
    const recent = [...intakes].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 5);
    const hideMarketingOverview = company.id === 'aspect-property';
    const selected = hideMarketingOverview || activeMarketingSection === 'reception' ? 'reception' : 'overview';
    const tabs = `<nav class="company-marketing-tabs" role="tablist" aria-label="Marketing sections">${hideMarketingOverview ? '' : `<button type="button" role="tab" id="companyMarketingOverviewTab" aria-controls="companyMarketingContent" aria-selected="${selected === 'overview'}" data-company-marketing-section="overview">Overview</button>`}<button type="button" role="tab" id="companyMarketingReceptionTab" aria-controls="companyMarketingContent" aria-selected="${selected === 'reception'}" data-company-marketing-section="reception">Reception Intake</button></nav>`;
    const overview = `<div class="company-marketing-metrics"><article><span>All inquiries</span><strong>${intakes.length}</strong><small>Recorded for ${escapeHtml(company.name)}</small></article><article><span>Open leads</span><strong>${open}</strong><small>Still being followed up</small></article><article><span>Qualified</span><strong>${qualified}</strong><small>Marked as a potential fit</small></article><article><span>Follow-ups due</span><strong>${due}</strong><small>Due today or overdue</small></article></div><section class="company-marketing-recent"><div class="company-marketing-recent-heading"><div><h4>Recent inquiries</h4><p>New interest captured for this company.</p></div><button type="button" class="button button-secondary" data-company-marketing-section="reception">Open Reception Intake</button></div>${recent.length ? `<div class="company-marketing-leads">${recent.map(item => `<article><span><strong>${escapeHtml(item.contactName || 'Unnamed contact')}</strong><small>${escapeHtml([item.source, item.requestType].filter(Boolean).join(' · ') || 'Inquiry')}</small></span><span class="intake-status intake-status-${escapeHtml(String(item.status || '').toLowerCase().replaceAll(' ', '-'))}">${escapeHtml(item.status || 'New')}</span></article>`).join('')}</div>` : '<div class="company-workspace-empty"><strong>No inquiries yet.</strong><span>Use Reception Intake to record calls, website requests, referrals, and other new business interest.</span></div>'}</section>`;
    const content = selected === 'reception' ? renderCompanyWorkspaceIntake(company) : overview;
    const label = selected === 'reception' ? 'companyMarketingReceptionTab' : 'companyMarketingOverviewTab';
    return `<div class="company-marketing"><div class="company-module-heading company-marketing-heading"><div><span class="eyebrow">${escapeHtml(company.name)} · MARKETING</span><h3>Marketing</h3><p>Track new business interest and follow-up for this company. Reception Intake is the lead capture and follow-up workspace.</p></div>${selected === 'overview' ? '<button type="button" class="button button-primary" data-company-marketing-section="reception">＋ Open Reception Intake</button>' : ''}</div>${tabs}<section class="company-marketing-content" id="companyMarketingContent" role="tabpanel" aria-labelledby="${label}">${content}</section></div>`;
  }

  function renderCentralReceptionIntake() {
    const panel = $('#centralReceptionPanel');
    if (!panel || state.view !== 'intake') return;
    if (state.user?.role !== 'admin' || state.portalCompany?.parentId) { panel.innerHTML = '<p class="company-workspace-error">Central reception oversight requires the Aspect Companies administrator portal.</p>'; return; }
    if (state.centralIntakesLoaded) { panel.innerHTML = renderIntakeQueue(null, { central: true }); return; }
    panel.innerHTML = '<p class="company-workspace-loading">Loading cross-company reception intake…</p>';
    api('/api/reception-intakes').then(intakes => {
      if (state.view !== 'intake') return;
      state.centralIntakes = intakes; state.centralIntakesLoaded = true; state.overviewIntakes = intakes; window.renderOverviewDashboard?.(); window.syncWorkspaceView();
    }).catch(error => { if (state.view === 'intake') panel.innerHTML = `<p class="company-workspace-error">${escapeHtml(error.message)}</p>`; });
  }

  async function reloadCompanyIntakes(company) {
    state.companyIntakes = await api(`/api/companies/${encodeURIComponent(company.id)}/reception-intakes`);
    state.companyIntakesLoadedFor = { ...state.companyIntakesLoadedFor, [company.id]: true };
    if (state.centralIntakesLoaded) { state.centralIntakes = [...state.centralIntakes.filter(item => item.companyId !== company.id), ...state.companyIntakes]; state.overviewIntakes = state.centralIntakes; window.renderOverviewDashboard?.(); }
    await window.refreshActivity();
    renderCompanyWorkspace();
  }

  const SIGNATURE_RECEPTION_REFRESH_INTERVAL_MS = 60_000;
  let signatureReceptionRefreshBusy = false;

  function signatureReceptionFocusReference(panel) {
    const active = document.activeElement;
    if (!active || !panel.contains(active)) return null;
    if (active.matches('input,textarea,select') || active.closest('form')) return { defer: true };

    const control = active.closest('button,summary,a');
    if (!control) return { defer: true };
    if (control.id) return { id: control.id };

    const card = control.closest('[data-intake-card]');
    if (card && control.matches('summary')) {
      return {
        cardId: card.dataset.intakeCard,
        summaryIndex: [...card.querySelectorAll('summary')].indexOf(control),
      };
    }

    const attributeNames = [
      'data-edit-intake', 'data-intake-reopen', 'data-intake-follow-action', 'data-intake-id',
      'data-intake-create-task', 'data-intake-open-task', 'data-intake-clear-filters',
      'data-intake-quick-status', 'data-intake-quick-follow', 'data-intake-my-follow-ups',
      'data-intake-accounting-stage', 'data-intake-accounting-quick',
    ];
    const attributeName = attributeNames.find(name => control.hasAttribute(name));
    if (attributeName) return { cardId: card?.dataset.intakeCard || null, attributeName, value: control.getAttribute(attributeName) };
    return { defer: true };
  }

  async function refreshSignatureReceptionQueue() {
    const company = currentWorkspaceCompany();
    const panel = $('#companyWorkspacePanel');
    if (signatureReceptionRefreshBusy || document.hidden || !state.user || state.view !== 'companyWorkspace'
      || state.activeCompanyWorkspaceTab !== 'intake' || company?.id !== SIGNATURE_ID
      || state.editingIntakeId || !state.companyIntakesLoadedFor?.[SIGNATURE_ID] || !panel || panel.hidden) return;

    let focusReference = signatureReceptionFocusReference(panel);
    if (focusReference?.defer) return;
    signatureReceptionRefreshBusy = true;
    try {
      const latest = await api(`/api/companies/${encodeURIComponent(SIGNATURE_ID)}/reception-intakes`);
      if (document.hidden || state.view !== 'companyWorkspace' || state.activeCompanyWorkspaceTab !== 'intake'
        || state.activeCompanyWorkspaceId !== SIGNATURE_ID || state.editingIntakeId) return;
      focusReference = signatureReceptionFocusReference(panel);
      if (focusReference?.defer) return;

      const current = (state.companyIntakes || []).filter(item => item.companyId === SIGNATURE_ID);
      const fingerprint = items => JSON.stringify(items.map(item => [
        item.id, item.updatedAt, item.status, item.assigneeUserId, item.nextAction, item.nextActionDate,
        item.summary, item.origin?.sourceSystem, item.origin?.sourceRecordId, item.origin?.receivedAt,
      ]));
      if (fingerprint(latest) === fingerprint(current)) return;

      const openDetails = [...panel.querySelectorAll('[data-intake-card] details[open]')].map(detail => {
        const card = detail.closest('[data-intake-card]');
        return card ? { cardId: card.dataset.intakeCard, index: [...card.querySelectorAll('details')].indexOf(detail) } : null;
      }).filter(Boolean);
      const scrollLeft = window.scrollX, scrollTop = window.scrollY;
      state.companyIntakes = [...(state.companyIntakes || []).filter(item => item.companyId !== SIGNATURE_ID), ...latest];
      if (state.centralIntakesLoaded) {
        state.centralIntakes = [...state.centralIntakes.filter(item => item.companyId !== SIGNATURE_ID), ...latest];
        state.overviewIntakes = state.centralIntakes;
        window.renderOverviewDashboard?.();
      }
      renderCompanyWorkspaceShell();
      panel.innerHTML = renderCompanyMarketing(company);

      for (const item of openDetails) {
        const card = panel.querySelector(`[data-intake-card="${CSS.escape(item.cardId)}"]`);
        const detail = card?.querySelectorAll('details')[item.index];
        if (detail) detail.open = true;
      }
      if (focusReference?.id) panel.querySelector(`#${CSS.escape(focusReference.id)}`)?.focus({ preventScroll: true });
      else if (focusReference?.cardId && Number.isInteger(focusReference.summaryIndex)) {
        const card = panel.querySelector(`[data-intake-card="${CSS.escape(focusReference.cardId)}"]`);
        card?.querySelectorAll('summary')[focusReference.summaryIndex]?.focus({ preventScroll: true });
      } else if (focusReference?.attributeName) {
        const scope = focusReference.cardId
          ? `[data-intake-card="${CSS.escape(focusReference.cardId)}"] `
          : '';
        const attribute = focusReference.value === ''
          ? `[${focusReference.attributeName}]`
          : `[${focusReference.attributeName}="${CSS.escape(focusReference.value)}"]`;
        panel.querySelector(`${scope}${attribute}`)?.focus({ preventScroll: true });
      }
      window.scrollTo(scrollLeft, scrollTop);
    } catch {
      // A missed refresh is retried by the next interval without disturbing the open workspace.
    } finally {
      signatureReceptionRefreshBusy = false;
    }
  }

  window.refreshSignatureReceptionQueue = refreshSignatureReceptionQueue;
  window.setInterval(() => { void refreshSignatureReceptionQueue(); }, SIGNATURE_RECEPTION_REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshSignatureReceptionQueue(); });

  function handleIntakeFilterChange(event, central = false) {
    const control = event.target.closest('[data-intake-filter]');
    if (!control || event.type === 'input' && control.dataset.intakeFilter !== 'q') return;
    const scope = central ? 'central' : currentWorkspaceCompany()?.id;
    if (!scope) return;
    state.intakeFilters[scope] ||= {};
    state.intakeFilters[scope][control.dataset.intakeFilter] = control.value;
    const selection = control.dataset.intakeFilter === 'q' ? control.selectionStart : null;
    if (central) renderCentralReceptionIntake(); else renderCompanyWorkspace();
    if (selection !== null) {
      const updated = (central ? $('#centralReceptionPanel') : $('#companyWorkspacePanel'))?.querySelector(`[data-intake-filter="q"]`);
      updated?.focus({ preventScroll: true });
      updated?.setSelectionRange(selection, selection);
    }
  }

  function handleIntakeQuickAction(event, central = false) {
    const button = event.target.closest('[data-intake-clear-filters], [data-intake-clear-status], [data-intake-quick-status], [data-intake-quick-follow], [data-intake-my-follow-ups], [data-intake-accounting-stage], [data-intake-accounting-quick]');
    if (!button) return false;
    const scope = central ? 'central' : currentWorkspaceCompany()?.id;
    if (!scope) return true;
    state.intakeFilters[scope] ||= {};
    const filters = state.intakeFilters[scope];
    if (button.hasAttribute('data-intake-clear-filters')) Object.keys(filters).forEach(key => delete filters[key]);
    if (button.hasAttribute('data-intake-clear-status')) { filters.status = ''; filters.followUp = ''; }
    if (button.dataset.intakeQuickStatus) {
      filters.status = filters.status === button.dataset.intakeQuickStatus ? '' : button.dataset.intakeQuickStatus;
      filters.followUp = '';
      filters.fitStatus = '';
      filters.accountingStage = '';
    }
    if (button.dataset.intakeQuickFollow) {
      filters.followUp = filters.followUp === button.dataset.intakeQuickFollow ? '' : button.dataset.intakeQuickFollow;
      filters.status = '';
      filters.fitStatus = '';
      filters.accountingStage = '';
    }
    if (button.hasAttribute('data-intake-my-follow-ups')) { filters.owner = state.user?.id || ''; filters.followUp = 'due'; filters.status = ''; filters.fitStatus=''; filters.accountingStage=''; filters.mine=false; }
    if(button.dataset.intakeAccountingStage){filters.accountingStage=filters.accountingStage===button.dataset.intakeAccountingStage?'':button.dataset.intakeAccountingStage;filters.status='';filters.followUp='';filters.fitStatus='';filters.mine=false;filters.owner='';}
    if(button.dataset.intakeAccountingQuick){const quick=button.dataset.intakeAccountingQuick;if(quick==='all'){['accountingStage','status','followUp','fitStatus','mine','owner','source','requestType','dateFrom','dateTo'].forEach(key=>delete filters[key]);}else if(quick==='mine'){filters.mine=!filters.mine;filters.accountingStage='';filters.status='';filters.followUp='';filters.fitStatus='';filters.owner='';}else{const follow=quick==='due'?'today':'overdue';filters.followUp=filters.followUp===follow?'':follow;filters.accountingStage='';filters.status='';filters.fitStatus='';filters.mine=false;filters.owner='';}}
    if (central) renderCentralReceptionIntake(); else renderCompanyWorkspace();
    return true;
  }

  async function performIntakeAction(id, action, company) {
    try {
      await api(`/api/reception-intakes/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await reloadCompanyIntakes(company);
      showToast(action === 'reopen' ? 'Inquiry reopened.' : action.endsWith('/complete') ? 'Follow-up marked complete.' : 'Follow-up reopened.');
    } catch (error) { showToast(error.message, 'error'); }
  }

  function renderCompanyWorkspaceNotes(company) {
    const canEdit = canManageCompanyLocal(company.id), notes = state.companyNotes.filter(note => note.companyId === company.id);
    const editor = state.editingCompanyNoteId ? (() => {
      const note = notes.find(item => item.id === state.editingCompanyNoteId), isNew = state.editingCompanyNoteId === 'new';
      return `<form class="company-note-editor" id="companyNoteForm" data-note-id="${isNew ? '' : escapeHtml(note?.id || '')}"><h4>${isNew ? 'New company note' : 'Edit note'}</h4><label class="form-field">Title <span>*</span><input name="title" maxlength="140" required value="${escapeHtml(note?.title || '')}" placeholder="e.g. Weekly operations meeting"></label><label class="form-field">Category<select name="category">${['General', 'Meeting', 'Decision', 'Reference'].map(category => `<option ${category === (note?.category || 'General') ? 'selected' : ''}>${category}</option>`).join('')}</select></label><label class="form-field full-field">Note <span>*</span><textarea name="body" rows="5" maxlength="8000" required placeholder="Capture the context the company team needs.">${escapeHtml(note?.body || '')}</textarea></label><div class="form-error full-field" id="companyNoteError" role="alert"></div><div class="company-note-form-actions full-field"><button type="button" class="button button-secondary" data-cancel-company-note>Cancel</button><button type="submit" class="button button-primary" id="saveCompanyNote">${isNew ? 'Save note' : 'Save changes'}</button></div></form>`;
    })() : '';
    const list = notes.length ? notes.map(note => `<article class="company-note-card"><div class="company-note-card-heading"><span class="note-category">${escapeHtml(note.category)}</span><span>${escapeHtml(new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</span></div><h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.body)}</p><small>Updated by ${escapeHtml(note.updatedByName || note.createdByName || 'Workspace user')}</small>${canEdit ? `<div class="company-note-actions"><button type="button" class="text-button" data-edit-company-note="${escapeHtml(note.id)}">Edit</button><button type="button" class="text-button note-delete" data-delete-company-note="${escapeHtml(note.id)}">Delete</button></div>` : ''}</article>`).join('') : '<p class="company-workspace-empty">No notes have been added for this company yet.</p>';
    return `<div class="company-module-heading"><div><span class="eyebrow">${escapeHtml(company.name)}</span><h3>Company notes</h3><p>Keep meeting notes, decisions, and references together for this company.</p></div>${canEdit ? '<button type="button" class="button button-primary" id="companyWorkspaceNewNote">＋ New note</button>' : ''}</div>${editor}<div class="company-note-list">${list}</div>`;
  }

  function renderCompanyWorkspaceDocuments(company) {
    const canEdit = canManageCompanyLocal(company.id), docs = state.companyDocuments;
    const list = docs.length ? docs.map(doc => `<article class="document-card${state.justUploadedDocumentId===doc.id?' is-new':''}">${window.documentFileIconMarkup(doc.name)}<div class="document-copy"><a href="/api/documents/${encodeURIComponent(doc.id)}/download" class="document-name" download>${escapeHtml(doc.name)}</a><div class="document-meta"><span>${escapeHtml(doc.category)}</span><span>${escapeHtml(formatFileSizeLocal(doc.sizeBytes))}</span><span>${escapeHtml(doc.uploader)}</span><span>${escapeHtml(dateLabel(doc.createdAt))}</span></div>${doc.description ? `<p>${escapeHtml(doc.description)}</p>` : ''}</div>${canEdit ? `<button type="button" class="document-delete" data-workspace-delete-document="${escapeHtml(doc.id)}" aria-label="Delete ${escapeHtml(doc.name)}">×</button>` : ''}</article>`).join('') : '<p class="company-workspace-empty">No documents for this company yet.</p>';
    state.justUploadedDocumentId = null;
    return `<div class="company-module-heading"><div><span class="eyebrow">${escapeHtml(company.name)}</span><h3>Company documents</h3><p>Files are stored privately and only shown to people with company access.</p></div></div><div class="document-list">${list}</div>${canEdit&&state.settings.documentUploads!==false ? `<form class="document-upload company-workspace-upload" id="companyWorkspaceDocumentForm"><div class="form-grid document-upload-fields"><label class="form-field">Choose file <span>*</span><input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.pptx" required><small>PDF, images, text, CSV, Word, Excel, or PowerPoint · up to 10 MB</small></label><label class="form-field">Category <span>*</span><select name="category" required><option>Contracts</option><option>Finance</option><option>Operations</option><option>Compliance</option><option>People</option><option>Other</option></select></label><label class="form-field full-field">Notes<textarea name="description" rows="2" maxlength="500" placeholder="Optional context for your team"></textarea></label></div><div class="form-error" id="companyWorkspaceDocumentError" role="alert"></div><div class="upload-progress" id="workspaceDocumentUploadProgress" role="progressbar" aria-label="Document upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span></span></div><div class="document-upload-actions"><button class="button button-primary" type="submit" id="uploadWorkspaceDocument">Upload document</button></div></form>` : ''}`;
  }

  function formatFileSizeLocal(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function restoreNewTaskButtonToToolbar() {
    const button = $('#newTask');
    const toolbar = document.querySelector('.page-heading .heading-actions');
    if (button && toolbar && !toolbar.contains(button)) toolbar.append(button);
  }

  async function renderCompanyWorkspace() {
    restoreNewTaskButtonToToolbar();
    if (state.user?.role !== 'admin' && state.activeCompanyWorkspaceTab === 'users') state.activeCompanyWorkspaceTab = 'overview';
    const company = renderCompanyWorkspaceShell(), panel = $('#companyWorkspacePanel');
    if (!company || !panel) return;
    const tab = state.activeCompanyWorkspaceTab;
    panel.hidden = tab === 'calendar';
    if (tab === 'calendar') return;
    $('#companyWorkspaceProfile').textContent = 'Company profile';
    panel.setAttribute('aria-labelledby', `${document.body.classList.contains('company-portal-mode') ? 'companyPortalTab' : 'companyTab'}-${tab}`);
    const renderTab = {
      overview: () => renderCompanyOverview(company),
      tasks: () => renderCompanyWorkspaceTasks(company),
      clients: () => '<div class="company-client-directory"><p class="company-workspace-loading">Loading clients…</p></div>',
      intake: () => renderCompanyMarketing(company),
      activity: () => renderCompanyActivity(company),
      users: () => renderCompanyWorkspaceUsers(company)
    }[state.activeCompanyWorkspaceTab] || (() => renderCompanyOverview(company));
    if (tab === 'overview' && !state.companyDashboard) { state.companyDashboard = { loading: true, counts: {}, recentActivity: [] }; panel.innerHTML = '<p class="company-workspace-loading">Loading the company overview…</p>'; }
    else if ((tab === 'intake' && !state.companyIntakesLoadedFor?.[company.id]) || (tab === 'users' && state.companyUsersLoadedFor !== company.id) || (tab === 'activity' && state.companyActivityLoadedFor !== company.id)) panel.innerHTML = `<p class="company-workspace-loading">Loading ${tab === 'intake' ? company.id === 'aspect-ventures' || activeMarketingSection === 'reception' ? 'Reception Intake' : 'Marketing' : tab === 'activity' ? 'company activity' : 'company users'}…</p>`;
    else panel.innerHTML = renderTab();
    if (document.body.classList.contains('company-portal-mode') && tab === 'tasks') {
      const taskHeading = panel.querySelector('.company-module-heading');
      const taskButton = $('#newTask');
      if (taskHeading && taskButton) taskHeading.append(taskButton);
    }
    try {
      if (tab === 'overview' && state.companyDashboard.loading) {
        const overview = await api('/api/company-dashboard');
        if (state.activeCompanyWorkspaceId === company.id && state.activeCompanyWorkspaceTab === tab) { state.companyDashboard = overview; panel.innerHTML = renderCompanyOverview(company); }
      } else if (tab === 'users' && state.user?.role === 'admin' && state.companyUsersLoadedFor !== company.id) {
        const users = await api('/api/company-users');
        if (state.activeCompanyWorkspaceId === company.id && state.activeCompanyWorkspaceTab === tab) { state.companyUsers = users; state.companyUsersLoadedFor = company.id; panel.innerHTML = renderCompanyWorkspaceUsers(company); }
      } else if (tab === 'intake' && !state.companyIntakesLoadedFor?.[company.id]) {
        const requests = [api(`/api/companies/${encodeURIComponent(company.id)}/reception-intakes`),api(`/api/companies/${encodeURIComponent(company.id)}/reception-config`)];
        if (canManageCompanyLocal(company.id)) requests.push(api(`/api/tasks/assignees?companyId=${encodeURIComponent(company.id)}`));
        const [intakes,receptionConfig,assignees=[]] = await Promise.all(requests);
        if (state.activeCompanyWorkspaceId === company.id && state.activeCompanyWorkspaceTab === tab) { state.companyIntakes = intakes; state.companyReceptionConfig={...state.companyReceptionConfig,[company.id]:receptionConfig};state.intakeAssignees = assignees; state.companyIntakesLoadedFor = {...state.companyIntakesLoadedFor,[company.id]:true}; renderCompanyWorkspaceShell(); panel.innerHTML = renderCompanyMarketing(company); }
      } else if (tab === 'activity' && state.companyActivityLoadedFor !== company.id) {
        const activities=await api(`/api/companies/${encodeURIComponent(company.id)}/activities`);
        if(state.activeCompanyWorkspaceId===company.id&&state.activeCompanyWorkspaceTab===tab){state.companyActivities=activities;state.companyActivityLoadedFor=company.id;panel.innerHTML=renderCompanyActivity(company);}
      } else if(tab==='clients') {
        await window.loadCompanyWorkspaceClients?.(company.id,canManageCompanyLocal(company.id));
      }
    } catch (error) {
      if (state.activeCompanyWorkspaceId === company.id && state.activeCompanyWorkspaceTab === tab) { if(tab==='overview')state.companyDashboard={loading:false,counts:{},recentActivity:[]};panel.innerHTML = `<p class="company-workspace-error">${escapeHtml(error.message)}</p>`; }
    }
    if (tab === 'intake') initializeAccountingIntakeForm();
  }

  function rememberIntakeReturnFocus(trigger) {
    const control = trigger?.closest('#companyWorkspaceNewIntake, [data-edit-intake]');
    state.intakeReturnFocus = control?.dataset.editIntake || 'new';
  }

  function focusIntakeReturnTarget() {
    const intakeId = state.intakeReturnFocus;
    state.intakeReturnFocus = null;
    const selector = intakeId && intakeId !== 'new' ? `[data-edit-intake="${CSS.escape(intakeId)}"]` : '#companyWorkspaceNewIntake';
    const target = $('#companyWorkspacePanel')?.querySelector(selector) || $('#companyWorkspacePanel');
    target?.focus({ preventScroll: true });
  }

  function activateAccountingIntakeTab(tabName, focusTab = false) {
    const dialog = $('#receptionIntakeDialog');
    if (!dialog) return;
    state.accountingIntakeTab = tabName;
    const requiredRequestChoice = dialog.querySelector('[name="summary"][type="radio"]');
    if (requiredRequestChoice) requiredRequestChoice.required = tabName === 'client';
    dialog.querySelectorAll('[data-intake-form-tab]').forEach(tab => {
      const selected = tab.dataset.intakeFormTab === tabName;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    dialog.querySelectorAll('[data-intake-form-panel]').forEach(panel => { panel.hidden = panel.dataset.intakeFormPanel !== tabName; });
    updateSignatureDesignSaveAction(dialog.querySelector('#receptionIntakeForm'));
  }

  function updateSignatureDesignSaveAction(form) {
    const dialog=form?.closest('#receptionIntakeDialog'), save=form?.querySelector('#saveReceptionIntake'), close=form?.querySelector('[data-cancel-intake]');
    if(!dialog?.classList.contains('signature-reception-detail')||!save)return;
    const active=state.accountingIntakeTab||'intake';
    const canEditWorkflow=Number(form.dataset.signatureSourceVersion||0)>=4&&['discovery','meetings','handoff'].includes(active);
    const canSave=form.dataset.signatureIntakeEditing==='true'||form.dataset.signatureHasPendingChanges==='true'||canEditWorkflow;
    save.hidden=!canSave; save.textContent=active==='discovery'?'Save discovery':'Save to both portals';
    if(close)close.textContent='Close';
  }

  function updateAccountingIntakeConditionalFields(form) {
    if (!form) return;
    const service = form.querySelector('[name="requestType"]')?.value || '';
    const help = form.querySelector('[name="summary"]:checked')?.value || '';
    const serviceContext = `${service} ${help}`.toLocaleLowerCase();
    const currentBookkeeper = form.querySelector('[name="accountingDetails.priorAccountantStatus"]')?.value || '';
    const show = (selector, visible) => { const field = form.querySelector(selector); if (field) field.hidden = !visible; };
    show('[data-accounting-transfer]', ['Another accountant or bookkeeper','Current','Transitioning'].includes(currentBookkeeper));
    show('[data-accounting-period-range]', /cleanup|catch.?up|sales tax|financial report|one.?time|tax prepar|before ongoing/.test(serviceContext));
    show('[data-accounting-sales-tax]', /sales tax/.test(serviceContext));
    show('[data-accounting-payroll-states]', /payroll/.test(serviceContext));
    const requiredTimeframe = form.querySelector('[name="workloadReview.capacityWindow"]')?.value || '';
    const requiredDateField = form.querySelector('[data-accounting-required-date]');
    if (requiredDateField) {
      const visible = requiredTimeframe === 'Specific due date';
      requiredDateField.hidden = !visible;
      const dateInput = requiredDateField.querySelector('input');
      if (dateInput) dateInput.required = visible;
    }
    const status = form.querySelector('[name="status"]')?.value || '';
    show('[data-accounting-start-checklist]', ['Qualified','Setup in progress'].includes(status));
  }

  function formatReceptionFileSize(size) {
    return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function buildAccountingFilesPanel(content, record) {
    const isPoolIntake = record?.companyId === 'aspect-property' || currentWorkspaceCompany()?.id === 'aspect-property';
    const heading = document.createElement('div'); heading.className = 'accounting-files-heading';
    const title = document.createElement('h4'); title.textContent = isPoolIntake ? 'Pool plans, site photos & files' : 'Files & conversation';
    const description = document.createElement('p'); description.textContent = isPoolIntake ? 'Keep site photos, pool plans, proposals, and other supporting files with this inquiry. Files are private to Signature Exteriors users.' : 'Keep supporting documents with this inquiry. Files are stored privately for users with access to this company.';
    heading.append(title, description); content.appendChild(heading);
    if (!record) {
      const note = document.createElement('p'); note.className = 'intake-history-empty'; note.textContent = 'Save the inquiry first, then open it to add supporting files.'; content.appendChild(note); return;
    }
    const zone = document.createElement('label'); zone.className = 'accounting-intake-upload-zone';
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.pptx'; input.setAttribute('aria-label', 'Upload supporting files'); input.dataset.intakeFileInput = record.id;
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden','true'); icon.textContent = '⇧';
    const prompt = document.createElement('strong'); prompt.textContent = 'Drag and drop files here';
    const browse = document.createElement('span'); browse.textContent = 'or click to browse · up to 10 MB each';
    zone.append(input,icon,prompt,browse); content.appendChild(zone);
    const error = document.createElement('p'); error.className = 'accounting-intake-files-error'; error.setAttribute('role','alert'); error.hidden = true; content.appendChild(error);
    const list = document.createElement('div'); list.className = 'accounting-intake-file-list'; list.setAttribute('aria-live','polite');
    const documents = state.intakeDocuments?.[record.id] || [];
    if (!documents.length) {
      const empty = document.createElement('div'); empty.className = 'accounting-intake-files-empty'; const emptyText = document.createElement('span'); emptyText.textContent = 'No documents yet'; empty.append(emptyText); list.appendChild(empty);
    } else {
      for (const doc of documents) {
        const row = document.createElement('div'); row.className = 'accounting-intake-file-row';
        const fileIcon = document.createElement('span'); fileIcon.className = 'accounting-intake-file-icon'; fileIcon.setAttribute('aria-hidden','true'); fileIcon.textContent = '▤';
        const meta = document.createElement('span'); meta.className = 'accounting-intake-file-meta'; const link = document.createElement('a'); link.href = doc.downloadUrl; link.textContent = doc.name; link.setAttribute('aria-label', `Download ${doc.name}`); const info = document.createElement('small'); info.textContent = `${formatReceptionFileSize(doc.sizeBytes)} · ${doc.uploader || 'Team member'}`; meta.append(link,info); row.append(fileIcon,meta);
        if (canManageCompanyLocal(record.companyId) || doc.uploadedBy === state.user?.id) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'accounting-intake-file-remove'; remove.dataset.intakeDocumentDelete = doc.id; remove.dataset.intakeId = record.id; remove.setAttribute('aria-label', `Remove ${doc.name}`); remove.textContent = '×'; row.appendChild(remove); }
        list.appendChild(row);
      }
    }
    content.appendChild(list);
  }

  function buildSignatureDesignIntakePanel(content, record) {
    const payload = record?.origin?.sourcePayload || {}, contact = payload.contact || {}, inquiry = payload.inquiry || {}, property = inquiry.property || {};
    const sourceRecord = payload.sourceRecord || {};
    const sourcePhase = Array.isArray(sourceRecord.readiness?.phases) ? sourceRecord.readiness.phases.find(item => item?.id === 'INITIAL_CONTACT') : null;
    const title = document.createElement('section'); title.className = 'signature-intake-overview';
    const fallbackPhaseCriteria = [
      { label: 'Contact identity', complete: Boolean(contact.name) },
      { label: 'Contact method', complete: Boolean(contact.email || contact.phone) },
      { label: 'Incoming channel', complete: Boolean(inquiry.sourceChannel || record.source) },
      { label: 'Reception owner', complete: Boolean(sourceRecord.ownerId || record.assigneeUserId) },
      { label: 'Initial next action', complete: Boolean(sourceRecord.nextAction?.trim() && sourceRecord.nextActionDueAt) },
      { label: 'Property identified', complete: Boolean(property.address) },
    ];
    const phaseCriteria = Array.isArray(sourcePhase?.criteria) && sourcePhase.criteria.length
      ? sourcePhase.criteria.map(item => ({ label: item.label, complete: Boolean(item.complete), deferred: Boolean(item.deferred) }))
      : fallbackPhaseCriteria;
    const phaseDone = phaseCriteria.filter(item => item.complete).length;
    const phaseStatus = phaseCriteria.every(item => item.complete) ? 'Complete' : 'In progress';
    const phase = document.createElement('details'); phase.className = 'signature-intake-phase';
    const phaseSummary = document.createElement('summary');
    const phaseCopy = document.createElement('span'); phaseCopy.className = 'signature-intake-phase-copy';
    const phaseNumber = document.createElement('small'); phaseNumber.textContent = 'Phase 1 of 4';
    const phaseName = document.createElement('strong'); phaseName.textContent = sourcePhase?.label || 'Initial Contact Made';
    const phaseStatusText = document.createElement('span'); phaseStatusText.textContent = phaseStatus;
    const phaseProgressText = document.createElement('small'); phaseProgressText.textContent = phaseDone + ' of ' + phaseCriteria.length + ' requirements complete';
    phaseCopy.append(phaseNumber, phaseName, phaseStatusText, phaseProgressText);
    const phaseChevron = document.createElement('span'); phaseChevron.className = 'signature-intake-chevron'; phaseChevron.textContent = '⌄';
    phaseSummary.append(phaseCopy, phaseChevron); phase.appendChild(phaseSummary);
    const criteria = document.createElement('div'); criteria.className = 'signature-intake-phase-criteria';
    phaseCriteria.forEach(criterion => {
      const item = document.createElement('span'); item.className = criterion.complete ? 'is-complete' : '';
      item.textContent = (criterion.complete ? '✓ ' : '○ ') + criterion.label + (criterion.deferred ? ' · deferred' : ''); criteria.appendChild(item);
    });
    phase.appendChild(criteria); title.appendChild(phase);
    const readinessCriteria = Array.isArray(sourceRecord.readiness?.criteria) ? sourceRecord.readiness.criteria : null;
    const savedCriterionStates = Array.isArray(sourceRecord.criterionStates) ? sourceRecord.criterionStates : [];
    const reviewItems = readinessCriteria
      ? readinessCriteria.filter(item => item?.answerState === 'NEEDS_REVIEW' || (item?.answerState === 'UNKNOWN' && ['MUST_HAVE_FEATURES', 'INSPIRATION_STATUS'].includes(item.id)))
      : savedCriterionStates.filter(item => item?.answerState === 'NEEDS_REVIEW');
    const reviewCount = reviewItems.length;
    if (reviewCount) {
      const review = document.createElement('details'); review.className = 'signature-intake-review';
      const summary = document.createElement('summary');
      const copy = document.createElement('span'); copy.innerHTML = '<strong>Answer review</strong><small>' + reviewCount + ' item' + (reviewCount === 1 ? '' : 's') + ' need attention before phase readiness.</small>';
      const chevron = document.createElement('span'); chevron.textContent = '⌄'; summary.append(copy,chevron); review.appendChild(summary);
      const note = document.createElement('p'); note.textContent = 'Open Pre-design discovery to review answers flagged by the Design team.'; review.appendChild(note); title.appendChild(review);
      const list=document.createElement('ul');list.className='signature-intake-review-list';
      reviewItems.forEach(item=>{const row=document.createElement('li');row.textContent=[item.label||item.criterionId?.replaceAll('_',' '),item.reason].filter(Boolean).join(' · ');list.appendChild(row);});
      if(list.childElementCount)review.appendChild(list);
    }
    content.appendChild(title);

    const handoff = document.createElement('aside'); handoff.className = 'signature-intake-handoff';
    const handoffTitle = document.createElement('strong'); handoffTitle.textContent = 'Aspect Companies handoff';
    const handoffMessage = document.createElement('span'); handoffMessage.textContent = 'Delivered to Signature Exteriors · target intake ' + record.id + '.';
    const handoffMeta = document.createElement('small');
    const received = record.origin?.receivedAt ? new Date(record.origin.receivedAt).toLocaleString() : 'Not recorded';
    handoffMeta.textContent = 'Design revision ' + (record.origin?.syncRevision || payload.sourceRevision || 1) + ' · Last source update ' + (sourceRecord.updatedAt ? new Date(sourceRecord.updatedAt).toLocaleString() : received);
    handoff.append(handoffTitle,handoffMessage,handoffMeta); content.appendChild(handoff);

    const projectHeading = document.createElement('div'); projectHeading.className = 'signature-intake-project-heading';
    const projectIntro = document.createElement('div');
    const projectTitle = document.createElement('h4'); projectTitle.textContent = 'Project information';
    const projectDescription = document.createElement('p'); projectDescription.textContent = 'Capture facts once and build on this record through Design.';
    projectIntro.append(projectTitle,projectDescription);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'signature-intake-edit-button'; edit.dataset.signatureIntakeEdit = '';
    edit.textContent = 'Edit intake'; projectHeading.append(projectIntro,edit); content.appendChild(projectHeading);

    const info = document.createElement('div'); info.className = 'signature-intake-info-grid'; info.dataset.signatureIntakeReadOnly = '';
    const infoRows = [
      ['Client email',contact.email || 'Not captured'],
      ['Project vision',inquiry.projectVision || 'Not captured'],
      ...(inquiry.description?.trim() ? [['Project description',inquiry.description.trim()]] : []),
      ['Objectives',inquiry.objectives || 'Not captured'],
      ['Preliminary scope',inquiry.preliminaryScope || 'Not captured'],
      ['Budget expectation',inquiry.budgetExpectation || 'Not discussed yet','Preliminary'],
      ['Desired timing',inquiry.desiredTiming || 'Not discussed yet','Preliminary'],
      ['Source / referral',[inquiry.sourceChannel || record.source || 'Not captured',inquiry.referralName].filter(Boolean).join(' · ')],
    ];
    infoRows.forEach(([label,value,badge]) => {
      const card = document.createElement('article'); card.className = 'signature-intake-info-card';
      const head = document.createElement('span'); head.textContent = label;
      if (badge) { const tag = document.createElement('small'); tag.textContent = badge; head.appendChild(tag); }
      const detail = document.createElement('strong'); detail.textContent = value; card.append(head,detail); info.appendChild(card);
    });
    content.appendChild(info);

    const editor = document.createElement('section'); editor.className = 'signature-design-intake-editor'; editor.dataset.signatureIntakeEditor = ''; editor.hidden = true;
    const editorIntro = document.createElement('p'); editorIntro.className = 'signature-design-panel-intro'; editorIntro.textContent = 'Changes are sent to Signature Design and return here after the source portal confirms the update.'; editor.appendChild(editorIntro);
    const grid = document.createElement('div'); grid.className = 'signature-design-edit-grid';
    const addField = (labelText,key,value,{multiline=false,maxLength=5000}={}) => {
      const wrapper=document.createElement('label'); wrapper.className='form-field'; wrapper.textContent=labelText;
      const control=document.createElement(multiline?'textarea':'input'); if(!multiline)control.type='text'; else control.rows=3;
      control.maxLength=maxLength; control.value=value==null?'':String(value); control.dataset.signatureDesignField=key; wrapper.appendChild(control); return wrapper;
    };
    const addSelect = (labelText,key,value,options) => {
      const wrapper=document.createElement('label'); wrapper.className='form-field'; wrapper.textContent=labelText;
      const control=document.createElement('select'); control.dataset.signatureDesignField=key;
      [...new Set([value,...options].filter(Boolean))].forEach(item=>{const option=document.createElement('option');option.value=item;option.textContent=item;control.appendChild(option);});
      control.value=value || options[options.length-1]; wrapper.appendChild(control); return wrapper;
    };
    const contactHeading=document.createElement('h4');contactHeading.className='full-field';contactHeading.textContent='Contact and project';grid.appendChild(contactHeading);
    grid.append(addField('Contact name','contact.name',contact.name,{maxLength:160}),addField('Company','contact.company',contact.company,{maxLength:200}),addField('Email','contact.email',contact.email,{maxLength:200}),addField('Phone','contact.phone',contact.phone,{maxLength:60}));
    grid.append(addSelect('Source channel','inquiry.sourceChannel',inquiry.sourceChannel,['PHONE','SMS','EMAIL','WEBSITE','REFERRAL','WALK_IN','OTHER']));
    grid.append(addSelect('Project vision','inquiry.projectVision',inquiry.projectVision,['New pool','Pool remodel','Spa addition','Outdoor living area','Pool and outdoor living','Water feature','Landscape project','Repair or renovation','Other / needs discussion']));
    grid.append(addField('Referral name','inquiry.referralName',inquiry.referralName,{maxLength:200}),addField('Project description','inquiry.description',inquiry.description,{multiline:true}),addField('Objectives','inquiry.objectives',inquiry.objectives,{multiline:true}),addField('Preliminary scope','inquiry.preliminaryScope',inquiry.preliminaryScope,{multiline:true}),addField('Design inspirations','inquiry.designInspirations',inquiry.designInspirations,{multiline:true}),addField('Budget expectation','inquiry.budgetExpectation',inquiry.budgetExpectation,{maxLength:500}),addField('Desired timing','inquiry.desiredTiming',inquiry.desiredTiming,{maxLength:500}));
    const propertyHeading=document.createElement('h4');propertyHeading.className='full-field';propertyHeading.textContent='Property';grid.appendChild(propertyHeading);
    const noPropertyLabel=document.createElement('label');noPropertyLabel.className='full-field signature-design-no-property';
    const noProperty=document.createElement('input');noProperty.type='checkbox';noProperty.dataset.signatureDesignNoProperty='';noProperty.checked=!property.address;
    noPropertyLabel.append(noProperty,document.createTextNode(' No property address recorded'));grid.appendChild(noPropertyLabel);
    for(const [label,key,max] of [['Street address','address',300],['City','city',100],['State','state',50],['Postal code','postalCode',20],['Jurisdiction','jurisdiction',150],['HOA / community','hoaName',150]]){
      const wrapped=addField(label,'inquiry.property.'+key,property[key],{maxLength:max});wrapped.dataset.signatureDesignPropertyField='';
      const control=wrapped.querySelector('[data-signature-design-field]');control.disabled=noProperty.checked;grid.appendChild(wrapped);
    }
    noProperty.addEventListener('change',()=>grid.querySelectorAll('[data-signature-design-property-field] input').forEach(control=>{control.disabled=noProperty.checked;}));
    const projectVision=grid.querySelector('[data-signature-design-field="inquiry.projectVision"]'),description=grid.querySelector('[data-signature-design-field="inquiry.description"]');
    const updateDescription=()=>{if(description)description.disabled=projectVision?.value!=='Other / needs discussion';};projectVision?.addEventListener('change',updateDescription);updateDescription();
    editor.appendChild(grid); content.appendChild(editor);
    edit.addEventListener('click',()=>{
      const editing=editor.hidden; editor.hidden=!editing; info.hidden=editing; edit.textContent=editing?'Done editing intake':'Edit intake';
      const form=content.closest('form'); if(form){form.dataset.signatureIntakeEditing='true'; updateSignatureDesignSaveAction(form);}
      if(editing)editor.querySelector('input:not([type="checkbox"]),select,textarea')?.focus({preventScroll:true});
    });
    buildSignatureDesignAdvancedFields(content.closest('form')?.querySelector('[data-intake-form-panel="handoff"] .intake-form-grid'),record);
  }

  function buildSignatureDesignAdvancedFields(content,record) {
    if(!content)return;
    const sourceRecord=record?.origin?.sourcePayload?.sourceRecord||{};
    const groups=[
      ['Qualification and disposition',['qualificationStatus','ownerName','nextAction','nextActionDueAt','declineReason','clientDisposition','clientDispositionComment','clientDispositionSource','clientDispositionAt','clientDispositionRecordedByName','clientDispositionClientUserName','clientDispositionReviewStatus','clientDispositionReviewedAt','clientDispositionReviewedByName','convertedAt']],
      ['ROM and proposal',['romAmount','romStatus','romDecisionAt','romApprovedBy','proposalNarrative','romProposalDetails','proposalProvidedAt','proposalClientResponse','romPreviewSnapshot','romPreviewHash','romPreviewRevision','romPreviewSavedAt']],
      ['Design agreement',['designAgreementStatus','designAgreementAcceptedAt','designAgreementAcceptedBy']],
      ['Handoff',['handoffSummary','handoffApprovedAt','handoffApprovedBy']],
      ['Compliance',['complianceVerificationStatus','complianceVerificationCheckedAt','complianceVerificationSource','complianceVerificationCategories','complianceVerificationLinks','complianceVerificationReviewedBy','complianceVerificationReviewedAt','complianceVerificationNotes','complianceResearchJobs','savedComplianceLinks']],
      ['Site assessment',['siteAssessment']],
      ['Work items',['workItems']],['Qualification criteria',['criterionStates']],['Linked project and phases',['project']],['Design record metadata',['createdAt','updatedAt','intakeRevision','legacyReviewStatus']],
    ];
    const labelFor=value=>value.replace(/([A-Z])/g,' $1').replace(/^./,char=>char.toUpperCase());
    const jsonFields=new Set(['romPreviewSnapshot','complianceResearchJobs','savedComplianceLinks','workItems','criterionStates','project']);
    const readOnly=new Set(['createdAt','updatedAt','intakeRevision','clientDispositionRecordedByName','clientDispositionClientUserName','clientDispositionReviewedByName','romPreviewSnapshot','romPreviewHash','romPreviewRevision','romPreviewSavedAt']);
    const longFields=new Set(['proposalNarrative','romProposalDetails','handoffSummary','complianceVerificationLinks','complianceVerificationNotes','declineReason','clientDispositionComment','siteAssessment']);
    const asLocalDateTime=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
    const heading=document.createElement('h4');heading.className='signature-design-advanced-heading';heading.textContent='Shared Design workflow details';content.appendChild(heading);
    for(const [title,keys] of groups.filter(([,keys])=>keys.some(key=>Object.hasOwn(sourceRecord,key)))){
      const section=document.createElement('details');section.className='signature-design-record-section';const summary=document.createElement('summary');summary.textContent=title;section.appendChild(summary);
      const grid=document.createElement('div');grid.className='signature-design-edit-grid';
      for(const key of keys){
        const value=sourceRecord[key],wrapper=document.createElement('label');wrapper.className='form-field';wrapper.appendChild(document.createTextNode(labelFor(key)));
        if(readOnly.has(key)){const output=document.createElement('span');output.className='signature-design-readonly-value';output.textContent=value==null||value===''?'Not recorded':typeof value==='string'?value:JSON.stringify(value,null,2);wrapper.appendChild(output);}
        else{let control;if(jsonFields.has(key)){control=document.createElement('textarea');control.rows=7;control.value=JSON.stringify(value,null,2);control.maxLength=900000;control.dataset.signatureDesignSourceJsonField=key;}
          else if(typeof value==='boolean'){control=document.createElement('input');control.type='checkbox';control.checked=value;control.dataset.signatureDesignSourceField=key;}
          else if(typeof value==='number'){control=document.createElement('input');control.type='number';control.step='1';control.value=String(value);control.dataset.signatureDesignSourceField=key;}
          else if(key.endsWith('At')||key.endsWith('Date')){control=document.createElement('input');control.type='datetime-local';control.value=asLocalDateTime(value);control.dataset.signatureDesignSourceField=key;}
          else if(longFields.has(key)){control=document.createElement('textarea');control.rows=3;control.value=value==null?'':String(value);control.maxLength=10000;control.dataset.signatureDesignSourceField=key;}
          else{control=document.createElement('input');control.type='text';control.value=value==null?'':String(value);control.maxLength=5000;control.dataset.signatureDesignSourceField=key;}
          wrapper.appendChild(control);
        }
        grid.appendChild(wrapper);
      }
      section.appendChild(grid);content.appendChild(section);
      if(Number(record?.origin?.sourcePayload?.schemaVersion||0)<4)section.querySelectorAll('[data-signature-design-source-field],[data-signature-design-source-json-field]').forEach(control=>{control.disabled=true;});
    }
  }

  function buildSignatureDesignDiscoveryPanel(content,record) {
    const sourceRecord=record?.origin?.sourcePayload?.sourceRecord||{};
    const stored=sourceRecord.discoveryData&&typeof sourceRecord.discoveryData==='object'&&!Array.isArray(sourceRecord.discoveryData)?sourceRecord.discoveryData:{};
    const root=document.createElement('div');root.className='signature-design-discovery';
    const nav=document.createElement('nav');nav.className='signature-discovery-subtabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Pre-design discovery sections');
    const subtabs=[['questions','Questions'],['community','Community and compliance context'],['calls','Pre-design discovery call tracker'],['survey','Pre-estimate field survey']];
    const bodies={};
    subtabs.forEach(([key,label],index)=>{const button=document.createElement('button');button.type='button';button.dataset.signatureDiscoveryTab=key;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(index===0));button.textContent=label;nav.appendChild(button);const body=document.createElement('section');body.className='signature-discovery-subpanel';body.dataset.signatureDiscoveryPanel=key;body.setAttribute('role','tabpanel');body.hidden=index!==0;bodies[key]=body;root.appendChild(body);});
    root.insertBefore(nav,root.firstChild);
    nav.addEventListener('click',event=>{const button=event.target.closest('[data-signature-discovery-tab]');if(!button)return;nav.querySelectorAll('[data-signature-discovery-tab]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));root.querySelectorAll('[data-signature-discovery-panel]').forEach(panel=>panel.hidden=panel.dataset.signatureDiscoveryPanel!==button.dataset.signatureDiscoveryTab);});

    const questions=bodies.questions;
    const fullSnapshot=Number(record?.origin?.sourcePayload?.schemaVersion||0)>=4;
    const requiredKeys=['projectType','primaryUse','decisionMakers','propertyAccess','siteConditions','utilities','surveyStatus','mustHaveFeatures','budgetRange','targetCompletion'];
    const requiredLabels=['Project type','Primary use','Decision makers','Property access','Site conditions','Utilities','Survey status','Must-have features','Working investment range','Target completion'];
    const completed=requiredKeys.filter(key=>signatureDesignDiscoveryComplete(stored,key,sourceRecord.criterionStates,sourceRecord.readiness?.criteria)).length;
    const progress=document.createElement('p');progress.className='signature-discovery-progress';progress.textContent=completed+' of '+requiredKeys.length+' qualification answers captured';questions.appendChild(progress);
    if(!fullSnapshot){const note=document.createElement('p');note.className='signature-design-panel-intro';note.textContent='This inquiry needs a full Design snapshot before discovery answers can be edited from Reception.';questions.prepend(note);}
    const dataInput=(key)=>{let input=questions.querySelector('[data-signature-design-discovery-field="'+key+'"]');if(!input){input=document.createElement('input');input.type='hidden';input.dataset.signatureDesignDiscoveryField=key;questions.appendChild(input);}return input;};
    const fieldValue=key=>Array.isArray(stored[key])?stored[key].join(', '):stored[key]==null?'':String(stored[key]);
    const select=(parent,label,key,options,required=false)=>{
      const wrapper=document.createElement('label');wrapper.className='signature-discovery-field';const caption=document.createElement('span');caption.className='signature-discovery-label';caption.textContent=label;
      if(required){const flag=document.createElement('span');flag.className='signature-required';flag.textContent='REQUIRED';const alert=document.createElement('span');alert.className='signature-required-icon';alert.textContent='!';caption.append(alert,flag);}
      const control=document.createElement('select');control.dataset.signatureDesignDiscoveryField=key;const prompt=document.createElement('option');prompt.value='';prompt.textContent='Select an answer';control.appendChild(prompt);
      const value=fieldValue(key);[...new Set([...(value&&!options.includes(value)?[value]:[]),...options])].forEach(optionValue=>{const option=document.createElement('option');option.value=optionValue;option.textContent=optionValue;control.appendChild(option);});control.value=value;wrapper.append(caption,control);parent.appendChild(wrapper);
    };
    const chips=(parent,label,key,options,required=false)=>{
      const fieldset=document.createElement('fieldset');fieldset.className='signature-discovery-choices';const legend=document.createElement('legend');legend.className='signature-discovery-label';legend.textContent=label;
      if(required){const flag=document.createElement('span');flag.className='signature-required';flag.textContent='REQUIRED';const alert=document.createElement('span');alert.className='signature-required-icon';alert.textContent='!';legend.append(alert,flag);}
      const hint=document.createElement('p');hint.textContent='Choose all that apply.';const optionsBox=document.createElement('div');optionsBox.className='signature-discovery-chip-list';
      const input=dataInput(key),selected=new Set(fieldValue(key).split(',').map(item=>item.trim()).filter(Boolean));input.value=[...selected].join(', ');
      const values=[...new Set([...options,...selected])];
      const update=()=>{input.value=[...selected].join(', ');const form=content.closest('form');if(form){form.dataset.signatureHasPendingChanges='true';updateSignatureDesignSaveAction(form);}};
      values.forEach(value=>{const button=document.createElement('button');button.type='button';button.className='signature-discovery-chip';button.dataset.value=value;button.setAttribute('aria-pressed',String(selected.has(value)));button.textContent=(selected.has(value)?'✓ ':'+ ')+value;button.addEventListener('click',()=>{if(selected.has(value))selected.delete(value);else selected.add(value);button.setAttribute('aria-pressed',String(selected.has(value)));button.textContent=(selected.has(value)?'✓ ':'+ ')+value;update();});optionsBox.appendChild(button);});
      fieldset.append(legend,hint,optionsBox);parent.appendChild(fieldset);
      const extra=[...selected].filter(value=>!options.includes(value));if(extra.length){const note=document.createElement('p');note.className='signature-discovery-existing';note.textContent='Existing response: '+extra.join(', ');fieldset.appendChild(note);}
    };
    const section=(number,title,description)=>{const fieldset=document.createElement('fieldset');fieldset.className='signature-discovery-section';const legend=document.createElement('legend');legend.innerHTML='<span>'+number+'</span>'+title;const help=document.createElement('p');help.textContent=description;const grid=document.createElement('div');grid.className='signature-discovery-grid';fieldset.append(legend,help,grid);questions.appendChild(fieldset);return grid;};
    let grid=section('1','Project purpose and decision process','Establish what is being built, why it matters, and who can approve decisions.');
    select(grid,'Project type','projectType',['New pool and spa','New pool only','Pool renovation','Outdoor living addition','Not yet determined'],true);
    select(grid,'How will the client primarily use the pool?','primaryUse',['Family recreation','Entertainment','Exercise and wellness','Relaxation','Pool parties and guests','Not sure yet'],true);
    chips(grid,'Who will regularly use the pool?','householdUsers',['Adults','Children','Grandchildren','Pets','Guests','Short-term rental guests']);
    select(grid,'Who are the decision makers and how will approvals happen?','decisionMakers',['Client only','Spouse or partner','Joint family decision','Property owner and representative','Multiple owners','Not decided yet'],true);
    grid=section('2','Property and feasibility','Record known site conditions before Design invests time in a concept.');
    select(grid,'Describe equipment and construction access','propertyAccess',['Easy equipment access','Through side yard','Through home or garage','Crane or special access may be needed','Access needs site review'],true);
    chips(grid,'Known grade, drainage, soil, retaining, or existing-condition concerns','siteConditions',['Flat grade','Sloped grade','Drainage concern','Rock or hard soil concern','Retaining wall concern','Existing pool or structure','No known concerns yet'],true);
    chips(grid,'Utilities, septic, well, easements, or overhead-line constraints','utilities',['City water','Well water','Septic system','Gas service','Overhead power lines','Easement or utility constraint','No known constraints yet'],true);
    select(grid,'HOA or neighborhood requirements','hoaRequirements',['No HOA','HOA approval required','HOA rules need review','Neighborhood requirements only','Not sure yet']);
    select(grid,'Property survey status','surveyStatus',['Current survey available','Survey exists but needs verification','Survey must be ordered','Not applicable'],true);
    grid=section('3','Pool concept and must-haves','Capture the starting design brief without promising final dimensions or selections.');
    select(grid,'Approximate pool size or usable space','poolSize',['Compact / small footprint','Standard backyard pool','Large entertaining pool','Lap or exercise pool','Size not determined yet']);
    chips(grid,'Preferred depths or activities','depthProfile',['Shallow play area','Tanning ledge','Standard deep end','Diving depth','Lap or exercise lanes','Not determined yet']);
    chips(grid,'Style, shape, and visual preferences','stylePreferences',['Modern','Traditional','Natural','Geometric','Freeform','Minimalist','Match existing home','Need design guidance']);
    chips(grid,'Must-have features','mustHaveFeatures',['Spa','Tanning ledge','Baja shelf','Water feature','Fire feature','Swim-up bar','Pool cover','Heating','Automation','Safety cover or fence'],true);
    chips(grid,'Decking, shade, kitchen, landscaping, or other outdoor scope','deckingOutdoorScope',['Concrete decking','Pavers','Covered patio','Shade structure','Outdoor kitchen','Fire pit','Landscaping','Pool lighting','No additional outdoor scope yet']);
    chips(grid,'Equipment, sanitation, automation, or maintenance preferences','equipmentPreferences',['Salt system','Traditional chlorine','Variable-speed pump','Automation controls','In-floor cleaning','Pool cover','Low-maintenance system','Need recommendations']);
    select(grid,'Heating or cooling preference','heatingPreference',['No heating planned','Gas heating','Heat pump','Cooling system','Heating and cooling','Not determined yet']);
    grid=section('4','Budget, schedule, and priorities','Align expectations early and record what should win if tradeoffs are needed.');
    select(grid,'Working investment range','budgetRange',['Under $50,000','$50,000-$75,000','$75,000-$100,000','$100,000-$150,000','$150,000+','Not discussed yet'],true);
    select(grid,'Target completion or event date','targetCompletion',['As soon as possible','Within 3 months','3-6 months','6-12 months','12+ months','Flexible','Not decided yet'],true);
    chips(grid,'Rank the priorities: budget, schedule, features, and finish level','priorityTradeoffs',['Budget','Schedule','Features','Finish level','Low maintenance','Energy efficiency','Resale value']);
    chips(grid,'Known concerns, objections, or deal breakers','knownConcerns',['Budget uncertainty','Schedule uncertainty','Access limitations','HOA approval','Site conditions','Maintenance concerns','No known concerns yet']);
    const note=document.createElement('label');note.className='signature-discovery-field signature-discovery-note';const noteLabel=document.createElement('span');noteLabel.className='signature-discovery-label';noteLabel.textContent='Representative quick note (optional)';const noteInput=document.createElement('input');noteInput.type='text';noteInput.placeholder='Add a brief note';noteInput.maxLength=5000;noteInput.value=fieldValue('representativeNotes');noteInput.dataset.signatureDesignDiscoveryField='representativeNotes';note.append(noteLabel,noteInput);questions.appendChild(note);

    const community=bodies.community,communityTitle=document.createElement('p');communityTitle.className='signature-design-panel-intro';communityTitle.textContent='Record the municipality, community, and compliance references that Design should verify.';community.appendChild(communityTitle);
    const communityGrid=document.createElement('div');communityGrid.className='signature-design-edit-grid';
    [['Municipality / jurisdiction','municipality'],['Community or development','communityDevelopment'],['Sub-community or neighborhood','communitySubcommunity'],['HOA / ARC contact or department link','hoaArcContact'],['Compliance categories to verify','complianceCategories'],['Compliance links','complianceLinks'],['Compliance follow-up status','complianceFollowUpStatus'],['Follow-up owner','complianceFollowUpOwner'],['Follow-up due date','complianceFollowUpDueAt'],['Follow-up action','complianceFollowUpAction']].forEach(([label,key])=>{const wrapper=document.createElement('label');wrapper.className='form-field';wrapper.textContent=label;const control=document.createElement(key==='complianceLinks'?'textarea':'input');if(key==='complianceLinks')control.rows=4;else control.type=key==='complianceFollowUpDueAt'?'datetime-local':'text';control.value=fieldValue(key);control.dataset.signatureDesignDiscoveryField=key;communityGrid.appendChild(wrapper);wrapper.appendChild(control);});
    community.appendChild(communityGrid);
    const calls=bodies.calls,consultations=Array.isArray(sourceRecord.consultations)?sourceRecord.consultations:[];
    const callIntro=document.createElement('p');callIntro.className='signature-design-panel-intro';callIntro.textContent='Pre-design calls and site meetings captured by Signature Design.';calls.appendChild(callIntro);
    const callList=document.createElement('div');callList.className='signature-discovery-meetings';
    consultations.filter(item=>item?.activityType==='DISCOVERY_CALL'||/discovery call|phone call/i.test(item?.title||'')).forEach(item=>{const card=document.createElement('article');card.className='signature-discovery-meeting';const heading=document.createElement('strong');heading.textContent=item.title||'Pre-design discovery call';const meta=document.createElement('small');meta.textContent=[item.date||item.scheduledAt,item.status].filter(Boolean).join(' · ');const outcome=document.createElement('p');outcome.textContent=item.outcome||item.notes||'No outcome recorded';card.append(heading,meta,outcome);callList.appendChild(card);});
    if(!callList.childElementCount){const empty=document.createElement('p');empty.className='intake-history-empty';empty.textContent='No pre-design calls have been recorded yet.';callList.appendChild(empty);}calls.appendChild(callList);
    const survey=bodies.survey,surveyIntro=document.createElement('p');surveyIntro.className='signature-design-panel-intro';surveyIntro.textContent='Record existing field survey observations and site assessment details.';survey.appendChild(surveyIntro);
    if(Object.hasOwn(sourceRecord,'siteAssessment')){const label=document.createElement('label');label.className='form-field';label.textContent='Site assessment notes';const textarea=document.createElement('textarea');textarea.rows=5;textarea.value=sourceRecord.siteAssessment||'';textarea.maxLength=10000;textarea.dataset.signatureDesignSourceField='siteAssessment';label.appendChild(textarea);survey.appendChild(label);}
    if(Object.hasOwn(sourceRecord,'siteAssessmentData')){const advanced=document.createElement('details');advanced.className='signature-design-record-section';const summary=document.createElement('summary');summary.textContent='Structured survey details';advanced.appendChild(summary);const textarea=document.createElement('textarea');textarea.rows=8;textarea.maxLength=900000;textarea.value=JSON.stringify(sourceRecord.siteAssessmentData,null,2);textarea.dataset.signatureDesignSourceJsonField='siteAssessmentData';advanced.appendChild(textarea);survey.appendChild(advanced);}
    if(!Object.hasOwn(sourceRecord,'siteAssessment')&&!Object.hasOwn(sourceRecord,'siteAssessmentData')){const empty=document.createElement('p');empty.className='intake-history-empty';empty.textContent='No pre-estimate field survey has been recorded yet.';survey.appendChild(empty);}
    if(!fullSnapshot)root.querySelectorAll('[data-signature-design-discovery-field],.signature-discovery-chip,[data-signature-design-source-field],[data-signature-design-source-json-field]').forEach(control=>{control.disabled=true;});
    content.appendChild(root);
  }

  function buildSignatureDesignMeetingsPanel(content,record) {
    const sourceRecord=record?.origin?.sourcePayload?.sourceRecord||{},consultations=Array.isArray(sourceRecord.consultations)?sourceRecord.consultations:[];
    const intro=document.createElement('p');intro.className='signature-design-panel-intro';intro.textContent='Site meeting notes and attendance shared from Signature Design.';content.appendChild(intro);
    const meetings=consultations.filter(item=>item?.activityType==='SITE_MEETING'||/site\s+(meeting|visit)|field\s+survey/i.test(item?.title||''));
    const list=document.createElement('div');list.className='signature-discovery-meetings';
    meetings.forEach(item=>{const card=document.createElement('article');card.className='signature-discovery-meeting';const heading=document.createElement('strong');heading.textContent=item.title||'Site meeting';const meta=document.createElement('small');meta.textContent=[item.date||item.scheduledAt,item.status,item.location].filter(Boolean).join(' · ');const participants=document.createElement('p');participants.textContent=item.participants||item.attendees||'';const outcome=document.createElement('p');outcome.textContent=item.outcome||item.notes||'No meeting notes recorded';card.append(heading,meta);if(participants.textContent)card.appendChild(participants);card.appendChild(outcome);list.appendChild(card);});
    if(!meetings.length){const empty=document.createElement('p');empty.className='intake-history-empty';empty.textContent='No site meetings have been recorded yet.';list.appendChild(empty);}content.appendChild(list);
    if(Object.hasOwn(sourceRecord,'consultations')){const advanced=document.createElement('details');advanced.className='signature-design-record-section';const summary=document.createElement('summary');summary.textContent='Edit meeting and call records';advanced.appendChild(summary);const textarea=document.createElement('textarea');textarea.rows=8;textarea.maxLength=900000;textarea.value=JSON.stringify(consultations,null,2);textarea.dataset.signatureDesignSourceJsonField='consultations';advanced.appendChild(textarea);content.appendChild(advanced);}
    if(Number(record?.origin?.sourcePayload?.schemaVersion||0)<4)content.querySelectorAll('[data-signature-design-source-json-field]').forEach(control=>{control.disabled=true;});
  }

  function buildSignatureDesignDetailsPanel(content, record) {
    return buildSignatureDesignIntakePanel(content, record);
  }

  async function saveSignatureDesignInquiry(form, button, company, intakeId) {
    const record = state.companyIntakes.find(item => item.id === intakeId), error = $('#receptionIntakeError');
    if (!record?.origin?.sourceRecordId || !record.origin?.sourcePayload || !Number.isSafeInteger(Number(record.origin.syncRevision))) {
      setError('#receptionIntakeError', 'The Design sync record is incomplete. Refresh the inquiry before saving.'); return;
    }
    const value = key => form.querySelector(`[data-signature-design-field="${CSS.escape(key)}"]`)?.value?.trim() || '';
    const nullable = key => value(key) || null;
    const noProperty = Boolean(form.querySelector('[data-signature-design-no-property]')?.checked);
    const property = noProperty ? null : {
      address:value('inquiry.property.address'), city:value('inquiry.property.city'), state:value('inquiry.property.state'),
      postalCode:value('inquiry.property.postalCode'), jurisdiction:value('inquiry.property.jurisdiction'), hoaName:value('inquiry.property.hoaName'),
    };
    if (!value('contact.name')) { setError('#receptionIntakeError', 'Enter the contact name.'); return; }
    if (!value('contact.email') && !value('contact.phone')) { setError('#receptionIntakeError', 'Enter an email address or phone number.'); return; }
    if (value('contact.email') && !/^\S+@\S+\.\S+$/.test(value('contact.email'))) { setError('#receptionIntakeError', 'Enter a valid contact email address.'); return; }
    if (property && !property.address) { setError('#receptionIntakeError', 'Enter the property street address or select “No property address recorded.”'); return; }
    const projectVision = value('inquiry.projectVision');
    const details = {
      contact:{name:value('contact.name'),company:nullable('contact.company'),email:nullable('contact.email'),phone:nullable('contact.phone')},
      inquiry:{sourceChannel:value('inquiry.sourceChannel'),referralName:nullable('inquiry.referralName'),projectVision,property,
        description:projectVision==='Other / needs discussion'?nullable('inquiry.description'):null,
        objectives:nullable('inquiry.objectives'),preliminaryScope:nullable('inquiry.preliminaryScope'),designInspirations:nullable('inquiry.designInspirations'),
        budgetExpectation:nullable('inquiry.budgetExpectation'),desiredTiming:nullable('inquiry.desiredTiming')},
    };
    const sourceRecord = structuredClone(record.origin.sourcePayload.sourceRecord || {}), sourceVersion = Number(record.origin.sourcePayload.schemaVersion || 0);
    if (sourceVersion >= 4) {
      for (const control of form.querySelectorAll('[data-signature-design-source-json-field]')) {
        const key = control.dataset.signatureDesignSourceJsonField;
        try { sourceRecord[key] = JSON.parse(control.value); }
        catch { setError('#receptionIntakeError', `${key.replace(/([A-Z])/g,' $1')} must contain valid JSON.`); control.focus(); return; }
      }
      const discoveryData = sourceRecord.discoveryData && typeof sourceRecord.discoveryData === 'object' && !Array.isArray(sourceRecord.discoveryData) ? { ...sourceRecord.discoveryData } : {};
      for (const control of form.querySelectorAll('[data-signature-design-discovery-field]')) {
        const key=control.dataset.signatureDesignDiscoveryField;
        discoveryData[key]=String(control.value ?? '').trim();
      }
      sourceRecord.discoveryData=discoveryData;
      for (const control of form.querySelectorAll('[data-signature-design-source-field]')) {
        const key = control.dataset.signatureDesignSourceField, raw = control.type === 'checkbox' ? control.checked : control.value;
        if (control.type === 'checkbox') sourceRecord[key] = raw;
        else if (control.type === 'number') sourceRecord[key] = raw === '' ? null : Number(raw);
        else if (control.type === 'datetime-local') sourceRecord[key] = raw ? new Date(raw).toISOString() : null;
        else sourceRecord[key] = String(raw).trim() || null;
      }
      if (!sourceRecord.qualificationStatus) { setError('#receptionIntakeError', 'Qualification status is required.'); return; }
    }
    button.disabled = true; button.textContent = 'Saving to both portals…'; if (error) error.textContent = '';
    let designSaved = false;
    try {
      await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}/signature-design-details`, { method:'PATCH', body:JSON.stringify({ expectedSourceRevision:Number(record.origin.syncRevision), details, ...(sourceVersion >= 4 ? { sourceRecord } : {}) }) });
      designSaved = true;
      const formData = new FormData(form), workflow = {};
      const currentWorkflow = { status:record.status, assigneeUserId:record.assigneeUserId||'', nextAction:record.nextAction||'', nextActionDate:record.nextActionDate||'', closureOutcome:record.closureOutcome||'', closureNote:record.closureNote||'' };
      for (const key of Object.keys(currentWorkflow)) if (formData.has(key) && String(formData.get(key) ?? '') !== String(currentWorkflow[key] ?? '')) workflow[key] = formData.get(key);
      if (Object.keys(workflow).length) await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}`, { method:'PATCH', body:JSON.stringify(workflow) });
      state.editingIntakeId = null; document.body.classList.remove('intake-modal-open');
      await reloadCompanyIntakes(company); focusIntakeReturnTarget(); showToast('Saved to both portals.');
    } catch (problem) {
      if (designSaved) {
        await reloadCompanyIntakes(company).catch(() => {});
        setError('#receptionIntakeError', `Design details were synchronized, but Aspect follow-up changes were not saved: ${problem.message}`);
      } else setError('#receptionIntakeError', problem.message || 'The shared details could not be saved.');
    } finally { if (button.isConnected) { button.disabled = false; button.textContent = 'Save to both portals'; } }
  }

  function initializeAccountingIntakeForm() {
    const form = $('#receptionIntakeForm'), grid = form?.querySelector(':scope > .intake-form-grid');
    if (!form || !grid || form.dataset.tabbed === 'true') return;
    const signaturePortal = currentWorkspaceCompany()?.id === 'aspect-property';
    const record = state.companyIntakes.find(item => item.id === form.dataset.intakeId);
    const designImported = signaturePortal && record?.origin?.sourceSystem === 'signature-exteriors-design';
    form.noValidate = true;
    if(designImported)form.dataset.signatureSourceVersion=String(record.origin.sourcePayload?.schemaVersion||0);
    const tabNames = designImported ? ['intake','discovery','meetings','files','handoff','history'] : ['client', 'scope', 'review', 'files', 'history'];
    const labels = { client: 'Client', scope: 'Scope', design: 'Design details', review: 'Review', intake:'Intake', discovery:'Pre-design discovery', meetings:'Site Meetings', files:'Files', handoff:'Handoff', history: 'History' };
    const signatureTabIcons = { intake:'user-round', discovery:'clipboard-list', meetings:'calendar-days', files:'file-text', handoff:'send', history:'clock-3' };
    const nav = document.createElement('nav');
    nav.className = 'intake-form-tabs'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Inquiry sections');
    const panels = {};
    for (const tabName of tabNames) {
      const tab = document.createElement('button');
      tab.type = 'button'; tab.className = 'intake-form-tab'; tab.id = `intakeTab${tabName}`;
      tab.setAttribute('role', 'tab'); tab.dataset.intakeFormTab = tabName;
      tab.setAttribute('aria-controls', `intakePanel${tabName}`);
      if (designImported) tab.innerHTML = `${iconMarkup(signatureTabIcons[tabName], 'signature-intake-tab-icon')}<span>${labels[tabName]}</span>`;
      else tab.textContent = labels[tabName];
      nav.appendChild(tab);
      const panel = document.createElement('section');
      panel.className = 'intake-tab-panel'; panel.id = `intakePanel${tabName}`;
      panel.dataset.intakeFormPanel = tabName; panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id); panel.tabIndex = 0;
      const content = document.createElement('div'); content.className = 'intake-form-grid'; panel.appendChild(content);
      panels[tabName] = { panel, content };
    }
    let navigationContainer=nav;
    if(designImported){
      const row=document.createElement('div');row.className='signature-intake-nav-row';row.appendChild(nav);
      const report=document.createElement('button');report.type='button';report.className='signature-intake-report-button';report.innerHTML='<svg class="signature-intake-report-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 17v3h14v-3"></path></svg><span>Download inquiry report</span>';
      report.addEventListener('click',()=>{
        const payload=record?.origin?.sourcePayload||{},sourceRecord=payload.sourceRecord||{},discovery=sourceRecord.discoveryData&&typeof sourceRecord.discoveryData==='object'?sourceRecord.discoveryData:{};
        const lines=['INQUIRY REPORT','',`Contact: ${payload.contact?.name||record.contactName||'Not recorded'}`,`Email: ${payload.contact?.email||record.email||'Not recorded'}`,`Phone: ${payload.contact?.phone||record.phone||'Not recorded'}`,`Project: ${payload.inquiry?.projectVision||record.requestType||'Not recorded'}`,`Property: ${[payload.inquiry?.property?.address,payload.inquiry?.property?.city,payload.inquiry?.property?.state].filter(Boolean).join(', ')||'Not recorded'}`,'',`Project description: ${payload.inquiry?.description||'Not recorded'}`,`Objectives: ${payload.inquiry?.objectives||'Not recorded'}`,`Preliminary scope: ${payload.inquiry?.preliminaryScope||'Not recorded'}`,`Budget expectation: ${payload.inquiry?.budgetExpectation||'Not discussed yet'}`,`Desired timing: ${payload.inquiry?.desiredTiming||'Not discussed yet'}`,'','PRE-DESIGN DISCOVERY',...Object.entries(discovery).map(([key,value])=>`${key.replace(/([A-Z])/g,' $1')}: ${Array.isArray(value)?value.join(', '):value??''}`)];
        const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=(payload.contact?.name||record.contactName||'inquiry').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()+'-inquiry-report.txt';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
      row.appendChild(report);navigationContainer=row;grid.before(row);
    }else grid.before(nav);
    let insertAfter = navigationContainer;
    for (const tabName of tabNames) { insertAfter.after(panels[tabName].panel); insertAfter = panels[tabName].panel; }
    const legacyBookkeeper = grid.querySelector('input[name="accountingDetails.priorAccountantStatus"]');
    legacyBookkeeper?.closest('.form-field')?.remove();
    const clientFields = new Set(['organizationName','contactName','source','email','phone','requestType','summary']);
    for (const child of [...grid.children]) {
      const names = [...child.querySelectorAll('[name]')].map(control => control.name);
      const originalGroup = child.dataset.intakeFormSection || (child.classList.contains('intake-accounting-scope') || names.some(name => name.startsWith('accountingDetails.')) || signaturePortal && names.some(name => ['requestType','summary'].includes(name)) ? 'scope'
        : names.some(name => clientFields.has(name)) ? 'client' : 'review');
      const group = designImported ? (originalGroup === 'review' ? 'handoff' : 'intake') : originalGroup;
      panels[group].content.appendChild(child);
    }
    grid.remove();
    if (designImported) {
      const dialog=$('#receptionIntakeDialog'),heading=dialog?.querySelector('.intake-modal-header'),headerCopy=heading?.querySelector(':scope > div');
      dialog?.classList.add('signature-reception-detail');
      form.dataset.signatureIntakeEditing='false';
      if(headerCopy){
        const payload=record.origin?.sourcePayload||{},contact=payload.contact||{},inquiry=payload.inquiry||{},property=inquiry.property||{},sourceRecord=payload.sourceRecord||{};
        headerCopy.replaceChildren();
        const eyebrow=document.createElement('span');eyebrow.className='eyebrow';eyebrow.textContent='SIGNATURE EXTERIORS · RECEPTION';
        const title=document.createElement('h3');title.id='intakeModalTitle';title.textContent=contact.name||record.contactName||'Inquiry';
        const subtitle=document.createElement('p');
        subtitle.textContent=property.address||property.jurisdiction||[property.city,property.state].filter(Boolean).join(', ')||sourceRecord.project?.name||inquiry.description||inquiry.projectVision||'Signature Design inquiry';
        headerCopy.append(eyebrow,title,subtitle);
      }
      const closeButton=heading?.querySelector('[data-cancel-intake]');if(closeButton){closeButton.classList.add('signature-detail-close');closeButton.setAttribute('aria-label','Close inquiry');}
      form.addEventListener('input',()=>{form.dataset.signatureHasPendingChanges='true';updateSignatureDesignSaveAction(form);});
      form.addEventListener('change',()=>{form.dataset.signatureHasPendingChanges='true';updateSignatureDesignSaveAction(form);});
      for (const name of ['contactName','email','phone','source','requestType','summary']) {
        const control = form.querySelector(`[name="${CSS.escape(name)}"]`);
        if (control) { control.disabled = true; const wrapper=control.closest('.form-field,fieldset'); if(wrapper){wrapper.hidden=true;wrapper.classList.add('signature-design-mirror-field');} }
      }
      buildSignatureDesignDetailsPanel(panels.intake.content, record);
      buildSignatureDesignDiscoveryPanel(panels.discovery.content,record);
      buildSignatureDesignMeetingsPanel(panels.meetings.content,record);
      const canEditLocalReception = canManageCompanyLocal(record.companyId) || record.createdBy === state.user?.id || record.assigneeUserId === state.user?.id;
      if (!canEditLocalReception) {
        const note = document.createElement('p'); note.className = 'signature-design-member-note';
        note.textContent = 'You can edit the shared Design inquiry details. Reception status, assignment, and follow-up stay with authorized managers.';
        panels.handoff.content.prepend(note);
        panels.handoff.content.querySelectorAll('[name="status"],[name="assigneeUserId"],[name="nextAction"],[name="nextActionDate"],[name="closureOutcome"],[name="closureNote"]').forEach(control => { control.disabled = true; });
      }
    }
    buildAccountingFilesPanel(panels.files.content, record);
    if (record) {
      const history = panels.history.content;
      if (signaturePortal && record.origin?.sourceSystem === 'signature-exteriors-design') {
        const origin = document.createElement('section'); origin.className = 'signature-design-origin';
        const title = document.createElement('strong'); title.textContent = 'From Signature Exteriors Design Portal';
        const sourceId = document.createElement('span'); sourceId.textContent = `Source inquiry ID · ${record.origin.sourceRecordId}`;
        const times = document.createElement('small'); times.textContent = `Source created ${new Date(record.origin.sourceCreatedAt).toLocaleString()} · Received ${new Date(record.origin.receivedAt).toLocaleString()}`;
        origin.append(title, sourceId, times); history.appendChild(origin);
      }
      if (record.history?.length) {
        const list = document.createElement('ol'); list.className = 'accounting-intake-history';
        for (const entry of record.history.slice().reverse()) {
          const row = document.createElement('li'), type = document.createElement('span'), detail = document.createElement('strong'), meta = document.createElement('small');
          type.textContent = (entry.type || 'update').replaceAll('-', ' '); detail.textContent = entry.detail || '';
          meta.textContent = `${entry.actor || 'Team member'} · ${new Date(entry.createdAt).toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' })}`;
          row.append(type, detail, meta); list.appendChild(row);
        }
        history.appendChild(list);
      } else {
        const empty = document.createElement('p'); empty.className = 'intake-history-empty'; empty.textContent = 'No history yet.'; history.appendChild(empty);
      }
      const canEdit = canManageCompanyLocal(record.companyId) || record.createdBy === state.user?.id || record.assigneeUserId === state.user?.id;
      if (canEdit && record.status !== 'Closed') {
        const log = document.createElement('div'); log.className = 'accounting-contact-log';
        log.innerHTML = `<label class="form-field">Log contact<select data-intake-event-type="${escapeHtml(record.id)}"><option>Call</option><option>Email</option><option>Text</option><option>Meeting</option><option>Note</option></select></label><label class="form-field">Quick note<textarea data-intake-event-detail="${escapeHtml(record.id)}" rows="2" maxlength="2000" required placeholder="What happened?"></textarea></label><button type="button" class="button button-secondary" data-intake-save-event="${escapeHtml(record.id)}">Add to history</button><div class="form-error" role="alert"></div>`;
        history.appendChild(log);
      }
      const actions = document.createElement('div'); actions.className = 'intake-record-actions'; actions.dataset.intakeFormSection = designImported ? 'handoff' : 'review';
      if (canEdit && record.status === 'Closed') actions.innerHTML += `<button type="button" class="text-button" data-intake-reopen="${escapeHtml(record.id)}">Reopen inquiry</button>`;
      if (canEdit && record.status !== 'Closed' && record.nextAction && !record.linkedTaskId) actions.innerHTML += record.followUpCompletedAt
        ? `<button type="button" class="text-button" data-intake-follow-action="reopen" data-intake-id="${escapeHtml(record.id)}">Reopen follow-up</button>`
        : `<button type="button" class="text-button" data-intake-follow-action="complete" data-intake-id="${escapeHtml(record.id)}">Mark follow-up done</button>`;
      if (canManageCompanyLocal(record.companyId) && record.status !== 'Closed' && !record.followUpCompletedAt && !record.linkedTaskId) actions.innerHTML += `<button type="button" class="text-button" data-intake-create-task="${escapeHtml(record.id)}">Create task</button>`;
      if (record.linkedTaskId) actions.innerHTML += `<button type="button" class="text-button" data-intake-open-task="${escapeHtml(record.linkedTaskId)}">Open linked task</button>`;
      if (actions.childElementCount) panels[designImported ? 'handoff' : 'review'].content.appendChild(actions);
    }
    const replaceInputWithSelect = (name, choices) => {
      const old = form.querySelector(`[name="${CSS.escape(name)}"]`);
      if (!old || old.tagName === 'SELECT') return;
      const value = old.value, select = document.createElement('select'); select.name = name; select.className = old.className;
      const prompt = document.createElement('option'); prompt.value = ''; prompt.textContent = 'Choose'; select.appendChild(prompt);
      if (value && !choices.includes(value)) { const saved = document.createElement('option'); saved.value = value; saved.textContent = `Saved: ${value}`; select.appendChild(saved); }
      for (const choice of choices) { const option = document.createElement('option'); option.value = choice; option.textContent = choice; select.appendChild(option); }
      select.value = value || ''; old.replaceWith(select);
    };
    replaceInputWithSelect('accountingDetails.entityType', ['Sole proprietor','LLC','S corporation','C corporation','Partnership','Nonprofit','Trust','Other']);
    replaceInputWithSelect('accountingDetails.payrollFrequency', ['Weekly','Biweekly','Semimonthly','Monthly','No payroll','Not sure']);
    replaceInputWithSelect('accountingDetails.accountingSoftware', ['QuickBooks Online','QuickBooks Desktop','Xero','FreshBooks','Other','Not sure']);
    replaceInputWithSelect('accountingDetails.payrollProvider', ['QuickBooks Payroll','ADP','Gusto','Paychex','Other','No payroll','Not sure']);
    replaceInputWithSelect('accountingDetails.priorAccountantStatus', ['Owner or internal team','Another accountant or bookkeeper','No one currently','Not sure','Current','Transitioning','No prior accountant']);
    replaceInputWithSelect('accountingDetails.clientResponseTime', ['Within 1 business day','Within 2–3 business days','Within 1 week','Not sure']);
    if (currentWorkspaceCompany()?.id === 'aspect-ventures') replaceInputWithSelect('nextAction', ['Call to clarify scope','Request records','Schedule discovery','Check capacity','Send engagement terms','Refer out','Other']);
    replaceInputWithSelect('workloadReview.capacityWindow', ['This month','Next month','Within 90 days','Specific due date','Not checked']);
    const workCycleSelect = form.querySelector('[name="workloadReview.effortConfidence"]');
    if (workCycleSelect) {
      const workCycleLabel = workCycleSelect.closest('.form-field');
      if (workCycleLabel?.firstChild?.nodeType === Node.TEXT_NODE) workCycleLabel.firstChild.textContent = 'Work Cycle Type ';
      workCycleSelect.name = 'workloadReview.workCycleType';
      const workCycleOptions = ['One-time','Weekly','Biweekly','Monthly','Quarterly','Annually','Seasonal','As needed','Unknown'];
      workCycleSelect.replaceChildren(...workCycleOptions.map(value => { const option = document.createElement('option'); option.value = value; option.textContent = value; option.selected = value === (record?.workloadReview?.workCycleType || 'Unknown'); return option; }));
    }
    const timeframeSelect = form.querySelector('[name="workloadReview.capacityWindow"]');
    if (timeframeSelect) {
      const dateField = document.createElement('label'); dateField.className = 'form-field'; dateField.dataset.accountingRequiredDate = ''; dateField.hidden = true;
      dateField.append(document.createTextNode('Specific due date '));
      const dateInput = document.createElement('input'); dateInput.type = 'date'; dateInput.name = 'workloadReview.requiredTimeframeDate'; dateInput.value = record?.workloadReview?.requiredTimeframeDate || ''; dateField.appendChild(dateInput);
      timeframeSelect.closest('.form-field')?.after(dateField);
    }
    form.querySelector('[name="workloadReview.capacityCheckedPeriod"]')?.closest('.form-field')?.remove();
    replaceInputWithSelect('workloadReview.rationale', ['Scope matches team services','Deadline fits current schedule','Need more scope details','Specialist capacity required','Current workload is full','Outside service offering']);
    replaceInputWithSelect('workloadReview.decisionNotes', ['No additional note','Confirm pricing and terms','Waiting for client information','Revisit at a later start date','Refer to another provider']);
    replaceInputWithSelect('closureNote', ['Completed','Client declined','Outside services','No response','Duplicate inquiry','Referred','Other']);
    const bookkeeperLabel = form.querySelector('[name="accountingDetails.priorAccountantStatus"]')?.closest('.form-field');
    if (bookkeeperLabel?.firstChild?.nodeType === Node.TEXT_NODE) bookkeeperLabel.firstChild.textContent = 'Who currently keeps the books? ';
    syncAccountingPrimaryContact(form);
    form.addEventListener('input', event => {
      if (event.target.matches('[data-client-contact-field]')) syncAccountingPrimaryContact(form);
    });
    form.addEventListener('change', event => {
      if (event.target.matches('[data-client-contact-field="role"]')) syncAccountingPrimaryContact(form);
      if (event.target.matches('[data-primary-client-contact]')) {
        const selected = collectAccountingClientContacts(form).find(contact => contact.id === event.target.value);
        form.querySelector('[data-primary-contact-name]').value = selected?.name || '';
        form.querySelector('[data-primary-contact-email]').value = selected?.email || '';
        form.querySelector('[data-primary-contact-phone]').value = selected?.phone || '';
        event.target.dataset.selectedContactId = selected?.id || '';
      }
    });
    form.addEventListener('click', event => {
      const add = event.target.closest('[data-client-contact-add]');
      if (add) {
        const list = form.querySelector('.accounting-client-contact-list');
        const index = list?.querySelectorAll('[data-client-contact-row]').length || 0;
        if (index >= 25) { showToast('A client can have up to 25 contacts.', 'error'); return; }
        list?.insertAdjacentHTML('beforeend', accountingClientContactMarkup({ id: newAccountingContactId() }, index));
        syncAccountingPrimaryContact(form);
        list?.lastElementChild?.querySelector('[data-client-contact-field="name"]')?.focus();
        return;
      }
      const remove = event.target.closest('[data-client-contact-remove]');
      if (remove) {
        remove.closest('[data-client-contact-row]')?.remove();
        form.querySelectorAll('[data-client-contact-row]').forEach((row, index) => { row.querySelector('.accounting-client-contact-head strong').textContent = `Contact ${index + 1}`; });
        syncAccountingPrimaryContact(form);
      }
    });
    nav.addEventListener('click', event => {
      const tab = event.target.closest('[data-intake-form-tab]');
      if (tab) activateAccountingIntakeTab(tab.dataset.intakeFormTab);
    });
    nav.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const tabs = [...nav.querySelectorAll('[role="tab"]')], current = tabs.indexOf(event.target.closest('[role="tab"]'));
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      activateAccountingIntakeTab(tabs[next].dataset.intakeFormTab, true);
    });
    form.dataset.tabbed = 'true';
    activateAccountingIntakeTab(state.accountingIntakeTab || (designImported ? 'intake' : 'client'));
    updateAccountingIntakeConditionalFields(form);
  }

  async function openIntakeEditor(intakeId, trigger) {
    rememberIntakeReturnFocus(trigger);
    state.editingIntakeId = intakeId;
    const openingRecord=state.companyIntakes.find(item=>item.id===intakeId);
    state.accountingIntakeTab=openingRecord?.origin?.sourceSystem==='signature-exteriors-design'?'intake':'client';
    document.body.classList.add('intake-modal-open');
    await renderCompanyWorkspace();
    if (intakeId !== 'new' && ['aspect-ventures','aspect-property'].includes(currentWorkspaceCompany()?.id)) {
      try { state.intakeDocuments[intakeId] = await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}/documents`); }
      catch (error) { state.intakeDocuments[intakeId] = []; showToast(error.message, 'error'); }
      await renderCompanyWorkspace();
    }
    initializeAccountingIntakeForm();
    $('#receptionIntakeForm [name="contactName"]')?.focus({ preventScroll: true });
  }

  async function readAccountingUpload(file) {
    return new Promise((resolve,reject) => { const reader=new FileReader(); reader.onerror=()=>reject(new Error('This file could not be read.')); reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||''); reader.readAsDataURL(file); });
  }

  async function uploadAccountingIntakeFiles(intakeId, files) {
    const company=currentWorkspaceCompany(),form=$('#receptionIntakeForm'),input=form?.querySelector('[data-intake-file-input]');
    if(!company||!form||!['aspect-ventures','aspect-property'].includes(company.id)||!intakeId)return;
    const error=form.querySelector('.accounting-intake-files-error');if(error){error.hidden=true;error.textContent='';}
    if(input)input.disabled=true;
    let uploaded=0,problem='';
    try {
      for(const file of files){
        if(file.size>10*1024*1024)throw new Error(`${file.name} is over the 10 MB limit.`);
        const content=await readAccountingUpload(file);
        await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}/documents`,{method:'POST',body:JSON.stringify({name:file.name,content})});uploaded++;
      }
    } catch(cause){problem=cause.message||'A file could not be uploaded.';}
    try { state.intakeDocuments[intakeId]=await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}/documents`); await reloadCompanyIntakes(company); }
    catch(cause){problem ||= cause.message||'Uploaded files could not be refreshed.';}
    state.accountingIntakeTab='files';
    if(input?.isConnected)input.value='';
    if(problem){showToast(uploaded?`Uploaded ${uploaded} file${uploaded===1?'':'s'}; ${problem}`:problem,'error');}
    else if(uploaded)showToast(`Uploaded ${uploaded} file${uploaded===1?'':'s'} to the inquiry.`);
  }

  async function closeIntakeEditor() {
    state.editingIntakeId = null;
    document.body.classList.remove('intake-modal-open');
    await renderCompanyWorkspace();
    window.portalLiveUpdatesModalClosed?.();
    focusIntakeReturnTarget();
  }

  document.addEventListener('keydown', async event => {
    const dialog = $('#receptionIntakeDialog');
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      await closeIntakeEditor();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter(item => item.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.loadWorkspace = async function () {
    await window.loadPortalSettings?.();
    const companies = await api('/api/companies');
    state.companies = companies;
    await window.refreshOverviewRecords?.(companies);
    const workItems=await api('/api/work-items');
    state.tasks=workItems.tasks||[];
    state.calendarEvents=workItems.events||[];
    if (state.portalCompany?.parentId) state.activities = [];
    else state.activities = state.user?.role !== 'admin' || state.settings.workspaceActivity === false ? [] : await api('/api/activities');
    render();
  };

  window.refreshWorkItems = async function () {
    const workItems=await api('/api/work-items');
    state.tasks=workItems.tasks||[];
    state.calendarEvents=workItems.events||[];
    renderTasks();
    window.renderOverviewDashboard?.();
    if(state.view==='companyWorkspace'&&state.activeCompanyWorkspaceTab==='tasks')window.syncWorkspaceView();
  };

  window.render = function () {
    renderStats();
    renderOrg();
    renderCompanies();
    renderActivity();
    renderActivityHistory();
    renderTasks();
    window.renderOverviewDashboard?.();
    renderProfileReadiness();
    window.renderPeople?.();
    if (state.view === 'companyWorkspace') renderCompanyWorkspace();
  };

  window.renderPeople = function () {
    const grid=$('#peopleGrid'),filter=$('#peopleCompanyFilter'),count=$('#peopleCount');
    if(!grid||!filter||!count)return;
    const currentFilter=state.peopleCompanyFilter||filter.value;
    filter.innerHTML='<option value="">All accessible companies</option>'+state.companies.map(company=>`<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`).join('');
    if(state.companies.some(company=>company.id===currentFilter)){filter.value=currentFilter;state.peopleCompanyFilter=currentFilter;}else{filter.value='';state.peopleCompanyFilter='';}
    const query=String(state.peopleQuery||'').trim().toLowerCase();
    const results=(state.people||[]).filter(person=>{
      const searchable=[person.name,person.jobTitle,person.roleLabel,person.email,person.phone,person.location,...(Array.isArray(person.companies)?person.companies.map(item=>item.name):[])].filter(Boolean).join(' ').toLowerCase();
      return(!query||searchable.includes(query))&&(!state.peopleCompanyFilter||person.companies==='All companies'||person.companies?.some(item=>item.id===state.peopleCompanyFilter));
    });
    count.textContent=`${results.length} ${results.length===1?'person':'people'}${query||state.peopleCompanyFilter?' found':' in your directory'}`;
    if(!results.length){grid.innerHTML=`<div class="people-empty-card"><span class="people-empty-mark">⌕</span><strong>${state.people?.length?'No matching people':'No people to show yet'}</strong><p>${state.people?.length?'Try a different name, role, or company.':'People appear here when they share access to one of your companies.'}</p></div>`;return;}
    grid.innerHTML=results.map(person=>{
      const companies=person.companies==='All companies'?'<span class="people-company-pill all">All companies</span>':(person.companies||[]).map(item=>`<span class="people-company-pill">${escapeHtml(item.name)} <small>${escapeHtml(item.role)}</small></span>`).join('');
      const contact=[person.email?`<a href="mailto:${encodeURIComponent(person.email)}"><span aria-hidden="true">✉</span>${escapeHtml(person.email)}</a>`:'',person.phone?`<a href="tel:${encodeURIComponent(person.phone)}"><span aria-hidden="true">⌕</span>${escapeHtml(person.phone)}</a>`:'',person.location?`<span><span aria-hidden="true">⌖</span>${escapeHtml(person.location)}</span>`:''].filter(Boolean).join('');
      return `<article class="people-card"><div class="people-card-top"><span class="people-avatar">${escapeHtml(initials(person.name))}</span><span class="people-role-pill">${escapeHtml(person.roleLabel)}</span></div><div class="people-card-identity"><h2>${escapeHtml(person.name)}${person.isSelf?'<span class="people-you-pill">You</span>':''}</h2><p>${escapeHtml(person.jobTitle||'Team member')}</p></div><div class="people-company-list" aria-label="Company access">${companies||'<span class="people-company-pill">No shared company</span>'}</div><div class="people-contact-list">${contact||'<span class="people-private-note">Contact details are private</span>'}</div>${person.isSelf?'<button type="button" class="people-edit-button" data-open-own-profile>Manage your profile <span aria-hidden="true">→</span></button>':'<div class="people-contact-note">Profile visibility follows your directory settings.</div>'}</article>`;
    }).join('');
  };

  window.loadPeople = async function () {
    const grid=$('#peopleGrid');if(grid)grid.innerHTML='<p class="people-empty">Loading people…</p>';
    try{state.people=await api('/api/people');window.renderPeople();}catch(error){if(grid)grid.innerHTML=`<div class="people-empty-card"><strong>People could not be loaded</strong><p>${escapeHtml(error.message)}</p></div>`;}
  };
  let peopleSearchTimer;$('#peopleSearch').addEventListener('input',event=>{state.peopleQuery=event.target.value;clearTimeout(peopleSearchTimer);peopleSearchTimer=window.setTimeout(window.renderPeople,120);});
  $('#peopleCompanyFilter').addEventListener('change',event=>{state.peopleCompanyFilter=event.target.value;window.renderPeople();});
  $('#peopleGrid').addEventListener('click',event=>{if(event.target.closest('[data-open-own-profile]'))window.openAccountSettings?.();});

  window.syncWorkspaceView = function () {
    restoreNewTaskButtonToToolbar();
    const company = currentWorkspaceCompany();
    const isDashboard = state.view === 'overview';
    const isClientProfile = state.view === 'clients' && Boolean(window.isClientProfileOpen?.());
    $('#dashboardContent').hidden = !isDashboard;
    $('#companiesView').hidden = state.view !== 'companies';
    $('#tasksView').hidden = state.view !== 'tasks';
    $('#intakeView').hidden = state.view !== 'intake';
    $('#activityView').hidden = state.view !== 'activity';
    $('#searchView').hidden = state.view !== 'search';
    $('#peopleView').hidden = state.view !== 'people';
    $('#clientsView').hidden = state.view !== 'clients' || isClientProfile;
    $('#clientProfileView').hidden = !isClientProfile;
    $('.page-heading').hidden = isClientProfile;
    $('.heading-actions').hidden = isClientProfile;
    $('#systemDevelopmentView').hidden = state.view !== 'systemDevelopment';
    $('#settingsView').hidden = state.view !== 'settings';
    $('#companyWorkspaceView').hidden = state.view !== 'companyWorkspace';
    const canSeeCentralIntake = state.user?.role === 'admin' && !state.portalCompany?.parentId;
    $('#centralReceptionNav').hidden = !canSeeCentralIntake || state.settings.workspaceReception===false;
    $('#marketingNavLabel').hidden = !canSeeCentralIntake || state.settings.workspaceReception===false;
    const canSeeSystemDevelopment = Boolean(state.user?.canAccessSystemDevelopment && !state.portalCompany?.parentId && state.settings.workspaceSystemDevelopment!==false);
    $('#systemDevelopmentNav').hidden = !canSeeSystemDevelopment;
    $('#systemDevelopmentNavLabel').hidden = !canSeeSystemDevelopment;
    const canSeeAdminSettings=state.user?.role==='admin'&&!state.portalCompany?.parentId;
    $('#adminSettingsNav').hidden=!canSeeAdminSettings;
    $('#portalAdminNavLabel').hidden=!canSeeAdminSettings;
    for(const [view,key] of Object.entries({people:'workspaceTeammates',tasks:'workspaceTasks',activity:'workspaceActivity',calendar:'workspaceCalendar',clients:'workspaceClients'})){const link=$('#primaryNav').querySelector('[data-view="'+view+'"]');if(link)link.hidden=state.settings[key]===false;}
    const canSeeActivity=state.user?.role==='admin';$('#primaryNav').querySelector('[data-view="activity"]').hidden=!canSeeActivity;$('#openActivity').hidden=!canSeeActivity;$('#activityMore').hidden=!canSeeActivity;document.querySelectorAll('[data-view-link="activity"]').forEach(link=>link.hidden=!canSeeActivity);$('.activity-panel').hidden=!canSeeActivity;
    if (canSeeCentralIntake && state.centralIntakesLoaded) {
      const dueCount = state.centralIntakes.filter(item => ['due', 'overdue'].includes(intakeDueState(item))).length;
      $('#receptionNavCount').hidden = !dueCount;
      $('#receptionNavCount').textContent = dueCount > 99 ? '99+' : String(dueCount).padStart(2, '0');
    } else $('#receptionNavCount').hidden = true;
    document.body.classList.toggle('intake-modal-open', state.view === 'companyWorkspace' && state.activeCompanyWorkspaceTab === 'intake' && Boolean(state.editingIntakeId));
    const primaryNav = $('#primaryNav');
    const activeNavigationLink = [...primaryNav.querySelectorAll('.nav-link')].find(link => link.dataset.view === (state.view === 'companyWorkspace' ? 'companies' : state.view));
    primaryNav.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link === activeNavigationLink));
    updatePrimaryNavIndicator(primaryNav);
    const labels = { overview: 'Overview', companies: 'Companies', clients: 'Clients', systemDevelopment: 'Projects', settings:'Portal settings', people: 'Collaborative Team', tasks: 'Current work tasks', intake: 'Reception Intake', activity: 'Activity', search: 'Search', calendar: 'Calendar' };
    $('#breadcrumbCurrent').textContent = state.view === 'companyWorkspace' && company ? company.name : labels[state.view] || 'Overview';
    $('#pageTitle').innerHTML = state.view === 'overview' ? (window.greetingMarkup?.() || `Good morning, ${escapeHtml(state.user?.name.split(' ')[0] || '')} <span class="wave">✳</span>`) : state.view === 'companyWorkspace' && company ? escapeHtml(company.name) : ({ companies: 'Company directory', clients: 'Clients', systemDevelopment: 'Projects', settings:'Portal settings', people: 'Collaborative Team', tasks: 'Current work tasks', intake: 'Reception Intake', activity: 'Workspace activity', search: 'Search results', calendar: 'Company calendar' }[state.view] || 'Overview');
    $('#pageSubtitle').textContent = state.view === 'companyWorkspace' && company ? (state.activeCompanyWorkspaceTab === 'overview' ? 'Today at a glance' : 'Company workspace') : ({ overview: 'Here’s what’s happening across your companies today.', companies: 'Review company profiles and open each company workspace.', clients: 'A company-scoped directory of the people and organizations you serve.', systemDevelopment: 'Ongoing team projects for discussion, shared decisions, files, and follow-up work.', settings:'Application-wide features and operating controls.', people: 'Find team members and see the company workspaces they share with you.', tasks: 'See open tasks and upcoming calendar events across companies you can access.', intake: 'Review inquiries and follow-ups across the Aspect Companies portfolio.', activity: 'The latest updates from your organization.', search: 'Search and filter the records in your accessible workspaces.', calendar: 'Plan team time across company calendars.' }[state.view] || '');
    const pageEyebrowText = $('#pageEyebrowText');
    if (pageEyebrowText) {
      const tabEyebrows = { overview: 'Dashboard', tasks: 'Tasks', clients: 'Clients', intake: 'Reception', calendar: 'Calendar', activity: 'Activity', users: 'User management' };
      const pageEyebrows = { overview: 'Overview', companies: 'Company directory', clients: 'Clients', systemDevelopment: 'Team projects', settings: 'Portal settings', people: 'Team', tasks: 'Tasks', intake: 'Reception', activity: 'Activity', search: 'Search', calendar: 'Calendar' };
      pageEyebrowText.textContent = state.view === 'companyWorkspace'
        ? (tabEyebrows[state.activeCompanyWorkspaceTab] || 'Dashboard')
        : (pageEyebrows[state.view] || 'Company portal');
    }
    if (state.view === 'overview' && !state.portalCompany?.parentId) { $('#pageTitle').textContent = window.overviewPageTitleMarkup?.() || 'Your company portfolio'; $('#pageSubtitle').textContent = 'A clear view of the teams and workspaces you manage.'; }
    if (state.user?.role !== 'admin' && state.activeCompanyWorkspaceTab === 'users') state.activeCompanyWorkspaceTab = 'overview';
    $('#addCompany').hidden = state.view !== 'companies' || state.user?.role !== 'admin';
    $('#manageCompanies').hidden = state.view !== 'overview' || state.user?.role !== 'admin' || Boolean(state.portalCompany?.parentId);
    $('#newTask').hidden = !(state.view === 'tasks' || (state.view === 'companyWorkspace' && state.activeCompanyWorkspaceTab === 'tasks')) || !mayCreateTasks() || (state.view === 'companyWorkspace' && (!company || !canManageCompanyLocal(company.id)));
    $('#manageBackups').hidden = true;
    $('#managePeople').hidden = true;
    if (state.view === 'companies') renderCompanies();
    if (state.view === 'tasks') renderTasks();
    if (state.view === 'activity') renderActivityHistory();
    if (state.view === 'people') window.loadPeople();
    if (state.view === 'clients') window.loadClients?.();
    if (state.view === 'systemDevelopment') window.loadSystemDevelopment?.();
    if (state.view === 'settings') window.renderAdminSettings?.();
    if (state.view === 'companyWorkspace' && company) renderCompanyWorkspace();
    if (state.view === 'intake') renderCentralReceptionIntake();
  };

  window.switchView = function (view) {
    if (view === 'projects') view = 'overview';
    if (view !== 'clients') window.dismissClientProfile?.();
    const featureByView={people:'workspaceTeammates',tasks:'workspaceTasks',activity:'workspaceActivity',calendar:'workspaceCalendar',clients:'workspaceClients',intake:'workspaceReception',systemDevelopment:'workspaceSystemDevelopment'};
    if(view==='activity'&&state.user?.role!=='admin'){showToast('Activity logs are available to portal administrators only.','error');return;}
    if(view==='settings'&&(state.user?.role!=='admin'||state.portalCompany?.parentId)){showToast('Portal settings are available to administrators in the organization portal.','error');return;}
    if(featureByView[view]&&state.settings[featureByView[view]]===false){showToast('This section is turned off in Portal settings.','error');return;}
    if (view === 'intake' && !(state.user?.role === 'admin' && !state.portalCompany?.parentId)) view = 'overview';
    if (view === 'systemDevelopment' && !(state.user?.canAccessSystemDevelopment && !state.portalCompany?.parentId)) view = 'overview';
    state.view = view;
    state.editingIntakeId = null;
    syncWorkspaceView();
    window.closeNavigation(true);
  };

  window.openCompanyWorkspace = function (companyId, workspaceTab = 'overview') {
    if (!state.companies.some(company => company.id === companyId)) { showToast('You do not have access to that company.', 'error'); return; }
    const targetCompany=state.companies.find(company=>company.id===companyId);
    if(targetCompany.parentId&&!document.body.classList.contains('company-portal-mode')){location.assign('/portal/'+encodeURIComponent(targetCompany.slug));return;}
    if(state.activeCompanyWorkspaceId!==companyId){state.companyDashboard=null;state.companyUsersLoadedFor=null;state.companyIntakesLoadedFor={};state.intakeAssignees=[];state.companyUserCredential=null;}
    activeMarketingSection = workspaceTab === 'intake' ? 'reception' : 'overview';
    state.activeCompanyWorkspaceId = companyId;
    state.activeCompanyWorkspaceTab = ['overview','tasks','clients','intake','calendar','activity','users'].includes(workspaceTab) && (workspaceTab !== 'users' && workspaceTab !== 'activity' || state.user?.role === 'admin') ? workspaceTab : 'overview';
    state.editingCompanyNoteId = null;
    state.editingIntakeId = null;
    state.view = 'companyWorkspace';
    window.syncWorkspaceView();
    window.renderOrg?.();
    window.closeNavigation(true);
  };

  window.openCompanyIntakeResult = function (companyId, intakeId, shouldEdit = false, notification = null) {
    const company = state.companies.find(item => item.id === companyId);
    if (!company) { showToast('You do not have access to that inquiry.', 'error'); return; }
    intakeNotificationFocus = notification;
    if (company.parentId && (!document.body.classList.contains('company-portal-mode') || state.portalCompany?.id !== companyId)) {
      try { sessionStorage.setItem('aspectPendingSearchResult', JSON.stringify({ companyId, intakeId, shouldEdit, notification })); } catch {}
      location.assign('/portal/' + encodeURIComponent(company.slug));
      return;
    }
    if (state.activeCompanyWorkspaceId !== companyId) { state.companyDashboard = null; state.companyIntakesLoadedFor = {}; }
    state.intakeFilters[companyId] = {};
    activeMarketingSection = 'reception';
    state.activeCompanyWorkspaceId = companyId;
    state.activeCompanyWorkspaceTab = 'intake';
    state.editingIntakeId = shouldEdit ? intakeId : null;
    state.view = 'companyWorkspace';
    window.syncWorkspaceView();
    window.renderOrg?.();
    window.closeNavigation(true);
  };

  window.addEventListener('portal-workspace-ready', () => {
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem('aspectPendingSearchResult') || 'null'); } catch {}
    if (!pending || pending.companyId !== state.portalCompany?.id) return;
    try { sessionStorage.removeItem('aspectPendingSearchResult'); } catch {}
    window.openCompanyIntakeResult(pending.companyId, pending.intakeId, !!pending.shouldEdit, pending.notification || null);
  });

  $('#companyWorkspaceSelect').addEventListener('change', event => {
    state.activeCompanyWorkspaceId = event.target.value;
    state.activeCompanyWorkspaceTab = 'overview';
    activeMarketingSection = 'overview';
    state.editingCompanyNoteId = null;
    state.editingIntakeId = null;
    window.syncWorkspaceView();
  });
  $('#companyWorkspaceProfile').addEventListener('click', async () => {
    const company = currentWorkspaceCompany();
    if (company) await window.openCompanyDetail(company.id);
  });
  const selectCompanyModule = event => {
    const tab = event.target.closest('[data-company-tab]');
    if (!tab) return;
    if(window.isClientProfileOpen?.()){window.dismissClientProfile?.();state.view='companyWorkspace';}
    if (tab.dataset.companyTab === 'users' && state.user?.role !== 'admin') return;
    if (state.portalCompany?.parentId) state.activeCompanyWorkspaceId = state.portalCompany.id;
    state.view = 'companyWorkspace';
    if (tab.dataset.companyTab === 'intake') activeMarketingSection = 'overview';
    state.activeCompanyWorkspaceTab = tab.dataset.companyTab;
    state.editingCompanyNoteId = null;
    state.editingIntakeId = null;
    window.syncWorkspaceView();
  };
  $('#companyModuleTabs').addEventListener('click', selectCompanyModule);
  $('#companyPortalNavigation').addEventListener('click', selectCompanyModule);
  $('#companyWorkspacePanel').addEventListener('click', async event => {
    const company = currentWorkspaceCompany();
    if (!company) return;
    const deleteIntakeFile = event.target.closest('[data-intake-document-delete]');
    if (deleteIntakeFile) {
      const file=state.intakeDocuments?.[deleteIntakeFile.dataset.intakeId]?.find(item=>item.id===deleteIntakeFile.dataset.intakeDocumentDelete);
      if(!file||!confirm(`Remove ${file.name} from this inquiry? This cannot be undone.`))return;
      try{state.accountingIntakeTab='files';await api(`/api/reception-intakes/${encodeURIComponent(deleteIntakeFile.dataset.intakeId)}/documents/${encodeURIComponent(file.id)}`,{method:'DELETE'});state.intakeDocuments[deleteIntakeFile.dataset.intakeId]=await api(`/api/reception-intakes/${encodeURIComponent(deleteIntakeFile.dataset.intakeId)}/documents`);await reloadCompanyIntakes(company);showToast('Supporting file removed.');}
      catch(error){showToast(error.message,'error');}
      return;
    }
    const marketingSection = event.target.closest('[data-company-marketing-section]');
    if (marketingSection) {
      activeMarketingSection = marketingSection.dataset.companyMarketingSection === 'reception' ? 'reception' : 'overview';
      state.activeCompanyWorkspaceTab = 'intake';
      state.editingCompanyNoteId = null;
      state.editingIntakeId = null;
      window.syncWorkspaceView();
      return;
    }
    if (handleIntakeQuickAction(event)) return;
    const saveIntakeEvent = event.target.closest('[data-intake-save-event]');
    if (saveIntakeEvent) {
      const log = saveIntakeEvent.closest('.accounting-contact-log'), detail = log?.querySelector('[data-intake-event-detail]'), error = log?.querySelector('.form-error');
      if (!detail?.reportValidity()) return;
      saveIntakeEvent.disabled = true; if (error) error.textContent = '';
      try {
        await api(`/api/reception-intakes/${encodeURIComponent(saveIntakeEvent.dataset.intakeSaveEvent)}/events`, { method:'POST', body:JSON.stringify({ type:log.querySelector('[data-intake-event-type]').value, detail:detail.value }) });
        await reloadCompanyIntakes(company); showToast('Contact added to inquiry history.');
      } catch (problem) { if (error) error.textContent = problem.message; saveIntakeEvent.disabled = false; }
      return;
    }
    const followAction = event.target.closest('[data-intake-follow-action]');
    if (followAction) { await performIntakeAction(followAction.dataset.intakeId, `follow-up/${followAction.dataset.intakeFollowAction}`, company); return; }
    const reopenIntake = event.target.closest('[data-intake-reopen]');
    if (reopenIntake) { await performIntakeAction(reopenIntake.dataset.intakeReopen, 'reopen', company); return; }
    const createTaskFromIntake = event.target.closest('[data-intake-create-task]');
    if (createTaskFromIntake) {
      createTaskFromIntake.disabled = true;
      try {
        const result = await api(`/api/reception-intakes/${encodeURIComponent(createTaskFromIntake.dataset.intakeCreateTask)}/create-task`, { method: 'POST', body: JSON.stringify({}) });
        await window.refreshWorkItems();
        await reloadCompanyIntakes(company);
        showToast(`Task created: ${result.task.title}`);
      } catch (error) { showToast(error.message, 'error'); createTaskFromIntake.disabled = false; }
      return;
    }
    const linkedTask = event.target.closest('[data-intake-open-task]');
    if (linkedTask) { await window.openTask(linkedTask.dataset.intakeOpenTask); return; }
    const companyUserAction = event.target.closest('[data-company-user-action]');
    if (companyUserAction) {
      if (state.user?.role !== 'admin') return;
      const targetId=companyUserAction.dataset.companyUserId,target=state.companyUsers.find(person=>person.id===targetId),action=companyUserAction.dataset.companyUserAction;if(!target)return;
      try {
        if(action==='toggle'){
          const active=!target.active;if(!confirm(`${active?'Restore':'Remove'} ${target.name}’s access to ${company.name}?`))return;
          await api(`/api/company-users/${encodeURIComponent(targetId)}`,{method:'PATCH',body:JSON.stringify({active})});showToast(`${target.name}’s company access was ${active?'restored':'removed'}.`);
        }
        state.companyUsers=await api('/api/company-users');state.companyUsersLoadedFor=company.id;await window.refreshActivity();renderCompanyWorkspace();
      }catch(error){showToast(error.message, 'error');}
      return;
    }
    if (event.target.closest('[data-dashboard-add-task]')) { if (canManageCompanyLocal(company.id)) await window.openTaskCreate?.(); return; }
    const weekControl = event.target.closest('[data-dashboard-week]');
    if (weekControl) { dashboardWeekOffset = Math.max(-52, Math.min(52, dashboardWeekOffset + Number(weekControl.dataset.dashboardWeek || 0))); renderCompanyWorkspace(); return; }
    if (event.target.closest('[data-dashboard-activity]')) { if (state.user?.role === 'admin') window.switchView?.('activity'); return; }
    const shortcut = event.target.closest('[data-company-tab-link]');
    if (shortcut) { if (shortcut.dataset.companyTabLink === 'users' && state.user?.role !== 'admin') return; state.activeCompanyWorkspaceTab = shortcut.dataset.companyTabLink; if(shortcut.dataset.companyTabLink==='intake')activeMarketingSection=shortcut.dataset.companyMarketingSection==='overview'?'overview':'reception'; state.editingCompanyNoteId = null; state.editingIntakeId = null;if(shortcut.hasAttribute('data-intake-dashboard-due')){state.intakeFilters[company.id]||={};state.intakeFilters[company.id].followUp='due';} window.syncWorkspaceView(); return; }
    if (event.target.closest('#companyWorkspaceEditProfile')) { await window.openCompanyDetail(company.id); return; }
    if (event.target.closest('#companyWorkspaceNewNote')) { state.editingCompanyNoteId = 'new'; renderCompanyWorkspace(); return; }
    if (event.target.id === 'intakeModalBackdrop') { await closeIntakeEditor(); return; }
    if (event.target.closest('#companyWorkspaceNewIntake')) { await openIntakeEditor('new', event.target); return; }
    if (event.target.closest('[data-cancel-intake]')) { await closeIntakeEditor(); return; }
    const editIntake = event.target.closest('[data-edit-intake]');
    if (editIntake) { event.preventDefault(); await openIntakeEditor(editIntake.dataset.editIntake, editIntake); return; }
    if (event.target.closest('[data-cancel-company-note]')) { state.editingCompanyNoteId = null; renderCompanyWorkspace(); return; }
    const editNote = event.target.closest('[data-edit-company-note]');
    if (editNote) { state.editingCompanyNoteId = editNote.dataset.editCompanyNote; renderCompanyWorkspace(); return; }
    const deleteNote = event.target.closest('[data-delete-company-note]');
    if (deleteNote) {
      const note = state.companyNotes.find(item => item.id === deleteNote.dataset.deleteCompanyNote);
      if (!note || !confirm(`Delete “${note.title}” from ${company.name}? This cannot be undone.`)) return;
      try { await api(`/api/company-notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' }); state.companyNotes = await api(`/api/companies/${encodeURIComponent(company.id)}/notes`); await window.refreshActivity(); renderCompanyWorkspace(); showToast('Company note deleted.'); }
      catch (error) { showToast(error.message, 'error'); }
      return;
    }
    const deleteDocument = event.target.closest('[data-workspace-delete-document]');
    if (deleteDocument) {
      const doc = state.companyDocuments.find(item => item.id === deleteDocument.dataset.workspaceDeleteDocument);
      if (!doc || !confirm(`Delete ${doc.name} from ${company.name}? This cannot be undone.`)) return;
      try { await api(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' }); state.companyDocuments = await api(`/api/companies/${encodeURIComponent(company.id)}/documents`); await window.refreshActivity(); renderCompanyWorkspace(); showToast('Company document deleted.'); }
      catch (error) { showToast(error.message, 'error'); }
      return;
    }
    const task = event.target.closest('[data-workspace-task]');
    if (task) { await window.openTask(task.dataset.workspaceTask); return; }
  });
  $('#companyWorkspacePanel').addEventListener('input', event => handleIntakeFilterChange(event));
  $('#companyWorkspacePanel').addEventListener('change', event => {
    const taskCompletion = event.target.closest('[data-dashboard-task-complete]');
    if (taskCompletion) { if (taskCompletion.checked) void completeDashboardTask(taskCompletion.dataset.dashboardTaskComplete, taskCompletion); return; }
    if(event.target.matches('[data-intake-file-input]')){const input=event.target;void uploadAccountingIntakeFiles(input.dataset.intakeFileInput,[...input.files]);return;}
    if(event.target.closest('#receptionIntakeForm'))updateAccountingIntakeConditionalFields(event.target.closest('#receptionIntakeForm'));
    if (event.target.matches('[data-intake-status]')) {
      const closure = $('#intakeClosureFields'), outcome = $('#intakeClosureOutcome'), closing = event.target.value === 'Closed';
      if (closure) closure.hidden = !closing;
      if (outcome) outcome.required = closing;
    }
    handleIntakeFilterChange(event);
  });
  $('#companyWorkspacePanel').addEventListener('dragover',event=>{if(event.target.closest('.accounting-intake-upload-zone'))event.preventDefault();});
  $('#companyWorkspacePanel').addEventListener('drop',event=>{const zone=event.target.closest('.accounting-intake-upload-zone');if(!zone)return;event.preventDefault();const intakeId=zone.querySelector('[data-intake-file-input]')?.dataset.intakeFileInput;if(intakeId&&event.dataTransfer?.files?.length)void uploadAccountingIntakeFiles(intakeId,[...event.dataTransfer.files]);});
  $('#centralReceptionPanel').addEventListener('click', event => {
    if (handleIntakeQuickAction(event, true)) return;
    const closeDetail = event.target.closest('[data-central-intake-detail-close]');
    const detailBackdrop = event.target.closest('[data-central-intake-detail-backdrop]');
    if (closeDetail || detailBackdrop && event.target === detailBackdrop) {
      const previousId = centralIntakeDetailId;
      centralIntakeDetailId = null;
      renderCentralReceptionIntake();
      [...$('#centralReceptionPanel').querySelectorAll('[data-central-intake-detail]')].find(button => button.dataset.centralIntakeDetail === previousId)?.focus({ preventScroll: true });
      return;
    }
    const detailButton = event.target.closest('[data-central-intake-detail]');
    if (detailButton) {
      centralIntakeDetailId = detailButton.dataset.centralIntakeDetail;
      renderCentralReceptionIntake();
      $('#centralReceptionPanel').querySelector('.central-v2-drawer [data-central-intake-detail-close]')?.focus({ preventScroll: true });
      return;
    }
    const companyLink = event.target.closest('[data-central-intake-company]');
    if (companyLink) window.openCompanyWorkspace(companyLink.dataset.centralIntakeCompany, 'intake');
  });
  $('#centralReceptionPanel').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || centralIntakeDetailId === null) return;
    const previousId = centralIntakeDetailId;
    centralIntakeDetailId = null;
    renderCentralReceptionIntake();
    [...$('#centralReceptionPanel').querySelectorAll('[data-central-intake-detail]')].find(button => button.dataset.centralIntakeDetail === previousId)?.focus({ preventScroll: true });
  });
  $('#centralReceptionPanel').addEventListener('input', event => handleIntakeFilterChange(event, true));
  $('#centralReceptionPanel').addEventListener('change', event => handleIntakeFilterChange(event, true));
  $('#companyWorkspacePanel').addEventListener('submit', async event => {
    const company = currentWorkspaceCompany();
    if (!company) return;
    const contactLog = event.target.closest('[data-intake-event-form]');
    if (contactLog) {
      event.preventDefault();
      const intakeId = contactLog.dataset.intakeEventForm, button = contactLog.querySelector('button[type="submit"]'), error = contactLog.querySelector('.form-error');
      if (error) error.textContent = '';
      button.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(contactLog).entries());
        await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}/events`, { method: 'POST', body: JSON.stringify(payload) });
        await reloadCompanyIntakes(company);
        showToast('Contact added to the intake timeline.');
      } catch (problem) { if (error) error.textContent = problem.message; button.disabled = false; }
      return;
    }
    if(event.target.id==='companyUserForm'){
      if(state.user?.role!=='admin'){event.preventDefault();return;}
      event.preventDefault();const form=event.target,button=$('#addCompanyUser'),payload=Object.fromEntries(new FormData(form).entries());setError('#companyUserError','');button.disabled=true;button.textContent='Adding…';
      try{const result=await api('/api/company-users',{method:'POST',body:JSON.stringify(payload)});state.companyUserCredential=result.temporaryPassword?{name:result.name,password:result.temporaryPassword}:null;state.companyUsers=await api('/api/company-users');state.companyUsersLoadedFor=company.id;form.reset();await window.refreshActivity();renderCompanyWorkspace();showToast(result.existingAccount?'Company access added to the existing account.':'Company user added.');}
      catch(error){setError('#companyUserError',error.message);}finally{if($('#addCompanyUser')){button.disabled=false;button.textContent='Add company user';}}
      return;
    }
    if (event.target.id === 'receptionIntakeForm') {
      event.preventDefault();
      const form = event.target, button = $('#saveReceptionIntake'), intakeId = form.dataset.intakeId;
      const existingIntake = state.companyIntakes.find(item => item.id === intakeId);
      if (existingIntake?.origin?.sourceSystem === 'signature-exteriors-design') {
        await saveSignatureDesignInquiry(form, button, company, intakeId);
        return;
      }
      let accountingContacts = [], primaryAccountingContact = null;
      if (company.id === 'aspect-ventures' || company.id === 'aspect-property') {
        const requiredFields = [
          ...(company.id === 'aspect-ventures' ? [['organizationName', 'Add the business name to continue.', 'client']] : []),
          ['contactName', company.id === 'aspect-property' ? 'Add the property owner or contact to continue.' : 'Add the primary contact to continue.', 'client'],
          ['requestType', company.id === 'aspect-property' ? 'Choose the pool service requested.' : 'Choose the accounting service requested.', 'client']
        ];
        for (const [name, message, tabName] of requiredFields) {
          const control = form.querySelector(`[name="${name}"]`);
          if (!control?.value?.trim()) {
            setError('#receptionIntakeError', message);
            activateAccountingIntakeTab(tabName);
            control?.focus({ preventScroll: true });
            return;
          }
        }
        if (company.id === 'aspect-ventures') {
          accountingContacts = collectAccountingClientContacts(form);
          const contactList = form.querySelector('.accounting-client-contact-list');
          const malformed = accountingContacts.find(contact => !contact.name || !contact.role || contact.email.length > 200 || contact.email && !/^\S+@\S+\.\S+$/.test(contact.email) || contact.phone.length > 60);
          if (malformed) {
            setError('#receptionIntakeError', 'Complete each contact’s name and role, and check any email or phone entered.');
            activateAccountingIntakeTab('client');
            contactList?.querySelector(`[data-client-contact-id="${CSS.escape(malformed.id)}"] [data-client-contact-field="${!malformed.name ? 'name' : !malformed.role ? 'role' : malformed.email && !/^\S+@\S+\.\S+$/.test(malformed.email) ? 'email' : 'phone'}"]`)?.focus({ preventScroll: true });
            return;
          }
          const primaryId = form.querySelector('[data-primary-client-contact]')?.value || '';
          primaryAccountingContact = accountingContacts.find(contact => contact.id === primaryId) || null;
          if (!accountingContacts.length || !primaryAccountingContact) {
            setError('#receptionIntakeError', 'Add at least one contact and choose the primary contact.');
            activateAccountingIntakeTab('client');
            form.querySelector('[data-client-contact-field="name"], [data-primary-client-contact]')?.focus({ preventScroll: true });
            return;
          }
          if (!primaryAccountingContact.email && !primaryAccountingContact.phone) {
            setError('#receptionIntakeError', 'Add an email address or phone number for the primary contact.');
            activateAccountingIntakeTab('client');
            form.querySelector(`[data-client-contact-id="${CSS.escape(primaryAccountingContact.id)}"] [data-client-contact-field="email"]`)?.focus({ preventScroll: true });
            return;
          }
          if (!form.elements.source.value) {
            setError('#receptionIntakeError', 'Choose how the organization found out about us.');
            activateAccountingIntakeTab('client');
            form.elements.source.focus({ preventScroll: true });
            return;
          }
        }
        if (company.id === 'aspect-ventures' && !form.querySelector('[name="summary"][type="radio"]:checked')) {
          setError('#receptionIntakeError', 'Choose the kind of accounting help requested.');
          activateAccountingIntakeTab('client');
          form.querySelector('[name="summary"][type="radio"]')?.focus({ preventScroll: true });
          return;
        }
        const status = form.querySelector('[name="status"]')?.value;
        const closure = form.querySelector('#intakeClosureOutcome');
        if (status === 'Closed' && closure && !closure.value) {
          setError('#receptionIntakeError', 'Choose a closure outcome before closing this inquiry.');
          activateAccountingIntakeTab('review');
          closure.focus({ preventScroll: true });
          return;
        }
        if (company.id === 'aspect-ventures' && form.querySelector('[name="workloadReview.capacityWindow"]')?.value === 'Specific due date') {
          const dueDate = form.querySelector('[name="workloadReview.requiredTimeframeDate"]');
          if (!dueDate?.value) {
            setError('#receptionIntakeError', 'Choose a specific due date for this timeframe.');
            activateAccountingIntakeTab('review');
            dueDate?.focus({ preventScroll: true });
            return;
          }
        }
        const existing=state.companyIntakes.find(item=>item.id===intakeId),startChecks=[...form.querySelectorAll('[name^="workloadReview.startChecklist."]')];
        if(['Qualified','Setup in progress'].includes(status)&&status!==existing?.status&&startChecks.length&&!startChecks.every(item=>item.checked)){
          setError('#receptionIntakeError','Complete all four readiness checks before moving this inquiry into setup.');activateAccountingIntakeTab('review');form.querySelector('[name^="workloadReview.startChecklist."]:not(:checked)')?.focus({preventScroll:true});return;
        }
      }
      const formData=new FormData(form),payload=Object.fromEntries(formData.entries());
      if(company.id==='aspect-ventures'){
        payload.accountingDetails={};payload.workloadReview={};
        for(const [key,value] of formData.entries())if(key.startsWith('accountingDetails.'))payload.accountingDetails[key.slice(18)]=value;else if(key.startsWith('workloadReview.')&&!key.startsWith('workloadReview.startChecklist.'))payload.workloadReview[key.slice(15)]=value;
        const startChecklistControls=[...form.querySelectorAll('[name^="workloadReview.startChecklist."]')];
        if(startChecklistControls.length){payload.workloadReview.startChecklist={};for(const control of startChecklistControls)payload.workloadReview.startChecklist[control.name.slice('workloadReview.startChecklist.'.length)]=control.checked;}
        payload.accountingDetails.complexityFlags=formData.getAll('complexityFlags');
        payload.accountingDetails.contacts=accountingContacts;
        payload.accountingDetails.primaryContactId=form.querySelector('[data-primary-client-contact]')?.value||'';
        payload.contactName=primaryAccountingContact?.name||'';
        payload.email=primaryAccountingContact?.email||'';
        payload.phone=primaryAccountingContact?.phone||'';
        for(const key of Object.keys(payload))if(key.startsWith('accountingDetails.')||key.startsWith('workloadReview.')||key==='complexityFlags')delete payload[key];
        for(const key of ['monthlyTransactions','entityCount','locationCount','accountCount','employeeCount','salesTaxJurisdictions','catchUpMonths'])if(payload.accountingDetails[key]==='')payload.accountingDetails[key]='';
        if(!Object.keys(payload.workloadReview).length)delete payload.workloadReview;
      }
      button.disabled = true; setError('#receptionIntakeError', '');
      try {
        if (intakeId) await api(`/api/reception-intakes/${encodeURIComponent(intakeId)}`, {method:'PATCH', body:JSON.stringify(payload)});
        else await api(`/api/companies/${encodeURIComponent(company.id)}/reception-intakes`, {method:'POST', body:JSON.stringify(payload)});
        state.editingIntakeId = null;
        document.body.classList.remove('intake-modal-open');
        await reloadCompanyIntakes(company); focusIntakeReturnTarget(); showToast(intakeId ? 'Reception intake updated.' : 'Reception intake saved.');
      } catch (error) { setError('#receptionIntakeError', error.message); }
      finally { if (button.isConnected) button.disabled = false; }
      return;
    }
    if (event.target.id === 'companyNoteForm') {
      event.preventDefault();
      const form = event.target, button = $('#saveCompanyNote'), noteId = form.dataset.noteId;
      const payload = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      setError('#companyNoteError', '');
      try {
        if (noteId) await api(`/api/company-notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        else await api(`/api/companies/${encodeURIComponent(company.id)}/notes`, { method: 'POST', body: JSON.stringify(payload) });
        state.editingCompanyNoteId = null;
        state.companyNotes = await api(`/api/companies/${encodeURIComponent(company.id)}/notes`); await window.refreshActivity();
        renderCompanyWorkspace();
        showToast(noteId ? 'Company note updated.' : 'Company note saved.');
      } catch (error) { setError('#companyNoteError', error.message); }
      finally { if (button.isConnected) button.disabled = false; }
      return;
    }
    if (event.target.id === 'companyWorkspaceDocumentForm') {
      event.preventDefault();
      const form = event.target, file = form.elements.file.files[0], button = $('#uploadWorkspaceDocument');
      const progressId = 'workspaceDocumentUploadProgress';
      let succeeded = false;
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setError('#companyWorkspaceDocumentError', 'Choose a file smaller than 10 MB.'); return; }
      button.disabled = true; button.textContent = 'Preparing…'; setError('#companyWorkspaceDocumentError', '');
      form.setAttribute('aria-busy', 'true');
      try {
        const bytes = new Uint8Array(await file.arrayBuffer()), chunks = [];
        for (let index = 0; index < bytes.length; index += 32768) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
        const payload = { name: file.name, category: form.elements.category.value, description: form.elements.description.value, content: btoa(chunks.join('')) };
        const uploadedDocument = await window.apiWithUploadProgress(`/api/companies/${encodeURIComponent(company.id)}/documents`, { method: 'POST', body: JSON.stringify(payload) }, percent => { window.updateUploadProgress(progressId, percent); button.textContent = percent >= 100 ? 'Finishing…' : `Uploading ${percent}%`; });
        succeeded = true;
        state.justUploadedDocumentId = uploadedDocument.id;
        form.reset(); state.companyDocuments = await api(`/api/companies/${encodeURIComponent(company.id)}/documents`); await window.refreshActivity(); renderCompanyWorkspace(); showToast('Company document uploaded.');
      } catch (error) { setError('#companyWorkspaceDocumentError', error.message); }
      finally { form.removeAttribute('aria-busy'); window.finishUploadProgress(progressId, succeeded); if (button.isConnected) { button.disabled = false; button.textContent = 'Upload document'; } }
    }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-open-workspace]');
    const row = event.target.closest('#companyRows [data-company-id]');
    if (button) {
      event.preventDefault(); event.stopPropagation();
      window.openCompanyWorkspace(button.dataset.openWorkspace);
    } else if (row) {
      event.preventDefault(); event.stopPropagation();
      window.openCompanyWorkspace(row.dataset.companyId);
    }
  }, true);
  document.addEventListener('keydown', event => {
    const row = event.target.closest?.('#companyRows [data-company-id]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); window.openCompanyWorkspace(row.dataset.companyId); }
  }, true);

  window.renderProfileReadiness = renderProfileReadiness;
})();






// producer.js — Full producer view logic
const PROD_ID = window.location.pathname.split('/').pop();

let state = { production: null, items: {} };
let addModal = { zone: 'timeline', insertIndex: null, editingId: null, objectType: 'event' };
let confirmCallback = null;
let expandedTaskLists = new Set();
let lastActiveTimelineId = null;

const TYPE_ICONS = {
  casters:'🎙', gameplay:'🃏', interview:'🎤', 'pre-recorded':'📼',
  'starting-soon':'⏳', brb:'☕', 'live-video':'📹', cosplay:'🎭',
  'end-credits':'🎬', custom:'⭐'
};

// ── Socket setup ──────────────────────────────────────────────────────────────
socket.emit('production:join', PROD_ID);

socket.on('production:stateUpdate', (newState) => {
  const prev = state.production;
  state = newState;
  // items as map
  const map = {};
  (newState.items||[]).forEach(i => map[i.id] = i);
  state.itemMap = map;
  renderAll();
  if (!prev || prev.status !== newState.production.status) updateControlBar();
});

// ── Render ─────────────────────────────────────────────────────────────────────
function renderAll() {
  if (!state.production) return;
  renderTopbar();
  renderTimeline();
  renderStandby();
  renderActiveDetail();
  updateControlBar();
  renderCasterMessage();

  const prod = state.production;
  if (prod && prod.status === 'live') {
    const currentId = prod.timeline?.[prod.currentItemIndex];
    if (currentId && currentId !== lastActiveTimelineId) {
      lastActiveTimelineId = currentId;
      const currentItem = state.itemMap[currentId];
      if (currentItem && currentItem.objectType !== 'taskList') {
        setTimeout(() => {
          const el = document.querySelector(`.timeline-item[data-id="${currentId}"]`);
          const container = document.getElementById('timeline-scroll');
          if (el && container) {
             fluidScroll(container, el.offsetTop - 140, 600);
          }
        }, 50);
      }
    }
  }
}

function fluidScroll(element, target, duration) {
  const start = element.scrollTop;
  const change = target - start;
  const startTime = performance.now();

  function easeInOutQuad(t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t + b;
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  }

  function animateScroll(currentTime) {
    const elapsed = currentTime - startTime;
    element.scrollTop = easeInOutQuad(elapsed, start, change, duration);
    if (elapsed < duration) {
      requestAnimationFrame(animateScroll);
    } else {
      element.scrollTop = target; // Ensure exact finish
    }
  }
  requestAnimationFrame(animateScroll);
}

function renderTopbar() {
  const el = document.getElementById('topbar-prod-name');
  if (document.activeElement !== el) el.value = state.production.name;
}

function renderTimeline() {
  const prod = state.production;
  const list = document.getElementById('timeline-list');
  list.innerHTML = '';
  if (!prod || !prod.timeline) return;

  const count = document.getElementById('timeline-count');
  const timeline = prod.timeline || [];
  count.textContent = `${timeline.length} item${timeline.length!==1?'s':''}`;

  const currentIdx = prod.currentItemIndex ?? 0;
  let activeItem = prod.status !== 'idle' ? state.itemMap[prod.timeline[currentIdx]] : null;
  if (activeItem && activeItem.status !== 'active') activeItem = null;

  let liveEventId = null;
  if (activeItem) {
    if (activeItem.objectType === 'event') {
      liveEventId = activeItem.id;
    } else if (activeItem.objectType === 'taskList') {
      for (let i = currentIdx - 1; i >= 0; i--) {
        const item = state.itemMap[prod.timeline[i]];
        if (item && item.objectType === 'event') { liveEventId = item.id; break; }
      }
    }
  }

  prod.timeline.forEach((id, idx) => {
    const item = state.itemMap[id];
    if (item) {
      const isLiveEvent = (item.id === liveEventId);
      list.appendChild(buildItemCard(item, 'timeline', idx, isLiveEvent));
      list.appendChild(buildInsertBtn('timeline', idx + 1));
    }
  });

  if (typeof initSortable === 'function') {
    initSortable(list, 'timeline');
  }
}

function renderStandby() {
  const prod = state.production;
  const list = document.getElementById('standby-list');
  const standby = prod.standby || [];

  if (!standby.length) {
    list.innerHTML = '<div class="standby-empty">No items in standby.<br>Create items here to drag onto the timeline.</div>';
    return;
  }
  list.innerHTML = '';
  standby.forEach((id, idx) => {
    const item = state.itemMap[id];
    if (!item) return;
    list.appendChild(buildItemCard(item, 'standby', idx));
  });
}

function buildItemCard(item, zone, idx, isLiveEvent = false) {
  const isActualActive = item.status === 'active';
  const isComplete = item.status === 'complete';
  const isSkipped = item.status === 'skipped';
  const isList = item.objectType === 'taskList';
  const tasks = item.tasks || [];
  const doneTasks = tasks.filter(t => t.complete).length;
  const allDone = tasks.length > 0 && doneTasks === tasks.length;

  let classes = 'timeline-item';
  if (isLiveEvent) {
    classes += ' is-active';
  } else if (isActualActive && isList) {
    classes += ' is-active-tasklist';
  } else if (isComplete && !isLiveEvent) {
    classes += ' is-complete';
  } else if (isSkipped) {
    classes += ' is-skipped';
  }

  const div = document.createElement('div');
  div.className = classes;
  div.dataset.id = item.id;
  div.dataset.zone = zone;
  div.dataset.type = item.type || '';
  div.dataset.objectType = item.objectType || 'event';

  const typeLabel = isList ? 'Task List' : getTypeLabel(item.type);
  const icon = isList ? '✅' : (TYPE_ICONS[item.type] || '⭐');

  let tasksHtml = '';
  if (isList && tasks.length > 0) {
    const pct = Math.round((doneTasks/tasks.length)*100);
    const isExpanded = expandedTaskLists.has(item.id);
    
    tasksHtml = `<div class="item-tasks-row" onclick="toggleTaskListExpand('${item.id}')" style="cursor:pointer; margin-bottom: ${isExpanded ? '8px' : '0'}; user-select:none;">
      <div class="tasks-mini-bar"><div class="tasks-mini-bar__fill" style="width:${pct}%"></div></div>
      <span class="tasks-mini-count">${doneTasks}/${tasks.length}</span>
      <span style="font-size:0.7rem; color:var(--text-muted); margin-left:4px;">${isExpanded ? '▲' : '▼'}</span>
    </div>`;

    if (isExpanded) {
      tasksHtml += `<div class="task-list" style="margin-top:8px;">`;
      tasks.forEach(t => {
        tasksHtml += `<div class="task-item ${t.complete?'is-done':''}" onclick="event.stopPropagation(); toggleTask('${item.id}','${t.id}',${!t.complete})">
          <div class="task-checkbox">${t.complete?'✓':''}</div>
          <span class="task-label">${escHtml(t.text)}</span>
        </div>`;
      });
      tasksHtml += `</div>`;
    }
  }

  const canComplete = isActualActive && (!isList || allDone);

  div.innerHTML = `
    <div class="item-handle" title="Drag to reorder">⠿</div>
    <div class="item-body">
      <div class="item-row1">
        <span class="type-icon">${icon}</span>
        <span class="item-title">${escHtml(item.title)}</span>
        <span class="item-type-badge">${typeLabel}</span>
      </div>
      <div class="item-meta">
        <span class="item-duration">⏱ ~${fmtDuration(item.estimatedDuration)}</span>
        ${item.obsScene ? `<span class="item-scene-badge">📺 ${escHtml(item.obsScene)}</span>` : ''}
      </div>
      ${item.notes ? `<div class="item-notes">📝 ${escHtml(item.notes)}</div>` : ''}
      ${tasksHtml}
    </div>
    <div class="item-actions">
      ${isActualActive ? `<button class="btn btn-live btn-sm" onclick="completeItem('${item.id}')" ${canComplete?'':'disabled'} title="${canComplete?'Mark complete':'Complete all tasks first'}">✓</button>` : ''}
      ${!isActualActive && item.status === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="jumpToItem('${item.id}')" title="Jump to this item">▶</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="editItem('${item.id}')" title="Edit">✎</button>
      <button class="btn btn-ghost btn-sm" onclick="duplicateItem('${item.id}', '${zone}')" title="Duplicate">⎘</button>
      <button class="btn btn-icon btn-sm" onclick="deleteItem('${item.id}')" title="Delete" style="color:var(--status-skip);">🗑</button>
    </div>`;
  return div;
}

function buildInsertBtn(zone, index) {
  const wrap = document.createElement('div');
  wrap.className = 'insert-btn-wrap';
  wrap.innerHTML = `
    <div class="insert-line"></div>
    <button class="insert-btn" onclick="openAddModal('${zone}',${index})">+ Add</button>
    <div class="insert-line"></div>`;
  return wrap;
}

function renderActiveDetail() {
  const prod = state.production;
  const activeId = prod.timeline?.[prod.currentItemIndex];
  const noMsg = document.getElementById('no-active-msg');
  const content = document.getElementById('active-detail-content');

  if (!activeId || prod.status === 'idle') {
    noMsg.classList.remove('hidden');
    content.classList.add('hidden');
    content.innerHTML = '';
    return;
  }

  const item = state.itemMap[activeId];
  if (!item || item.status !== 'active') {
    noMsg.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  noMsg.classList.add('hidden');
  content.classList.remove('hidden');

  const isList = item.objectType === 'taskList';
  const tasks = item.tasks || [];

  const itemColor = getEventTypeColor(item.type, item.objectType);
  let html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <div class="item-stripe" style="background:${itemColor};width:4px;height:32px;border-radius:4px;flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="font-size:1rem;font-weight:700;">${escHtml(item.title)}</div>
          <div style="background:${itemColor}; color:#fff; font-size:0.65rem; font-weight:700; padding:2px 6px; border-radius:12px; text-transform:uppercase; letter-spacing:0.5px;">${getTypeLabel(isList?'taskList':item.type)}</div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);">~${fmtDuration(item.estimatedDuration)}</div>
      </div>
    </div>`;

  if (item.notes) {
    html += `<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;padding:8px 10px;background:var(--bg-overlay);border-radius:6px;border-left:3px solid ${itemColor};">${escHtml(item.notes)}</div>`;
  }

  if (item.obsScene) {
    html += `<div style="margin-bottom:12px;"><span class="item-scene-badge">📺 ${escHtml(item.obsScene)}</span></div>`;
  }

  if (isList && tasks.length) {
    const doneTasks = tasks.filter(t => t.complete).length;
    const allDone = doneTasks === tasks.length;
    html += `<div class="task-list">`;
    tasks.forEach(t => {
      html += `<div class="task-item ${t.complete?'is-done':''}" onclick="toggleTask('${item.id}','${t.id}',${!t.complete})">
        <div class="task-checkbox">${t.complete?'✓':''}</div>
        <span class="task-label">${escHtml(t.text)}</span>
      </div>`;
    });
    html += `</div>`;
    html += `<button class="btn btn-live btn-sm" style="margin-top:12px;width:100%;justify-content:center;" onclick="completeItem('${item.id}')" ${allDone?'':'disabled'}>${allDone?'✓ Mark Complete':'Complete all tasks first'}</button>`;
  } else {
    html += `<button class="btn btn-live btn-sm" style="margin-top:4px;width:100%;justify-content:center;" onclick="completeItem('${item.id}')">✓ Mark Complete</button>`;
  }

  content.innerHTML = html;
}

function updateControlBar() {
  const prod = state.production;
  if (!prod) return;
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const badge = document.getElementById('topbar-status-badge');
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');

  dot.className = 'status-dot ' + (prod.status === 'live' ? 'live' : prod.status === 'paused' ? 'paused' : '');
  label.textContent = prod.status.toUpperCase();

  if (badge) {
    badge.className = `badge ${getStatusBadgeClass(prod.status)}`;
    badge.textContent = prod.status.toUpperCase();
  }

  const isIdle = prod.status === 'idle';
  const isLive = prod.status === 'live';
  const isPaused = prod.status === 'paused';
  const isDone = prod.status === 'complete';

  btnStart.classList.toggle('hidden', !isIdle);
  btnPause.classList.toggle('hidden', !isLive);
  btnResume.classList.toggle('hidden', !isPaused);
}


// ── SortableJS drag & drop ────────────────────────────────────────────────────
let timelineSortable, standbySortable;

function initSortable() {
  const timelineList = document.getElementById('timeline-list');
  const standbyList  = document.getElementById('standby-list');

  const opts = (zone) => ({
    group: 'items',
    handle: '.item-handle',
    animation: 180,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    onEnd(evt) {
      const fromZone = evt.from.dataset.zone || zone;
      const toZone   = evt.to.dataset.zone   || zone;
      const itemId   = evt.item.dataset.id;

      if (fromZone === toZone) {
        // Reorder within zone
        const ids = [...evt.to.querySelectorAll('.timeline-item')].map(el => el.dataset.id);
        socket.emit('item:reorder', { productionId: PROD_ID, zone: toZone, orderedIds: ids });
      } else {
        // Move between zones
        const ids = [...evt.to.querySelectorAll('.timeline-item')].map(el => el.dataset.id);
        const insertIndex = ids.indexOf(itemId);
        socket.emit('item:move', { productionId: PROD_ID, itemId, fromZone, toZone, insertIndex });
      }
    }
  });

  timelineList.dataset.zone = 'timeline';
  standbyList.dataset.zone  = 'standby';

  timelineSortable = Sortable.create(timelineList, opts('timeline'));
  standbySortable  = Sortable.create(standbyList,  opts('standby'));
}

// ── Production controls ────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('production:start', { productionId: PROD_ID });
});
document.getElementById('btn-pause').addEventListener('click', () => {
  socket.emit('production:pause', { productionId: PROD_ID });
});
document.getElementById('btn-resume').addEventListener('click', () => {
  socket.emit('production:start', { productionId: PROD_ID });
});
document.getElementById('btn-reset').addEventListener('click', () => {
  openConfirm('Reset Production?', 'This will reset all items to pending and stop the production. Are you sure?', () => {
    socket.emit('production:reset', { productionId: PROD_ID });
  });
});

// ── Item actions ──────────────────────────────────────────────────────────────
function completeItem(id) {
  socket.emit('item:complete', { productionId: PROD_ID, itemId: id });
}

function jumpToItem(id) {
  socket.emit('item:activate', { productionId: PROD_ID, itemId: id });
}

function scrollToActiveItem() {
  const prod = state.production;
  if (!prod) return;
  const activeId = prod.timeline?.[prod.currentItemIndex];
  if (!activeId) return;
  const el = document.querySelector(`.timeline-item[data-id="${activeId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'transform 0.3s ease';
    el.style.transform = 'scale(1.02)';
    setTimeout(() => { el.style.transform = 'scale(1)'; }, 300);
  }
}

function toggleTask(itemId, taskId, complete) {
  socket.emit('task:toggle', { productionId: PROD_ID, itemId, taskId, complete });
}

function toggleTaskListExpand(itemId) {
  if (expandedTaskLists.has(itemId)) {
    expandedTaskLists.delete(itemId);
  } else {
    expandedTaskLists.add(itemId);
  }
  renderAll();
}

async function duplicateItem(id, zone) {
  const original = state.itemMap[id];
  if (!original) return;
  
  const data = {
    objectType: original.objectType,
    title: original.title + ' Copy',
    estimatedDuration: original.estimatedDuration,
    notes: original.notes,
    color: getEventTypeColor(original.type, original.objectType),
  };
  
  if (original.objectType === 'taskList') {
    data.tasks = (original.tasks || []).map(t => ({
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: t.text,
      complete: false
    }));
  } else {
    data.type = original.type;
    data.obsScene = original.obsScene;
    data.typeData = { ...original.typeData };
  }
  
  try {
    await api.post(`/api/productions/${PROD_ID}/items?zone=${zone}`, data);
    socket.emit('production:refresh', { productionId: PROD_ID });
    showToast('Item duplicated', 'success');
  } catch(e) {
    showToast('Failed to duplicate item', 'error');
  }
}


function deleteItem(id) {
  openConfirm('Delete Item?', 'This will permanently remove this item.', () => {
    socket.emit('item:delete', { productionId: PROD_ID, itemId: id });
  });
}

// ── Add/Edit Modal ─────────────────────────────────────────────────────────────
function openAddModal(zone, insertIndex) {
  addModal = { zone, insertIndex, editingId: null, objectType: 'event' };
  populateModal(null);
  document.getElementById('modal-item-title').textContent = 'Add Item';
  document.getElementById('modal-item').classList.remove('hidden');
  document.getElementById('objecttype-tabs').classList.remove('hidden');
  setTimeout(() => document.getElementById('item-title').focus(), 50);
}

function editItem(id) {
  const item = state.itemMap[id];
  if (!item) return;
  addModal = { zone: null, insertIndex: null, editingId: id, objectType: item.objectType };
  populateModal(item);
  document.getElementById('modal-item-title').textContent = 'Edit Item';
  // Hide type switcher when editing
  document.getElementById('objecttype-tabs').classList.add('hidden');
  document.getElementById('modal-item').classList.remove('hidden');
}

function populateModal(item) {
  const settings = state.production.settings || {};
  const casters = settings.casters || [];
  const scenes = settings.obsScenes || [];
  const isEdit = !!item;
  const isList = item ? item.objectType === 'taskList' : addModal.objectType === 'taskList';

  // Common fields
  document.getElementById('item-title').value = item ? item.title : '';
  document.getElementById('item-duration').value = item ? item.estimatedDuration : 15;
  document.getElementById('item-notes').value = item ? item.notes : '';



  // OBS scenes dropdown
  const sceneSelect = document.getElementById('item-obs-scene');
  sceneSelect.innerHTML = '<option value="">— None —</option>' + scenes.map(s => `<option value="${s}"${item&&item.obsScene===s?' selected':''}>${s}</option>`).join('');

  // Event type dropdown
  const typeSelect = document.getElementById('item-type');
  typeSelect.innerHTML = EVENT_TYPES.map(t =>
    `<option value="${t}"${item&&item.type===t?' selected':''}>${getTypeLabel(t)}</option>`
  ).join('');

  // Caster dropdowns
  const casterOptions = '<option value="">— None —</option>' + casters.map(c => `<option value="${c}">${c}</option>`).join('');
  ['td-caster-a','td-caster-b','td-gp-caster-a','td-gp-caster-b'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = casterOptions;
      if (item) {
        const key = id.replace('td-','').replace('-','');
        el.value = item.typeData?.[key] || '';
      }
    }
  });

  // Populate typeData fields
  if (item && item.typeData) {
    const td = item.typeData;
    setVal('td-round', td.round||1);
    setVal('td-table', td.table||'');
    setVal('td-player', td.player||'');
    setVal('td-interviewer', td.interviewer||'');
    setVal('td-iv-round', td.ivRound||1);
    setVal('td-cam-source', td.camSource||'');
  } else {
    ['td-round','td-table','td-player','td-interviewer','td-iv-round','td-cam-source'].forEach(id => setVal(id,''));
  }

  // Switch to correct object type UI
  switchObjectType(isList ? 'taskList' : 'event', null);
  if (!isList) onTypeChange();

  // Tab buttons
  document.querySelectorAll('#objecttype-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === (isList?'taskList':'event'));
  });

  // Task list tasks
  if (isList) {
    const tasksList = document.getElementById('tasks-list');
    tasksList.innerHTML = '';
    const tasks = item ? item.tasks : [];
    tasks.forEach(t => addTaskRow(t.text, t.id));
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}



function switchObjectType(type, btn) {
  addModal.objectType = type;
  const eventFields = document.getElementById('event-fields');
  const taskFields = document.getElementById('tasklist-fields');
  eventFields.classList.toggle('hidden', type === 'taskList');
  taskFields.classList.toggle('hidden', type === 'event');
  if (btn) {
    document.querySelectorAll('#objecttype-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

function onTypeChange() {
  const type = document.getElementById('item-type').value;
  const sections = { casters:'ts-casters', gameplay:'ts-gameplay', interview:'ts-interview', 'live-video':'ts-live-video' };
  document.querySelectorAll('.type-section').forEach(s => s.classList.remove('visible'));
  if (sections[type]) document.getElementById(sections[type]).classList.add('visible');
}

// ── Task rows in modal ────────────────────────────────────────────────────────
function addTaskRow(text = '', id = null) {
  const { v4: uuid } = { v4: () => Math.random().toString(36).slice(2) };
  const rowId = id || `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const list = document.getElementById('tasks-list');
  const row = document.createElement('div');
  row.className = 'expandable-item';
  row.dataset.taskId = rowId;
  row.innerHTML = `
    <input class="form-input" type="text" value="${escHtml(text)}" placeholder="Task description">
    <button class="btn btn-icon" onclick="this.parentElement.remove()" title="Remove task" style="color:var(--status-skip);">✕</button>`;
  list.appendChild(row);
}

document.getElementById('btn-add-task').addEventListener('click', () => addTaskRow());

// ── Save item ──────────────────────────────────────────────────────────────────
document.getElementById('btn-save-item').addEventListener('click', async () => {
  const title = document.getElementById('item-title').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }

  const isList = addModal.objectType === 'taskList';
  const type = isList ? null : document.getElementById('item-type').value;

  const data = {
    objectType: addModal.objectType,
    title,
    estimatedDuration: parseInt(document.getElementById('item-duration').value) || 15,
    notes: document.getElementById('item-notes').value.trim(),
  };

  if (isList) {
    data.tasks = [...document.querySelectorAll('#tasks-list .expandable-item')].map(row => ({
      id: row.dataset.taskId,
      text: row.querySelector('input').value.trim(),
      complete: false
    })).filter(t => t.text);
  } else {
    data.type = document.getElementById('item-type').value;
    data.obsScene = document.getElementById('item-obs-scene').value;
    data.typeData = buildTypeData(data.type);
  }

  try {
    if (addModal.editingId) {
      // Edit existing
      socket.emit('item:update', { productionId: PROD_ID, itemId: addModal.editingId, data });
      showToast('Item updated', 'success');
    } else {
      // Create new
      const zone = addModal.zone || 'standby';
      const insertIndex = addModal.insertIndex;
      const item = await api.post(`/api/productions/${PROD_ID}/items?zone=${zone}`, data);
      // If there's an insert index, move it to the right position
      if (zone === 'timeline' && insertIndex !== null && insertIndex >= 0) {
        const prod = state.production;
        const timeline = [...(prod.timeline||[])];
        const currentIdx = timeline.indexOf(item.id);
        if (currentIdx !== insertIndex) {
          timeline.splice(currentIdx, 1);
          timeline.splice(insertIndex, 0, item.id);
          // item:reorder also triggers a broadcast, so no extra refresh needed here
          socket.emit('item:reorder', { productionId: PROD_ID, zone: 'timeline', orderedIds: timeline });
        } else {
          socket.emit('production:refresh', { productionId: PROD_ID });
        }
      } else {
        // Always broadcast after a REST create so all clients update
        socket.emit('production:refresh', { productionId: PROD_ID });
      }
      showToast('Item added', 'success');
    }
    closeItemModal();
  } catch(e) {
    showToast('Failed to save item', 'error');
  }
});


function buildTypeData(type) {
  const td = {};
  if (type === 'casters') {
    td.castera = document.getElementById('td-caster-a')?.value;
    td.casterb = document.getElementById('td-caster-b')?.value;
  } else if (type === 'gameplay') {
    td.round = document.getElementById('td-round')?.value;
    td.table = document.getElementById('td-table')?.value;
    td.gpcastera = document.getElementById('td-gp-caster-a')?.value;
    td.gpcasterb = document.getElementById('td-gp-caster-b')?.value;
  } else if (type === 'interview') {
    td.player = document.getElementById('td-player')?.value;
    td.interviewer = document.getElementById('td-interviewer')?.value;
    td.ivRound = document.getElementById('td-iv-round')?.value;
  } else if (type === 'live-video') {
    td.camSource = document.getElementById('td-cam-source')?.value;
  }
  return td;
}

function closeItemModal() {
  document.getElementById('modal-item').classList.add('hidden');
}

// ── Quick-add buttons ─────────────────────────────────────────────────────────
document.getElementById('btn-add-timeline-bottom').addEventListener('click', () => {
  const len = (state.production?.timeline||[]).length;
  openAddModal('timeline', len);
});
document.getElementById('btn-add-standby').addEventListener('click', () => openAddModal('standby', null));

// ── Settings Modal ────────────────────────────────────────────────────────────
function openSettings() {
  const prod = state.production;
  if (!prod) return;
  document.getElementById('s-prod-name').value = prod.name;
  document.getElementById('s-prod-length').value = prod.estimatedLength;

  // Casters
  renderSettingsList('settings-casters-list', prod.settings?.casters || [], 'Caster name');
  // Scenes
  renderSettingsList('settings-scenes-list', prod.settings?.obsScenes || [], 'Scene name');

  // Activate first tab
  switchSettingsTab('info', document.querySelector('#modal-settings .tab-btn.active') || document.querySelector('#modal-settings .tab-btn'));
  document.getElementById('modal-settings').classList.remove('hidden');
}

function renderSettingsList(listId, items, placeholder) {
  const list = document.getElementById(listId);
  list.innerHTML = '';
  items.forEach(val => addSettingsRow(list, val, placeholder));
}

function addSettingsRow(list, val, placeholder) {
  const row = document.createElement('div');
  row.className = 'settings-list-item';
  row.innerHTML = `
    <input class="form-input" type="text" value="${escHtml(val)}" placeholder="${placeholder}">
    <button class="btn btn-icon" onclick="this.parentElement.remove()" style="color:var(--status-skip);">✕</button>`;
  list.appendChild(row);
}

document.getElementById('btn-add-caster').addEventListener('click', () =>
  addSettingsRow(document.getElementById('settings-casters-list'), '', 'Caster name'));
document.getElementById('btn-add-scene').addEventListener('click', () =>
  addSettingsRow(document.getElementById('settings-scenes-list'), '', 'Scene name'));

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const name = document.getElementById('s-prod-name').value.trim();
  const estimatedLength = parseInt(document.getElementById('s-prod-length').value) || 480;
  const casters = [...document.querySelectorAll('#settings-casters-list input')].map(i => i.value.trim()).filter(Boolean);
  const obsScenes = [...document.querySelectorAll('#settings-scenes-list input')].map(i => i.value.trim()).filter(Boolean);

  try {
    await api.put(`/api/productions/${PROD_ID}`, { name, estimatedLength, settings: { casters, obsScenes } });
    socket.emit('production:refresh', { productionId: PROD_ID });
    showToast('Settings saved', 'success');
    closeSettings();
  } catch(e) { showToast('Failed to save settings', 'error'); }
});

// ── OBS WebSocket Integration ──────────────────────────────────────────────────
let obsClient = null;

document.getElementById('btn-obs-connect').addEventListener('click', async () => {
  const url = document.getElementById('obs-ws-url').value;
  const pass = document.getElementById('obs-ws-pass').value;
  const btn = document.getElementById('btn-obs-connect');
  
  if (!window.OBSWebSocket) {
    showToast('OBS library not loaded yet', 'error');
    return;
  }
  
  try {
    btn.textContent = 'Connecting...';
    btn.disabled = true;
    obsClient = new OBSWebSocket();
    await obsClient.connect(url, pass);
    
    // Fetch scene collections
    const { currentSceneCollectionName, sceneCollections } = await obsClient.call('GetSceneCollectionList');
    
    const select = document.getElementById('obs-collection-select');
    select.innerHTML = sceneCollections.map(c => 
      `<option value="${escHtml(c)}" ${c === currentSceneCollectionName ? 'selected' : ''}>${escHtml(c)}</option>`
    ).join('');
    
    document.getElementById('obs-connect-row').classList.add('hidden');
    document.getElementById('obs-import-row').classList.remove('hidden');
    showToast('Connected to OBS', 'success');
    
  } catch (e) {
    showToast('OBS Connection failed', 'error');
    console.error(e);
    obsClient = null;
  } finally {
    btn.textContent = 'Connect';
    btn.disabled = false;
  }
});

document.getElementById('btn-obs-disconnect').addEventListener('click', async () => {
  if (obsClient) await obsClient.disconnect();
  obsClient = null;
  document.getElementById('obs-connect-row').classList.remove('hidden');
  document.getElementById('obs-import-row').classList.add('hidden');
});

document.getElementById('btn-obs-import').addEventListener('click', async () => {
  if (!obsClient) return;
  const btn = document.getElementById('btn-obs-import');
  const selectedCollection = document.getElementById('obs-collection-select').value;
  
  try {
    btn.textContent = 'Importing...';
    btn.disabled = true;
    
    const { currentSceneCollectionName } = await obsClient.call('GetSceneCollectionList');
    let switched = false;
    
    if (selectedCollection !== currentSceneCollectionName) {
      await obsClient.call('SetCurrentSceneCollection', { sceneCollectionName: selectedCollection });
      // wait a bit for OBS to switch
      await new Promise(r => setTimeout(r, 1500));
      switched = true;
    }
    
    const data = await obsClient.call('GetSceneList');
    const scenes = data.scenes || [];
    
    // Switch back if we switched
    if (switched) {
      await obsClient.call('SetCurrentSceneCollection', { sceneCollectionName: currentSceneCollectionName });
    }
    
    const list = document.getElementById('settings-scenes-list');
    const existingInputs = [...document.querySelectorAll('#settings-scenes-list input')].map(i => i.value.trim());
    
    let added = 0;
    scenes.reverse().forEach(scene => {
      if (!existingInputs.includes(scene.sceneName)) {
        addSettingsRow(list, scene.sceneName, 'Scene name');
        added++;
      }
    });
    
    showToast(`Imported ${added} new scenes!`, 'success');
  } catch (e) {
    showToast('Import failed: ' + (e.message || 'Unknown error'), 'error');
    console.error(e);
  } finally {
    btn.textContent = 'Import';
    btn.disabled = false;
  }
});

function closeSettings() {
  document.getElementById('modal-settings').classList.add('hidden');
}

function switchSettingsTab(tabId, btn) {
  document.querySelectorAll('#modal-settings .tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`stab-${tabId}`).classList.add('active');
  document.querySelectorAll('#modal-settings .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

document.getElementById('btn-settings').addEventListener('click', openSettings);

// ── Inline title rename ────────────────────────────────────────────────────────
document.getElementById('topbar-prod-name').addEventListener('blur', async (e) => {
  const name = e.target.value.trim();
  if (!name || name === state.production?.name) return;
  try {
    await api.put(`/api/productions/${PROD_ID}`, { name });
    showToast('Renamed', 'success');
  } catch(e) { showToast('Rename failed', 'error'); }
});

// ── Confirm modal ──────────────────────────────────────────────────────────────
function openConfirm(title, body, cb) {
  document.getElementById('modal-confirm-title').textContent = title;
  document.getElementById('modal-confirm-body').textContent = body;
  confirmCallback = cb;
  document.getElementById('modal-confirm').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('modal-confirm').classList.add('hidden');
  confirmCallback = null;
}

document.getElementById('btn-confirm-action').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// Backdrop close
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) {
      closeItemModal();
      closeSettings();
      closeConfirm();
    }
  });
});

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ── Init ──────────────────────────────────────────────────────────────────────
initSortable();

// ── Caster Message ────────────────────────────────────────────────────────────
(function initCasterMessage() {
  const input    = document.getElementById('caster-msg-input');
  const sendBtn  = document.getElementById('btn-send-caster-msg');
  const clearBtn = document.getElementById('btn-clear-caster-msg');

  // Enable send button only when there's text
  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
  });

  // Also allow Ctrl+Enter to send
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !sendBtn.disabled) {
      sendBtn.click();
    }
  });

  sendBtn.addEventListener('click', () => {
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('caster:message:send', { productionId: PROD_ID, message: msg });
    // UI update will come back via production:stateUpdate broadcast
  });

  clearBtn.addEventListener('click', () => {
    socket.emit('caster:message:clear', { productionId: PROD_ID });
  });
})();

function renderCasterMessage() {
  const msg = state.production && state.production.casterMessage;
  const composePanel = document.getElementById('caster-msg-compose');
  const activePanel  = document.getElementById('caster-msg-active-panel');
  const activeText   = document.getElementById('caster-msg-active-text');
  const input        = document.getElementById('caster-msg-input');
  const sendBtn      = document.getElementById('btn-send-caster-msg');

  if (msg) {
    // Show active state
    composePanel.classList.add('hidden');
    activePanel.classList.remove('hidden');
    activeText.textContent = msg;
  } else {
    // Show compose state
    activePanel.classList.add('hidden');
    composePanel.classList.remove('hidden');
    // Clear input only if it wasn't already cleared
    if (input.value === '') sendBtn.disabled = true;
  }
}

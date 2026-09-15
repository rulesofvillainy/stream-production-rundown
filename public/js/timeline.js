// timeline.js — Read-only Crew Timeline View
const PROD_ID = window.location.pathname.split('/').pop();

let state = { production: null, items: {} };
let lastActiveTimelineId = null;

const TYPE_ICONS = {
  casters:'🎙', gameplay:'🃏', interview:'🎤', 'pre-recorded':'📼',
  'starting-soon':'⏳', brb:'☕', 'live-video':'📹', cosplay:'🎭',
  'end-credits':'🎬', custom:'⭐'
};

// ── Socket setup ──────────────────────────────────────────────────────────────
socket.emit('production:join', PROD_ID);

socket.on('connect', () => {
  document.getElementById('conn-dot').style.background = 'var(--status-live)';
  document.getElementById('conn-label').textContent = 'Connected';
});

socket.on('disconnect', () => {
  document.getElementById('conn-dot').style.background = 'var(--status-skip)';
  document.getElementById('conn-label').textContent = 'Disconnected';
});

socket.on('production:stateUpdate', (newState) => {
  state = newState;
  const map = {};
  (newState.items||[]).forEach(i => map[i.id] = i);
  state.itemMap = map;
  renderAll();
});

// ── Render ─────────────────────────────────────────────────────────────────────
function renderAll() {
  if (!state.production) return;
  renderTopbar();
  renderTimeline();
  renderStandby();
  renderCasterMessage();
}

function renderTopbar() {
  const prod = state.production;
  document.getElementById('topbar-prod-name').textContent = prod.name;
  
  const badge = document.getElementById('topbar-status-badge');
  badge.className = `badge ${getStatusBadgeClass(prod.status)}`;
  badge.textContent = prod.status.toUpperCase();
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

  prod.timeline.forEach((id) => {
    const item = state.itemMap[id];
    if (item) {
      const isLiveEvent = (item.id === liveEventId);
      list.appendChild(buildItemCard(item, isLiveEvent));
    }
  });

  // Auto-scroll logic
  if (prod.status === 'live') {
    const currentId = prod.timeline[prod.currentItemIndex];
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

function renderStandby() {
  const prod = state.production;
  const list = document.getElementById('standby-list');
  list.innerHTML = '';
  if (!prod || !prod.standby) return;

  prod.standby.forEach((id) => {
    const item = state.itemMap[id];
    if (item) {
      list.appendChild(buildItemCard(item, false));
    }
  });
}

function buildItemCard(item, isLiveEvent = false) {
  const isActualActive = item.status === 'active';
  const isComplete = item.status === 'complete';
  const isSkipped = item.status === 'skipped';
  const isList = item.objectType === 'taskList';
  const tasks = item.tasks || [];
  const doneTasks = tasks.filter(t => t.complete).length;

  let classes = 'timeline-item';
  // Strip out sortable handles/pointer events via inline style if needed, but css doesn't rely on it unless dragged
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
  div.dataset.type = item.type || '';
  div.dataset.objectType = item.objectType || 'event';

  const typeLabel = isList ? 'Task List' : getTypeLabel(item.type);
  const icon = isList ? '✅' : (TYPE_ICONS[item.type] || '⭐');

  let tasksHtml = '';
  if (isList && tasks.length > 0) {
    const pct = Math.round((doneTasks/tasks.length)*100);
    // Expand by default if it's active
    const isExpanded = isActualActive || (state.production.status === 'idle' && !isComplete);
    
    tasksHtml = `<div class="item-tasks-row" style="margin-bottom: ${isExpanded ? '8px' : '0'}; user-select:none; padding:4px 0;">
      <div class="tasks-mini-bar"><div class="tasks-mini-bar__fill" style="width:${pct}%"></div></div>
      <span class="tasks-mini-count">${doneTasks}/${tasks.length}</span>
    </div>`;

    if (isExpanded) {
      tasksHtml += `<div class="task-list" style="margin-top:8px;">`;
      tasks.forEach(t => {
        tasksHtml += `<div class="task-item ${t.complete?'is-done':''}" style="cursor:default;">
          <div class="task-checkbox">${t.complete?'✓':''}</div>
          <span class="task-label">${escHtml(t.text)}</span>
        </div>`;
      });
      tasksHtml += `</div>`;
    }
  }

  // Notice: We completely omit the item-handle and item-actions divs!
  div.innerHTML = `
    <div class="item-body" style="padding-left:12px;">
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
    </div>`;
  return div;
}

function renderCasterMessage() {
  const prod = state.production;
  const alert = document.getElementById('caster-message-alert');
  const text = document.getElementById('caster-message-text');

  if (prod && prod.casterMessage) {
    text.textContent = prod.casterMessage;
    alert.classList.remove('hidden');
  } else {
    alert.classList.add('hidden');
    text.textContent = '';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
      element.scrollTop = target;
    }
  }
  requestAnimationFrame(animateScroll);
}

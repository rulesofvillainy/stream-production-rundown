// caster.js
const PROD_ID = window.location.pathname.split('/').pop();
let state = { production: null, items: {} };
let showTaskLists = false;

const TYPE_ICONS = {
  casters:'🎙', gameplay:'🃏', interview:'🎤', 'pre-recorded':'📼',
  'starting-soon':'⏳', brb:'☕', 'live-video':'📹', cosplay:'🎭',
  'end-credits':'🎬', custom:'⭐'
};

// ── Socket ─────────────────────────────────────────────────────────────────────
function joinRoom() {
  socket.emit('production:join', PROD_ID);
  document.getElementById('conn-dot').classList.add('connected');
  document.getElementById('conn-label').textContent = 'Connected';
}

// The socket in shared.js connects immediately — by the time this handler
// is registered, 'connect' may have already fired. So we check both cases.
socket.on('connect', joinRoom);

// If already connected when this script executes, join right away
if (socket.connected) joinRoom();

socket.on('disconnect', () => {
  document.getElementById('conn-dot').classList.remove('connected');
  document.getElementById('conn-label').textContent = 'Disconnected';
});

socket.on('production:stateUpdate', (newState) => {
  state = newState;
  const map = {};
  (newState.items||[]).forEach(i => map[i.id] = i);
  state.itemMap = map;
  render();
});

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  const prod = state.production;
  if (!prod) return;

  document.getElementById('caster-prod-name').textContent = prod.name;
  updateStatusBar(prod);
  renderCasterMessage();

  const offline = document.getElementById('caster-offline');
  const cards   = document.getElementById('caster-cards');

  // ── Idle: waiting for producer to start ───────────────────────────────────
  if (prod.status === 'idle') {
    offline.classList.remove('hidden');
    offline.innerHTML = `<div class="big-icon">🎙</div><h2>Waiting for production to start…</h2><p>The producer will start the show.</p>`;
    cards.innerHTML = '';
    return;
  }

  offline.classList.add('hidden');

  // ── Complete ──────────────────────────────────────────────────────────────
  if (prod.status === 'complete') {
    cards.innerHTML = `
      <div class="prod-complete-banner">
        <div style="font-size:2rem;margin-bottom:12px;">🎬</div>
        <h2 style="font-size:1.4rem;font-weight:700;">That's a wrap!</h2>
        <p style="color:var(--text-secondary);margin-top:8px;">Production complete.</p>
      </div>`;
    return;
  }

  // ── Live ──────────────────────────────────────────────────────────────────
  const timeline = prod.timeline || [];
  const currentIdx = prod.currentItemIndex ?? 0;
  const rawItem = state.itemMap[timeline[currentIdx]];

  // Only show an item as active if the producer has explicitly activated it.
  // A 'pending' item at currentItemIndex means nothing has been selected yet.
  const activeItem = (rawItem && rawItem.status === 'active') ? rawItem : null;

  // Nothing activated yet → show pre-show banner + upcoming events
  if (!activeItem) {
    // Gather the first 2 upcoming events from the timeline
    const upcomingPre = [];
    for (let i = 0; i < timeline.length && upcomingPre.length < 2; i++) {
      const item = state.itemMap[timeline[i]];
      if (!item || item.objectType !== 'event') continue;
      upcomingPre.push(item);
    }

    cards.innerHTML = `
      <div class="prod-starting-banner">
        <div class="prod-starting-banner__icon">🎬</div>
        <div class="prod-starting-banner__title">Production Starting</div>
        <div class="prod-starting-banner__sub">Stand by — the show is about to begin.</div>
      </div>`;

    upcomingPre.forEach((item, i) => {
      cards.appendChild(buildCasterCard(item, i === 0 ? 'next' : 'next2'));
    });
    return;
  }

  // ── Step 1: Determine NOW ─────────────────────────────────────────────────
  // If the active item is a task list, show the previous event as NOW instead.
  let nowItem = null;
  if (activeItem.objectType === 'event') {
    nowItem = activeItem;
  } else if (activeItem.objectType === 'taskList') {
    for (let i = currentIdx - 1; i >= 0; i--) {
      const item = state.itemMap[timeline[i]];
      if (item && item.objectType === 'event') { nowItem = item; break; }
    }
  }

  // ── Step 2: Pending task list banners ─────────────────────────────────────
  // Collect all task lists between NOW and the next event.
  // If active item is itself a task list, start scan from it (currentIdx).
  const pendingTaskLists = [];
  const searchFrom = (activeItem.objectType === 'taskList') ? currentIdx : currentIdx + 1;
  let nextEventIdx = -1;

  for (let i = searchFrom; i < timeline.length; i++) {
    const item = state.itemMap[timeline[i]];
    if (!item || item.status === 'complete' || item.status === 'skipped') continue;
    if (item.objectType === 'taskList') { pendingTaskLists.push(item); continue; }
    if (item.objectType === 'event') { nextEventIdx = i; break; }
  }

  // ── Step 3: Upcoming events ───────────────────────────────────────────────
  const upcoming = [];
  const eventSearchFrom = nextEventIdx >= 0 ? nextEventIdx : currentIdx + 1;

  for (let i = eventSearchFrom; i < timeline.length && upcoming.length < 2; i++) {
    if (i === currentIdx) continue;
    const item = state.itemMap[timeline[i]];
    if (!item || item.status === 'complete' || item.status === 'skipped') continue;
    if (item.objectType === 'event') upcoming.push(item);
  }

  // ── Render cards ──────────────────────────────────────────────────────────
  cards.innerHTML = '';

  if (nowItem) {
    cards.appendChild(buildCasterCard(nowItem, 'now'));
  }

  pendingTaskLists.forEach(tl => {
    const banner = document.createElement('div');
    banner.className = 'waiting-banner';
    banner.innerHTML = `<div class="waiting-banner__icon">✅</div><div class="waiting-banner__text">Completing production task: <strong>${escHtml(tl.title)}</strong></div>`;
    cards.appendChild(banner);
  });

  upcoming.forEach((item, i) => {
    cards.appendChild(buildCasterCard(item, i === 0 ? 'next' : 'next2'));
  });
}

// ── Card builder ───────────────────────────────────────────────────────────────
function buildCasterCard(item, slot) {
  const isNow = slot === 'now';
  const icon = TYPE_ICONS[item.type] || '⭐';
  const typeLabel = getTypeLabel(item.type);

  const card = document.createElement('div');
  card.className = `caster-card ${isNow ? 'is-now' : 'is-next'}`;

  const labelText = isNow ? `${icon} NOW` : slot === 'next' ? 'NEXT' : 'COMING UP';

  let metaHtml = '';
  if (item.estimatedDuration) {
    metaHtml += `<span>~${fmtDuration(item.estimatedDuration)}</span>`;
  }
  if (item.obsScene) {
    metaHtml += `<span class="caster-card__scene">📺 ${escHtml(item.obsScene)}</span>`;
  }

  // Type-specific details
  let typeDataHtml = '';
  const td = item.typeData || {};
  if (item.type === 'casters' && (td.castera || td.casterb)) {
    typeDataHtml = buildChips([
      td.castera ? ['🎙', 'Caster A', td.castera] : null,
      td.casterb ? ['🎙', 'Caster B', td.casterb] : null
    ]);
  } else if (item.type === 'gameplay') {
    typeDataHtml = buildChips([
      td.round ? ['🏆', 'Round', td.round] : null,
      td.table ? ['🗃', 'Table', td.table] : null,
      td.gpcastera ? ['🎙', 'Cast A', td.gpcastera] : null,
      td.gpcasterb ? ['🎙', 'Cast B', td.gpcasterb] : null,
    ]);
  } else if (item.type === 'interview') {
    typeDataHtml = buildChips([
      td.player ? ['🃏', 'Player', td.player] : null,
      td.interviewer ? ['🎤', 'Host', td.interviewer] : null,
      td.ivRound ? ['🏆', 'Round', td.ivRound] : null,
    ]);
  } else if (item.type === 'live-video' && td.camSource) {
    typeDataHtml = buildChips([['📹', 'Source', td.camSource]]);
  }

  card.innerHTML = `
    <div class="caster-card__label">${labelText}</div>
    <div class="caster-card__body">
      <div class="caster-card__type">${typeLabel}</div>
      <div class="caster-card__title">${escHtml(item.title)}</div>
      <div class="caster-card__meta">${metaHtml}</div>
      ${typeDataHtml ? `<div class="type-data-row">${typeDataHtml}</div>` : ''}
      ${item.notes && isNow ? `<div class="caster-card__notes">${escHtml(item.notes)}</div>` : ''}
    </div>`;
  return card;
}

function buildChips(chips) {
  return chips.filter(Boolean).map(([icon, label, val]) =>
    `<span class="type-data-chip">${icon} <span>${label}:</span> <strong>${escHtml(String(val))}</strong></span>`
  ).join('');
}

function updateStatusBar(prod) {
  const dot = document.getElementById('caster-status-dot');
  const label = document.getElementById('caster-status-label');
  dot.className = 'status-dot ' + (prod.status === 'live' ? 'live' : prod.status === 'paused' ? 'paused' : '');
  label.textContent = prod.status.toUpperCase();
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ── View options ───────────────────────────────────────────────────────────────
document.getElementById('show-tasklists').addEventListener('change', (e) => {
  showTaskLists = e.target.checked;
  render();
});

// ── Caster Message Banner ──────────────────────────────────────────────────────
function renderCasterMessage() {
  const msg     = state.production && state.production.casterMessage;
  const banner  = document.getElementById('caster-msg-banner');
  const text    = document.getElementById('caster-msg-banner-text');
  const layout  = document.getElementById('caster-layout');

  if (msg) {
    text.textContent = msg;
    if (banner.classList.contains('hidden')) {
      // Re-trigger animation by removing and re-adding the element clone trick
      banner.classList.remove('hidden');
      // Force reflow to replay animation
      banner.style.animation = 'none';
      banner.offsetHeight; // reflow
      banner.style.animation = '';
    }
    layout.classList.add('has-banner');
  } else {
    banner.classList.add('hidden');
    layout.classList.remove('has-banner');
  }
}

// shared.js — API helpers, socket client, utilities

// ── Socket.IO Client ─────────────────────────────────────────────────────────
const socket = io();

// ── API helpers ───────────────────────────────────────────────────────────────
const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async put(url, body) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async del(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtDuration(mins) {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getTypeLabel(type) {
  const labels = {
    casters: 'Casters',
    gameplay: 'Gameplay',
    interview: 'Interview',
    'pre-recorded': 'Pre-Recorded',
    'starting-soon': 'Starting Soon',
    brb: 'BRB',
    'live-video': 'Live Video',
    cosplay: 'Cosplay',
    'end-credits': 'End Credits',
    custom: 'Custom'
  };
  return labels[type] || type;
}

function getStatusBadgeClass(status) {
  return { idle: 'badge-idle', live: 'badge-live', paused: 'badge-paused', complete: 'badge-complete' }[status] || 'badge-idle';
}

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ── Production ID from URL ───────────────────────────────────────────────────
function getProductionIdFromUrl() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
}

const EVENT_TYPE_COLORS = {
  'starting-soon': '#F59E0B',  // Amber / gold
  'casters':       '#10B981',  // Emerald green
  'gameplay':      '#3B82F6',  // Bright blue
  'interview':     '#A855F7',  // Rich violet
  'pre-recorded':  '#F97316',  // Vivid orange
  'brb':           '#06B6D4',  // Cyan / teal
  'live-video':    '#EC4899',  // Hot pink
  'cosplay':       '#84CC16',  // Lime green
  'end-credits':   '#6366F1',  // Indigo
  'custom':        '#14B8A6',  // Teal-mint
  'taskList':      '#FBBF24',  // Bright amber/gold — warm, distinct from red
};

function getEventTypeColor(type, objectType = 'event') {
  if (objectType === 'taskList') return EVENT_TYPE_COLORS['taskList'];
  return EVENT_TYPE_COLORS[type] || EVENT_TYPE_COLORS['custom'];
}


const EVENT_TYPES = [
  'casters', 'gameplay', 'interview', 'pre-recorded', 'starting-soon',
  'brb', 'live-video', 'cosplay', 'end-credits', 'custom'
];

function formatTimerMS(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
}


function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}


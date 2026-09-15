// dashboard.js
let productions = [];
let deleteTargetId = null;

async function loadProductions() {
  try {
    productions = await api.get('/api/productions');
    renderProductions();
  } catch(e) {
    showToast('Failed to load productions', 'error');
  }
}

function renderProductions() {
  const grid = document.getElementById('productions-grid');
  if (!productions.length) {
    grid.innerHTML = '<div class="no-prods">No productions yet. Create one to get started.</div>';
    return;
  }
  grid.innerHTML = productions.map(prod => {
    const itemCount = (prod.timeline||[]).length + (prod.standby||[]).length;
    const statusClass = getStatusBadgeClass(prod.status);
    return `
    <div class="prod-card" data-id="${prod.id}">
      <div class="prod-card__name">${escHtml(prod.name)}</div>
      <div class="prod-card__meta">
        <span>~${fmtDuration(prod.estimatedLength)}</span>
        <span>${itemCount} item${itemCount!==1?'s':''}</span>
        <span class="badge ${statusClass}">${prod.status}</span>
      </div>
      <div class="prod-card__actions">
        <button class="btn btn-primary btn-sm" onclick="openProducer('${prod.id}')">🎬 Producer</button>
        <button class="btn btn-ghost btn-sm" onclick="openCaster('${prod.id}')">🎙 Caster</button>
        <button class="btn btn-ghost btn-sm" onclick="openCrew('${prod.id}')">📋 Crew</button>
        <button class="btn btn-ghost btn-sm" onclick="exportProd('${prod.id}')">⬇ Export</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('${prod.id}', event)">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function openProducer(id) { window.location.href = `/producer/${id}`; }
function openCaster(id) { window.open(`/caster/${id}`, '_blank'); }
function openCrew(id) { window.open(`/timeline/${id}`, '_blank'); }

async function exportProd(id) {
  try {
    const data = await api.get(`/api/productions/${id}/export`);
    const name = data.name.replace(/[^a-z0-9]/gi, '_');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported!', 'success');
  } catch(e) { showToast('Export failed', 'error'); }
}

function confirmDelete(id, e) {
  e.stopPropagation();
  deleteTargetId = id;
  document.getElementById('modal-confirm-delete').classList.remove('hidden');
}

// ── New Production Modal ──────────────────────────────────────────────────────
function openNewProdModal() {
  document.getElementById('new-prod-name').value = '';
  document.getElementById('new-prod-length').value = '480';
  document.getElementById('modal-new-prod').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-prod-name').focus(), 50);
}

function closeModals() {
  document.getElementById('modal-new-prod').classList.add('hidden');
  document.getElementById('modal-confirm-delete').classList.add('hidden');
}

async function createProduction() {
  const name = document.getElementById('new-prod-name').value.trim();
  const estimatedLength = parseInt(document.getElementById('new-prod-length').value) || 480;
  if (!name) { showToast('Please enter a production name', 'error'); return; }
  try {
    const prod = await api.post('/api/productions', { name, estimatedLength });
    productions.push(prod);
    renderProductions();
    closeModals();
    showToast(`"${prod.name}" created!`, 'success');
    // Go straight to producer view
    openProducer(prod.id);
  } catch(e) { showToast('Failed to create production', 'error'); }
}

async function deleteProduction() {
  if (!deleteTargetId) return;
  try {
    await api.del(`/api/productions/${deleteTargetId}`);
    productions = productions.filter(p => p.id !== deleteTargetId);
    renderProductions();
    closeModals();
    showToast('Production deleted', 'success');
    deleteTargetId = null;
  } catch(e) { showToast('Failed to delete', 'error'); }
}

// ── Import ────────────────────────────────────────────────────────────────────
async function importFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const prod = await api.post('/api/productions/import', data);
    productions.push(prod);
    renderProductions();
    showToast(`Imported "${prod.name}"!`, 'success');
  } catch(e) { showToast('Import failed: invalid JSON', 'error'); }
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.getElementById('btn-new-prod').addEventListener('click', openNewProdModal);
document.getElementById('btn-import-topbar').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('btn-close-modal').addEventListener('click', closeModals);
document.getElementById('btn-cancel-new-prod').addEventListener('click', closeModals);
document.getElementById('btn-confirm-new-prod').addEventListener('click', createProduction);
document.getElementById('btn-close-delete-modal').addEventListener('click', closeModals);
document.getElementById('btn-cancel-delete').addEventListener('click', closeModals);
document.getElementById('btn-confirm-delete').addEventListener('click', deleteProduction);

document.getElementById('new-prod-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') createProduction();
});

// Backdrop click to close
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) closeModals(); });
});

// Import file input
document.getElementById('import-file').addEventListener('change', e => {
  if (e.target.files[0]) importFile(e.target.files[0]);
});

// Drag & drop import zone
const importZone = document.getElementById('import-zone');
importZone.addEventListener('dragover', e => { e.preventDefault(); importZone.classList.add('drag-over'); });
importZone.addEventListener('dragleave', () => importZone.classList.remove('drag-over'));
importZone.addEventListener('drop', e => {
  e.preventDefault();
  importZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) importFile(file);
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadProductions();

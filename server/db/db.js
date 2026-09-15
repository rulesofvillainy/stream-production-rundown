const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let dbPath;
try {
  // pkg environment — executable's directory
  dbPath = path.join(path.dirname(process.execPath), 'data', 'db.json');
} catch (e) {
  dbPath = path.join(__dirname, '../../data/db.json');
}
// Always fall back to local data dir for dev
if (!require('fs').existsSync(path.dirname(dbPath))) {
  dbPath = path.join(__dirname, '../../data/db.json');
}

const adapter = new FileSync(dbPath);
const db = low(adapter);

// Default schema
db.defaults({
  productions: [],
  items: []
}).write();

// ─── Productions ────────────────────────────────────────────────────────────

function getAllProductions() {
  return db.get('productions').value();
}

function getProduction(id) {
  return db.get('productions').find({ id }).value();
}

function createProduction(data) {
  const prod = {
    id: uuidv4(),
    name: data.name || 'Untitled Production',
    estimatedLength: data.estimatedLength || 480,
    status: 'idle',
    currentItemIndex: 0,
    settings: {
      casters: data.settings?.casters || [],
      obsScenes: data.settings?.obsScenes || []
    },
    timeline: [],
    standby: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.get('productions').push(prod).write();
  return prod;
}

function updateProduction(id, data) {
  const allowed = ['name', 'estimatedLength', 'status', 'currentItemIndex', 'settings', 'timeline', 'standby', 'casterMessage'];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  update.updatedAt = new Date().toISOString();
  db.get('productions').find({ id }).assign(update).write();
  return getProduction(id);
}

function deleteProduction(id) {
  db.get('productions').remove({ id }).write();
  db.get('items').remove({ productionId: id }).write();
}

function importProduction(data) {
  // Assign a fresh ID to avoid collisions
  const prod = { ...data, id: uuidv4(), status: 'idle', currentItemIndex: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  // Re-ID all items to avoid collision
  const idMap = {};
  const items = (data._items || []).map(item => {
    const newId = uuidv4();
    idMap[item.id] = newId;
    return { ...item, id: newId, productionId: prod.id };
  });
  prod.timeline = (prod.timeline || []).map(id => idMap[id] || id);
  prod.standby = (prod.standby || []).map(id => idMap[id] || id);
  delete prod._items;
  db.get('productions').push(prod).write();
  items.forEach(item => db.get('items').push(item).write());
  return prod;
}

function exportProduction(id) {
  const prod = getProduction(id);
  if (!prod) return null;
  const allIds = [...(prod.timeline || []), ...(prod.standby || [])];
  const items = db.get('items').filter(item => allIds.includes(item.id)).value();
  return { ...prod, _items: items };
}

// ─── Items ───────────────────────────────────────────────────────────────────

function getItemsByProduction(productionId) {
  return db.get('items').filter({ productionId }).value();
}

function getItem(id) {
  return db.get('items').find({ id }).value();
}

function createItem(productionId, data, zone = 'standby') {
  const item = {
    id: uuidv4(),
    productionId,
    objectType: data.objectType || 'event',
    title: data.title || 'Untitled',
    estimatedDuration: data.estimatedDuration || 10,
    notes: data.notes || '',
    status: 'pending',
    // event-specific
    type: data.type || 'casters',
    obsScene: data.obsScene || '',
    typeData: data.typeData || {},
    // task list-specific
    tasks: data.tasks || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.get('items').push(item).write();

  // Add to the correct zone array on the production
  const prod = getProduction(productionId);
  if (prod) {
    const arr = [...(prod[zone] || []), item.id];
    updateProduction(productionId, { [zone]: arr });
  }
  return item;
}

function updateItem(id, data) {
  const allowed = ['title', 'estimatedDuration', 'notes', 'status', 'type', 'obsScene', 'typeData', 'tasks'];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  update.updatedAt = new Date().toISOString();
  db.get('items').find({ id }).assign(update).write();
  return getItem(id);
}

function deleteItem(id) {
  const item = getItem(id);
  if (item) {
    const prod = getProduction(item.productionId);
    if (prod) {
      const timeline = (prod.timeline || []).filter(i => i !== id);
      const standby = (prod.standby || []).filter(i => i !== id);
      updateProduction(item.productionId, { timeline, standby });
    }
  }
  db.get('items').remove({ id }).write();
}

function reorderZone(productionId, zone, orderedIds) {
  updateProduction(productionId, { [zone]: orderedIds });
}

function moveItem(productionId, itemId, fromZone, toZone, insertIndex) {
  const prod = getProduction(productionId);
  if (!prod) return;
  let from = [...(prod[fromZone] || [])].filter(id => id !== itemId);
  let to = [...(prod[toZone] || [])].filter(id => id !== itemId);
  if (insertIndex !== undefined && insertIndex >= 0) {
    to.splice(insertIndex, 0, itemId);
  } else {
    to.push(itemId);
  }
  updateProduction(productionId, { [fromZone]: from, [toZone]: to });
}

function toggleTask(itemId, taskId, complete) {
  const item = getItem(itemId);
  if (!item) return null;
  const tasks = (item.tasks || []).map(t => t.id === taskId ? { ...t, complete } : t);
  return updateItem(itemId, { tasks });
}

module.exports = {
  db,
  getAllProductions,
  getProduction,
  createProduction,
  updateProduction,
  deleteProduction,
  importProduction,
  exportProduction,
  getItemsByProduction,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  reorderZone,
  moveItem,
  toggleTask
};

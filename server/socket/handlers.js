// socket/handlers.js — Socket.IO event handlers
const db = require('../db/db');

function buildState(productionId) {
  const prod = db.getProduction(productionId);
  if (!prod) return null;
  const items = db.getItemsByProduction(productionId);
  return { production: prod, items };
}

function broadcast(io, productionId) {
  const state = buildState(productionId);
  if (state) io.to(productionId).emit('production:stateUpdate', state);
}

module.exports = function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('[socket] client connected:', socket.id);

    socket.on('production:join', (productionId) => {
      socket.join(productionId);
      const state = buildState(productionId);
      if (state) socket.emit('production:stateUpdate', state);
    });

    socket.on('production:leave', (productionId) => {
      socket.leave(productionId);
    });

    // ── Production controls ─────────────────────────────────────────────────

    socket.on('production:start', ({ productionId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      if (prod.status === 'idle' || prod.status === 'paused') {
        db.updateProduction(productionId, { status: 'live' });
        broadcast(io, productionId);
      }
    });

    socket.on('production:pause', ({ productionId }) => {
      db.updateProduction(productionId, { status: 'paused' });
      broadcast(io, productionId);
    });

    socket.on('production:reset', ({ productionId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      // Reset all item statuses
      const allIds = [...prod.timeline, ...prod.standby];
      allIds.forEach(id => {
        const item = db.getItem(id);
        if (item) {
          const resetItem = { status: 'pending' };
          if (item.objectType === 'taskList') {
            resetItem.tasks = (item.tasks || []).map(t => ({ ...t, complete: false }));
          }
          db.updateItem(id, resetItem);
        }
      });
      db.updateProduction(productionId, { status: 'idle', currentItemIndex: 0 });
      broadcast(io, productionId);
    });

    // ── Item advancement ────────────────────────────────────────────────────

    socket.on('item:complete', ({ productionId, itemId }) => {
      const prod = db.getProduction(productionId);
      if (!prod || prod.status !== 'live') return;

      db.updateItem(itemId, { status: 'complete' });

      // Find next pending item in timeline
      const timeline = prod.timeline;
      const currentIdx = timeline.indexOf(itemId);
      let nextIdx = currentIdx + 1;

      // Skip completed items
      while (nextIdx < timeline.length) {
        const nextItem = db.getItem(timeline[nextIdx]);
        if (nextItem && nextItem.status !== 'complete' && nextItem.status !== 'skipped') break;
        nextIdx++;
      }

      if (nextIdx < timeline.length) {
        db.updateItem(timeline[nextIdx], { status: 'active' });
        db.updateProduction(productionId, { currentItemIndex: nextIdx });
      } else {
        // All done
        db.updateProduction(productionId, { status: 'complete' });
      }
      broadcast(io, productionId);
    });

    socket.on('item:activate', ({ productionId, itemId }) => {
      // Manually jump to a specific item
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const idx = prod.timeline.indexOf(itemId);
      if (idx < 0) return;
      db.updateItem(itemId, { status: 'active' });
      db.updateProduction(productionId, { currentItemIndex: idx });
      broadcast(io, productionId);
    });

    socket.on('item:skip', ({ productionId, itemId }) => {
      db.updateItem(itemId, { status: 'skipped' });
      broadcast(io, productionId);
    });

    // ── Task toggle ─────────────────────────────────────────────────────────

    socket.on('task:toggle', ({ itemId, taskId, complete, productionId }) => {
      db.toggleTask(itemId, taskId, complete);
      broadcast(io, productionId);
    });

    // ── Caster message ──────────────────────────────────────────────────────

    socket.on('caster:message:send', ({ productionId, message }) => {
      if (!productionId || !message || !message.trim()) return;
      db.updateProduction(productionId, { casterMessage: message.trim() });
      broadcast(io, productionId);
    });

    socket.on('caster:message:clear', ({ productionId }) => {
      if (!productionId) return;
      db.updateProduction(productionId, { casterMessage: null });
      broadcast(io, productionId);
    });

    // ── Item CRUD (real-time) ───────────────────────────────────────────────

    socket.on('item:update', ({ productionId, itemId, data }) => {
      db.updateItem(itemId, data);
      broadcast(io, productionId);
    });

    socket.on('item:delete', ({ productionId, itemId }) => {
      db.deleteItem(itemId);
      broadcast(io, productionId);
    });

    socket.on('item:reorder', ({ productionId, zone, orderedIds }) => {
      db.reorderZone(productionId, zone, orderedIds);
      broadcast(io, productionId);
    });

    socket.on('item:move', ({ productionId, itemId, fromZone, toZone, insertIndex }) => {
      db.moveItem(productionId, itemId, fromZone, toZone, insertIndex);
      broadcast(io, productionId);
    });

    // Triggered after any REST API change to push state to all clients
    socket.on('production:refresh', ({ productionId }) => {
      broadcast(io, productionId);
    });


    socket.on('disconnect', () => {
      console.log('[socket] client disconnected:', socket.id);
    });
  });
};

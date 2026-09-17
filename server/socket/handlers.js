// socket/handlers.js  Socket.IO event handlers
const db = require('../db/db');
const { randomUUID: uuidv4 } = require('crypto');

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

// -- Event Timing Helpers ----------------------------------------------------
function getLiveEventId(prod) {
  if (prod.status === 'idle') return null;
  const currentIdx = prod.currentItemIndex;
  const currentId = prod.timeline[currentIdx];
  const activeItem = db.getItem(currentId);
  if (!activeItem || activeItem.status === 'pending') return null;

  if (activeItem.objectType === 'event') return activeItem.id;
  
  if (activeItem.objectType === 'taskList') {
    for (let i = currentIdx - 1; i >= 0; i--) {
      const prevItem = db.getItem(prod.timeline[i]);
      if (prevItem && prevItem.objectType === 'event') return prevItem.id;
    }
  }
  return null;
}

function updateProductionTimer(prod, newStatus) {
  const now = Date.now();
  let elapsed = prod.productionElapsedMs || 0;
  
  if (prod.productionLastStartedAt) {
    elapsed += now - prod.productionLastStartedAt;
  }
  
  let nextStartedAt = null;
  if (newStatus === 'live') {
    nextStartedAt = now;
  }
  
  return db.updateProduction(prod.id, {
    productionElapsedMs: elapsed,
    productionLastStartedAt: nextStartedAt
  });
}

function updateLiveEventTimer(prod, newStatus) {
  const now = Date.now();
  const newLiveEventId = getLiveEventId(prod);
  const oldLiveEventId = prod.liveEventId;

  let elapsed = prod.liveEventElapsedMs || 0;
  if (prod.liveEventLastStartedAt) {
    elapsed += now - prod.liveEventLastStartedAt;
  }

  // If the live event changed, save the old one's duration
  if (oldLiveEventId && oldLiveEventId !== newLiveEventId) {
    db.updateItem(oldLiveEventId, { actualDurationMs: elapsed });
    elapsed = 0; // reset for the new event
  }

  let nextStartedAt = null;
  if (newStatus === 'live' && newLiveEventId) {
    nextStartedAt = now;
  }

  db.updateProduction(prod.id, {
    liveEventId: newLiveEventId,
    liveEventElapsedMs: elapsed,
    liveEventLastStartedAt: nextStartedAt
  });
}

function updateCustomTimersOnPauseResume(prod, isPause) {
  const now = Date.now();
  const timers = prod.timers || [];
  let updated = false;
  
  const newTimers = timers.map(t => {
    if (t.isRunning) {
      if (isPause) {
        const remaining = Math.max(0, t.remainingMs - (now - (t.lastStartedAt || now)));
        updated = true;
        return { ...t, isRunning: false, remainingMs: remaining, lastStartedAt: null };
      }
    }
    return t;
  });

  if (updated) {
    db.updateProduction(prod.id, { timers: newTimers });
  }
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

    // -- Production controls -------------------------------------------------

    socket.on('production:start', ({ productionId }) => {
      let prod = db.getProduction(productionId);
      if (!prod) return;
      if (prod.status === 'idle' || prod.status === 'paused') {
        prod = db.updateProduction(productionId, { status: 'live' });
        updateProductionTimer(prod, 'live');
        updateLiveEventTimer(prod, 'live');
        broadcast(io, productionId);
      }
    });

    socket.on('production:pause', ({ productionId }) => {
      let prod = db.getProduction(productionId);
      if (prod) {
        prod = db.updateProduction(productionId, { status: 'paused' });
        updateProductionTimer(prod, 'paused');
        updateLiveEventTimer(prod, 'paused');
        updateCustomTimersOnPauseResume(prod, true);
        broadcast(io, productionId);
      }
    });

    socket.on('production:reset', ({ productionId }) => {
      let prod = db.getProduction(productionId);
      if (!prod) return;
      
      const timers = (prod.timers || []).map(t => ({ ...t, isRunning: false, remainingMs: t.durationMs, lastStartedAt: null }));

      const allIds = [...prod.timeline, ...prod.standby];
      allIds.forEach(id => {
        const item = db.getItem(id);
        if (item) {
          const resetItem = { status: 'pending', actualDurationMs: null };
          if (item.objectType === 'taskList') {
            resetItem.tasks = (item.tasks || []).map(t => ({ ...t, complete: false }));
          }
          db.updateItem(id, resetItem);
        }
      });
      
      prod = db.updateProduction(productionId, { 
        status: 'idle', 
        currentItemIndex: 0,
        timers,
        liveEventId: null,
        liveEventElapsedMs: 0,
        liveEventLastStartedAt: null,
        productionElapsedMs: 0,
        productionLastStartedAt: null
      });
      broadcast(io, productionId);
    });

    // -- Item advancement ----------------------------------------------------

    socket.on('item:complete', ({ productionId, itemId }) => {
      let prod = db.getProduction(productionId);
      if (!prod || prod.status !== 'live') return;

      db.updateItem(itemId, { status: 'complete' });

      const timeline = prod.timeline;
      const currentIdx = timeline.indexOf(itemId);
      let nextIdx = currentIdx + 1;

      while (nextIdx < timeline.length) {
        const nextItem = db.getItem(timeline[nextIdx]);
        if (nextItem && nextItem.status !== 'complete' && nextItem.status !== 'skipped') break;
        nextIdx++;
      }

      if (nextIdx < timeline.length) {
        db.updateItem(timeline[nextIdx], { status: 'active' });
        prod = db.updateProduction(productionId, { currentItemIndex: nextIdx });
      } else {
        prod = db.updateProduction(productionId, { status: 'complete' });
      }
      
      updateLiveEventTimer(prod, prod.status);
      broadcast(io, productionId);
    });

    socket.on('item:activate', ({ productionId, itemId }) => {
      let prod = db.getProduction(productionId);
      if (!prod) return;
      const idx = prod.timeline.indexOf(itemId);
      if (idx < 0) return;
      db.updateItem(itemId, { status: 'active' });
      prod = db.updateProduction(productionId, { currentItemIndex: idx });
      updateLiveEventTimer(prod, prod.status);
      broadcast(io, productionId);
    });

    socket.on('item:skip', ({ productionId, itemId }) => {
      db.updateItem(itemId, { status: 'skipped' });
      broadcast(io, productionId);
    });

    // -- Task toggle ---------------------------------------------------------

    socket.on('task:toggle', ({ itemId, taskId, complete, productionId }) => {
      db.toggleTask(itemId, taskId, complete);
      broadcast(io, productionId);
    });

    // -- Caster message ------------------------------------------------------

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

    // -- Custom Timers -------------------------------------------------------

    socket.on('timer:toggleVisibility', ({ productionId, timerId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const timers = (prod.timers || []).map(t => {
        if (t.id === timerId) {
          return { ...t, isVisible: t.isVisible === false ? true : false };
        }
        return t;
      });
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });

    socket.on('timer:updateName', ({ productionId, timerId, name }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const timers = (prod.timers || []).map(t => {
        if (t.id === timerId) {
          return { ...t, name };
        }
        return t;
      });
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });

    socket.on('timer:create', ({ productionId, name, durationMs }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const timers = prod.timers || [];
      timers.push({
        id: uuidv4(),
        name,
        durationMs,
        remainingMs: durationMs,
        isRunning: false, lastStartedAt: null, isVisible: false
      });
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });

    socket.on('timer:play', ({ productionId, timerId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const timers = (prod.timers || []).map(t => {
        if (t.id === timerId && !t.isRunning && t.remainingMs > 0) {
          return { ...t, isRunning: true, lastStartedAt: Date.now() };
        }
        return t;
      });
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });

    socket.on('timer:pause', ({ productionId, timerId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const now = Date.now();
      const timers = (prod.timers || []).map(t => {
        if (t.id === timerId && t.isRunning) {
          const remaining = Math.max(0, t.remainingMs - (now - (t.lastStartedAt || now)));
          return { ...t, isRunning: false, remainingMs: remaining, lastStartedAt: null };
        }
        return t;
      });
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });

    socket.on('timer:reset', ({ productionId, timerId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const timers = (prod.timers || []).map(t => {
        if (t.id === timerId) {
          return { ...t, isRunning: false, remainingMs: t.durationMs, lastStartedAt: null };
        }
        return t;
      });
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });

    socket.on('timer:delete', ({ productionId, timerId }) => {
      const prod = db.getProduction(productionId);
      if (!prod) return;
      const timers = (prod.timers || []).filter(t => t.id !== timerId);
      db.updateProduction(productionId, { timers });
      broadcast(io, productionId);
    });


    // -- Item CRUD (real-time) -----------------------------------------------

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

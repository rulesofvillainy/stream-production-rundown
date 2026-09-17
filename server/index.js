const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Static files ──────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// ── API Routes ────────────────────────────────────────────────────────────────
const productionsRouter = require('./routes/productions');
const timelineRouter = require('./routes/timeline');

app.use('/api/productions', productionsRouter);
app.use('/api/productions/:productionId/items', timelineRouter);

// ── Named views ────────────────────────────────────────────────────────────────
app.get('/producer/:productionId', (req, res) => {
  res.sendFile(path.join(publicDir, 'producer.html'));
});

app.get('/caster/:productionId', (req, res) => {
  res.sendFile(path.join(publicDir, 'caster.html'));
});

app.get('/timeline/:productionId', (req, res) => {
  res.sendFile(path.join(publicDir, 'timeline.html'));
});

app.get('/timer/:productionId/:timerId', (req, res) => {
  res.sendFile(path.join(publicDir, 'timer.html'));
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
const registerSocketHandlers = require('./socket/handlers');
registerSocketHandlers(io);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎬 Stream Production Manager`);
  console.log(`   Running at http://localhost:${PORT}`);
  console.log(`   Producer: http://localhost:${PORT}/`);
  console.log(`   Press Ctrl+C to stop\n`);
});

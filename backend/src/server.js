// Canteen Pre-order System - REST API (Node.js + Express)
//
// Configuration (environment variables):
//   PORT      port to listen on            (default 3000)
//   DATA_DIR  where db.json is saved       (default ./data, /data in the container)
//   APP_TZ    time zone for "today"        (default Asia/Kolkata)
import express from 'express';
import path from 'node:path';
import { Store, ApiError, STATUSES } from './store.js';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const APP_TZ = process.env.APP_TZ || 'Asia/Kolkata';

const store = new Store(DATA_DIR, APP_TZ);
const app = express();
app.use(express.json({ limit: '20kb' }));

// Log every request except health checks (see them with `podman logs`).
app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.path !== '/api/health') console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

// Used by the container HEALTHCHECK and for troubleshooting.
app.get('/api/health', (req, res) => {
  res.json({ status: 'UP', orders: store.orders.length, dataDir: DATA_DIR, time: new Date().toISOString() });
});

app.get('/api/menu', (req, res) => {
  res.json(store.getMenu());
});

app.post('/api/menu', (req, res) => {
  const item = store.addMenuItem(req.body?.name, req.body?.price);
  res.status(201).json(item);
});

// GET /api/orders?status=READY&date=2026-10-30  (both filters optional)
app.get('/api/orders', (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  if (status && !STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of ${STATUSES.join(', ')}`);
  }
  const date = req.query.date ? checkDate(req.query.date) : undefined;
  res.json(store.listOrders({ status, date }));
});

// Body: { "customer": "Ravi", "items": [{ "menuItemId": 1, "qty": 2 }] }
app.post('/api/orders', (req, res) => {
  const order = store.createOrder(req.body?.customer, req.body?.items);
  console.log(`New order #${order.id} for ${order.customer}, total Rs ${order.total}`);
  res.status(201).json(order);
});

app.get('/api/orders/:id', (req, res) => {
  res.json(store.getOrder(Number(req.params.id)));
});

// Body: { "status": "READY" }
app.patch('/api/orders/:id/status', (req, res) => {
  const status = String(req.body?.status ?? '').toUpperCase();
  const order = store.updateStatus(Number(req.params.id), status);
  console.log(`Order #${order.id} -> ${order.status}`);
  res.json(order);
});

// Daily order count. GET /api/stats?date=2026-10-30 (defaults to today)
app.get('/api/stats', (req, res) => {
  const date = req.query.date ? checkDate(req.query.date) : store.today();
  res.json(store.stats(date));
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Turns thrown errors into JSON responses.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body must be valid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

function checkDate(value) {
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new ApiError(400, 'Date must look like 2026-10-30');
  }
  return s;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Canteen API listening on port ${PORT} (data: ${DATA_DIR}, tz: ${APP_TZ})`);
});

// `podman stop` sends SIGTERM; close cleanly instead of being killed after 10s.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  });
}

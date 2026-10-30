// Keeps the menu and orders in memory and saves them to DATA_DIR/db.json.
// In the container DATA_DIR is /data, which is a Podman volume, so the data
// survives container removal and image rebuilds.
import fs from 'node:fs';
import path from 'node:path';

export const STATUSES = ['PLACED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];
const CLOSED = ['COLLECTED', 'CANCELLED'];

const DEFAULT_MENU = [
  { id: 1, name: 'Masala Dosa', price: 50 },
  { id: 2, name: 'Idli (2 pcs)', price: 30 },
  { id: 3, name: 'Veg Biryani', price: 90 },
  { id: 4, name: 'Chapati Meal', price: 70 },
  { id: 5, name: 'Samosa', price: 15 },
  { id: 6, name: 'Tea', price: 12 },
  { id: 7, name: 'Coffee', price: 15 },
  { id: 8, name: 'Fresh Lime Soda', price: 25 },
];

/** An error that the API sends back with a specific HTTP status code. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class Store {
  constructor(dataDir, timeZone = 'Asia/Kolkata') {
    this.file = path.join(dataDir, 'db.json');
    this.timeZone = timeZone;
    fs.mkdirSync(dataDir, { recursive: true });

    if (fs.existsSync(this.file)) {
      const db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.menu = db.menu ?? [];
      this.orders = db.orders ?? [];
    } else {
      this.menu = structuredClone(DEFAULT_MENU);
      this.orders = [];
      this.save();
      console.log(`No data found, created default menu at ${this.file}`);
    }
    console.log(`Loaded ${this.menu.length} menu items and ${this.orders.length} orders from ${this.file}`);
  }

  // ---------- menu ----------

  getMenu() {
    return this.menu;
  }

  addMenuItem(rawName, rawPrice) {
    const name = clean(rawName);
    const price = Number(rawPrice);
    if (!name) throw new ApiError(400, 'Item name is required');
    if (!Number.isInteger(price) || price < 1 || price > 10000) {
      throw new ApiError(400, 'Price must be a whole number between 1 and 10000');
    }
    if (this.menu.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError(409, `'${name}' is already on the menu`);
    }
    const item = { id: nextId(this.menu), name, price };
    this.menu.push(item);
    this.save();
    return item;
  }

  // ---------- orders ----------

  /** items is a list like [{ menuItemId: 1, qty: 2 }]. Prices always come from the menu, never the client. */
  createOrder(rawCustomer, items) {
    const customer = clean(rawCustomer);
    if (!customer) throw new ApiError(400, 'Customer name is required');
    if (!Array.isArray(items)) throw new ApiError(400, 'items must be a list');

    const lines = [];
    for (const { menuItemId, qty } of items) {
      if (Number(qty) === 0) continue;
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
        throw new ApiError(400, 'Quantity must be a whole number between 1 and 50');
      }
      const menuItem = this.menu.find((m) => m.id === menuItemId);
      if (!menuItem) throw new ApiError(400, `Unknown menu item id ${menuItemId}`);
      // Copy name and price so later menu changes do not alter old orders.
      lines.push({ menuItemId, name: menuItem.name, price: menuItem.price, qty, subtotal: menuItem.price * qty });
    }
    if (lines.length === 0) throw new ApiError(400, 'Select at least one item');

    const order = {
      id: nextId(this.orders),
      customer,
      items: lines,
      total: lines.reduce((sum, l) => sum + l.subtotal, 0),
      status: 'PLACED',
      createdAt: new Date().toISOString(),
    };
    this.orders.push(order);
    this.save();
    return order;
  }

  /** Newest first. status and date (YYYY-MM-DD) are optional filters. */
  listOrders({ status, date } = {}) {
    return this.orders
      .filter((o) => !status || o.status === status)
      .filter((o) => !date || this.dayOf(o.createdAt) === date)
      .sort((a, b) => b.id - a.id);
  }

  getOrder(id) {
    const order = this.orders.find((o) => o.id === id);
    if (!order) throw new ApiError(404, `Order ${id} not found`);
    return order;
  }

  updateStatus(id, status) {
    if (!STATUSES.includes(status)) {
      throw new ApiError(400, `Status must be one of ${STATUSES.join(', ')}`);
    }
    const order = this.getOrder(id);
    if (CLOSED.includes(order.status)) {
      throw new ApiError(409, `Order ${id} is already ${order.status} and cannot change`);
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  // ---------- daily order count (assigned variation) ----------

  stats(date = this.today()) {
    const dayOrders = this.listOrders({ date });
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const o of dayOrders) byStatus[o.status]++;

    const expectedRevenue = dayOrders
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + o.total, 0);

    // Order count for each of the 7 days ending on `date`, oldest first.
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = shiftDate(date, -i);
      last7Days.push({ date: d, count: this.orders.filter((o) => this.dayOf(o.createdAt) === d).length });
    }
    return { date, orderCount: dayOrders.length, expectedRevenue, byStatus, last7Days };
  }

  today() {
    return this.dayOf(new Date());
  }

  /** Calendar day (YYYY-MM-DD) of a timestamp in the canteen's time zone. */
  dayOf(timestamp) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.timeZone }).format(new Date(timestamp));
  }

  // ---------- persistence ----------

  /** Write to a temp file, then rename it, so a crash never leaves a half-written file. */
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ menu: this.menu, orders: this.orders }, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

function nextId(list) {
  return list.reduce((max, x) => Math.max(max, x.id), 0) + 1;
}

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

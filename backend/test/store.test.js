// Unit tests for the data layer. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canteen-test-'));
  return { dir, store: new Store(dir) };
}

test('seeds a default menu with prices', () => {
  const { store } = freshStore();
  assert.ok(store.getMenu().length >= 5);
  assert.ok(store.getMenu().every((m) => m.price > 0));
});

test('calculates the order total from menu prices', () => {
  const { store } = freshStore();
  // 2 x Masala Dosa (50) + 1 x Tea (12) = 112
  const order = store.createOrder('Ravi', [{ menuItemId: 1, qty: 2 }, { menuItemId: 6, qty: 1 }]);
  assert.equal(order.total, 112);
  assert.equal(order.status, 'PLACED');
});

test('rejects bad orders', () => {
  const { store } = freshStore();
  assert.throws(() => store.createOrder('', [{ menuItemId: 1, qty: 1 }]), /Customer name/);
  assert.throws(() => store.createOrder('Ravi', []), /at least one item/);
  assert.throws(() => store.createOrder('Ravi', [{ menuItemId: 999, qty: 1 }]), /Unknown menu item/);
  assert.throws(() => store.createOrder('Ravi', [{ menuItemId: 1, qty: 100 }]), /Quantity/);
});

test('updates status, and collected orders are locked', () => {
  const { store } = freshStore();
  const order = store.createOrder('Ravi', [{ menuItemId: 1, qty: 1 }]);
  assert.equal(store.updateStatus(order.id, 'READY').status, 'READY');
  assert.throws(() => store.updateStatus(order.id, 'EATEN'), /Status must be one of/);
  store.updateStatus(order.id, 'COLLECTED');
  assert.throws(() => store.updateStatus(order.id, 'PLACED'), /cannot change/);
});

test('filters orders by status and counts orders per day', () => {
  const { store } = freshStore();
  const a = store.createOrder('A', [{ menuItemId: 1, qty: 1 }]);
  store.createOrder('B', [{ menuItemId: 2, qty: 1 }]);
  store.updateStatus(a.id, 'READY');

  assert.deepEqual(store.listOrders({ status: 'READY' }).map((o) => o.id), [a.id]);
  const stats = store.stats();
  assert.equal(stats.orderCount, 2);
  assert.equal(stats.byStatus.READY, 1);
  assert.equal(stats.last7Days.at(-1).count, 2);
});

test('data persists after reloading from disk', () => {
  const { dir, store } = freshStore();
  store.addMenuItem('Paneer Roll', 60);
  store.createOrder('Ravi', [{ menuItemId: 1, qty: 1 }]);

  const reloaded = new Store(dir);
  assert.ok(reloaded.getMenu().some((m) => m.name === 'Paneer Roll'));
  assert.equal(reloaded.listOrders().length, 1);
});

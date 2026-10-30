// All calls to the backend go through here. The paths are relative (/api/...),
// so the same build works behind Vite in development and behind nginx in Podman.

export const STATUSES = ['PLACED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

export const api = {
  getMenu: () => request('/api/menu'),
  addMenuItem: (name, price) =>
    request('/api/menu', { method: 'POST', body: JSON.stringify({ name, price }) }),

  getOrders: ({ status, date } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (date) params.set('date', date);
    return request(`/api/orders?${params}`);
  },
  createOrder: (customer, items) =>
    request('/api/orders', { method: 'POST', body: JSON.stringify({ customer, items }) }),
  updateStatus: (id, status) =>
    request(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getStats: (date) => request(`/api/stats${date ? `?date=${date}` : ''}`),
};

/** Today's date as YYYY-MM-DD in the browser's local time zone. */
export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

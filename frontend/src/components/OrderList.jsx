import { useEffect, useState } from 'react';
import { api, STATUSES } from '../api.js';

const CLOSED = ['COLLECTED', 'CANCELLED'];

/** Lists orders, filters them by status/date, and updates their status. */
export default function OrderList({ version, onChanged }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.getOrders({ status, date })
      .then((list) => { setOrders(list); setError(''); })
      .catch((e) => setError(e.message));
  }

  useEffect(load, [status, date, version]);

  async function changeStatus(id, newStatus) {
    try {
      await api.updateStatus(id, newStatus);
      onChanged(); // reloads this list and the daily stats
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  return (
    <section className="card">
      <div className="row heading">
        <h2>Orders</h2>
        <label>Status{' '}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button type="button" className="secondary" onClick={onChanged}>Refresh</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Time</th><th>Customer</th><th>Items</th><th className="num">Total</th><th>Status</th><th>Update</th></tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan="7" className="muted">No orders match this filter.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{new Date(o.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{o.customer}</td>
                <td className="muted">{o.items.map((i) => <div key={i.menuItemId}>{i.name} x{i.qty}</div>)}</td>
                <td className="num">Rs {o.total}</td>
                <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                <td>
                  {!CLOSED.includes(o.status) && (
                    <select aria-label={`Status of order ${o.id}`} value={o.status}
                      onChange={(e) => changeStatus(o.id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="msg error">{error}</div>}
    </section>
  );
}

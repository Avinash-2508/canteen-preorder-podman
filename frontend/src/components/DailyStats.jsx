import { useEffect, useState } from 'react';
import { api, STATUSES, todayISO } from '../api.js';

/** Assigned variation: daily order count, counts per status, and a 7-day bar chart. */
export default function DailyStats({ version }) {
  const [date, setDate] = useState(todayISO());
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getStats(date).then((s) => { setStats(s); setError(''); }).catch((e) => setError(e.message));
  }, [date, version]);

  const max = stats ? Math.max(1, ...stats.last7Days.map((d) => d.count)) : 1;

  return (
    <section className="card">
      <div className="row heading">
        <h2>Daily order count</h2>
        <input type="date" aria-label="Day" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <div className="msg error">{error}</div>}
      {stats && (
        <>
          <div className="stats">
            <div className="stat highlight"><b>{stats.orderCount}</b><span>orders on {stats.date}</span></div>
            <div className="stat"><b>Rs {stats.expectedRevenue}</b><span>to collect at counter</span></div>
            {STATUSES.map((s) => (
              <div className="stat" key={s}><b>{stats.byStatus[s]}</b><span>{s.toLowerCase()}</span></div>
            ))}
          </div>
          <div className="bars" aria-label="Orders in the last 7 days">
            {stats.last7Days.map((d) => (
              <div className="bar" key={d.date} title={`${d.date}: ${d.count} orders`}>
                <span>{d.count}</span>
                <div style={{ height: `${Math.round((d.count / max) * 60)}px` }} />
                <span>{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

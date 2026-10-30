import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Message from './Message.jsx';

/** Shows the menu with prices and lets the student build and place an order. */
export default function OrderForm({ menuVersion, onOrderPlaced }) {
  const [menu, setMenu] = useState([]);
  const [quantities, setQuantities] = useState({}); // { menuItemId: qty }
  const [customer, setCustomer] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getMenu().then(setMenu).catch((e) => setMessage({ error: true, text: e.message }));
  }, [menuVersion]);

  const total = menu.reduce((sum, item) => sum + item.price * (quantities[item.id] || 0), 0);

  function setQty(id, value) {
    const qty = Math.max(0, Math.min(50, parseInt(value, 10) || 0));
    setQuantities({ ...quantities, [id]: qty });
  }

  async function placeOrder(e) {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ menuItemId: Number(id), qty }));

    setBusy(true);
    try {
      const order = await api.createOrder(customer, items);
      setMessage({ text: `Order #${order.id} placed. Total Rs ${order.total}, pay at the counter.` });
      setQuantities({});
      setCustomer('');
      onOrderPlaced();
    } catch (err) {
      setMessage({ error: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Menu</h2>
      <form onSubmit={placeOrder}>
        <table>
          <thead>
            <tr><th>Item</th><th className="num">Price</th><th className="num">Qty</th></tr>
          </thead>
          <tbody>
            {menu.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="num">Rs {item.price}</td>
                <td className="num">
                  <input
                    type="number" min="0" max="50" className="qty"
                    aria-label={`Quantity of ${item.name}`}
                    value={quantities[item.id] || 0}
                    onChange={(e) => setQty(item.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row">
          <input
            type="text" className="grow" placeholder="Your name / roll no." maxLength={40} required
            value={customer} onChange={(e) => setCustomer(e.target.value)}
          />
        </div>
        <div className="row">
          <button type="submit" disabled={busy || total === 0}>Place order</button>
          <button type="button" className="secondary" onClick={() => setQuantities({})}>Clear</button>
          <span className="total">Total: Rs {total}</span>
        </div>
        <Message message={message} />
      </form>
    </section>
  );
}

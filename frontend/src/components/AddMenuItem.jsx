import { useState } from 'react';
import { api } from '../api.js';
import Message from './Message.jsx';

/** Lets kitchen staff add a dish to the menu. */
export default function AddMenuItem({ onAdded }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState(null);

  async function add(e) {
    e.preventDefault();
    try {
      const item = await api.addMenuItem(name, Number(price));
      setMessage({ text: `Added ${item.name} (Rs ${item.price}).` });
      setName('');
      setPrice('');
      onAdded();
    } catch (err) {
      setMessage({ error: true, text: err.message });
    }
  }

  return (
    <section className="card">
      <details>
        <summary>Add a menu item (kitchen)</summary>
        <form className="row" onSubmit={add}>
          <input type="text" className="grow" placeholder="Item name" maxLength={40} required
            value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" className="price" placeholder="Rs" min="1" max="10000" required
            value={price} onChange={(e) => setPrice(e.target.value)} />
          <button type="submit">Add</button>
        </form>
        <Message message={message} />
      </details>
    </section>
  );
}

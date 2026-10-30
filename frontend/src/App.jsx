import { useState } from 'react';
import OrderForm from './components/OrderForm.jsx';
import AddMenuItem from './components/AddMenuItem.jsx';
import DailyStats from './components/DailyStats.jsx';
import OrderList from './components/OrderList.jsx';

export default function App() {
  // Bumping these numbers tells the child components to reload their data.
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [menuVersion, setMenuVersion] = useState(0);
  const ordersChanged = () => setOrdersVersion((v) => v + 1);

  return (
    <>
      <header className="topbar">
        <h1>Canteen Pre-order System</h1>
        <p>Order ahead, pay at the counter. No online payment.</p>
      </header>

      <main className="layout">
        <div className="column">
          <OrderForm menuVersion={menuVersion} onOrderPlaced={ordersChanged} />
          <AddMenuItem onAdded={() => setMenuVersion((v) => v + 1)} />
        </div>
        <div className="column">
          <DailyStats version={ordersVersion} />
          <OrderList version={ordersVersion} onChanged={ordersChanged} />
        </div>
      </main>
    </>
  );
}

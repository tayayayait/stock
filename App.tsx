import * as React from 'react';

import DeepflowDashboard from './src/app/pages/deepflow/DeepflowDashboard';
import OrdersPage from './src/domains/orders/pages/OrdersPage';
import ToastProvider from './src/components/Toaster';

type ViewMode = 'dashboard' | 'orders';

const App: React.FC = () => {
  const [view, setView] = React.useState<ViewMode>('dashboard');

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-slate-100">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex w-full items-center justify-between px-6 py-4">
            <h1 className="text-lg font-semibold text-slate-800">STOCK- Console</h1>
            <nav className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setView('dashboard')}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                수요/재고 대시보드
              </button>
              <button
                type="button"
                onClick={() => setView('orders')}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${view === 'orders' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                주문서 관리
              </button>
            </nav>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          {view === 'dashboard' ? <DeepflowDashboard /> : <OrdersPage />}
        </main>
      </div>
    </ToastProvider>
  );
};

export default App;

import { Outlet } from 'react-router-dom';
import BottomNav, { TopBar } from './BottomNav';
import DesktopSidebar from './DesktopSidebar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <DesktopSidebar />
      <main className="main-content pb-20 md:pb-0 md:ml-56 lg:ml-64">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <Outlet />
        </div>
        {/* Spacer zodat content boven de home-indicator-balk uitkomt op iPhone */}
        <div className="md:hidden" style={{ height: 'env(safe-area-inset-bottom)' }} />
      </main>
      <BottomNav />
    </div>
  );
}

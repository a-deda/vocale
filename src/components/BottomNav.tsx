import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookMarked, GraduationCap, BarChart3, User, Flame, Snowflake } from 'lucide-react';
import { useStore } from './StoreProvider';

const leftItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/toevoegen', icon: BookMarked, label: 'Woorden' },
];

const rightItems = [
  { to: '/statistieken', icon: BarChart3, label: 'Stats' },
  { to: '/profiel', icon: User, label: 'Profiel' },
];

export default function BottomNav() {
  const location = useLocation();
  const studyActive = location.pathname === '/studeren';

  const renderItem = ({ to, icon: Icon, label }: { to: string; icon: typeof Home; label: string }) => {
    const active = location.pathname === to;
    return (
      <NavLink
        key={to}
        to={to}
        className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1"
      >
        <Icon className={`h-5 w-5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          {label}
        </span>
      </NavLink>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around py-2">
        {leftItems.map(renderItem)}
        <NavLink
          to="/studeren"
          className="flex flex-1 flex-col items-center gap-0.5 px-2 py-1"
        >
          <div className="gradient-primary flex h-12 w-12 items-center justify-center rounded-full -mt-5 shadow-lg shadow-primary/30">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className={`text-[10px] font-medium ${studyActive ? 'text-primary' : 'text-muted-foreground'}`}>
            Leren
          </span>
        </NavLink>
        {rightItems.map(renderItem)}
      </div>
    </nav>
  );
}

export function TopBar() {
  const { stats } = useStore();
  const today = new Date().toISOString().split('T')[0];
  const studiedToday = stats.lastStudyDate === today;
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-lg md:hidden" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">Lexis</span>
      </div>
      <div className="flex items-center gap-2">
        {stats.streakFreezes > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5" title={`${stats.streakFreezes} streak freeze${stats.streakFreezes === 1 ? '' : 's'}`}>
            <Snowflake className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{stats.streakFreezes}</span>
          </div>
        )}
        <div
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${studiedToday ? 'bg-streak/15' : 'bg-secondary'}`}
          title={studiedToday ? 'Vandaag al geoefend' : 'Nog niet geoefend vandaag'}
        >
          <Flame className={`h-4 w-4 ${studiedToday ? 'flame-active' : 'text-streak'}`} />
          <span className="text-sm font-bold text-foreground">{stats.currentStreak}</span>
        </div>
      </div>
    </header>
  );
}

import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, Plus, BarChart3, User, Flame, Snowflake } from 'lucide-react';
import { useStore } from './StoreProvider';

const navItems = [
  { to: '/', icon: BookOpen, label: 'Leren' },
  { to: '/toevoegen', icon: Plus, label: 'Toevoegen' },
  { to: '/statistieken', icon: BarChart3, label: 'Stats' },
  { to: '/profiel', icon: User, label: 'Profiel' },
];

export default function BottomNav() {
  const location = useLocation();
  const { stats } = useStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg md:hidden">
      <div className="flex items-center justify-around py-2">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 px-3 py-1"
            >
              {to === '/toevoegen' ? (
                <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-full -mt-4 shadow-lg shadow-primary/30">
                  <Icon className="h-5 w-5 text-primary-foreground" />
                </div>
              ) : (
                <Icon className={`h-5 w-5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              )}
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function TopBar() {
  const { stats } = useStore();
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-lg md:hidden">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold italic text-gradient-primary">Lexis</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5">
        <Flame className="h-4 w-4 text-streak" />
        <span className="text-sm font-bold text-foreground">{stats.currentStreak}</span>
      </div>
    </header>
  );
}

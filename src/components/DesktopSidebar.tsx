import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, Plus, BarChart3, User, Flame, Home, BookMarked, Snowflake } from 'lucide-react';
import { useStore } from './StoreProvider';

const sidebarItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/studeren', icon: BookOpen, label: 'Studeren' },
  { to: '/toevoegen', icon: BookMarked, label: 'Woordenbank' },
  { to: '/statistieken', icon: BarChart3, label: 'Statistieken' },
  { to: '/profiel', icon: User, label: 'Profiel' },
];

export default function DesktopSidebar() {
  const location = useLocation();
  const { stats } = useStore();
  const today = new Date().toISOString().split('T')[0];
  const studiedToday = stats.lastStudyDate === today;

  return (
    <aside className="hidden md:flex md:w-56 lg:w-64 flex-col fixed left-0 top-0 bottom-0 border-r border-border bg-sidebar z-50">
      <div className="flex items-center gap-2 px-6 py-6">
        <span className="text-xl font-black italic text-gradient-primary">LEXIS</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Vocal Mastery</span>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {sidebarItems.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-primary/10 text-primary border-l-2 border-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-4 pb-6 space-y-3">
        <NavLink
          to="/studeren"
          className="flex items-center justify-center gap-2 gradient-primary rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <BookOpen className="h-4 w-4" />
          Nieuwe Sessie
        </NavLink>

        <div className="flex items-center gap-2 px-2">
          <div className="h-8 w-8 rounded-full gradient-accent flex items-center justify-center">
            <span className="text-xs font-bold text-accent-foreground">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Alex</p>
            <p className="text-[10px] text-muted-foreground">Lexis Lid</p>
          </div>
          <div className="flex items-center gap-2">
            {stats.streakFreezes > 0 && (
              <div className="flex items-center gap-0.5" title={`${stats.streakFreezes} streak freeze${stats.streakFreezes === 1 ? '' : 's'}`}>
                <Snowflake className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">{stats.streakFreezes}</span>
              </div>
            )}
            <div
              className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${studiedToday ? 'bg-streak/15' : ''}`}
              title={studiedToday ? 'Vandaag al geoefend' : 'Nog niet geoefend vandaag'}
            >
              <Flame className={`h-4 w-4 ${studiedToday ? 'flame-active' : 'text-streak'}`} />
              <span className="text-sm font-bold text-foreground">{stats.currentStreak}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

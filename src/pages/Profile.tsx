import { useStore } from '@/components/StoreProvider';
import { User, Target, BookOpen, RotateCcw } from 'lucide-react';

export default function Profile() {
  const { stats, words, updateStats } = useStore();

  const handleResetAll = () => {
    if (confirm('Weet je zeker dat je alle data wilt wissen? Dit kan niet ongedaan worden.')) {
      localStorage.removeItem('lexis-words');
      localStorage.removeItem('lexis-stats');
      localStorage.removeItem('lexis-sessions');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-lg mx-auto">
      <div className="text-center">
        <div className="h-20 w-20 rounded-full gradient-primary mx-auto flex items-center justify-center mb-3">
          <User className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Alex</h1>
        <p className="text-sm text-muted-foreground">Italiaans leren vanuit het Nederlands</p>
      </div>

      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" /> Dagelijks Doel
        </h3>
        <div className="flex items-center gap-3">
          {[10, 15, 20, 30].map(goal => (
            <button
              key={goal}
              onClick={() => updateStats({ dailyGoal: goal })}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
                stats.dailyGoal === goal
                  ? 'gradient-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {goal}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">woorden per dag</p>
      </div>

      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Overzicht
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Totale woorden</span>
            <span className="text-sm font-medium text-foreground">{words.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Stabiele woorden</span>
            <span className="text-sm font-medium text-success">{words.filter(w => w.status === 'stable').length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Langste streak</span>
            <span className="text-sm font-medium text-streak">{stats.longestStreak} dagen</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Totaal sessies</span>
            <span className="text-sm font-medium text-foreground">{stats.totalSessions}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleResetAll}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-destructive/30 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
      >
        <RotateCcw className="h-4 w-4" /> Alle Data Wissen
      </button>
    </div>
  );
}

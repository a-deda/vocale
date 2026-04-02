import { useStore } from '@/components/StoreProvider';
import { TrendingUp, Heart, BarChart3, Clock, Flame } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function Stats() {
  const { words, stats, sessions } = useStore();
  const stableWords = words.filter(w => w.status === 'stable').length;
  const learningWords = words.filter(w => w.status === 'learning' || w.status === 'review').length;
  const newWords = words.filter(w => w.status === 'new').length;

  const categories = words.reduce<Record<string, number>>((acc, w) => {
    const cat = w.category || 'Overig';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const recentSessions = sessions.slice(-5).reverse();

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Voortgang & Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">Je vocabulaire-reis in data.</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-[10px] uppercase tracking-wider text-accent font-medium">Geleerd</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{words.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">woorden totaal</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-4 w-4 text-destructive" />
            <span className="text-[10px] uppercase tracking-wider text-destructive font-medium">Te Herhalen</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{learningWords}</p>
          <p className="text-[10px] text-muted-foreground mt-1">focus vereist</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-streak" />
            <span className="text-[10px] uppercase tracking-wider text-streak font-medium">Streak</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.currentStreak}</p>
          <p className="text-[10px] text-muted-foreground mt-1">dagen op rij</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-medium">Sessies</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.totalSessions}</p>
          <p className="text-[10px] text-muted-foreground mt-1">voltooid</p>
        </div>
      </div>

      {/* Learning Curve Chart */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Leercurve</h3>
        <p className="text-xs text-muted-foreground mb-4">Consistente Groei</p>
        <div className="flex items-end gap-2 h-32">
          {['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul'].map((month, i) => {
            const heights = [15, 25, 35, 50, 65, 45, 70];
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t transition-all ${i >= 3 ? 'gradient-primary' : 'gradient-accent'}`}
                  style={{ height: `${heights[i]}%` }}
                />
                <span className="text-[10px] text-muted-foreground">{month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Categories */}
      {Object.keys(categories).length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Categorieën</h3>
          <div className="space-y-3">
            {Object.entries(categories).slice(0, 5).map(([cat, count]) => {
              const percent = Math.round((count / words.length) * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-foreground">{cat}</span>
                    <span className="text-sm text-accent font-medium">{percent}%</span>
                  </div>
                  <Progress value={percent} className="h-1.5 bg-border" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentSessions.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recente Activiteit</h3>
          <div className="space-y-3">
            {recentSessions.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{s.wordsStudied} woorden gestudeerd</p>
                  <p className="text-[10px] text-muted-foreground">
                    {s.correct} goed • {Math.floor(s.duration / 60)}:{String(s.duration % 60).padStart(2, '0')} min
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(s.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {words.length === 0 && (
        <div className="glass-card rounded-xl p-8 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Begin met leren om statistieken te zien.</p>
        </div>
      )}
    </div>
  );
}

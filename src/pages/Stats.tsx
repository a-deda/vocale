import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { TrendingUp, Heart, BarChart3, Clock, Flame, Target, AlertCircle, Timer, Trophy } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getMasteryScore } from '@/lib/srs';
import { ActivityHeatmap } from '@/components/stats/ActivityHeatmap';

export default function Stats() {
  const { words, stats, sessions } = useStore();

  const stableWords = words.filter(w => w.status === 'stable').length;
  const reviewWords = words.filter(w => w.status === 'review').length;
  const learningWords = words.filter(w => w.status === 'learning').length;
  const newWords = words.filter(w => w.status === 'new').length;
  const dueCount = learningWords + reviewWords;

  const categories = useMemo(() => {
    const map = words.reduce<Record<string, number>>((acc, w) => {
      const cat = w.category || 'Overig';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [words]);

  // 30-day activity
  const activity = useMemo(() => {
    const days: { date: Date; key: string; count: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d, key: d.toISOString().slice(0, 10), count: 0 });
    }
    const map = new Map(days.map(d => [d.key, d]));
    for (const s of sessions) {
      const key = new Date(s.date).toISOString().slice(0, 10);
      const day = map.get(key);
      if (day) day.count += s.wordsStudied;
    }
    return days;
  }, [sessions]);

  const maxActivity = Math.max(1, ...activity.map(d => d.count));
  const todayKey = new Date().toISOString().slice(0, 10);

  // Accuracy last 7 days
  const accuracy7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = sessions.filter(s => new Date(s.date).getTime() >= cutoff);
    const total = recent.reduce((a, s) => a + s.correct + s.incorrect, 0);
    const correct = recent.reduce((a, s) => a + s.correct, 0);
    return { percent: total > 0 ? Math.round((correct / total) * 100) : 0, total, correct };
  }, [sessions]);

  // Hardest words
  const hardestWords = useMemo(() => {
    return [...words]
      .filter(w => w.status !== 'new')
      .map(w => ({ w, score: getMasteryScore(w), errors: w.consecutiveErrors }))
      .sort((a, b) => {
        if (b.errors !== a.errors) return b.errors - a.errors;
        return a.score - b.score;
      })
      .slice(0, 5);
  }, [words]);

  // Study time
  const studyTime = useMemo(() => {
    const totalSec = sessions.reduce((a, s) => a + s.duration, 0);
    const avgSec = sessions.length > 0 ? Math.round(totalSec / sessions.length) : 0;
    const avgWords = sessions.length > 0
      ? Math.round(sessions.reduce((a, s) => a + s.wordsStudied, 0) / sessions.length)
      : 0;
    return { totalSec, avgSec, avgWords };
  }, [sessions]);

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}u ${m % 60}m`;
  };

  const recentSessions = sessions.slice(-5).reverse();
  const totalStatus = Math.max(1, words.length);

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
          <p className="text-3xl font-bold text-foreground">{dueCount}</p>
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

      {/* 30-day activity */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Activiteit</h3>
            <p className="text-xs text-muted-foreground">Laatste 30 dagen</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {activity.reduce((a, d) => a + d.count, 0)} woorden
          </p>
        </div>
        <div className="flex items-end gap-[3px] h-32">
          {activity.map(d => {
            const heightPct = d.count > 0 ? Math.max(6, (d.count / maxActivity) * 100) : 2;
            const isToday = d.key === todayKey;
            return (
              <div
                key={d.key}
                className="flex-1 flex flex-col justify-end group relative"
                title={`${d.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}: ${d.count}`}
              >
                <div
                  className={`w-full rounded-t transition-all ${
                    isToday ? 'gradient-accent' : d.count > 0 ? 'gradient-primary' : 'bg-border'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{activity[0].date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
          <span>vandaag</span>
        </div>
      </div>

      {/* Year heatmap + streaks */}
      <ActivityHeatmap sessions={sessions} />

      {/* Mastery Distribution + Accuracy 7d */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Beheersing</h3>
          </div>
          {words.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nog geen woorden.</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Stabiel', count: stableWords, color: 'bg-accent' },
                { label: 'Herhaling', count: reviewWords, color: 'bg-primary' },
                { label: 'Aan het leren', count: learningWords, color: 'bg-streak' },
                { label: 'Nieuw', count: newWords, color: 'bg-muted-foreground' },
              ].map(row => {
                const pct = Math.round((row.count / totalStatus) * 100);
                return (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-foreground">{row.label}</span>
                      <span className="text-xs text-muted-foreground">{row.count} • {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Nauwkeurigheid</h3>
          </div>
          {accuracy7d.total === 0 ? (
            <p className="text-xs text-muted-foreground">Geen data voor de laatste 7 dagen.</p>
          ) : (
            <div className="flex flex-col items-center justify-center py-4">
              <p className="text-5xl font-bold text-gradient-accent">{accuracy7d.percent}%</p>
              <p className="text-xs text-muted-foreground mt-2">
                {accuracy7d.correct} / {accuracy7d.total} correct
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">laatste 7 dagen</p>
            </div>
          )}
        </div>
      </div>

      {/* Hardest words */}
      {hardestWords.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-semibold text-foreground">Lastigste woorden</h3>
            </div>
            <Link to="/wordbank" className="text-[10px] text-accent hover:underline">Bekijk alle →</Link>
          </div>
          <div className="space-y-2">
            {hardestWords.map(({ w, score, errors }) => (
              <Link
                key={w.id}
                to="/wordbank"
                className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{w.original}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{w.translation}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  {errors > 0 && (
                    <span className="text-destructive font-medium">{errors}× fout</span>
                  )}
                  <span className="text-muted-foreground">{score}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Study time */}
      {sessions.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Studietijd</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-2xl font-bold text-foreground">{formatDuration(studyTime.totalSec)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">totaal</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{formatDuration(studyTime.avgSec)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">per sessie</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{studyTime.avgWords}</p>
              <p className="text-[10px] text-muted-foreground mt-1">woorden/sessie</p>
            </div>
          </div>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Categorieën</h3>
          <div className="space-y-3">
            {categories.slice(0, 5).map(([cat, count]) => {
              const percent = Math.round((count / words.length) * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-foreground">{cat}</span>
                    <span className="text-sm text-accent font-medium">{count} • {percent}%</span>
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
            {recentSessions.map(s => {
              const total = s.correct + s.incorrect;
              const pct = total > 0 ? Math.round((s.correct / total) * 100) : 0;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
                    <BarChart3 className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.wordsStudied} woorden gestudeerd</p>
                    <p className="text-[10px] text-muted-foreground">
                      {pct}% correct • {Math.floor(s.duration / 60)}:{String(s.duration % 60).padStart(2, '0')} min
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(s.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {words.length === 0 && sessions.length === 0 && (
        <div className="glass-card rounded-xl p-8 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Begin met leren om statistieken te zien.</p>
        </div>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Zap, BookOpen, Bookmark, TrendingUp, ChevronRight } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { getWordsForReview, getMasteryScore } from '@/lib/srs';
import { Progress } from '@/components/ui/progress';

export default function Dashboard() {
  const navigate = useNavigate();
  const { words, stats, sessions } = useStore();
  const dueWords = getWordsForReview(words);
  const todayLearned = words.filter(w => {
    if (!w.lastReview) return false;
    return new Date(w.lastReview).toDateString() === new Date().toDateString();
  }).length;
  const progressPercent = stats.dailyGoal > 0 ? Math.min(100, Math.round((todayLearned / stats.dailyGoal) * 100)) : 0;
  const avgMastery = words.length > 0 ? Math.round(words.reduce((sum, w) => sum + getMasteryScore(w), 0) / words.length) : 0;

  // Build last 7 days chart data from real sessions
  const weekData = useMemo(() => {
    const dayLabels = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
    const days: { label: string; words: number; minutes: number; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const daySessions = sessions.filter(s => s.date.slice(0, 10) === dateStr);
      days.push({
        label: dayLabels[d.getDay()],
        words: daySessions.reduce((sum, s) => sum + s.wordsStudied, 0),
        minutes: Math.round(daySessions.reduce((sum, s) => sum + s.duration, 0) / 60),
        isToday: i === 0,
      });
    }
    return days;
  }, [sessions]);

  const maxWords = Math.max(1, ...weekData.map(d => d.words));
  const randomWord = words.length > 0 ? words[Math.floor(Math.random() * words.length)] : null;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Goedemorgen, <span className="text-gradient-primary">Alex.</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Klaar om je volgende {stats.dailyGoal} woorden te leren?
        </p>
      </div>

      {/* CTA Card */}
      <button
        onClick={() => navigate('/studeren')}
        className="w-full gradient-primary rounded-2xl p-6 text-left transition-all hover:opacity-95 active:scale-[0.98] shadow-lg shadow-primary/20"
      >
        <p className="text-[10px] uppercase tracking-widest text-primary-foreground/70 font-medium">
          Algoritmisch Geoptimaliseerd
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-primary-foreground mt-2">
          Start Ochtend Herhalingssessie
        </h2>
        <p className="text-sm text-primary-foreground/80 mt-2">
          {dueWords.length} woorden staan klaar voor herhaling. Focus op je zwakke punten.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-background/20 px-4 py-2 text-sm font-semibold text-primary-foreground backdrop-blur-sm">
          Verder Leren <ChevronRight className="h-4 w-4" />
        </div>
      </button>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Streak */}
        <div className="glass-card rounded-xl p-4 text-center">
          <Flame className="h-8 w-8 mx-auto text-streak" />
          <p className="text-3xl font-bold text-foreground mt-2">{stats.currentStreak}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dag Streak</p>
          <div className="flex gap-1 mt-3 justify-center">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full ${i < Math.min(stats.currentStreak, 7) ? 'bg-streak' : 'bg-border'}`}
              />
            ))}
          </div>
        </div>

        {/* Today's Progress */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Voortgang Vandaag</p>
            <Zap className="h-5 w-5 text-accent" />
          </div>
          <p className="text-3xl font-bold text-foreground mt-2">{progressPercent}%</p>
          <Progress value={progressPercent} className="mt-3 h-2 bg-border" />
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">{todayLearned} Geleerd</span>
            <span className="text-[10px] text-muted-foreground">{stats.dailyGoal} Doel</span>
          </div>
        </div>

        {/* Word of the Day */}
        {randomWord && (
          <div className="col-span-2 md:col-span-1 glass-card rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-accent font-medium">Woord van de Dag</p>
            <h3 className="text-2xl md:text-3xl font-bold text-foreground mt-2 italic">{randomWord.original}</h3>
            {randomWord.phonetic && (
              <p className="text-sm text-accent italic mt-1">{randomWord.phonetic}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">{randomWord.translation}</p>
            <div className="flex gap-2 mt-3">
              {randomWord.category && (
                <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                  {randomWord.category}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overall Mastery */}
      {words.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">Totale Beheersing</h3>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">
                Gemiddelde score van {words.length} woorden
              </p>
            </div>
            <p className="text-3xl font-bold text-foreground">{avgMastery}%</p>
          </div>
          <Progress value={avgMastery} className="mt-3 h-2.5 bg-border" />
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{words.filter(w => w.status === 'new').length} nieuw</span>
            <span>{words.filter(w => w.status === 'learning').length} aan het leren</span>
            <span>{words.filter(w => w.status === 'stable').length} stabiel</span>
          </div>
        </div>
      )}

      {/* Learning Velocity */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">Leersnelheid</h3>
          </div>
          <div className="flex gap-4 text-[10px] uppercase tracking-wider">
            <span className="text-accent font-medium">Woorden</span>
            <span className="text-muted-foreground">Minuten</span>
          </div>
        </div>
        <div className="flex items-end gap-2 mt-4 h-24">
          {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((day, i) => {
            const height = [30, 45, 20, 60, 80, 40, 55][i];
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md transition-all ${i === 4 ? 'gradient-accent' : 'bg-primary/40'}`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-muted-foreground">{day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next to Master */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-foreground">Volgende te Leren</h3>
          <button
            onClick={() => navigate('/toevoegen')}
            className="text-xs text-accent font-medium flex items-center gap-1"
          >
            Bekijk Woordenbank <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {dueWords.slice(0, 4).map(word => (
            <div key={word.id} className="glass-card rounded-xl p-4">
              <span className={`text-[9px] uppercase tracking-wider font-medium ${
                word.status === 'new' ? 'text-accent' : 
                word.status === 'learning' ? 'text-warning' :
                word.status === 'review' ? 'text-primary' : 'text-success'
              }`}>
                {word.status === 'new' ? 'Nieuw' : word.status === 'learning' ? 'Aan het leren' : word.status === 'review' ? 'Herhaling' : 'Stabiel'}
              </span>
              <h4 className="text-base font-bold text-foreground mt-1">{word.original}</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{word.translation}</p>
            </div>
          ))}
          {dueWords.length === 0 && words.length === 0 && (
            <div className="col-span-2 glass-card rounded-xl p-6 text-center">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nog geen woorden toegevoegd.</p>
              <button
                onClick={() => navigate('/toevoegen')}
                className="mt-3 text-sm text-accent font-medium"
              >
                Voeg je eerste woorden toe →
              </button>
            </div>
          )}
          {dueWords.length === 0 && words.length > 0 && (
            <div className="col-span-2 glass-card rounded-xl p-6 text-center">
              <p className="text-sm text-muted-foreground">🎉 Alles bijgewerkt! Kom later terug.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

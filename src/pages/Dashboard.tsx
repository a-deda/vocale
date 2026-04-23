import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Zap, BookOpen, TrendingUp, ChevronRight, Clock, Target } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { getWordsForReview, getMasteryScore } from '@/lib/srs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';

function getDayPart(hour: number): { greeting: string; session: string } {
  if (hour < 6) return { greeting: 'Goedenacht', session: 'nachtsessie' };
  if (hour < 12) return { greeting: 'Goedemorgen', session: 'ochtendsessie' };
  if (hour < 18) return { greeting: 'Goedemiddag', session: 'middagsessie' };
  if (hour < 23) return { greeting: 'Goedenavond', session: 'avondsessie' };
  return { greeting: 'Goedenacht', session: 'nachtsessie' };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { words, stats, sessions } = useStore();
  const [firstName, setFirstName] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      const name = (data?.display_name || '').trim().split(/\s+/)[0] || '';
      setFirstName(name);
    };
    load();
  }, []);

  const { greeting, session } = getDayPart(new Date().getHours());
  const dueWords = getWordsForReview(words);
  const todayLearned = words.filter(w => {
    if (!w.lastReview) return false;
    return new Date(w.lastReview).toDateString() === new Date().toDateString();
  }).length;
  const today = new Date().toISOString().split('T')[0];
  const studiedToday = stats.lastStudyDate === today || todayLearned > 0;
  const progressPercent = stats.dailyGoal > 0 ? Math.min(100, Math.round((todayLearned / stats.dailyGoal) * 100)) : 0;
  const avgMastery = words.length > 0 ? Math.round(words.reduce((sum, w) => sum + getMasteryScore(w), 0) / words.length) : 0;

  // Build last 7 days chart data from real sessions (use local date keys)
  const weekData = useMemo(() => {
    const dayLabels = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const days: {
      label: string;
      dateLabel: string;
      words: number;
      minutes: number;
      sessions: number;
      isToday: boolean;
    }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localKey(d);
      const daySessions = sessions.filter(s => {
        const sd = new Date(s.date);
        return localKey(sd) === key;
      });
      days.push({
        label: dayLabels[d.getDay()],
        dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
        words: daySessions.reduce((sum, s) => sum + s.wordsStudied, 0),
        minutes: Math.round(daySessions.reduce((sum, s) => sum + s.duration, 0) / 60),
        sessions: daySessions.length,
        isToday: i === 0,
      });
    }
    return days;
  }, [sessions]);

  const weekTotals = useMemo(() => {
    const totalWords = weekData.reduce((s, d) => s + d.words, 0);
    const totalMinutes = weekData.reduce((s, d) => s + d.minutes, 0);
    const activeDays = weekData.filter(d => d.words > 0).length;
    const avgPerActive = activeDays > 0 ? Math.round(totalWords / activeDays) : 0;
    const best = weekData.reduce((m, d) => (d.words > m ? d.words : m), 0);
    return { totalWords, totalMinutes, activeDays, avgPerActive, best };
  }, [weekData]);
  const randomWord = words.length > 0 ? words[Math.floor(Math.random() * words.length)] : null;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          {greeting}{firstName ? ', ' : ''}
          {firstName && <span className="text-gradient-primary">{firstName}.</span>}
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
          algoritmisch geoptimaliseerd
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-primary-foreground mt-2">
          Start je {session}
        </h2>
        <p className="text-sm text-primary-foreground/80 mt-2">
          {dueWords.length} woorden staan klaar voor herhaling. Focus op je zwakke punten.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-background/20 px-4 py-2 text-sm font-semibold text-primary-foreground backdrop-blur-sm">
          Verder leren <ChevronRight className="h-4 w-4" />
        </div>
      </button>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Streak */}
        <div className="glass-card rounded-xl p-4 text-center relative">
          {stats.streakFreezes > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5" title={`${stats.streakFreezes} streak freeze${stats.streakFreezes === 1 ? '' : 's'}`}>
              <span className="text-[10px]">❄️</span>
              <span className="text-[10px] font-bold text-primary">{stats.streakFreezes}</span>
            </div>
          )}
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
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground">Leersnelheid</h3>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">
              Afgelopen 7 dagen
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Totaal</p>
              <p className="text-lg font-bold text-foreground leading-tight">
                {weekTotals.totalWords} <span className="text-xs font-medium text-muted-foreground">woorden</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Gemiddeld</p>
              <p className="text-lg font-bold text-accent leading-tight">
                {weekTotals.avgPerActive}
                <span className="text-xs font-medium text-muted-foreground">/dag</span>
              </p>
            </div>
          </div>
        </div>

        {/* Mini stat row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              <Target className="h-3 w-3" /> Actieve dagen
            </div>
            <p className="text-base font-bold text-foreground mt-0.5">{weekTotals.activeDays}/7</p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              <TrendingUp className="h-3 w-3" /> Beste dag
            </div>
            <p className="text-base font-bold text-foreground mt-0.5">{weekTotals.best}</p>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              <Clock className="h-3 w-3" /> Studietijd
            </div>
            <p className="text-base font-bold text-foreground mt-0.5">
              {weekTotals.totalMinutes}<span className="text-xs font-medium text-muted-foreground">m</span>
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-4 h-56 -mx-2">
          {weekTotals.totalWords === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nog geen activiteit deze week. Start een sessie om je voortgang te zien.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weekData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="velocityArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="velocityBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="velocityBarToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--primary) / 0.06)' }}
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: '0 8px 24px hsl(var(--background) / 0.4)',
                  }}
                  labelFormatter={(label, payload) => {
                    const p: any = payload?.[0]?.payload;
                    return p ? `${label} · ${p.dateLabel}` : label;
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === 'words') return [`${value} woorden`, 'Geleerd'];
                    if (name === 'minutes') return [`${value} min`, 'Studietijd'];
                    return [value, name];
                  }}
                />
                {weekTotals.avgPerActive > 0 && (
                  <ReferenceLine
                    y={weekTotals.avgPerActive}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                      value: `gem. ${weekTotals.avgPerActive}`,
                      position: 'right',
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: 10,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="words"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  fill="url(#velocityArea)"
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--accent))', strokeWidth: 0 }}
                />
                <Bar dataKey="words" radius={[6, 6, 0, 0]} barSize={18}>
                  {weekData.map((d, i) => (
                    <Cell key={i} fill={d.isToday ? 'url(#velocityBarToday)' : 'url(#velocityBar)'} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          )}
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

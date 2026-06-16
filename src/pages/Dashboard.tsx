import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, BookOpen, TrendingUp, ChevronRight } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { buildSession, getFsrsMasteryScore } from '@/lib/fsrs';
import type { FsrsMode, FsrsState } from '@/lib/fsrs';
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
  const { words, stats, sessions, fsrsStates } = useStore();
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

  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const { dueCount, dueWords } = useMemo(() => {
    const allCardStates: Record<string, Partial<Record<FsrsMode, FsrsState>>> = {};
    for (const w of words) {
      allCardStates[w.id] = fsrsStates[w.id] ?? {};
    }
    const wordMap = new Map(words.map(w => [w.id, w]));
    const session = buildSession(allCardStates, localToday, 20);
    const preview = session
      .map(item => wordMap.get(item.cardId))
      .filter((w): w is typeof words[number] => w !== undefined);
    return { dueCount: session.length, dueWords: preview };
  }, [words, fsrsStates, localToday]);

  const todayLearned = sessions
    .filter(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return key === localToday;
    })
    .reduce((sum, s) => sum + s.wordsStudied, 0);

  const studiedToday = stats.lastStudyDate === localToday;
  const progressPercent = stats.dailyGoal > 0 ? Math.min(100, Math.round((todayLearned / stats.dailyGoal) * 100)) : 0;
  const avgMastery = words.length > 0 ? Math.round(words.reduce((sum, w) => sum + getFsrsMasteryScore(fsrsStates[w.id] ?? {}), 0) / words.length) : 0;

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
    const activeDays = weekData.filter(d => d.words > 0).length;
    const avgPerActive = activeDays > 0 ? Math.round(totalWords / activeDays) : 0;
    return { totalWords, activeDays, avgPerActive };
  }, [weekData]);

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          {greeting}{firstName ? `, ${firstName}.` : '.'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {dueCount > 0 ? `${dueCount} woorden klaar voor herhaling.` : 'Alles bijgewerkt voor nu.'}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/studeren')}
        className="w-full gradient-primary rounded-xl p-6 text-left transition-all hover:opacity-95 active:scale-[0.98] shadow-lg shadow-primary/20"
      >
        <h2 className="text-xl md:text-2xl font-bold text-primary-foreground">
          Start je {session}
        </h2>
        <p className="text-sm text-primary-foreground/80 mt-2">
          {dueCount} woorden staan klaar. Focus op je zwakste punten.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-foreground/90">
          Verder leren <ChevronRight className="h-4 w-4" />
        </div>
      </button>

      {/* Status bar: streak + daily progress */}
      <div className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <Flame className={`h-5 w-5 ${studiedToday ? 'flame-active' : 'text-streak'}`} />
          <div>
            <p className="text-sm font-bold text-foreground leading-none">{stats.currentStreak}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{studiedToday ? 'Vandaag voltooid' : 'Dagenstreak'}</p>
          </div>
        </div>
        <div className="w-px h-8 bg-border shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1.5">
            <p className="text-xs text-muted-foreground">{todayLearned} van {stats.dailyGoal} woorden vandaag</p>
            <p className="text-xs font-medium text-foreground">{progressPercent}%</p>
          </div>
          <Progress value={progressPercent} className="h-1.5 bg-border" />
        </div>
        {stats.streakFreezes > 0 && (
          <>
            <div className="w-px h-8 bg-border shrink-0" />
            <div
              className="flex items-center gap-1 shrink-0"
              title={`${stats.streakFreezes} streak freeze${stats.streakFreezes === 1 ? '' : 's'}`}
            >
              <span className="text-sm">❄️</span>
              <span className="text-sm font-bold text-foreground">{stats.streakFreezes}</span>
            </div>
          </>
        )}
      </div>

      {/* Overall Mastery */}
      {words.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Totale beheersing</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{words.length} woorden</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{avgMastery}%</p>
          </div>
          <Progress value={avgMastery} className="mt-3 h-1.5 bg-border" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{words.filter(w => w.status === 'new').length} nieuw</span>
            <span>{words.filter(w => w.status === 'learning').length} aan het leren</span>
            <span>{words.filter(w => w.status === 'stable').length} stabiel</span>
          </div>
        </div>
      )}

      {/* Learning Velocity */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Leersnelheid</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Afgelopen 7 dagen</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Totaal</p>
              <p className="text-base font-bold text-foreground leading-tight">
                {weekTotals.totalWords} <span className="text-xs font-medium text-muted-foreground">woorden</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gemiddeld</p>
              <p className="text-base font-bold text-foreground leading-tight">
                {weekTotals.avgPerActive}<span className="text-xs font-medium text-muted-foreground">/dag</span>
              </p>
            </div>
          </div>
        </div>

        <div className="h-52 -mx-2">
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

      {/* Next to Learn */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-foreground">Volgende te leren</h3>
          <button
            onClick={() => navigate('/toevoegen')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Woordenbank <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {dueWords.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            {dueWords.slice(0, 5).map((word, index) => (
              <div
                key={word.id}
                className={`flex items-center gap-3 bg-card px-4 py-3 ${index < Math.min(dueWords.length, 5) - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{word.original}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{word.translation}</p>
                </div>
                <span className={`text-[10px] font-medium shrink-0 ${
                  word.status === 'new' ? 'text-primary' :
                  word.status === 'learning' ? 'text-warning' :
                  word.status === 'review' ? 'text-primary' : 'text-success'
                }`}>
                  {word.status === 'new' ? 'Nieuw' : word.status === 'learning' ? 'Leren' : word.status === 'review' ? 'Herhaling' : 'Stabiel'}
                </span>
              </div>
            ))}
          </div>
        ) : words.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nog geen woorden toegevoegd.</p>
            <button
              onClick={() => navigate('/toevoegen')}
              className="mt-3 text-sm text-primary font-medium"
            >
              Voeg je eerste woorden toe
            </button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Alles bijgewerkt. Kom later terug.</p>
          </div>
        )}
      </div>
    </div>
  );
}

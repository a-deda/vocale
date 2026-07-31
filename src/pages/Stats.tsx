import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { TrendingUp, Heart, BarChart3, Clock, Flame, Target, AlertCircle, Timer, Trophy } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getFsrsMasteryScore, FSRS_MODES } from '@/lib/fsrs';
import { ActivityHeatmap } from '@/components/stats/ActivityHeatmap';
import { supabase } from '@/integrations/supabase/client';

const ETA_HISTORY_KEY = 'mastery-eta-history-v1';
const ETA_MAX_ENTRIES = 5;
const ETA_SMOOTH_WINDOW = 3;
const ETA_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

type EtaEntry = { t: number; daysLeft: number; perDay: number };

function sanitizeHistory(arr: unknown): EtaEntry[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((e: any): e is EtaEntry =>
      !!e && typeof e.daysLeft === 'number' && typeof e.t === 'number'
    )
    .slice(-ETA_MAX_ENTRIES);
}

function readEtaHistoryLocal(): EtaEntry[] {
  try {
    const raw = localStorage.getItem(ETA_HISTORY_KEY);
    if (!raw) return [];
    return sanitizeHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeEtaHistoryLocal(entries: EtaEntry[]) {
  try {
    localStorage.setItem(ETA_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota errors */
  }
}

function mergeHistories(a: EtaEntry[], b: EtaEntry[]): EtaEntry[] {
  const map = new Map<number, EtaEntry>();
  for (const e of [...a, ...b]) map.set(e.t, e);
  return [...map.values()].sort((x, y) => x.t - y.t).slice(-ETA_MAX_ENTRIES);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatEtaLabel(daysLeft: number): string {
  if (daysLeft <= 1) return '1 studiedag';
  if (daysLeft < 14) return `${daysLeft} studiedagen`;
  if (daysLeft < 60) return `~${Math.round(daysLeft / 7)} weken`;
  if (daysLeft < 365) return `~${Math.round(daysLeft / 30)} maanden`;
  if (daysLeft < 365 * 3) return `~${(daysLeft / 365).toFixed(1)} jaar`;
  return '3+ jaar';
}

export default function Stats() {
  const { words, stats, sessions, fsrsStates, loading } = useStore();

  const { stableWords, reviewWords, learningWords, newWords } = useMemo(() => {
    let stable = 0, review = 0, learning = 0, newW = 0;
    for (const w of words) {
      const states = fsrsStates[w.id] ?? {};
      const maxStability = Math.max(0, ...FSRS_MODES.map(m => states[m]?.stability ?? 0));
      if (maxStability >= 21) stable++;
      else if (maxStability >= 7) review++;
      else if (maxStability > 0) learning++;
      else newW++;
    }
    return { stableWords: stable, reviewWords: review, learningWords: learning, newWords: newW };
  }, [words, fsrsStates]);
  const dueCount = learningWords + reviewWords;

  const categories = useMemo(() => {
    const map = words.reduce<Record<string, number>>((acc, w) => {
      const cat = w.category || 'Overig';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [words]);

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
      .filter(w => {
        const states = fsrsStates[w.id] ?? {};
        return FSRS_MODES.some(m => states[m]?.stability != null);
      })
      .map(w => ({ w, score: getFsrsMasteryScore(fsrsStates[w.id] ?? {}), errors: w.consecutiveErrors }))
      .sort((a, b) => {
        if (b.errors !== a.errors) return b.errors - a.errors;
        return a.score - b.score;
      })
      .slice(0, 5);
  }, [words, fsrsStates]);

  // Study time
  const studyTime = useMemo(() => {
    const totalSec = sessions.reduce((a, s) => a + s.duration, 0);
    const avgSec = sessions.length > 0 ? Math.round(totalSec / sessions.length) : 0;
    const avgWords = sessions.length > 0
      ? Math.round(sessions.reduce((a, s) => a + s.wordsStudied, 0) / sessions.length)
      : 0;
    return { totalSec, avgSec, avgWords };
  }, [sessions]);

  // Time-to-mastery prediction
  const mastery = useMemo(() => {
    const nonStable = words.filter(w => w.status !== 'stable').length;
    if (words.length === 0) {
      return { empty: true as const, masteredPct: 0, nonStable: 0, done: false, perDay: 0, daysLeft: null as number | null, etaLabel: '' };
    }
    const masteredPct = Math.round((stableWords / words.length) * 100);
    if (nonStable === 0) {
      return { empty: false as const, done: true, masteredPct, nonStable: 0, perDay: 0, daysLeft: 0, etaLabel: '', activeDays: 0, recentlyStable: 0 };
    }
    const windowDays = 30;
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const recentlyStable = words.filter(
      w => w.status === 'stable' && w.lastReview && new Date(w.lastReview).getTime() >= cutoff
    ).length;
    const activeDays = new Set(
      sessions
        .filter(s => new Date(s.date).getTime() >= cutoff && s.wordsStudied > 0)
        .map(s => new Date(s.date).toISOString().slice(0, 10))
    ).size;

    const remainingWork = words
      .filter(w => w.status !== 'stable')
      .reduce((acc, w) => acc + Math.max(0, 1 - getFsrsMasteryScore(fsrsStates[w.id] ?? {}) / 100), 0);

    const reviewProgress = words.filter(w => w.status === 'review').length * 0.5;
    const learningProgress = words.filter(w => w.status === 'learning').length * 0.2;
    const totalProgress = recentlyStable + reviewProgress + learningProgress;

    if (activeDays === 0 || totalProgress <= 0) {
      return { empty: false as const, done: false, masteredPct, nonStable, perDay: 0, daysLeft: null as number | null, etaLabel: 'meer data nodig', activeDays, recentlyStable };
    }
    const perDay = totalProgress / activeDays;
    const rawDaysLeft = remainingWork / perDay;
    const daysLeft = Math.ceil(rawDaysLeft);
    return { empty: false as const, done: false, masteredPct, nonStable, perDay, daysLeft, etaLabel: formatEtaLabel(daysLeft), activeDays, recentlyStable };
  }, [words, sessions, stableWords, fsrsStates]);

  const [etaHistory, setEtaHistory] = useState<EtaEntry[]>(() => readEtaHistoryLocal());
  const lastWriteRef = useRef<number>(0);
  const remoteLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('eta_history')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || error) return;
      const remote = sanitizeHistory(data?.eta_history);
      const merged = mergeHistories(readEtaHistoryLocal(), remote);
      writeEtaHistoryLocal(merged);
      setEtaHistory(merged);
      remoteLoadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mastery.empty || mastery.done || mastery.daysLeft === null) return;
    if (!remoteLoadedRef.current) return;
    const now = Date.now();
    const prev = etaHistory;
    const last = prev[prev.length - 1];
    const changedSignificantly =
      !last || Math.abs(last.daysLeft - mastery.daysLeft) / Math.max(last.daysLeft, 1) > 0.15;
    if (now - lastWriteRef.current < 5000) return;
    if (last && now - last.t < ETA_MIN_INTERVAL_MS && !changedSignificantly) return;
    lastWriteRef.current = now;
    const next = [...prev, { t: now, daysLeft: mastery.daysLeft, perDay: mastery.perDay }].slice(-ETA_MAX_ENTRIES);
    writeEtaHistoryLocal(next);
    setEtaHistory(next);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('profiles')
        .update({ eta_history: next as any })
        .eq('user_id', user.id);
    })();
  }, [mastery.empty, mastery.done, mastery.daysLeft, mastery.perDay, etaHistory]);

  const smoothedMastery = useMemo(() => {
    if (mastery.empty || mastery.done || mastery.daysLeft === null) return mastery;
    const samples = [...etaHistory.slice(-(ETA_SMOOTH_WINDOW - 1)).map(e => e.daysLeft), mastery.daysLeft];
    if (samples.length < 2) return mastery;
    const smoothedDays = Math.ceil(median(samples));
    return {
      ...mastery,
      daysLeft: smoothedDays,
      etaLabel: formatEtaLabel(smoothedDays),
      smoothed: true as const,
      sampleCount: samples.length,
    };
  }, [mastery, etaHistory]);

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}u ${m % 60}m`;
  };

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  const totalStatus = Math.max(1, words.length);

  if (loading) {
    return (
      <div className="space-y-6 ">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Voortgang & Stats</h1>
          <p className="text-sm text-muted-foreground mt-1">Je vocabulaire-reis in data.</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 ">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Voortgang & Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">Je vocabulaire-reis in data.</p>
      </div>

      {/* Time to Mastery — primary insight */}
      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Tijd tot Mastery</h3>
        </div>
        {mastery.empty ? (
          <div className="py-2">
            <p className="text-sm text-foreground">Nog geen woorden in je woordenbank.</p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Voeg woorden toe en studeer een paar dagen — dan verschijnt hier je voorspelling.
            </p>
          </div>
        ) : mastery.done ? (
          <div className="text-center py-2">
            <p className="text-3xl font-bold text-accent">100%</p>
            <p className="text-xs text-muted-foreground mt-2">Alle woorden zijn stabiel — bravo! 🎉</p>
          </div>
        ) : mastery.daysLeft === null ? (
          <>
            <div className="flex items-end justify-between mb-3 gap-3">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-foreground">Nog geen voorspelling</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Verschijnt zodra je een paar studiedagen hebt voltooid in de laatste 30 dagen.
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-accent">{mastery.masteredPct}%</p>
                <p className="text-[10px] text-muted-foreground">stabiel</p>
              </div>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden mb-3">
              <div className="h-full bg-active transition-all" style={{ width: `${mastery.masteredPct}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground space-y-1">
              <p>· Stabiele woorden (laatste 30 dagen): <span className="text-foreground font-medium">{mastery.recentlyStable}</span></p>
              <p>· Actieve studiedagen (laatste 30 dagen): <span className="text-foreground font-medium">{mastery.activeDays}</span></p>
              <p>· Resterend om te beheersen: <span className="text-foreground font-medium">{mastery.nonStable}</span></p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-end justify-between mb-3 gap-3">
              <div className="min-w-0">
                <p className="text-3xl font-bold text-foreground truncate">{smoothedMastery.etaLabel}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  tot alle {mastery.nonStable} resterende woorden stabiel zijn
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-accent">{mastery.masteredPct}%</p>
                <p className="text-[10px] text-muted-foreground">stabiel</p>
              </div>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
              <div className="h-full bg-active transition-all" style={{ width: `${mastery.masteredPct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Tempo: ~{mastery.perDay.toFixed(1)} woord-equivalent{mastery.perDay >= 2 ? 'en' : ''}/studiedag
              {'smoothed' in smoothedMastery && smoothedMastery.smoothed
                ? ` · ${smoothedMastery.sampleCount} metingen`
                : ' · laatste 30 dagen'}
            </p>
          </>
        )}
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-[10px] uppercase tracking-wider text-accent font-medium">Geleerd</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{words.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">woorden totaal</p>
        </div>
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-4 w-4 text-destructive" />
            <span className="text-[10px] uppercase tracking-wider text-destructive font-medium">Te Herhalen</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{dueCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1">focus vereist</p>
        </div>
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-active" />
            <span className="text-[10px] uppercase tracking-wider text-active font-medium">Streak</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.currentStreak}</p>
          <p className="text-[10px] text-muted-foreground mt-1">dagen op rij</p>
        </div>
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-medium">Sessies</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.totalSessions}</p>
          <p className="text-[10px] text-muted-foreground mt-1">voltooid</p>
        </div>
      </div>

      {/* ACTIVITEIT */}
      <div className="space-y-3 pt-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activiteit</p>
        <ActivityHeatmap sessions={sessions} />
      </div>

      {/* PRESTATIE */}
      <div className="space-y-3 pt-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prestatie</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-card rounded-xl p-5">
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
                  { label: 'Aan het leren', count: learningWords, color: 'bg-active' },
                  { label: 'Nieuw', count: newWords, color: 'bg-muted-foreground' },
                ].map(row => {
                  const pct = Math.round((row.count / totalStatus) * 100);
                  return (
                    <div key={row.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-foreground">{row.label}</span>
                        <span className="text-xs text-muted-foreground">{row.count} · {pct}%</span>
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

          <div className="bg-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Nauwkeurigheid</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">laatste 7 dagen</span>
            </div>
            {accuracy7d.total === 0 ? (
              <p className="text-xs text-muted-foreground">Geen data voor de laatste 7 dagen.</p>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <p className="text-5xl font-bold text-accent">{accuracy7d.percent}%</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {accuracy7d.correct} / {accuracy7d.total} correct
                </p>
              </div>
            )}
          </div>
        </div>

        {hardestWords.length > 0 && (
          <div className="bg-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold text-foreground">Lastigste woorden</h3>
              </div>
              <Link to="/toevoegen" className="text-[10px] text-accent hover:underline">Bekijk alle →</Link>
            </div>
            <div className="space-y-2">
              {hardestWords.map(({ w, score, errors }) => (
                <Link
                  key={w.id}
                  to="/toevoegen"
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
      </div>

      {/* DETAILS */}
      <div className="space-y-3 pt-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Details</p>

        {sessions.length > 0 && (
          <div className="bg-card rounded-xl p-5">
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

        {categories.length > 0 && (
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Categorieën</h3>
            <div className="space-y-3">
              {categories.slice(0, 5).map(([cat, count]) => {
                const percent = Math.round((count / words.length) * 100);
                return (
                  <div key={cat}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-foreground">{cat}</span>
                      <span className="text-sm text-accent font-medium">{count} · {percent}%</span>
                    </div>
                    <Progress value={percent} className="h-1.5 bg-border" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {recentSessions.length > 0 && (
          <div className="bg-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recente Activiteit</h3>
            <div className="space-y-3">
              {recentSessions.map(s => {
                const total = s.correct + s.incorrect;
                const pct = total > 0 ? Math.round((s.correct / total) * 100) : 0;
                const sd = new Date(s.date);
                const today = new Date();
                const yesterday = new Date(Date.now() - 86400000);
                const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
                let when: string;
                if (sameDay(sd, today)) {
                  when = `Vandaag · ${sd.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
                } else if (sameDay(sd, yesterday)) {
                  when = `Gisteren · ${sd.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
                } else {
                  when = sd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
                }
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-active flex items-center justify-center shrink-0">
                      <BarChart3 className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.wordsStudied} woorden gestudeerd</p>
                      <p className="text-[10px] text-muted-foreground">
                        {pct}% correct · {Math.floor(s.duration / 60)}:{String(s.duration % 60).padStart(2, '0')} min
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 text-right">
                      {when}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">❄️ Streak Freezes</h3>
            <span className="text-sm font-bold text-primary">{stats.streakFreezes} / 3</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Verdien automatisch <span className="text-foreground font-medium">1 freeze per 10 dagen</span> streak (max 3).
            Als je een dag mist, wordt er automatisch één gebruikt zodat je streak doorloopt.
            {stats.currentStreak > 0 && stats.streakFreezes < 3 && (
              <> Nog <span className="text-foreground font-medium">{10 - (stats.currentStreak % 10)}</span> dagen tot je volgende freeze.</>
            )}
          </p>
        </div>
      </div>

      {words.length === 0 && sessions.length === 0 && (
        <div className="bg-card rounded-xl p-8 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Begin met leren om statistieken te zien.</p>
        </div>
      )}
    </div>
  );
}

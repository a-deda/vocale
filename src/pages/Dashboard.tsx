import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { buildSession } from '@/lib/fsrs';
import { buildOverview, formatSeconds, studiedToday } from '@/lib/vocabulary';
import { localDateKey } from '@/lib/store';
import StateBar from '@/components/vocale/StateBar';
import RhythmDots from '@/components/vocale/RhythmDots';
import {
  Button, Card, Data, Hairline, ItalianText, Label, Screen, ScreenHeader,
} from '@/components/vocale/Primitives';

/** Vanaf zoveel dagen zonder sessie meldt het overzicht wat er ondertussen gebeurd is. */
const LONG_ABSENCE_DAYS = 7;

export default function Dashboard() {
  const navigate = useNavigate();
  const { words, stats, sessions, fsrsStates, reviewLogs } = useStore();
  const today = localDateKey();

  const overview = useMemo(
    () => buildOverview(words, fsrsStates, sessions, reviewLogs, today),
    [words, fsrsStates, sessions, reviewLogs, today],
  );

  const sessionSize = stats.dailyGoal;

  /** Wat er vandaag nog in het dagdoel past. */
  const doneToday = useMemo(() => studiedToday(reviewLogs, today), [reviewLogs, today]);
  const budget    = Math.max(0, sessionSize - doneToday);

  /**
   * De splitsing komt uit de sessie zelf: een introductie heeft geen vervaldatum.
   * Zo kan het getal op de knop niet uiteenlopen met wat je daarna krijgt.
   */
  const plan = useMemo(() => {
    const states  = Object.fromEntries(words.map(w => [w.id, fsrsStates[w.id] ?? {}]));
    const build   = (max: number) => buildSession(states, today, max);
    const items   = build(budget);
    const reviews = items.filter(i => i.dueDate !== null).length;
    return {
      total:   items.length,
      reviews,
      intro:   items.length - reviews,
      // Ligt er werk dat alleen het dagdoel nog tegenhoudt?
      blocked: budget === 0 && build(sessionSize).length > 0,
    };
  }, [words, fsrsStates, today, budget, sessionSize]);

  const waiting    = overview.dueToday + overview.backlog;
  const longAbsence = overview.daysAway !== null
    && overview.daysAway >= LONG_ABSENCE_DAYS
    && overview.counts.lapsed > 0;

  return (
    <Screen>
      <ScreenHeader onMenu={() => navigate('/menu')} />

      {longAbsence ? (
        <Absence days={overview.daysAway!} lapsed={overview.counts.lapsed} />
      ) : waiting > 0 ? (
        <Due count={overview.dueToday} overview={overview} />
      ) : (
        <Nothing
          tomorrow={overview.dueTomorrow}
          intro={plan.intro}
          blocked={plan.blocked}
          goal={sessionSize}
        />
      )}

      <div className="mt-[26px]">
        <StateBar counts={overview.counts} />
      </div>

      <div className="mt-[26px]">
        {plan.total > 0 ? (
          <Button
            variant={plan.reviews > 0 || longAbsence ? 'primary' : 'quiet'}
            onClick={() => navigate('/studeren')}
          >
            {planLabel(plan.reviews, plan.intro)}
          </Button>
        ) : plan.blocked ? (
          <Button variant="quiet" onClick={() => navigate('/studeren')}>
            Toch doorgaan
          </Button>
        ) : (
          <Button variant="quiet" onClick={() => navigate('/toevoegen')}>
            Woorden toevoegen
          </Button>
        )}
        {longAbsence && plan.total < overview.counts.lapsed && (
          <p className="mt-[10px] text-[13px] text-ink-weak">
            De sessie stopt bij {budget}. De rest komt daarna.
          </p>
        )}
      </div>

      <Card className="mt-[26px]">
        <div className="flex items-end gap-3">
          <div className="text-[44px] font-bold leading-[0.9] tracking-[-0.04em] text-ink">
            {overview.shelfLife ?? '—'}
          </div>
          <div className="pb-1 text-[14px] leading-[1.3] text-ink-weak">
            dagen houdbaarheid<br />gemiddeld over alles
          </div>
        </div>

        <Hairline className="my-4" />
        <RhythmDots rhythm={overview.rhythm} />

        {overview.avgResponseMs !== null && (
          <>
            <Hairline className="my-4" />
            <div className="flex justify-between">
              <Data>tijd tot eerste toets</Data>
              <Data className="text-ink">{formatSeconds(overview.avgResponseMs)}</Data>
            </div>
          </>
        )}
      </Card>

      {overview.weakest.length > 0 && (
        <>
          <Label className="mb-[10px] mt-[26px]">wankelst — verdwijnt het eerst</Label>
          <div className="rounded-card bg-card px-5 py-[6px]">
            {overview.weakest.map((word, i) => (
              <div
                key={word.id}
                className={
                  `flex items-baseline justify-between py-[11px] ` +
                  `${i < overview.weakest.length - 1 ? 'border-b border-[rgba(139,158,183,0.45)]' : ''}`
                }
              >
                <ItalianText className="text-[19px]">{word.original}</ItalianText>
                <Data>{Math.round(word.stability)} d</Data>
              </div>
            ))}
          </div>
        </>
      )}

      {overview.recentlyAnchored.length > 0 && (
        <>
          <Label className="mb-[10px] mt-[26px]">recent vast geworden</Label>
          <ItalianText className="text-[17px] leading-[1.55]">
            {overview.recentlyAnchored.join(' · ')}
          </ItalianText>
        </>
      )}

      <button
        onClick={() => navigate('/statistieken')}
        className="mt-5 flex w-full justify-between border-t border-[rgba(1,25,54,0.1)] pt-[15px] text-[14px] text-ink-weak"
      >
        <span>statistieken</span>
        <span>→</span>
      </button>
    </Screen>
  );
}

function Due({ count, overview }: { count: number; overview: ReturnType<typeof buildOverview> }) {
  // De weekregel houdt vast wat eraan komt, nu de vervalstrook eruit is.
  // dueThisWeek heeft geen ondergrens en bevat dus ook de achterstand en
  // vandaag; die eraf halen, anders staat hetzelfde woord in twee getallen.
  const restOfWeek = Math.max(0, overview.dueThisWeek - overview.backlog - overview.dueToday);
  const week = [
    overview.backlog > 0     ? `${overview.backlog} stonden er al`  : null,
    overview.dueTomorrow > 0 ? `morgen ${overview.dueTomorrow}`     : null,
    restOfWeek > 0           ? `${restOfWeek} verder deze week`     : null,
  ].filter(Boolean);

  return (
    <>
      <div className="text-[108px] font-bold leading-[0.86] tracking-[-0.055em] text-ink">
        {count > 0 ? count : overview.backlog}
      </div>
      <div className="mt-[6px] text-[18px] font-medium text-ink-weak">
        {count > 0 ? 'woorden te herhalen vandaag' : 'woorden stonden er al'}
      </div>
      {week.length > 0 && <Data className="mt-[10px] block">{week.join(' · ')}</Data>}
    </>
  );
}

/** Knoptekst die precies benoemt wat de sessie gaat doen. */
function planLabel(reviews: number, intro: number): string {
  if (reviews > 0 && intro > 0) return `Begin — ${reviews} herhalen · ${intro} nieuw`;
  if (reviews > 0)              return `Begin — ${reviews} herhalen`;
  return `Begin — ${intro} ${intro === 1 ? 'nieuw woord' : 'nieuwe woorden'}`;
}

function Nothing({
  tomorrow, intro, blocked, goal,
}: { tomorrow: number; intro: number; blocked: boolean; goal: number }) {
  return (
    <div className="text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
      {blocked ? `Je dagdoel van ${goal} is gehaald.` : 'Niets te herhalen vandaag.'}
      {!blocked && intro > 0 && (
        <><br />Er staan {intro} nieuwe woorden klaar.</>
      )}
      {!blocked && intro === 0 && tomorrow > 0 && (
        <><br />Morgen komen er {tomorrow} terug.</>
      )}
    </div>
  );
}

function Absence({ days, lapsed }: { days: number; lapsed: number }) {
  return (
    <div className="text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
      Je was {days} dagen weg.<br />{lapsed} woorden zijn vervallen.
    </div>
  );
}

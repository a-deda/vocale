import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { buildSession } from '@/lib/fsrs';
import { buildOverview, formatSeconds } from '@/lib/vocabulary';
import { localDateKey } from '@/lib/store';
import StateBar from '@/components/vocale/StateBar';
import RhythmDots from '@/components/vocale/RhythmDots';
import DecayChart from '@/components/vocale/DecayChart';
import DaySheet from '@/components/vocale/DaySheet';
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
  const queued = useMemo(
    () => buildSession(
      Object.fromEntries(words.map(w => [w.id, fsrsStates[w.id] ?? {}])),
      today,
      sessionSize,
    ).length,
    [words, fsrsStates, today, sessionSize],
  );

  const waiting    = overview.dueToday + overview.backlog;
  const longAbsence = overview.daysAway !== null
    && overview.daysAway >= LONG_ABSENCE_DAYS
    && overview.counts.lapsed > 0;

  // Welke dag het blad toont; null zolang het dicht is.
  const [openDay, setOpenDay] = useState<number | null>(null);

  // Wat vandaag openstaat past niet altijd in één sessie. Hoeveel sessies het
  // wél kost staat onder de grafiek, zodat de berg een lengte krijgt.
  const sessionsToClear = Math.ceil(waiting / sessionSize);
  const clearNote = overview.backlog > 0 && sessionsToClear > 1
    ? `bij in ${sessionsToClear} sessies`
    : undefined;

  return (
    <Screen>
      <ScreenHeader onMenu={() => navigate('/menu')} />

      {longAbsence ? (
        <Absence days={overview.daysAway!} lapsed={overview.counts.lapsed} />
      ) : waiting > 0 ? (
        <Due waiting={waiting} backlog={overview.backlog} />
      ) : (
        <Nothing tomorrow={overview.dueTomorrow} />
      )}

      <div className="mt-[26px]">
        <DecayChart
          days={overview.decay}
          limit={sessionSize}
          note={clearNote}
          onPickDay={setOpenDay}
        />
      </div>

      <div className="mt-[26px]">
        {queued > 0 ? (
          <Button
            variant={waiting > 0 || longAbsence ? 'primary' : 'quiet'}
            onClick={() => navigate('/studeren')}
          >
            {waiting > 0 || longAbsence
              ? `Begin — ${queued} woorden`
              : `Vooruitwerken (${queued})`}
          </Button>
        ) : (
          <Button variant="quiet" onClick={() => navigate('/toevoegen')}>
            Woorden toevoegen
          </Button>
        )}
      </div>

      <div className="mt-[26px]">
        <StateBar counts={overview.counts} />
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

      {openDay !== null && (
        <DaySheet
          days={overview.decay}
          index={openDay}
          limit={sessionSize}
          today={today}
          onIndex={setOpenDay}
          onClose={() => setOpenDay(null)}
        />
      )}
    </Screen>
  );
}

/**
 * Het kopgetal is alles wat nu klaarligt — wat vandaag vervalt plus wat al
 * openstond. Dat is precies de eerste staaf van de grafiek eronder; de rest van
 * de week hoeft er niet meer bij te staan, want die staat er in beeld.
 */
function Due({ waiting, backlog }: { waiting: number; backlog: number }) {
  return (
    <>
      <div className="text-[108px] font-bold leading-[0.86] tracking-[-0.055em] text-ink">
        {waiting}
      </div>
      <div className="mt-[6px] text-[18px] font-medium text-ink-weak">
        {backlog > 0 ? 'woorden staan open' : 'woorden vervallen vandaag'}
      </div>
      {backlog > 0 && backlog < waiting && (
        <Data className="mt-[10px] block">{backlog} van eerder</Data>
      )}
    </>
  );
}

function Nothing({ tomorrow }: { tomorrow: number }) {
  return (
    <div className="text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
      Niets vervalt vandaag.
      {tomorrow > 0 && <><br />Morgen vervallen er {tomorrow}.</>}
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

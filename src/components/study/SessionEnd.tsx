import { formatSeconds } from '@/lib/vocabulary';
import type { StateCounts } from '@/lib/vocabulary';
import StateBar from '@/components/vocale/StateBar';
import { Button, Data, ItalianText, Label } from '@/components/vocale/Primitives';

export interface SessionTally {
  words:      number;
  /** Woorden die deze sessie voor het eerst zijn geïntroduceerd. */
  introduced: number;
  anchored:   string[];
  almost:     number;
  avgResponseMs: number | null;
}

/**
 * Einde sessie. Vier regels, geen lof — de toestandsbalk is verschoven, en dat
 * is het enige bewijs dat er iets gebeurd is.
 */
export default function SessionEnd({
  tally, counts, lapsedBefore, dueTomorrow, newAvailable, blockedByGoal, dailyGoal,
  onClose, onMoreNew, onContinueAnyway,
}: {
  tally:        SessionTally;
  counts:       StateCounts;
  lapsedBefore: number;
  dueTomorrow:  number;
  /** Nieuwe woorden die vandaag nog geïntroduceerd kunnen worden. */
  newAvailable: number;
  /** Er ligt nog werk, maar het dagdoel houdt het tegen. */
  blockedByGoal: boolean;
  dailyGoal:    number;
  onClose:      () => void;
  onMoreNew:    () => void;
  onContinueAnyway: () => void;
}) {
  return (
    <>
      <div className="rounded-card bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <Label>sessie afgerond</Label>
          <button onClick={onClose} aria-label="Sluiten" className="text-[17px] text-ink-weak">×</button>
        </div>
        <Tally label="herhaald" value={tally.words - tally.introduced} />
        <Tally label="nieuw geleerd" value={tally.introduced} />
        <Tally label="vast geworden" value={tally.anchored.length} highlight />
        {tally.avgResponseMs !== null && (
          <Tally label="gemiddeld" value={formatSeconds(tally.avgResponseMs)} />
        )}
        <Tally label="bijna" value={tally.almost} />
      </div>

      <div className="mt-[22px] text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        {blockedByGoal
          ? `Je dagdoel van ${dailyGoal} is gehaald.`
          : newAvailable > 0
            ? 'Alles herhaald.'
            : 'Niets meer vandaag.'}
        {!blockedByGoal && newAvailable > 0 && (
          <><br />Er staan nog {newAvailable} nieuwe woorden klaar.</>
        )}
        {!blockedByGoal && newAvailable === 0 && dueTomorrow > 0 && (
          <><br />Morgen komen er {dueTomorrow} terug.</>
        )}
      </div>

      <div className="mt-[26px]">
        <StateBar counts={counts} />
        {lapsedBefore !== counts.lapsed && (
          <Data className="mt-1 block text-[11px]">wankel · was {lapsedBefore}</Data>
        )}
      </div>

      {blockedByGoal ? (
        <Button variant="quiet" className="mt-[26px]" onClick={onContinueAnyway}>
          Toch doorgaan
        </Button>
      ) : newAvailable > 0 && (
        <Button variant="quiet" className="mt-[26px]" onClick={onMoreNew}>
          Nieuwe woorden ({newAvailable})
        </Button>
      )}

      {tally.anchored.length > 0 && (
        <>
          <Label className="mb-[10px] mt-[26px]">vast geworden vandaag</Label>
          <ItalianText className="text-[17px] leading-[1.55]">{tally.anchored.join(' · ')}</ItalianText>
        </>
      )}
    </>
  );
}

function Tally({
  label, value, highlight = false,
}: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-[6px] text-[16px]">
      <span className="text-ink-weak">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-active' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

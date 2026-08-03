import { formatSeconds } from '@/lib/vocabulary';
import type { StateCounts } from '@/lib/vocabulary';
import StateBar from '@/components/vocale/StateBar';
import { Button, Data, ItalianText, Label } from '@/components/vocale/Primitives';

export interface SessionTally {
  words:      number;
  anchored:   string[];
  almost:     number;
  avgResponseMs: number | null;
}

/**
 * Einde sessie. Vier regels, geen lof — de toestandsbalk is verschoven, en dat
 * is het enige bewijs dat er iets gebeurd is.
 */
export default function SessionEnd({
  tally, counts, lapsedBefore, dueTomorrow, aheadCount, onClose, onWorkAhead,
}: {
  tally:        SessionTally;
  counts:       StateCounts;
  lapsedBefore: number;
  dueTomorrow:  number;
  aheadCount:   number;
  onClose:      () => void;
  onWorkAhead:  () => void;
}) {
  return (
    <>
      <div className="rounded-card bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <Label>sessie afgerond</Label>
          <button onClick={onClose} aria-label="Sluiten" className="text-[17px] text-ink-weak">×</button>
        </div>
        <Tally label="woorden" value={tally.words} />
        <Tally label="vast geworden" value={tally.anchored.length} highlight />
        {tally.avgResponseMs !== null && (
          <Tally label="gemiddeld" value={formatSeconds(tally.avgResponseMs)} />
        )}
        <Tally label="bijna" value={tally.almost} />
      </div>

      <div className="mt-[22px] text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
        Niets meer vandaag.
        {dueTomorrow > 0 && <><br />Morgen vervallen er {dueTomorrow}.</>}
      </div>

      <div className="mt-[26px]">
        <StateBar counts={counts} />
        {lapsedBefore !== counts.lapsed && (
          <Data className="mt-1 block text-[11px]">wankel · was {lapsedBefore}</Data>
        )}
      </div>

      {aheadCount > 0 && (
        <Button variant="quiet" className="mt-[26px]" onClick={onWorkAhead}>
          Vooruitwerken ({aheadCount})
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

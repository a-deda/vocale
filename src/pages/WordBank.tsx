import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { wordState } from '@/lib/fsrs';
import type { WordState } from '@/lib/fsrs';
import { strongestState } from '@/lib/fsrs';
import { localDateKey } from '@/lib/store';
import { formatTranslationsClean, stripAnnotations } from '@/lib/translation-utils';
import { Button, Data, ItalianText, Screen } from '@/components/vocale/Primitives';
import CorrectionEditor from '@/components/study/CorrectionEditor';

const PAGE_SIZE = 30;

/** De toestand is een klein vlak, geen label — kleur draagt de betekenis. */
const STATE_FILL: Record<WordState, string> = {
  lapsed:   'bg-lapsed',
  active:   'bg-active',
  anchored: 'bg-ink',
  new:      'bg-steel',
};

export default function WordBank() {
  const navigate = useNavigate();
  const { words, fsrsStates, updateWord } = useStore();
  const today = localDateKey();

  const [query, setQuery]               = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId]       = useState<string | null>(null);

  const sorted = useMemo(() => {
    const lastReviewed = (id: string) => {
      const times = Object.values(fsrsStates[id] ?? {})
        .map(s => s?.lastReviewedAt ? new Date(s.lastReviewedAt).getTime() : 0);
      return times.length > 0 ? Math.max(...times) : 0;
    };
    const needle = query.trim().toLowerCase();

    return words
      .filter(w =>
        w.original.toLowerCase().includes(needle) ||
        w.translation.toLowerCase().includes(needle))
      .sort((a, b) => {
        const diff = lastReviewed(b.id) - lastReviewed(a.id);
        return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [words, fsrsStates, query]);

  const visible = sorted.slice(0, visibleCount);
  const remaining = sorted.length - visible.length;
  const editing = editingId ? words.find(w => w.id === editingId) : undefined;

  if (editing) {
    return (
      <Screen>
        <Header onBack={() => setEditingId(null)} count={words.length} />
        <h1 className="mb-[18px] text-[30px] font-bold tracking-[-0.02em] text-ink">Woord aanpassen</h1>
        <CorrectionEditor
          word={editing}
          input=""
          typedDutch={false}
          showUseMyAnswer={false}
          onCancel={() => setEditingId(null)}
          onSave={(original, translation) => {
            if (original && translation) void updateWord(editing.id, { original, translation });
            setEditingId(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header onBack={() => navigate('/menu')} count={words.length} />
      <h1 className="mb-[18px] text-[30px] font-bold tracking-[-0.02em] text-ink">Woordenbank</h1>

      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
        placeholder="zoek"
        className="h-[52px] w-full rounded-full bg-card px-5 text-[17px] text-ink caret-[#D19C1D] outline-none placeholder:text-steel focus:shadow-[inset_0_0_0_2px_#D19C1D]"
      />

      {visible.length > 0 && (
        <div className="mt-4 rounded-card bg-card px-5 py-[6px]">
          {visible.map((word, i) => {
            const stability = strongestState(fsrsStates[word.id] ?? {})?.stability;
            return (
              <button
                key={word.id}
                onClick={() => setEditingId(word.id)}
                className={
                  `flex w-full items-center gap-3 py-[13px] text-left ` +
                  `${i < visible.length - 1 ? 'border-b border-[rgba(139,158,183,0.45)]' : ''}`
                }
              >
                <span className={`h-2 w-2 flex-none rounded-sm ${STATE_FILL[wordState(fsrsStates[word.id] ?? {}, today)]}`} />
                <span className="min-w-0 flex-1">
                  <ItalianText className="block text-[19px] leading-[1.2]">
                    {stripAnnotations(word.original)}
                  </ItalianText>
                  <span className="mt-[2px] block text-[13px] text-ink-weak">
                    {formatTranslationsClean(word.translation)}
                  </span>
                </span>
                {stability != null && <Data>{Math.round(stability)} d</Data>}
              </button>
            );
          })}
        </div>
      )}

      <Data className="mt-[14px] block">wankel · actief · vast — tik een woord om te wijzigen</Data>

      {remaining > 0 && (
        <Button variant="quiet" className="mt-[18px] h-[52px] text-[16px] font-medium"
          onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
          Meer laden ({remaining})
        </Button>
      )}
    </Screen>
  );
}

function Header({ onBack, count }: { onBack: () => void; count: number }) {
  return (
    <div className="mb-[22px] flex items-center justify-between">
      <button onClick={onBack} aria-label="Terug" className="text-[20px] leading-none text-ink">←</button>
      <Data className="text-[13px]">{count} woorden</Data>
    </div>
  );
}

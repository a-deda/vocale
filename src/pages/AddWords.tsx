import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { useToast } from '@/hooks/use-toast';
import { hasTranslation, mergeTranslation } from '@/lib/translation-utils';
import { validateWordPair, WordWarning } from '@/lib/word-validation';
import { Word } from '@/types/word';
import { Button, Data, ItalianText, Label, Screen } from '@/components/vocale/Primitives';

interface PendingWord {
  original:       string;
  translation:    string;
  autoTranslated: boolean;
  translating:    boolean;
  warnings:       WordWarning[];
}

export default function AddWords() {
  const navigate = useNavigate();
  const { words, addWords, updateWord, autoTranslate } = useStore();
  const { toast } = useToast();

  const [input, setInput]     = useState('');
  const [autoOn, setAutoOn]   = useState(true);
  const [pending, setPending] = useState<PendingWord[]>([]);

  // Een import komt hier binnen als kale regels; bevestigen gebeurt gewoon hier.
  const { state } = useLocation() as { state: { prefill?: string } | null };
  useEffect(() => {
    if (state?.prefill) setInput(state.prefill);
  }, [state?.prefill]);

  const lineCount = input.split('\n').filter(l => l.trim()).length;

  const handleAdd = async () => {
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const fresh: PendingWord[] = [];
    const merged: string[] = [];

    for (const line of lines) {
      const [rawOriginal = '', rawTranslation = ''] = line.split(/[-–—=:,]\s*/);
      const original    = rawOriginal.trim();
      const translation = rawTranslation.trim();

      const existing = words.find(w => w.original.toLowerCase().trim() === original.toLowerCase());
      if (existing) {
        if (translation && !hasTranslation(existing.translation, translation)) {
          await updateWord(existing.id, { translation: mergeTranslation(existing.translation, translation) });
          merged.push(original);
        }
        continue;
      }
      if (fresh.some(p => p.original.toLowerCase() === original.toLowerCase())) continue;

      fresh.push({
        original,
        translation,
        autoTranslated: !translation,
        translating:    !translation && autoOn,
        warnings:       translation ? validateWordPair(original, translation) : [],
      });
    }

    if (merged.length > 0) {
      toast({ title: 'Vertalingen samengevoegd', description: merged.join(' · ') });
    }
    setInput('');
    if (fresh.length === 0) return;
    setPending(fresh);

    if (!autoOn) return;
    const toTranslate = fresh.filter(p => !p.translation).map(p => p.original);
    if (toTranslate.length === 0) return;

    try {
      const translations = await autoTranslate(toTranslate);
      setPending(prev => prev.map(p => {
        if (!p.translating) return p;
        const translated = translations[p.original.toLowerCase()] ?? '';
        return {
          ...p,
          translation: translated,
          translating: false,
          warnings:    translated ? validateWordPair(p.original, translated) : [],
        };
      }));
    } catch (e) {
      console.error('Vertalen mislukt:', e);
      setPending(prev => prev.map(p => p.translating ? { ...p, translating: false } : p));
      toast({ title: 'Vertalen mislukt', description: 'Vul de vertalingen zelf in.' });
    }
  };

  const confirmAll = () => {
    const ready: Omit<Word, 'id'>[] = pending
      .filter(p => p.original && p.translation && !p.translating)
      .map(p => ({
        original:          p.original.trim(),
        translation:       p.translation.trim(),
        easeFactor:        2.5,
        interval:          0,
        repetitions:       0,
        nextReview:        new Date().toISOString(),
        createdAt:         new Date().toISOString(),
        status:            'new' as const,
        autoTranslated:    p.autoTranslated,
        consecutiveErrors: 0,
      }));
    if (ready.length === 0) return;
    void addWords(ready);
    setPending([]);
  };

  const editPending = (index: number, field: 'original' | 'translation', value: string) => {
    setPending(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const next = { ...p, [field]: value };
      next.warnings = next.original && next.translation && !next.translating
        ? validateWordPair(next.original, next.translation)
        : [];
      return next;
    }));
  };

  const stillTranslating = pending.some(p => p.translating);

  return (
    <Screen>
      <div className="mb-[22px] flex items-center justify-between">
        <button onClick={() => navigate('/menu')} aria-label="Terug" className="text-[20px] leading-none text-ink">←</button>
        <Data className="text-[13px]">{words.length} woorden</Data>
      </div>

      <h1 className="mb-[6px] text-[30px] font-bold tracking-[-0.02em] text-ink">Woorden toevoegen</h1>
      <p className="mb-[18px] text-[15px] text-ink-weak">Eén per regel. Vertaling erachter mag, hoeft niet.</p>

      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        rows={4}
        placeholder={'effimero\nla resilienza - veerkracht\nluminescente'}
        className="w-full resize-none rounded-card bg-card px-5 py-[18px] text-[19px] leading-[1.6] text-ink caret-[#D19C1D] outline-none placeholder:text-steel focus:shadow-[inset_0_0_0_2px_#D19C1D]"
      />

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[15px] text-ink-weak">automatisch vertalen</span>
        {/* Een aan/uit-segment, geen switch: die kent het designsysteem niet. */}
        <div className="flex rounded-full bg-card p-[3px]">
          {([true, false] as const).map(on => (
            <button
              key={String(on)}
              onClick={() => setAutoOn(on)}
              className={
                `rounded-full px-4 py-[7px] text-[14px] transition-colors duration-[120ms] ` +
                `${autoOn === on ? 'bg-active font-semibold text-ink' : 'font-medium text-ink-weak'}`
              }
            >
              {on ? 'aan' : 'uit'}
            </button>
          ))}
        </div>
      </div>

      <Button className="mt-[18px]" disabled={lineCount === 0} onClick={handleAdd}>
        Toevoegen — {lineCount} {lineCount === 1 ? 'woord' : 'woorden'}
      </Button>

      {pending.length > 0 && (
        <>
          <Label className="mb-[10px] mt-[26px]">te bevestigen · {pending.length}</Label>
          <div className="rounded-card bg-card px-5 py-[6px]">
            {pending.map((word, i) => (
              <div
                key={i}
                className={`py-[13px] ${i < pending.length - 1 ? 'border-b border-[rgba(139,158,183,0.45)]' : ''}`}
              >
                <div className="flex items-baseline gap-[10px]">
                  <input
                    value={word.original}
                    onChange={e => editPending(i, 'original', e.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-italian text-[19px] text-ink outline-none"
                  />
                  {word.translating ? (
                    <Data className="flex-1">vertalen…</Data>
                  ) : (
                    <input
                      value={word.translation}
                      onChange={e => editPending(i, 'translation', e.target.value)}
                      placeholder="vertaling"
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-ink-weak outline-none placeholder:text-steel"
                    />
                  )}
                  {word.autoTranslated && !word.translating ? (
                    <span className="rounded-bar border border-[rgba(139,158,183,0.6)] px-1 font-mono text-[10px] text-ink-weak">ai</span>
                  ) : (
                    <span className="w-[22px]" />
                  )}
                </div>
                {word.warnings.map((warning, w) => (
                  <div key={w} className="mt-2 font-mono text-[11px] text-lapsed">{warning.message}</div>
                ))}
              </div>
            ))}
          </div>

          <Button variant="secondary" className="mt-4" disabled={stillTranslating} onClick={confirmAll}>
            Alles bevestigen
          </Button>
        </>
      )}

      {pending.length === 0 && words.length > 0 && (
        <div className="mt-[26px]">
          <Label className="mb-[10px]">laatst toegevoegd</Label>
          <ItalianText className="text-[17px] leading-[1.55]">
            {words.slice(0, 3).map(w => w.original).join(' · ')}
          </ItalianText>
        </div>
      )}
    </Screen>
  );
}

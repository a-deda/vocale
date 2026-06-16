import { useState, useRef, useEffect } from 'react';
import { Word } from '@/types/word';
import { Pencil, ArrowRight, Check } from 'lucide-react';
import { mergeTranslation } from '@/lib/translation-utils';

type CorrectableMode = 'mc' | 'typed_nl_it' | 'typed_it_nl' | 'listen_type';

interface FeedbackCorrectionProps {
  word:   Word;
  /** Wat de gebruiker typte/koos ('' bij overslaan). */
  input:  string;
  mode:   CorrectableMode;
  /** Huidige (eventueel herziene) beoordeling van het antwoord. */
  result: 'correct' | 'almost' | 'wrong';
  /** Vastgelegd resultaat ná een correctie, voor het bijwerken-label. */
  corrected: boolean;
  /** Sla de aangepaste velden op (persisteert + herbeoordeelt). */
  onSave: (original: string, translation: string) => void;
  /** Reken dit antwoord toch goed (overschrijf de beoordeling). */
  onMarkCorrect: () => void;
  /** Ga door naar de volgende kaart (commit huidige beoordeling). */
  onContinue: () => void;
}

export default function FeedbackCorrection({
  word, input, mode, result, corrected, onSave, onMarkCorrect, onContinue,
}: FeedbackCorrectionProps) {
  const [expanded, setExpanded]               = useState(false);
  const [editOriginal, setEditOriginal]       = useState(word.original);
  const [editTranslation, setEditTranslation] = useState(word.translation);

  const continueRef = useRef<HTMLButtonElement>(null);
  const originalRef  = useRef<HTMLInputElement>(null);

  // De getypte kant: bij IT→NL typte je het Nederlands, anders het Italiaans.
  const typedDutch = mode === 'typed_it_nl';
  // Bij meerkeuze koos je een bestaande optie; "mijn antwoord overnemen" heeft
  // dan geen zin (het is de vertaling van een ánder woord).
  const showUseMyAnswer = mode !== 'mc' && input.trim().length > 0;
  const canMarkCorrect = result !== 'correct' && input.trim().length > 0;

  useEffect(() => {
    if (!expanded) {
      const timer = setTimeout(() => continueRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  const handleSave = () => {
    onSave(editOriginal.trim(), editTranslation.trim());
    setExpanded(false);
  };

  const useMyAnswer = () => {
    if (!input.trim()) return;
    if (typedDutch) {
      // Voeg mijn antwoord toe als extra Nederlandse betekenis.
      setEditTranslation(prev => mergeTranslation(prev, input));
    } else {
      // De opgeslagen Italiaanse spelling klopt niet → vervang door mijn antwoord.
      setEditOriginal(input.trim());
    }
  };

  const expand = () => {
    setEditOriginal(word.original);
    setEditTranslation(word.translation);
    setExpanded(true);
    setTimeout(() => originalRef.current?.focus(), 50);
  };

  return (
    <div className="mt-4 space-y-3">
      {corrected && (
        <div className="flex items-center gap-2 text-sm text-success">
          <Check className="h-4 w-4 shrink-0" />
          <span>
            {result === 'correct'
              ? <>Aangepast — beoordeling bijgewerkt naar <strong>Goed</strong></>
              : 'Woord aangepast'}
          </span>
        </div>
      )}

      {expanded ? (
        <div className="glass-card rounded-xl p-4 space-y-3 animate-slide-up">
          <h3 className="text-sm font-semibold text-foreground">Woord aanpassen</h3>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Italiaans</label>
            <input
              ref={originalRef}
              value={editOriginal}
              onChange={e => setEditOriginal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nederlands</label>
            <input
              value={editTranslation}
              onChange={e => setEditTranslation(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {showUseMyAnswer && (
            <button
              type="button"
              onClick={useMyAnswer}
              className="text-xs text-primary hover:underline text-left"
            >
              {typedDutch
                ? `Mijn antwoord toevoegen als betekenis: «${input.trim()}»`
                : `Mijn antwoord overnemen: «${input.trim()}»`}
            </button>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex-1 rounded-lg bg-secondary text-secondary-foreground px-4 py-2 text-sm font-medium"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
            >
              Opslaan
            </button>
          </div>
        </div>
      ) : (
        <>
          {canMarkCorrect && (
            <button
              type="button"
              onClick={onMarkCorrect}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-success/10 border border-success/30 text-success px-4 py-2.5 text-sm font-semibold hover:bg-success/20 transition-colors"
            >
              <Check className="h-4 w-4" />
              Toch goed rekenen
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={expand}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-secondary text-secondary-foreground px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Pencil className="h-4 w-4" />
              Woord aanpassen
            </button>
            <button
              ref={continueRef}
              type="button"
              onClick={onContinue}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-primary-foreground px-6 py-3 text-sm font-semibold"
            >
              Verder
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

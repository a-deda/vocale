import { useState, useEffect } from 'react';
import { Word } from '@/types/word';
import { Check, X, Minus } from 'lucide-react';
import { GRADE, fsrsIntervalText } from '@/lib/fsrs';
import type { FsrsGrade, FsrsState } from '@/lib/fsrs';
import { formatTranslationsClean } from '@/lib/translation-utils';
import AnnotationTags from './AnnotationTags';

interface FlashcardCardProps {
  word:      Word;
  fsrsState: FsrsState;
  today:     string; // YYYY-MM-DD
  onRate:    (grade: FsrsGrade) => void;
}

export default function FlashcardCard({ word, fsrsState, today, onRate }: FlashcardCardProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setRevealed(false); }, [word.id]);

  const buttons: { grade: FsrsGrade; label: string; icon: typeof X; color: string }[] = [
    { grade: GRADE.FORGOT, label: 'Opnieuw',  icon: X,     color: 'bg-destructive/10 border-destructive/30 text-destructive' },
    { grade: GRADE.HARD,   label: 'Moeilijk', icon: Minus,  color: 'bg-warning/10 border-warning/30 text-warning' },
    { grade: GRADE.GOOD,   label: 'Goed',     icon: Check,  color: 'bg-success/10 border-success/30 text-success' },
    { grade: GRADE.EASY,   label: 'Makkelijk', icon: Check, color: 'bg-primary/10 border-primary/30 text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Ken je dit woord?
        </span>
        <h2 className="text-4xl font-bold text-foreground mt-3">{word.original}</h2>
        {revealed && (
          <div className="mt-3 animate-slide-up">
            <p className="text-lg text-muted-foreground">{formatTranslationsClean(word.translation)}</p>
            <AnnotationTags text={word.translation} />
          </div>
        )}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="w-full gradient-primary rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Toon antwoord
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2 animate-slide-up">
          {buttons.map(({ grade, label, icon: Icon, color }) => (
            <button
              key={grade}
              type="button"
              onClick={() => onRate(grade)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 ${color} transition-all hover:scale-105 active:scale-95`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[9px] text-muted-foreground">
                {fsrsIntervalText(fsrsState, grade, today)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

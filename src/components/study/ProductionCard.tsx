import React, { useRef, useEffect } from 'react';
import { Word } from '@/types/word';
import { Check, X, Minus } from 'lucide-react';
import DiffHighlight from './DiffHighlight';
import { formatTranslations } from '@/lib/translation-utils';

type AnswerState = { result: 'correct' | 'almost' | 'wrong'; input: string };

interface ProductionCardProps {
  word: Word;
  typedAnswer: string;
  onTypeAnswer: (v: string) => void;
  answerState: AnswerState | null;
  onSubmit: () => void;
  onSkip?: () => void;
}

export default function ProductionCard({
  word, typedAnswer, onTypeAnswer, answerState, onSubmit, onSkip,
}: ProductionCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!answerState) {
      // Multiple attempts for reliable mobile keyboard activation
      const attempts = [50, 150, 300];
      const timers = attempts.map(delay =>
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            // Some mobile browsers need a click to open the keyboard
            inputRef.current.click();
          }
        }, delay)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [word.id, answerState]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !answerState) {
      if (typedAnswer.trim()) {
        onSubmit();
      } else if (onSkip) {
        onSkip();
      }
    }
  };

  const hasInput = typedAnswer.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Vertaal naar het Italiaans
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{formatTranslations(word.translation)}</h2>
      </div>

      {!answerState ? (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={typedAnswer}
            onChange={e => onTypeAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ het Italiaanse woord..."
            autoFocus
            className="w-full rounded-xl bg-card border border-border px-4 py-3.5 text-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
          />
          <button
            onClick={hasInput ? onSubmit : onSkip}
            className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-opacity ${
              hasInput
                ? 'gradient-primary text-primary-foreground disabled:opacity-40'
                : 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20'
            }`}
          >
            {hasInput ? 'Controleer' : 'Ik weet het niet'}
          </button>
        </div>
      ) : (
        <ProductionFeedback word={word} answerState={answerState} />
      )}
    </div>
  );
}

function ProductionFeedback({ word, answerState }: { word: Word; answerState: AnswerState }) {
  const { result, input } = answerState;

  const feedbackConfig = {
    correct: { icon: Check, label: 'Goed!', color: 'text-success', bg: 'bg-success/10 border-success/30' },
    almost: { icon: Minus, label: 'Bijna!', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
    wrong: { icon: X, label: 'Fout', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
  }[result];

  const FeedbackIcon = feedbackConfig.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${feedbackConfig.bg}`}>
        <FeedbackIcon className={`h-6 w-6 ${feedbackConfig.color}`} />
        <div>
          <p className={`font-semibold ${feedbackConfig.color}`}>{feedbackConfig.label}</p>
          {result === 'almost' ? (
            <DiffHighlight input={input} correct={word.original} />
          ) : result === 'wrong' && input && (
            <p className="text-sm text-muted-foreground">
              Jouw antwoord: <span className="text-foreground">{input}</span>
            </p>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Correcte spelling</p>
        <p className="text-2xl font-bold text-foreground">{word.original}</p>
      </div>
    </div>
  );
}

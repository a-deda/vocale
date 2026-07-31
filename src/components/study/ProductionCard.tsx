import React, { useEffect, useRef } from 'react';
import { Word } from '@/types/word';
import { formatTranslationsClean, stripAnnotations } from '@/lib/translation-utils';
import { AccentRow, TypedInput } from '@/components/vocale/Input';
import { Button, ItalianText, TextAction } from '@/components/vocale/Primitives';
import PromptCard, { requiresArticle } from './PromptCard';

interface ProductionCardProps {
  word:         Word;
  /** nl_it = toon NL, typ IT (standaard); it_nl = toon IT, typ NL */
  direction:    'nl_it' | 'it_nl';
  typedAnswer:  string;
  onTypeAnswer: (v: string) => void;
  onSubmit:     () => void;
  onSkip:       () => void;
  onEdit:       () => void;
  /** Laat het veld goud oplichten: het enige signaal bij een goed antwoord. */
  flash:        boolean;
}

export default function ProductionCard({
  word, direction, typedAnswer, onTypeAnswer, onSubmit, onSkip, onEdit, flash,
}: ProductionCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timers = [50, 150, 300].map(delay =>
      setTimeout(() => inputRef.current?.focus(), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [word.id, direction]);

  const hasInput = typedAnswer.trim().length > 0;
  const toItalian = direction === 'nl_it';

  const insertAccent = (char: string) => {
    const field = inputRef.current;
    if (!field) return;
    const start = field.selectionStart ?? typedAnswer.length;
    const end   = field.selectionEnd   ?? typedAnswer.length;
    onTypeAnswer(typedAnswer.slice(0, start) + char + typedAnswer.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + char.length, start + char.length);
    });
  };

  return (
    <>
      <PromptCard
        label={word.partOfSpeech || (toItalian ? 'vertaal naar het Italiaans' : 'vertaal naar het Nederlands')}
        requirement={toItalian && requiresArticle(word.original) ? 'met lidwoord' : undefined}
      >
        {toItalian ? (
          <div className="text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            {formatTranslationsClean(word.translation)}
          </div>
        ) : (
          <ItalianText className="text-[38px] font-medium leading-[1.1]">
            {stripAnnotations(word.original)}
          </ItalianText>
        )}
      </PromptCard>

      <TypedInput
        ref={inputRef}
        value={typedAnswer}
        flash={flash}
        placeholder={toItalian ? 'typ het Italiaans' : 'typ het Nederlands'}
        onChange={e => onTypeAnswer(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key !== 'Enter') return;
          hasInput ? onSubmit() : onSkip();
        }}
      />

      {toItalian && <AccentRow onInsert={insertAccent} />}

      <Button
        className="mt-4"
        variant={hasInput ? 'primary' : 'secondary'}
        onClick={hasInput ? onSubmit : onSkip}
      >
        {hasInput ? 'Controleer' : 'Ik weet het niet'}
      </Button>

      <div className="mt-3 text-center">
        <TextAction onClick={onEdit}>woord aanpassen</TextAction>
      </div>
    </>
  );
}

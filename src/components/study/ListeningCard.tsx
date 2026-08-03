import React, { useCallback, useEffect, useRef } from 'react';
import { Word } from '@/types/word';
import { AccentRow, TypedInput } from '@/components/vocale/Input';
import { Button, TextAction } from '@/components/vocale/Primitives';
import PromptCard from './PromptCard';

interface ListeningCardProps {
  word:         Word;
  typedAnswer:  string;
  onTypeAnswer: (v: string) => void;
  onSubmit:     () => void;
  onSkip:       () => void;
  onMute:       () => void;
  flash:        boolean;
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'it-IT';
  utterance.rate = 0.85;
  const italian = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('it'));
  if (italian) utterance.voice = italian;
  window.speechSynthesis.speak(utterance);
}

export default function ListeningCard({
  word, typedAnswer, onTypeAnswer, onSubmit, onSkip, onMute, flash,
}: ListeningCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const play = () => speak(word.original);
    if (window.speechSynthesis.getVoices().length > 0) play();
    else window.speechSynthesis.onvoiceschanged = play;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [word.id, word.original]);

  useEffect(() => {
    const timers = [50, 150, 300].map(delay =>
      setTimeout(() => inputRef.current?.focus(), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [word.id]);

  const replay = useCallback(() => speak(word.original), [word.original]);
  const hasInput = typedAnswer.trim().length > 0;

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
        label="nieuw woord · luister en typ"
        requirement="Je hoort het Italiaans. Typ wat je hoort."
      >
        {/* Geen luidsprekericoon: het systeem kent maar vier glyphs, dus tekst. */}
        <button
          onClick={replay}
          onMouseDown={e => e.preventDefault()}
          className="h-14 w-full rounded-full bg-paper text-[17px] font-semibold text-ink transition-colors duration-[120ms] active:bg-[#DEDBDB]"
        >
          Opnieuw afspelen
        </button>
      </PromptCard>

      <TypedInput
        ref={inputRef}
        value={typedAnswer}
        flash={flash}
        placeholder="typ het Italiaans"
        onChange={e => onTypeAnswer(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key !== 'Enter') return;
          if (hasInput) onSubmit(); else onSkip();
        }}
      />

      <AccentRow onInsert={insertAccent} />

      <Button
        className="mt-4"
        variant={hasInput ? 'primary' : 'secondary'}
        onClick={hasInput ? onSubmit : onSkip}
      >
        {hasInput ? 'Controleer' : 'Ik weet het niet'}
      </Button>

      <div className="mt-3 text-center">
        <TextAction onClick={onMute}>luisteren 30 min uit</TextAction>
      </div>
    </>
  );
}

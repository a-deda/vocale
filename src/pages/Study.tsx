import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2, Eye, EyeOff, Frown, Smile, Laugh } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { getWordsForReview, calculateNextReview, getReviewIntervalText } from '@/lib/srs';
import { Difficulty, Word } from '@/types/word';
import { Progress } from '@/components/ui/progress';

export default function Study() {
  const navigate = useNavigate();
  const { words, updateWord, updateStreak, addSession } = useStore();
  const [sessionWords] = useState<Word[]>(() => getWordsForReview(words));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, startTime: Date.now() });

  const currentWord = sessionWords[currentIndex];
  const progress = sessionWords.length > 0 ? ((currentIndex) / sessionWords.length) * 100 : 0;

  const handleRate = useCallback((difficulty: Difficulty) => {
    if (!currentWord) return;
    const updates = calculateNextReview(currentWord, difficulty);
    updateWord(currentWord.id, updates);
    updateStreak();

    setSessionStats(prev => ({
      ...prev,
      correct: difficulty !== 'hard' ? prev.correct + 1 : prev.correct,
      incorrect: difficulty === 'hard' ? prev.incorrect + 1 : prev.incorrect,
    }));

    setShowTranslation(false);
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Session complete
      addSession({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        wordsStudied: sessionWords.length,
        correct: sessionStats.correct + (difficulty !== 'hard' ? 1 : 0),
        incorrect: sessionStats.incorrect + (difficulty === 'hard' ? 1 : 0),
        duration: Math.round((Date.now() - sessionStats.startTime) / 1000),
      });
      setCurrentIndex(sessionWords.length); // trigger complete view
    }
  }, [currentWord, currentIndex, sessionWords.length, updateWord, updateStreak, addSession, sessionStats]);

  if (sessionWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-foreground">Alles bijgewerkt!</h2>
        <p className="text-muted-foreground mt-2">Geen woorden klaar voor herhaling. Kom later terug.</p>
        <button onClick={() => navigate('/')} className="mt-6 gradient-primary rounded-lg px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          Terug naar Dashboard
        </button>
      </div>
    );
  }

  // Session complete
  if (currentIndex >= sessionWords.length) {
    const totalTime = Math.round((Date.now() - sessionStats.startTime) / 1000);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-foreground">Sessie Voltooid!</h2>
        <div className="grid grid-cols-3 gap-4 mt-6 w-full max-w-sm">
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{sessionWords.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Woorden</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-success">{sessionStats.correct}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Goed</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Tijd</p>
          </div>
        </div>
        <button onClick={() => navigate('/')} className="mt-6 gradient-primary rounded-lg px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          Terug naar Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-right">
          <span className="text-lg font-bold text-foreground">{currentIndex + 1}</span>
          <span className="text-muted-foreground"> / {sessionWords.length} woorden</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 mb-6 bg-border" />

      {/* Flashcard */}
      <div
        className="glass-card rounded-2xl p-8 min-h-[350px] flex flex-col items-center justify-center cursor-pointer transition-all hover:border-primary/30 active:scale-[0.99]"
        onClick={() => setShowTranslation(!showTranslation)}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Italiaans {currentWord.partOfSpeech && `• ${currentWord.partOfSpeech}`}
          </span>
          <button className="text-muted-foreground hover:text-foreground p-1">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold text-foreground text-center">
          {currentWord.original}
        </h2>

        {currentWord.phonetic && (
          <p className="text-lg text-accent italic mt-3">{currentWord.phonetic}</p>
        )}

        {showTranslation ? (
          <div className="mt-8 animate-flip-in text-center">
            <p className="text-xl text-foreground font-medium">{currentWord.translation}</p>
            {currentWord.exampleSentence && (
              <p className="text-sm text-muted-foreground mt-3 italic">"{currentWord.exampleSentence}"</p>
            )}
          </div>
        ) : (
          <button
            className="mt-8 rounded-full bg-secondary px-6 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowTranslation(true); }}
          >
            Toon Vertaling
          </button>
        )}
      </div>

      {/* Rating Buttons */}
      {showTranslation && (
        <div className="grid grid-cols-3 gap-3 mt-6 animate-slide-up">
          {([
            { diff: 'hard' as Difficulty, icon: Frown, label: 'Moeilijk', color: 'bg-destructive/10 border-destructive/30 text-destructive' },
            { diff: 'good' as Difficulty, icon: Smile, label: 'Goed', color: 'bg-primary/10 border-primary/30 text-primary' },
            { diff: 'easy' as Difficulty, icon: Laugh, label: 'Makkelijk', color: 'bg-success/10 border-success/30 text-success' },
          ]).map(({ diff, icon: Icon, label, color }) => (
            <button
              key={diff}
              onClick={() => handleRate(diff)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all hover:scale-105 active:scale-95 ${color}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-[10px] text-muted-foreground">
                {getReviewIntervalText(diff, currentWord)}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground mt-4">
        Klik op de kaart om de vertaling te onthullen
      </p>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { Zap, Loader2, Trash2, Check, X, Pencil } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Word } from '@/types/word';
import { getFsrsMasteryScore } from '@/lib/fsrs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatTranslations, hasTranslation, mergeTranslation } from '@/lib/translation-utils';
import { validateWordPair, WordWarning } from '@/lib/word-validation';
import { AlertTriangle } from 'lucide-react';

interface PendingWord {
  original: string;
  translation: string;
  autoTranslated: boolean;
  translating: boolean;
  warnings: WordWarning[];
}

export default function WordBank() {
  const { words, fsrsStates, addWords, deleteWord, updateWord, autoTranslate } = useStore();
  const { toast } = useToast();
  const [bulkInput, setBulkInput] = useState('');
  const [autoTranslateOn, setAutoTranslateOn] = useState(true);
  const [pendingWords, setPendingWords] = useState<PendingWord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [wordToDeleteId, setWordToDeleteId] = useState<string | null>(null);

  const handleAddWords = async () => {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const newPending: PendingWord[] = [];
    const merged: string[] = [];

    for (const line of lines) {
      const parts = line.split(/[-–—=:,]\s*/);
      const original = parts[0]?.trim() || '';
      const translation = parts[1]?.trim() || '';

      const existing = words.find(w => w.original.toLowerCase().trim() === original.toLowerCase().trim());
      if (existing) {
        if (translation && !hasTranslation(existing.translation, translation)) {
          await updateWord(existing.id, {
            translation: mergeTranslation(existing.translation, translation),
          });
          merged.push(original);
        }
        continue;
      }

      if (newPending.some(p => p.original.toLowerCase().trim() === original.toLowerCase().trim())) {
        continue;
      }

      newPending.push({
        original,
        translation,
        autoTranslated: !translation,
        translating: !translation && autoTranslateOn,
        warnings: translation ? validateWordPair(original, translation) : [],
      });
    }

    if (merged.length > 0) {
      toast({
        title: 'Vertalingen samengevoegd',
        description: `Nieuwe betekenis toegevoegd aan: ${merged.join(', ')}`,
      });
    }

    if (newPending.length === 0) {
      setBulkInput('');
      return;
    }

    setPendingWords(newPending);
    setBulkInput('');

    if (autoTranslateOn) {
      const wordsToTranslate = newPending.filter(p => !p.translation).map(p => p.original);
      if (wordsToTranslate.length > 0) {
        try {
          const translations = await autoTranslate(wordsToTranslate);
          setPendingWords(prev => prev.map(p => {
            if (p.translating) {
              const translated = translations[p.original.toLowerCase()] || `[vertaling van "${p.original}"]`;
              return { ...p, translation: translated, translating: false, warnings: validateWordPair(p.original, translated) };
            }
            return p;
          }));
        } catch (e) {
          console.error('Translation error:', e);
          setPendingWords(prev => prev.map(p =>
            p.translating ? { ...p, translation: '[fout bij vertalen]', translating: false } : p
          ));
        }
      }
    }
  };

  const handleConfirmAll = () => {
    const newWords: Omit<Word, 'id'>[] = pendingWords
      .filter(p => p.original && p.translation && !p.translating)
      .map(p => ({
        original: p.original.trim(),
        translation: p.translation.trim(),
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReview: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'new' as const,
        autoTranslated: p.autoTranslated,
        consecutiveErrors: 0,
      }));
    addWords(newWords);
    setPendingWords([]);
  };

  const handleEditPending = (index: number, field: 'original' | 'translation', value: string) => {
    setPendingWords(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const updated = { ...p, [field]: value };
      updated.warnings = (updated.original && updated.translation && !updated.translating)
        ? validateWordPair(updated.original, updated.translation)
        : [];
      return updated;
    }));
  };

  const handleRemovePending = (index: number) => {
    setPendingWords(prev => prev.filter((_, i) => i !== index));
  };

  const startEditingWord = (word: Word) => {
    setEditingWordId(word.id);
    setEditOriginal(word.original);
    setEditTranslation(word.translation);
  };

  const cancelEditingWord = () => {
    setEditingWordId(null);
    setEditOriginal('');
    setEditTranslation('');
  };

  const handleSaveWord = async () => {
    if (!editingWordId) return;

    const original = editOriginal.trim();
    const translation = editTranslation.trim();

    if (!original || !translation) {
      toast({
        title: 'Vul beide velden in',
        description: 'Zowel het woord als de vertaling zijn verplicht.',
      });
      return;
    }

    const duplicateWord = words.find(w =>
      w.id !== editingWordId && w.original.toLowerCase().trim() === original.toLowerCase().trim()
    );

    if (duplicateWord) {
      toast({
        title: 'Woord bestaat al',
        description: 'Pas liever de vertalingen van het bestaande woord aan.',
      });
      return;
    }

    await updateWord(editingWordId, { original, translation });
    cancelEditingWord();
  };

  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredWords = useMemo(() =>
    words.filter(w =>
      w.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.translation.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [words, searchQuery]
  );

  const visibleWords = filteredWords.slice(0, visibleCount);
  const hasMore = visibleCount < filteredWords.length;

  return (
    <>
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mijn Woorden</h1>
        <p className="text-sm text-muted-foreground mt-1">Voeg woorden toe aan je woordenbank.</p>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Snel Invoeren</h3>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Eén woord per regel</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto-vertalen</span>
            <Switch checked={autoTranslateOn} onCheckedChange={setAutoTranslateOn} />
          </div>
        </div>
        <textarea
          className="w-full rounded-lg bg-background/60 border border-border p-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          rows={4}
          placeholder={"Typ hier woorden...\neffimero\nresilienza - veerkracht\nluminescente"}
          value={bulkInput}
          onChange={e => setBulkInput(e.target.value)}
        />
        <button
          onClick={handleAddWords}
          disabled={!bulkInput.trim()}
          className="mt-3 gradient-primary rounded-lg px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Toevoegen aan Bank
        </button>
      </div>

      {pendingWords.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Te bevestigen ({pendingWords.length})
            </h3>
            <button
              onClick={handleConfirmAll}
              disabled={pendingWords.some(p => p.translating)}
              className="flex items-center gap-1.5 gradient-accent rounded-lg px-4 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" /> Alles Bevestigen
            </button>
          </div>
          <div className="space-y-2">
            {pendingWords.map((pw, i) => (
              <div key={i} className="rounded-lg bg-background/40 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 bg-transparent text-sm font-medium text-foreground focus:outline-none"
                    value={pw.original}
                    onChange={e => handleEditPending(i, 'original', e.target.value)}
                  />
                  <span className="text-muted-foreground text-xs">→</span>
                  {pw.translating ? (
                    <div className="flex-1 flex items-center gap-1.5 text-muted-foreground text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vertalen...
                    </div>
                  ) : (
                    <input
                      className="flex-1 bg-transparent text-sm text-muted-foreground focus:outline-none focus:text-foreground"
                      value={pw.translation}
                      onChange={e => handleEditPending(i, 'translation', e.target.value)}
                      placeholder="Vertaling..."
                    />
                  )}
                  {pw.autoTranslated && !pw.translating && (
                    <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-medium">AI</span>
                  )}
                  <button onClick={() => handleRemovePending(i)} className="text-muted-foreground hover:text-destructive p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {pw.warnings.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {pw.warnings.map((w, wi) => (
                      <span key={wi} className="flex items-center gap-1 text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded">
                        <AlertTriangle className="h-3 w-3" /> {w.message}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {words.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-foreground">
              Recente Woorden
              <span className="text-sm text-muted-foreground font-normal ml-2">{words.length} totaal</span>
            </h3>
          </div>
          <input
            className="w-full rounded-lg bg-card border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary mb-3"
            placeholder="Zoek woorden..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleWords.map(word => {
              const isEditing = editingWordId === word.id;

              return (
                <div key={word.id} className="glass-card rounded-xl p-4 group">
                  <div className="flex items-start justify-between">
                    <span className={`text-[9px] uppercase tracking-wider font-medium ${
                      word.status === 'new' ? 'text-accent' :
                      word.status === 'learning' ? 'text-warning' :
                      word.status === 'review' ? 'text-primary' : 'text-success'
                    }`}>
                      {word.status === 'new' ? 'Nieuw' : word.status === 'learning' ? 'Leren' : word.status === 'review' ? 'Herhaling' : 'Stabiel'}
                    </span>
                    <div className={`flex gap-1 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button onClick={() => startEditingWord(word)} className="text-muted-foreground hover:text-foreground p-1">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setWordToDeleteId(word.id)} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <input
                        className="w-full rounded-lg bg-background/60 border border-border px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={editOriginal}
                        onChange={e => setEditOriginal(e.target.value)}
                        placeholder="Italiaans woord"
                      />
                      <input
                        className="w-full rounded-lg bg-background/60 border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={editTranslation}
                        onChange={e => setEditTranslation(e.target.value)}
                        placeholder="Vertaling of: langzaam; zachtjes"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onPointerDown={e => { e.preventDefault(); handleSaveWord(); }}
                          className="flex-1 flex items-center justify-center gap-1.5 gradient-primary rounded-lg px-3 py-2 text-sm font-semibold text-primary-foreground"
                        >
                          <Check className="h-3.5 w-3.5" /> Opslaan
                        </button>
                        <button
                          type="button"
                          onPointerDown={e => { e.preventDefault(); cancelEditingWord(); }}
                          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-base font-bold text-foreground mt-1">{word.original}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{formatTranslations(word.translation)}</p>
                    </>
                  )}

                  {(() => {
                    const mastery = getFsrsMasteryScore(fsrsStates[word.id] ?? {});
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <Progress value={mastery} className="h-1.5 flex-1" />
                        <span className="text-[10px] font-medium text-muted-foreground">{mastery}%</span>
                      </div>
                    );
                  })()}
                  {word.autoTranslated && (
                    <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded mt-1.5 inline-block">AI vertaald</span>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              className="w-full mt-4 rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
            >
              Meer laden ({filteredWords.length - visibleCount} resterend)
            </button>
          )}
        </div>
      )}
    </div>

      <AlertDialog open={!!wordToDeleteId} onOpenChange={() => setWordToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Woord verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {wordToDeleteId && (() => {
                const w = words.find(w => w.id === wordToDeleteId);
                return w ? <>Verwijder <span className="font-medium text-foreground">"{w.original}"</span>? Dit kan niet ongedaan worden gemaakt.</> : 'Dit kan niet ongedaan worden gemaakt.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (wordToDeleteId) deleteWord(wordToDeleteId);
                setWordToDeleteId(null);
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}



## Plan: MC Voorrang op Luisteren

### Wijziging
Eén bestand: `src/lib/srs.ts`, functie `pickExerciseType()`.

### Nieuwe logica

```text
status = 'new':
  80% MC, 20% luisteren

status = 'learning':
  consecutiveErrors >= 2  → 80% MC, 20% luisteren (fallback)
  anders                  → productie (altijd)

status = 'review'/'stable':
  exampleSentence exists  → willekeurig: flashcard, productie, of zin aanvullen
  anders                  → willekeurig: flashcard of productie
```

Luisteren verdwijnt volledig uit review/stable en wordt in de introductie-/fallbackfase ondergeschikt aan MC (slechts 20% kans).


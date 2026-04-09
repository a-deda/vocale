

## Plan: Intuïtievere Mastery Score

### Probleem
De huidige score telt de Ease Factor mee (30%), waardoor nieuwe woorden al op ~30% starten. Dat is verwarrend.

### Nieuwe formule
De Ease Factor wordt geschrapt als component. De score wordt puur gebaseerd op **herhalingen** en **interval**, plus een statusbonus:

- **Status = 'new'** → altijd **0%**
- **Herhalingen** (max 40 punten): `min(repetitions / 6, 1) × 40`
- **Interval** (max 50 punten): `min(interval / 90, 1) × 50`
- **Statusbonus** (max 10 punten): `learning = 0`, `review = 5`, `stable = 10`
- **100% pas bereikbaar** wanneer een woord 6+ herhalingen, 90+ dagen interval én status 'stable' heeft

### Wijzigingen
**`src/lib/srs.ts`** — `getMasteryScore()` herschrijven met bovenstaande formule.

Geen andere bestanden hoeven te wijzigen; Dashboard en WordBank gebruiken al `getMasteryScore()`.


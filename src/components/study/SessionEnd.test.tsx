import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SessionEnd from '@/components/study/SessionEnd';
import type { SessionTally } from '@/components/study/SessionEnd';

const tally: SessionTally = {
  words: 8, introduced: 3, anchored: [], almost: 1, avgResponseMs: null,
};
const counts = { lapsed: 2, active: 5, anchored: 1, new: 4, total: 12 };

function show(over: Partial<React.ComponentProps<typeof SessionEnd>> = {}) {
  cleanup();
  return render(
    <SessionEnd
      tally={tally}
      counts={counts}
      lapsedBefore={2}
      dueTomorrow={0}
      newAvailable={0}
      blockedByGoal={false}
      dailyGoal={20}
      onClose={vi.fn()}
      onMoreNew={vi.fn()}
      onContinueAnyway={vi.fn()}
      {...over}
    />,
  );
}

describe('SessionEnd', () => {
  it('splitst wat je deed in herhaald en nieuw geleerd', () => {
    show();
    // De waarde staat naast zijn label in dezelfde rij; het cijfer alleen
    // opzoeken zou de toestandsbalk kunnen raken.
    const value = (label: string) =>
      screen.getByText(label).parentElement!.textContent!.replace(label, '');

    expect(value('herhaald')).toBe('5');           // 8 - 3
    expect(value('nieuw geleerd')).toBe('3');
  });

  it('noemt nieuwe woorden bij naam, niet "vooruitwerken"', () => {
    show({ newAvailable: 6 });
    expect(screen.getByText('Nieuwe woorden (6)')).toBeInTheDocument();
    expect(screen.queryByText(/Vooruitwerken/)).not.toBeInTheDocument();
    expect(screen.getByText(/Alles herhaald/)).toBeInTheDocument();
  });

  it('meldt het dagdoel en laat je er toch voorbij', () => {
    show({ blockedByGoal: true, newAvailable: 6 });
    expect(screen.getByText(/Je dagdoel van 20 is gehaald/)).toBeInTheDocument();
    expect(screen.getByText('Toch doorgaan')).toBeInTheDocument();
    // Het dagdoel gaat vóór: geen tweede knop die het meteen omzeilt.
    expect(screen.queryByText(/Nieuwe woorden/)).not.toBeInTheDocument();
  });

  it('valt terug op morgen als er niets nieuws meer is', () => {
    show({ dueTomorrow: 4 });
    expect(screen.getByText(/Morgen komen er 4 terug/)).toBeInTheDocument();
  });
});

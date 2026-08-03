/**
 * Wat je typte, met het verschil eronder gestreept in tangerine. Bij 'bijna'
 * alleen de afwijkende tekens; bij 'nog niet' het hele woord — daar valt niets
 * meer aan te wijzen.
 */
export default function AnswerDiff({
  input, correct, result,
}: {
  input:   string;
  correct: string;
  result:  'almost' | 'wrong';
}) {
  if (!input) return <span className="text-ink-weak">—</span>;

  if (result === 'wrong') {
    return <Marked>{input}</Marked>;
  }

  return (
    <>
      {segmentAgainst(input, correct).map((segment, i) =>
        segment.differs
          ? <Marked key={i}>{segment.text}</Marked>
          : <span key={i}>{segment.text}</span>,
      )}
    </>
  );
}

function Marked({ children }: { children: React.ReactNode }) {
  return <span className="border-b-[3px] border-lapsed">{children}</span>;
}

/**
 * Splits de invoer in stukken die wel en niet overeenkomen met het juiste woord,
 * via de langste gemeenschappelijke deelrij. Casing telt niet mee.
 */
function segmentAgainst(input: string, correct: string): { text: string; differs: boolean }[] {
  const a = input.toLowerCase();
  const b = correct.toLowerCase();
  const m = a.length;
  const n = b.length;

  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = a[i - 1] === b[j - 1]
        ? lcs[i - 1][j - 1] + 1
        : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  const kept = new Array<boolean>(m).fill(false);
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      kept[i - 1] = true;
      i--; j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const segments: { text: string; differs: boolean }[] = [];
  for (let k = 0; k < m; k++) {
    const differs = !kept[k];
    const last = segments[segments.length - 1];
    if (last && last.differs === differs) last.text += input[k];
    else segments.push({ text: input[k], differs });
  }
  return segments;
}

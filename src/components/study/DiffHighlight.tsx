import React from 'react';

/**
 * Show a character-level diff between the user's input and the correct answer.
 * Highlights added/wrong characters in red and missing characters in green.
 */
interface DiffHighlightProps {
  input: string;
  correct: string;
}

export default function DiffHighlight({ input, correct }: DiffHighlightProps) {
  const ops = diffChars(input.toLowerCase(), correct.toLowerCase());

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Jouw antwoord:{' '}
        <span className="font-mono">
          {ops.map((op, i) => {
            if (op.type === 'equal') return <span key={i} className="text-foreground">{displayChar(input, op.sourceStart!, op.length)}</span>;
            if (op.type === 'delete') return <span key={i} className="text-destructive bg-destructive/15 rounded px-0.5 line-through">{displayChar(input, op.sourceStart!, op.length)}</span>;
            // insert — character missing from input, skip in this line
            return null;
          })}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        Correct:{' '}
        <span className="font-mono">
          {ops.map((op, i) => {
            if (op.type === 'equal') return <span key={i} className="text-foreground">{displayChar(correct, op.targetStart!, op.length)}</span>;
            if (op.type === 'insert') return <span key={i} className="text-success bg-success/15 rounded px-0.5 font-bold">{displayChar(correct, op.targetStart!, op.length)}</span>;
            // delete — extra char in input, skip in correct line
            return null;
          })}
        </span>
      </p>
    </div>
  );
}

/** Preserve original casing when displaying */
function displayChar(source: string, start: number, length: number) {
  return source.slice(start, start + length);
}

type DiffOp =
  | { type: 'equal'; sourceStart: number; targetStart: number; length: number }
  | { type: 'delete'; sourceStart: number; length: number }
  | { type: 'insert'; targetStart: number; length: number };

/** Simple Myers-like char diff using DP (fine for short strings) */
function diffChars(a: string, b: string): DiffOp[] {
  const m = a.length, n = b.length;
  // LCS via DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build ops
  const ops: DiffOp[] = [];
  let i = m, j = n;
  const raw: Array<{ type: 'equal' | 'delete' | 'insert'; si: number; ti: number }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', si: i - 1, ti: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'insert', si: -1, ti: j - 1 });
      j--;
    } else {
      raw.push({ type: 'delete', si: i - 1, ti: -1 });
      i--;
    }
  }

  raw.reverse();

  // Merge consecutive same-type ops
  for (const r of raw) {
    const last = ops[ops.length - 1];
    if (r.type === 'equal') {
      if (last && last.type === 'equal' && last.sourceStart! + last.length === r.si) {
        last.length++;
      } else {
        ops.push({ type: 'equal', sourceStart: r.si, targetStart: r.ti, length: 1 });
      }
    } else if (r.type === 'delete') {
      if (last && last.type === 'delete' && last.sourceStart! + last.length === r.si) {
        last.length++;
      } else {
        ops.push({ type: 'delete', sourceStart: r.si, length: 1 });
      }
    } else {
      if (last && last.type === 'insert' && last.targetStart! + last.length === r.ti) {
        last.length++;
      } else {
        ops.push({ type: 'insert', targetStart: r.ti, length: 1 });
      }
    }
  }

  return ops;
}

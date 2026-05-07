import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allEntries } from '../src/lib/server/ozhegov.js';
import { isCleanRussianWord } from '../src/lib/words.js';
import { findRhymes } from '../src/lib/rhymes.js';

let corpusCache: string[] | null = null;

// Корпус для рифм — все «чистые» леммы Ожегова (включая глаголы и прилагательные:
// рифмовать имеет смысл с чем угодно, не только с другим существительным).
function getCorpus(): string[] {
  if (corpusCache) return corpusCache;
  const out: string[] = [];
  for (const e of allEntries()) {
    if (!isCleanRussianWord(e.word)) continue;
    out.push(e.word);
  }
  corpusCache = out;
  return out;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const word = (typeof req.query.word === 'string' ? req.query.word : '').trim();
  const countRaw = parseInt(
    (typeof req.query.count === 'string' ? req.query.count : '12') || '12',
    10,
  );
  const count = Math.max(1, Math.min(50, countRaw || 12));

  if (!word) {
    res.status(400).json({ error: 'word required' });
    return;
  }

  const rhymes = findRhymes(word, getCorpus(), count);
  res.status(200).json({ word, rhymes });
}

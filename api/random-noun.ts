import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allEntries, type OzhEntry } from '../src/lib/server/ozhegov.js';
import { isCleanRussianWord, isNounLemma } from '../src/lib/words.js';
import { isEasyWord, isNormalWord } from '../src/lib/server/frequency.js';

type Level = 'easy' | 'normal' | 'all';

const LEN_LIMITS: Record<Level, { min: number; max: number }> = {
  easy:   { min: 3, max: 12 },
  normal: { min: 3, max: 14 },
  all:    { min: 3, max: 16 },
};

const caches: Partial<Record<Level, OzhEntry[]>> = {};

function getNouns(level: Level): OzhEntry[] {
  const cached = caches[level];
  if (cached) return cached;
  const { min, max } = LEN_LIMITS[level];
  const out: OzhEntry[] = [];
  for (const e of allEntries()) {
    if (!isCleanRussianWord(e.word)) continue;
    if (!e.defs.length) continue;
    if (!isNounLemma(e.word)) continue;
    if (e.word.length < min || e.word.length > max) continue;
    if (level === 'easy'   && !isEasyWord(e.word))   continue;
    if (level === 'normal' && !isNormalWord(e.word)) continue;
    out.push(e);
  }
  caches[level] = out;
  return out;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const raw = (typeof req.query.level === 'string' ? req.query.level : 'normal') || 'normal';
  const level: Level = raw === 'easy' || raw === 'all' ? raw : 'normal';

  const nouns = getNouns(level);
  if (!nouns.length) {
    res.status(500).json({ error: 'no nouns' });
    return;
  }
  const i = Math.floor(Math.random() * nouns.length);
  const e = nouns[i];
  res.status(200).json({
    word: e.word,
    def: e.defs[0] || '',
  });
}

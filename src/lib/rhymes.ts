// Поиск рифм без словаря ударений.
//
// Минимальное условие — совпадение последних 2 букв. Дальше ранжирование:
//   1) длина общего суффикса (главное)
//   2) бонус за «хорошую» рифму — если общий суффикс ≥ длины хвоста от предпоследней гласной
//   3) близость числа слогов (одинаковый размер строк звучит ритмичнее)
//
// Это даёт хороший охват: для «молоко» найдутся яблоко/глубоко/далеко даже при
// расхождении в начале хвоста. Для «жизнь» подтянутся болезнь/боязнь.
//
// Ограничения: ударение неизвестно, оглушение и редукция гласных не учитываются.

const VOWELS = new Set(['а', 'е', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я']);

export function normalize(word: string): string {
  return String(word || '').toLowerCase().replace(/ё/g, 'е');
}

export function getRhymeTail(word: string): string {
  const w = normalize(word);
  const vowels: number[] = [];
  for (let i = w.length - 1; i >= 0; i--) {
    if (VOWELS.has(w[i])) {
      vowels.push(i);
      if (vowels.length === 2) break;
    }
  }
  if (vowels.length === 0) return '';
  const start = vowels.length === 1 ? vowels[0] : vowels[1];
  return w.slice(start);
}

export function countSyllables(word: string): number {
  const w = normalize(word);
  let n = 0;
  for (const ch of w) if (VOWELS.has(ch)) n++;
  return n;
}

function commonSuffixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

export function findRhymes(word: string, allWords: string[], max = 12): string[] {
  const target = normalize(word);
  if (target.length < 2) return [];
  const last2 = target.slice(-2);
  const tail = getRhymeTail(target);
  const tailLen = tail.length;
  const targetSyl = countSyllables(target);

  type Cand = { word: string; suffix: number; isStrong: boolean; sylDiff: number };
  const cands: Cand[] = [];

  for (const w of allWords) {
    const norm = normalize(w);
    if (norm === target) continue;
    if (norm.length < 3) continue;
    if (!norm.endsWith(last2)) continue;
    const suffix = commonSuffixLength(norm, target);
    if (suffix < 2) continue;
    const isStrong = tailLen > 0 && suffix >= tailLen;
    const sylDiff = Math.abs(countSyllables(norm) - targetSyl);
    cands.push({ word: w, suffix, isStrong, sylDiff });
  }

  cands.sort((a, b) =>
    Number(b.isStrong) - Number(a.isStrong)
    || b.suffix - a.suffix
    || a.sylDiff - b.sylDiff
    || a.word.localeCompare(b.word, 'ru'),
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cands) {
    if (seen.has(c.word)) continue;
    seen.add(c.word);
    out.push(c.word);
    if (out.length >= max) break;
  }
  return out;
}

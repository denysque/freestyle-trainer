// Эвристика части речи по окончаниям леммы Ожегова.
// Для freestyle-тренажёра нам нужны только существительные на L1.
// Леммы Ожегова в начальной форме: глагол на -ть/-ти/-чь, прил-е на -ый/-ий.
// Всё остальное — считаем существительным.

export function isNounLemma(word: string): boolean {
  const w = String(word).toLowerCase();
  if (w.length < 2) return false;
  const isVerb = w.length >= 5 && /(?:ть|ти|чь)(?:ся)?$/.test(w);
  const isAdjective = w.length >= 4 && /(?:ый|ий)$/.test(w) && !isVerb;
  return !isVerb && !isAdjective;
}

export function isCleanRussianWord(w: string): boolean {
  if (w.length < 3) return false;
  if (/[A-Za-z0-9]/.test(w)) return false;
  if (!/^[а-яёА-ЯЁ-]+$/.test(w)) return false;
  // Имена собственные — у Ожегова с заглавной первой буквы; нарицательные — со строчной.
  if (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) return false;
  // Слова с дефисом часто составные/спорные — отбрасываем.
  if (w.includes('-')) return false;
  return true;
}

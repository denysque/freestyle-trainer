import { useEffect, useRef, useState } from 'react';
import {
  fetchRandomNoun,
  fetchRhymes,
  fetchByWord,
  type RandomNoun,
  type DifficultyLevel,
} from './lib/api';
import { createBeatPlayer, type BeatPlayer, BEAT_PRESETS } from './lib/beat';
import { createRecorder, type VoiceRecorder } from './lib/recorder';
import { countSyllables } from './lib/rhymes';
import { pluralSyllables, formatTime } from './lib/format';
import { initTelegram, getTg } from './lib/telegram';

// ---------------------------------------------------------------------------
// Типы и константы

interface Slot {
  noun: RandomNoun;
  rhymes: string[];
}

interface Recording {
  id: number;
  url: string;
  duration: number;
  createdAt: number;
}

const SLOT_LABELS = ['1—2 строки', '3—4 строки'];
const TIMER_OPTIONS = [30, 60, 90];
const DIFFICULTY_OPTIONS: { id: DifficultyLevel; label: string; hint: string }[] = [
  {
    id: 'easy',
    label: 'простые',
    hint: 'из топ-3000 самых частых слов в речи — точно знакомые',
  },
  {
    id: 'normal',
    label: 'обычные',
    hint: 'из топ-15 000 — расширенный словарный запас',
  },
  {
    id: 'all',
    label: 'любые',
    hint: 'весь словарь Ожегова, включая редкие и научные',
  },
];
const DIFFICULTY_KEY = 'freestyle:difficulty';
const THEME_KEY = 'freestyle:theme';

type Theme = 'dark' | 'light';

// ---------------------------------------------------------------------------
// Звуковой пик для конца таймера. Создаём свой AudioContext по требованию.
function playEndBeep() {
  try {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* нет аудио — молча */
  }
}

// ---------------------------------------------------------------------------
// Компонент

export default function App() {
  // --- слоты со словами ---
  const [slots, setSlots] = useState<(Slot | null)[]>([null, null]);
  const [loading, setLoading] = useState<boolean[]>([false, false]);

  // --- плеер бита ---
  const [presetIdx, setPresetIdx] = useState(0);
  const [bpm, setBpm] = useState(BEAT_PRESETS[0].bpm);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<BeatPlayer | null>(null);

  // --- сложность слов ---
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (saved === 'easy' || saved === 'normal' || saved === 'all') return saved;
    return 'normal';
  });

  // --- тема ---
  // Приоритет: 1) сохранённый выбор пользователя, 2) тема из Telegram (если в TG),
  // 3) тёмная по умолчанию.
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    const tgScheme = window.Telegram?.WebApp?.colorScheme;
    if (tgScheme === 'light' || tgScheme === 'dark') return tgScheme;
    return 'dark';
  });
  // Если пользователь сам нажимал переключатель — больше не следуем за TG-темой.
  const userOverrodeTheme = useRef(localStorage.getItem(THEME_KEY) !== null);

  // --- таймер ---
  const [timerSec, setTimerSec] = useState(60);
  const [timerLeft, setTimerLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerEndRef = useRef(0);
  const onEndRef = useRef<() => void>(() => {});

  // --- запись голоса ---
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const recordingStartRef = useRef(0);
  const recordIdRef = useRef(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  // --- тост (для share и т.п.) ---
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Эффекты

  useEffect(() => {
    playerRef.current = createBeatPlayer(BEAT_PRESETS[0].id);
    recorderRef.current = createRecorder();

    // Telegram Mini App: ready() + expand() + подписка на смену темы.
    const tg = initTelegram();
    const handleThemeChange = () => {
      if (userOverrodeTheme.current) return;
      const next = tg?.colorScheme;
      if (next === 'light' || next === 'dark') setTheme(next);
    };
    tg?.onEvent('themeChanged', handleThemeChange);

    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
      recorderRef.current = null;
      tg?.offEvent('themeChanged', handleThemeChange);
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setTempo(bpm);
  }, [bpm]);

  useEffect(() => {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
  }, [difficulty]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Подгрузить пару из URL-параметров при первом маунте.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const w1 = params.get('w1');
    const w2 = params.get('w2');
    if (!w1 && !w2) return;
    (async () => {
      setLoading([!!w1, !!w2]);
      const tasks = [w1, w2].map(async w => (w ? await loadByWord(w) : null));
      const next = await Promise.all(tasks);
      setSlots(next);
      setLoading([false, false]);
    })();
    // Не сбрасываем URL — пусть остаётся «постоянной» ссылкой пары.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Тик таймера через rAF + Date.now (точно работает в фоне).
  useEffect(() => {
    if (!timerRunning) return;
    let frame = 0;
    const loop = () => {
      const left = (timerEndRef.current - Date.now()) / 1000;
      if (left <= 0) {
        setTimerLeft(0);
        setTimerRunning(false);
        playEndBeep();
        onEndRef.current?.();
        return;
      }
      setTimerLeft(left);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [timerRunning]);

  // Тик секундомера записи.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setRecordingTime((Date.now() - recordingStartRef.current) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, [recording]);

  // -------------------------------------------------------------------------
  // Хелперы

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  }

  async function loadSlot(_idx: number): Promise<Slot | null> {
    try {
      const w = await fetchRandomNoun(difficulty);
      const r = await fetchRhymes(w.word);
      return { noun: w, rhymes: r };
    } catch {
      return null;
    }
  }

  async function loadByWord(word: string): Promise<Slot | null> {
    try {
      const w = await fetchByWord(word);
      if (!w) return null;
      const r = await fetchRhymes(w.word);
      return { noun: w, rhymes: r };
    } catch {
      return null;
    }
  }

  async function rollPair() {
    setLoading([true, true]);
    setSlots([null, null]);
    getTg()?.HapticFeedback?.impactOccurred('medium');
    const [a, b] = await Promise.all([loadSlot(0), loadSlot(1)]);
    setSlots([a, b]);
    setLoading([false, false]);
    // Чистим URL чтобы новая пара не «застывала» под старым shared-адресом.
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  async function rerollSlot(idx: number) {
    setLoading(l => { const c = [...l]; c[idx] = true; return c; });
    setSlots(s => { const c = [...s]; c[idx] = null; return c; });
    const next = await loadSlot(idx);
    setSlots(s => { const c = [...s]; c[idx] = next; return c; });
    setLoading(l => { const c = [...l]; c[idx] = false; return c; });
  }

  // --- плеер ---

  async function togglePlay() {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) {
      p.stop();
      setPlaying(false);
    } else {
      await p.start();
      setPlaying(true);
    }
  }

  function shiftPreset(delta: number) {
    const next = (presetIdx + delta + BEAT_PRESETS.length) % BEAT_PRESETS.length;
    const preset = BEAT_PRESETS[next];
    setPresetIdx(next);
    setBpm(preset.bpm);
    playerRef.current?.setPreset(preset.id);
  }

  function bumpBpm(delta: number) {
    setBpm(b => Math.max(60, Math.min(180, b + delta)));
  }

  // --- таймер ---

  function startTimer() {
    onEndRef.current = () => {
      // Сбрасываем дисплей и катим новую пару (если уже была).
      if (slots.some(Boolean)) rollPair();
    };
    timerEndRef.current = Date.now() + timerSec * 1000;
    setTimerLeft(timerSec);
    setTimerRunning(true);
  }

  function stopTimer() {
    setTimerRunning(false);
    setTimerLeft(0);
  }

  // --- запись голоса ---

  async function toggleRecord() {
    const r = recorderRef.current;
    if (!r) return;
    if (r.isRecording()) {
      const blob = await r.stop();
      setRecording(false);
      const dur = (Date.now() - recordingStartRef.current) / 1000;
      const url = URL.createObjectURL(blob);
      const id = ++recordIdRef.current;
      setRecordings(prev => [{ id, url, duration: dur, createdAt: Date.now() }, ...prev]);
      setRecordingTime(0);
    } else {
      try {
        // Если бит-плеер инициализирован — забираем у него поток для микса.
        // Это нужно делать ДО getUserMedia, чтобы AudioContext завёлся внутри
        // user-gesture (нажатия кнопки записи).
        const beatStream = (await playerRef.current?.getRecordingStream()) ?? null;
        await r.start(beatStream);
        recordingStartRef.current = Date.now();
        setRecordingTime(0);
        setRecording(true);
        setRecordError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'не получилось';
        setRecordError(`микрофон недоступен — ${msg}`);
      }
    }
  }

  function deleteRecording(id: number) {
    setRecordings(prev => {
      const target = prev.find(r => r.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(r => r.id !== id);
    });
  }

  function downloadRecording(rec: Recording) {
    const a = document.createElement('a');
    a.href = rec.url;
    const ts = new Date(rec.createdAt).toISOString().replace(/[:.]/g, '-');
    a.download = `freestyle-${ts}.webm`;
    a.click();
  }

  // --- поделиться ---

  async function shareCurrent() {
    const w1 = slots[0]?.noun.word ?? '';
    const w2 = slots[1]?.noun.word ?? '';
    if (!w1 && !w2) return;
    const url = new URL(window.location.href);
    url.search = '';
    if (w1) url.searchParams.set('w1', w1);
    if (w2) url.searchParams.set('w2', w2);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('ссылка скопирована');
    } catch {
      showToast(url.toString());
    }
  }

  // -------------------------------------------------------------------------
  // Рендер

  const preset = BEAT_PRESETS[presetIdx];
  const hasAny = slots.some(Boolean);
  const isLoadingAll = loading[0] && loading[1] && !hasAny;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">FREESTYLE<span>®</span></div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() => {
              userOverrodeTheme.current = true;
              setTheme(t => t === 'dark' ? 'light' : 'dark');
              getTg()?.HapticFeedback?.impactOccurred('light');
            }}
            aria-label="Сменить тему"
            title={theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          {hasAny && (
            <button className="icon-btn" onClick={shareCurrent} aria-label="Поделиться парой" title="SHARE">
              ↗
            </button>
          )}
        </div>
      </header>

      <div className="difficulty-block">
        <div className="difficulty">
          {DIFFICULTY_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`difficulty-btn ${difficulty === opt.id ? 'active' : ''}`}
              onClick={() => setDifficulty(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="difficulty-hint">
          {DIFFICULTY_OPTIONS.find(o => o.id === difficulty)?.hint}
        </div>
      </div>

      {!hasAny && !isLoadingAll && (
        <section className="intro">
          <div className="intro-title">как это работает</div>
          <p className="intro-text">
            расскажи историю в <b>4 строки</b>, чтобы строки рифмовались парами.
            жми «NEW PAIR» — выпадет два слова и подсказки-рифмы к каждому.
          </p>
          <div className="intro-example">
            <div className="intro-line">сижу за решёткой в темнице <b>сырой</b></div>
            <div className="intro-line">вскормлённый в неволе орёл <b>молодой</b></div>
            <div className="intro-line">мой грустный товарищ, махая <b>крылом</b></div>
            <div className="intro-line">кровавую пищу клюёт под <b>окном</b></div>
          </div>
        </section>
      )}

      <button
        className={`btn-randomize ${hasAny ? 'refresh' : ''}`}
        onClick={rollPair}
        disabled={isLoadingAll}
      >
        {isLoadingAll ? '"LOADING…"' : hasAny ? '"NEW PAIR"' : '"START"'}
      </button>

      {(hasAny || isLoadingAll) && (
        <div className="slots">
          {slots.map((slot, i) => (
            <SlotCard
              key={i}
              slot={slot}
              label={SLOT_LABELS[i]}
              loading={loading[i]}
              onReroll={() => rerollSlot(i)}
            />
          ))}
        </div>
      )}

      <section className="timer-bar">
        <div className="timer-row">
          <button
            className={`timer-toggle ${timerRunning ? 'on' : ''}`}
            onClick={timerRunning ? stopTimer : startTimer}
          >
            {timerRunning ? '■' : '⏱'}
          </button>
          <div className="timer-display">
            {timerRunning ? formatTime(timerLeft) : formatTime(timerSec)}
          </div>
          <div className="timer-presets">
            {TIMER_OPTIONS.map(s => (
              <button
                key={s}
                className={`timer-preset ${timerSec === s ? 'active' : ''}`}
                onClick={() => { setTimerSec(s); if (timerRunning) stopTimer(); }}
              >
                {s}с
              </button>
            ))}
          </div>
        </div>
        {timerRunning && (
          <div className="timer-progress">
            <div
              className="timer-progress-bar"
              style={{ width: `${(1 - timerLeft / timerSec) * 100}%` }}
            />
          </div>
        )}
      </section>

      <section className="recorder">
        <div className="recorder-row">
          <button
            className={`record-btn ${recording ? 'on' : ''}`}
            onClick={toggleRecord}
            aria-label={recording ? 'Остановить запись' : 'Начать запись'}
          >
            {recording ? '■' : '●'}
          </button>
          <div className="recorder-meta">
            <div className="recorder-title">"VOICE RECORDER"</div>
            <div className="recorder-state">
              {recording
                ? `REC · ${formatTime(recordingTime)}`
                : recordError
                  ? recordError
                  : recordings.length
                    ? `${recordings.length} ${pluralRecordings(recordings.length)}`
                    : 'PRESS ● TO RECORD'}
            </div>
          </div>
        </div>

        {recordings.length > 0 && (
          <div className="recordings">
            {recordings.map(rec => (
              <div key={rec.id} className="recording">
                <audio controls src={rec.url} />
                <div className="recording-meta">
                  {formatTime(rec.duration)}
                </div>
                <div className="recording-actions">
                  <button
                    className="recording-btn"
                    onClick={() => downloadRecording(rec)}
                    aria-label="Скачать"
                    title="Скачать"
                  >↓</button>
                  <button
                    className="recording-btn danger"
                    onClick={() => deleteRecording(rec.id)}
                    aria-label="Удалить"
                    title="Удалить"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="credit">
        DESIGNED BY{' '}
        <a href="https://t.me/tellychko" target="_blank" rel="noopener noreferrer">
          @TELLYCHKO
        </a>
        {' '}— "MADE IN 2026"
      </div>

      <footer className="player">
        <div className="player-inner">
          <button className="player-btn" onClick={togglePlay} aria-label={playing ? 'Стоп' : 'Играть'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="player-meta">
            <div className="player-track">
              <button className="preset-btn" onClick={() => shiftPreset(-1)} aria-label="Предыдущий бит">‹</button>
              <span className="player-track-name">"{preset.name.toUpperCase()}"</span>
              <button className="preset-btn" onClick={() => shiftPreset(1)} aria-label="Следующий бит">›</button>
            </div>
            <div className="player-state">
              {playing ? 'PLAY' : 'STOP'} · {String(presetIdx + 1).padStart(2, '0')}/{String(BEAT_PRESETS.length).padStart(2, '0')}
            </div>
          </div>
          <div className="tempo">
            <button className="tempo-btn" onClick={() => bumpBpm(-4)} aria-label="Темп ниже">−</button>
            <div className="tempo-stack">
              <span className="tempo-val">{bpm}</span>
              <span className="tempo-unit">BPM</span>
            </div>
            <button className="tempo-btn" onClick={() => bumpBpm(4)} aria-label="Темп выше">+</button>
          </div>
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlotCard

function SlotCard({
  slot,
  label,
  loading,
  onReroll,
}: {
  slot: Slot | null;
  label: string;
  loading: boolean;
  onReroll: () => void;
}) {
  return (
    <section className="slot">
      <div className="slot-head">
        <span className="slot-label">{label}</span>
        <button
          className="reroll-btn"
          onClick={onReroll}
          disabled={loading}
          aria-label="Перевыбрать слово"
          title="Перевыбрать"
        >↻</button>
      </div>

      <div className="slot-word">
        {slot ? slot.noun.word : loading ? '…' : '—'}
      </div>
      {slot && (
        <div className="slot-syl">{pluralSyllables(countSyllables(slot.noun.word))}</div>
      )}
      {slot?.noun.def && <div className="slot-def">{slot.noun.def}</div>}

      <div className="slot-rhymes">
        {slot?.rhymes.length
          ? slot.rhymes.map(r => (
              <button
                key={r}
                className="rhyme"
                onClick={() => navigator.clipboard?.writeText(r)}
              >{r}</button>
            ))
          : <span className="rhymes-empty">{loading ? 'подбираем…' : 'нет рифм'}</span>
        }
      </div>
    </section>
  );
}

function pluralRecordings(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'запись';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'записи';
  return 'записей';
}

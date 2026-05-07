// Процедурный лоу-фай бит-движок на Web Audio API.
// Каждый пресет — 16-шаговый паттерн (один такт 4/4). Пресет переключается на лету,
// плеер подхватывает новый паттерн со следующего шага без рестарта.

export interface BeatPreset {
  id: string;
  name: string;
  bpm: number;
  kick: number[];
  snare: number[];
  hat: number[];
  bass: number[];
  bassFreq: number[]; // 0 = нет ноты; иначе Гц
  // Окраска мастера: лоу-пасс срез + общая громкость.
  filterHz: number;
  master: number;
}

const _ = 0;
const X = 1;

export const BEAT_PRESETS: BeatPreset[] = [
  {
    id: 'lofi',
    name: 'лоу-фай',
    bpm: 86,
    kick:  [X,_,_,_, _,_,_,_, X,_,_,_, _,_,_,_],
    snare: [_,_,_,_, X,_,_,_, _,_,_,_, X,_,_,_],
    hat:   [X,_,X,_, X,_,X,X, X,_,X,_, X,_,X,_],
    bass:  [X,_,_,_, _,_,_,X, X,_,_,_, _,X,_,_],
    bassFreq: [55, 0, 0, 0,  0, 0, 0, 49,  44, 0, 0, 0,  0, 49, 0, 0],
    filterHz: 5500,
    master: 0.7,
  },
  {
    id: 'boom-bap',
    name: 'boom-bap',
    bpm: 90,
    kick:  [X,_,_,_, _,_,X,_, _,_,_,_, _,_,_,_],
    snare: [_,_,_,_, X,_,_,_, _,_,_,_, X,_,_,X],
    hat:   [X,_,X,_, X,_,X,_, X,_,X,_, X,_,X,_],
    bass:  [X,_,_,_, _,_,_,_, X,_,_,X, _,_,_,_],
    bassFreq: [49, 0, 0, 0,  0, 0, 0, 0,  55, 0, 0, 41,  0, 0, 0, 0],
    filterHz: 6500,
    master: 0.75,
  },
  {
    id: 'trap',
    name: 'трэп',
    bpm: 140,
    kick:  [X,_,_,_, _,_,X,_, _,X,_,_, _,_,_,_],
    snare: [_,_,_,_, _,_,_,_, X,_,_,_, _,_,_,_],
    hat:   [X,_,X,_, X,X,X,_, X,_,X,X, X,X,_,X],
    bass:  [X,_,_,_, _,_,X,_, _,X,_,_, _,_,_,_],
    bassFreq: [37, 0, 0, 0,  0, 0, 41, 0,  0, 37, 0, 0,  0, 0, 0, 0],
    filterHz: 4800,
    master: 0.7,
  },
  {
    id: 'drill',
    name: 'дрилл',
    bpm: 142,
    kick:  [X,_,_,_, _,_,_,X, _,_,X,_, _,_,_,_],
    snare: [_,_,_,_, _,_,_,_, X,_,_,_, _,_,_,_],
    hat:   [X,X,X,_, X,X,_,X, X,X,X,X, _,X,X,_],
    bass:  [X,_,_,_, _,_,X,_, _,X,_,_, _,_,_,X],
    bassFreq: [41, 0, 0, 0,  0, 0, 39, 0,  0, 37, 0, 0,  0, 0, 0, 44],
    filterHz: 5200,
    master: 0.72,
  },
  {
    id: 'dembow',
    name: 'дембоу',
    bpm: 98,
    kick:  [X,_,_,X, _,_,X,_, _,_,X,_, _,_,X,_],
    snare: [_,_,_,_, X,_,_,_, _,_,_,_, X,_,_,_],
    hat:   [X,_,X,_, X,_,X,_, X,_,X,_, X,_,X,_],
    bass:  [X,_,_,_, _,_,_,_, X,_,_,_, _,_,_,_],
    bassFreq: [49, 0, 0, 0,  0, 0, 0, 0,  44, 0, 0, 0,  0, 0, 0, 0],
    filterHz: 6000,
    master: 0.7,
  },
];

export interface BeatPlayer {
  start(): Promise<void>;
  stop(): void;
  setPreset(id: string): void;
  getPreset(): BeatPreset;
  setTempo(bpm: number): void;
  isPlaying(): boolean;
  // Поток для микширования с микрофоном при записи. Активирует AudioContext.
  getRecordingStream(): Promise<MediaStream | null>;
}

const SCHEDULE_AHEAD = 0.1;
const SCHEDULE_INTERVAL = 25;

export function createBeatPlayer(initialPresetId = BEAT_PRESETS[0].id): BeatPlayer {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let masterFilter: BiquadFilterNode | null = null;
  let recordingDest: MediaStreamAudioDestinationNode | null = null;

  let preset: BeatPreset =
    BEAT_PRESETS.find(p => p.id === initialPresetId) ?? BEAT_PRESETS[0];
  let bpmOverride: number | null = null;
  let playing = false;
  let nextNoteTime = 0;
  let step = 0;
  let timerId: number | null = null;

  function ensureContext(): AudioContext {
    if (!ctx) {
      const Ctx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      masterGain = ctx.createGain();
      masterFilter = ctx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterGain.connect(masterFilter);
      masterFilter.connect(ctx.destination);
      applyMasterFromPreset();
    }
    return ctx;
  }

  function applyMasterFromPreset() {
    if (!ctx || !masterGain || !masterFilter) return;
    masterGain.gain.setTargetAtTime(preset.master, ctx.currentTime, 0.05);
    masterFilter.frequency.setTargetAtTime(preset.filterHz, ctx.currentTime, 0.05);
  }

  function kick(time: number) {
    const c = ctx!;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.13);
    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    osc.connect(gain);
    gain.connect(masterGain!);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  function snare(time: number) {
    const c = ctx!;
    const buf = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain!);
    noise.start(time);
    noise.stop(time + 0.2);
  }

  function hat(time: number) {
    const c = ctx!;
    const buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain!);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  function bass(time: number, freq: number) {
    if (!freq) return;
    const c = ctx!;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.55, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(masterGain!);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  function scheduleStep(s: number, time: number) {
    if (preset.kick[s])  kick(time);
    if (preset.snare[s]) snare(time);
    if (preset.hat[s])   hat(time);
    if (preset.bass[s])  bass(time, preset.bassFreq[s]);
  }

  function currentBpm(): number {
    return bpmOverride ?? preset.bpm;
  }

  function tick() {
    if (!playing || !ctx) return;
    const stepDuration = 60 / currentBpm() / 4;
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += stepDuration;
      step = (step + 1) % 16;
    }
    timerId = window.setTimeout(tick, SCHEDULE_INTERVAL);
  }

  return {
    async start() {
      if (playing) return;
      const c = ensureContext();
      if (c.state === 'suspended') await c.resume();
      playing = true;
      step = 0;
      nextNoteTime = c.currentTime + 0.05;
      tick();
    },
    stop() {
      playing = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    setPreset(id: string) {
      const next = BEAT_PRESETS.find(p => p.id === id);
      if (!next) return;
      preset = next;
      // Сброс пользовательского темпа при смене пресета — он подгружается из пресета.
      bpmOverride = null;
      applyMasterFromPreset();
    },
    getPreset() {
      return preset;
    },
    setTempo(bpm: number) {
      bpmOverride = Math.max(60, Math.min(180, bpm));
    },
    isPlaying() {
      return playing;
    },
    async getRecordingStream() {
      const c = ensureContext();
      if (c.state === 'suspended') await c.resume();
      if (!recordingDest && masterFilter) {
        // Параллельный отвод: бит звучит и в колонках, и в записи.
        recordingDest = c.createMediaStreamDestination();
        masterFilter.connect(recordingDest);
      }
      return recordingDest?.stream ?? null;
    },
  };
}

// MediaRecorder + опциональное микширование внешнего потока (бита из плеера).
// Если передать beatStream — микрофон и бит сводятся в один MediaStream через
// собственный AudioContext, и итоговая запись содержит чистый бит, не «пролив».

export interface VoiceRecorder {
  start(beatStream?: MediaStream | null): Promise<void>;
  stop(): Promise<Blob>;
  isRecording(): boolean;
}

export function createRecorder(): VoiceRecorder {
  let micStream: MediaStream | null = null;
  let mixCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stopResolve: ((b: Blob) => void) | null = null;

  function pickMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  async function buildStream(beatStream: MediaStream | null): Promise<MediaStream> {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Без эхо-отмены/шумодава, иначе браузер агрессивно режет всё, что
        // не похоже на голос (включая бит, если он где-то рядом). Запись бита
        // идёт напрямую из аудио-графа, поэтому подавление не нужно.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    if (!beatStream || beatStream.getAudioTracks().length === 0) {
      return micStream;
    }

    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    mixCtx = new Ctx();
    const dest = mixCtx.createMediaStreamDestination();

    const micSrc = mixCtx.createMediaStreamSource(micStream);
    const micGain = mixCtx.createGain();
    micGain.gain.value = 1.0;
    micSrc.connect(micGain);
    micGain.connect(dest);

    const beatSrc = mixCtx.createMediaStreamSource(beatStream);
    const beatGain = mixCtx.createGain();
    beatGain.gain.value = 0.65; // голос громче бита по умолчанию
    beatSrc.connect(beatGain);
    beatGain.connect(dest);

    return dest.stream;
  }

  function cleanup() {
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    if (mixCtx) {
      mixCtx.close().catch(() => {});
      mixCtx = null;
    }
  }

  return {
    async start(beatStream) {
      if (recorder) return;
      const stream = await buildStream(beatStream ?? null);
      const mime = pickMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder?.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        stopResolve?.(blob);
        stopResolve = null;
        chunks = [];
        recorder = null;
        cleanup();
      };
      recorder.start();
    },

    stop() {
      return new Promise<Blob>(resolve => {
        if (!recorder) {
          resolve(new Blob([], { type: 'audio/webm' }));
          return;
        }
        stopResolve = resolve;
        recorder.stop();
      });
    },

    isRecording() {
      return recorder?.state === 'recording';
    },
  };
}

// Тонкая обёртка над Telegram.WebApp. Не падает, если приложение открыто
// в обычном браузере вне Telegram — там tg будет undefined.

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  button_color?: string;
}

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTg(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function isInTelegram(): boolean {
  return getTg() !== null;
}

// Сразу зовём ready+expand. ready() говорит TG что UI готов,
// expand() раскрывает Mini App на весь экран.
export function initTelegram(): TelegramWebApp | null {
  const tg = getTg();
  if (!tg) return null;
  try {
    tg.ready();
    tg.expand();
  } catch {
    /* ignore — старые TG-клиенты могут не поддерживать */
  }
  return tg;
}

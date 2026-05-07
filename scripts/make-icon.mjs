// Генерирует public/icon-640x360.png для Telegram Mini App preview.
// Запуск: npm run icon
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Off-White-эстетика: чёрный фон, оранжевый акцент, кавычки, тех-подписи в углах,
// диагональная caution-полоса справа.
const W = 640;
const H = 360;
const BG = '#0b0b0f';
const FG = '#f1efe6';
const ACCENT = '#ff6b3d';
const MUTED = '#7a7a8c';

const STRIPE_W = 40;          // ширина диагональной полосы справа
const SAFE_RIGHT = W - STRIPE_W - 24; // правая граница для текста

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="stripes" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(-45)">
      <rect width="10" height="20" fill="${ACCENT}"/>
      <rect x="10" width="10" height="20" fill="${BG}"/>
    </pattern>
  </defs>

  <!-- фон -->
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- верхняя угловая подпись -->
  <text x="24" y="28" font-family="JetBrains Mono, Menlo, monospace" font-size="11" fill="${MUTED}" letter-spacing="1.4">
    C/O FREESTYLE BY @TELLYCHKO  "SAINT-PETERSBURG"  ©2026
  </text>

  <!-- основной заголовок: чуть меньший шрифт + tighter spacing, чтоб не лезло в полосу -->
  <text x="48" y="180" font-family="Inter, Helvetica, Arial, sans-serif" font-size="78" font-weight="900" fill="${FG}" letter-spacing="-2.5" textLength="${SAFE_RIGHT - 56}" lengthAdjust="spacingAndGlyphs">
    FREESTYLE<tspan fill="${ACCENT}">®</tspan>
  </text>

  <!-- подзаголовок в "кавычках" -->
  <text x="50" y="218" font-family="JetBrains Mono, Menlo, monospace" font-size="17" font-weight="700" fill="${MUTED}" letter-spacing="1.8">
    "RHYME · BEAT · 4 LINES"
  </text>

  <!-- акцентная диагональная полоса справа -->
  <rect x="${W - STRIPE_W}" y="0" width="${STRIPE_W}" height="${H}" fill="url(#stripes)"/>

  <!-- "NOT FOR SALE" повёрнутый внутри полосы — вертикальный бэйдж в стиле Virgil -->
  <g transform="translate(${W - STRIPE_W / 2}, ${H / 2}) rotate(-90)">
    <text x="0" y="3" text-anchor="middle" font-family="JetBrains Mono, Menlo, monospace" font-size="11" font-weight="700" fill="${BG}" letter-spacing="2.5">
      NOT FOR SALE  ·  EDITION 01/01
    </text>
  </g>

  <!-- нижняя подпись -->
  <text x="48" y="${H - 38}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="14" font-weight="600" fill="${FG}">
    тренажёр <tspan fill="${ACCENT}">фристайла</tspan> и рифмы
  </text>
  <text x="48" y="${H - 20}" font-family="JetBrains Mono, Menlo, monospace" font-size="10" fill="${MUTED}" letter-spacing="2">
    640×360  ·  PNG  ·  ©2026
  </text>

  <!-- акцентная засечка слева -->
  <rect x="24" y="${H - 96}" width="3" height="64" fill="${ACCENT}"/>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  background: BG,
});
const png = resvg.render().asPng();
const out = resolve(__dirname, '..', 'public', 'icon-640x360.png');
writeFileSync(out, png);
console.log(`✓ wrote ${out} (${png.length} bytes)`);

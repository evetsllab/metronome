// Generates the App Store icon + splash source images from a hand-built SVG that
// echoes the app's own face: a rainbow tempo gauge with a red top indicator and
// a metronome pendulum. No SEIKO. Rasterized with sharp; the full iOS icon set
// is then produced by @capacitor/assets.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

// Polar helper: angle in degrees measured CLOCKWISE from 12 o'clock.
function polar(cx, cy, r, deg) {
  const a = (deg) * Math.PI / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Build the dial as an SVG group, sized to a `S`x`S` canvas.
function dial(S) {
  const cx = S / 2, cy = S / 2;
  const Rmid = S * 0.332;          // ring centre radius
  const thick = S * 0.070;         // ring thickness
  const A0 = -138, A1 = 138;       // 276-degree gauge, gap at the bottom
  const SEG = 72;
  let ring = '';
  for (let i = 0; i < SEG; i++) {
    const a0 = A0 + (A1 - A0) * (i / SEG);
    const a1 = A0 + (A1 - A0) * ((i + 1) / SEG) + 0.6; // slight overlap, no gaps
    const hue = 8 + 280 * (i / (SEG - 1));             // red -> violet
    ring += `<path d="${arcPath(cx, cy, Rmid, a0, a1)}" stroke="hsl(${hue.toFixed(0)},85%,55%)" stroke-width="${thick}" fill="none" stroke-linecap="butt"/>`;
  }
  // Major tick marks just inside the ring.
  let ticks = '';
  const tickN = 9;
  for (let i = 0; i <= tickN; i++) {
    const a = A0 + (A1 - A0) * (i / tickN);
    const [ox, oy] = polar(cx, cy, Rmid - thick / 2 - S * 0.012, a);
    const [ix, iy] = polar(cx, cy, Rmid - thick / 2 - S * 0.045, a);
    ticks += `<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${ix.toFixed(1)}" y2="${iy.toFixed(1)}" stroke="#cfd6e0" stroke-width="${S*0.006}" stroke-linecap="round" opacity="0.85"/>`;
  }
  // Red top indicator wedge at 12 o'clock.
  const [tx, ty] = polar(cx, cy, Rmid + thick / 2 + S * 0.006, 0);
  const [lx, ly] = polar(cx, cy, Rmid - thick / 2 - S * 0.028, -5.5);
  const [rx, ry] = polar(cx, cy, Rmid - thick / 2 - S * 0.028, 5.5);
  const pointer = `<path d="M ${tx.toFixed(1)} ${ty.toFixed(1)} L ${lx.toFixed(1)} ${ly.toFixed(1)} L ${rx.toFixed(1)} ${ry.toFixed(1)} Z" fill="#ff2b2b" stroke="#7a0d0d" stroke-width="${S*0.004}"/>`;

  // Center medallion + metronome pendulum.
  const rMed = S * 0.245;
  const [nx, ny] = polar(cx, cy, rMed * 0.86, -20);   // needle tip, up and slightly left
  const [wx, wy] = polar(cx, cy, rMed * 0.52, -20);   // weight position on the needle
  const center = `
    <circle cx="${cx}" cy="${cy}" r="${rMed}" fill="#0e0f16" stroke="#2b2f45" stroke-width="${S*0.006}"/>
    <circle cx="${cx}" cy="${cy}" r="${rMed*0.92}" fill="none" stroke="#171a28" stroke-width="${S*0.004}"/>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#e6e9f2" stroke-width="${S*0.014}" stroke-linecap="round"/>
    <rect x="${(wx-S*0.028).toFixed(1)}" y="${(wy-S*0.020).toFixed(1)}" width="${(S*0.056).toFixed(1)}" height="${(S*0.040).toFixed(1)}" rx="${S*0.008}" fill="#c9cede" stroke="#6a7086" stroke-width="${S*0.003}"/>
    <circle cx="${cx}" cy="${cy}" r="${S*0.028}" fill="#3a3f55" stroke="#5a6078" stroke-width="${S*0.004}"/>
    <circle cx="${cx}" cy="${cy}" r="${S*0.010}" fill="#e6e9f2"/>`;

  return `${ring}${ticks}${pointer}${center}`;
}

function svg(S) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stop-color="#1a1d2e"/>
        <stop offset="60%" stop-color="#0e1018"/>
        <stop offset="100%" stop-color="#070810"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${S}" height="${S}" fill="url(#bg)"/>
    ${dial(S)}
  </svg>`;
}

async function main() {
  const iconSVG = svg(1024);
  await sharp(Buffer.from(iconSVG)).png().resize(1024, 1024).toFile(path.join(OUT, 'icon.png'));

  // Splash: dial centered on a large dark canvas.
  const SP = 2732;
  const dialPx = Math.round(SP * 0.42);
  const dsvg = svg(dialPx);
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SP}" height="${SP}"><rect width="${SP}" height="${SP}" fill="#0a0b12"/></svg>`;
  const dialBuf = await sharp(Buffer.from(dsvg)).png().toBuffer();
  const splash = await sharp(Buffer.from(bg)).composite([{ input: dialBuf, gravity: 'center' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'splash.png'), splash);
  fs.writeFileSync(path.join(OUT, 'splash-dark.png'), splash);

  console.log('Wrote assets/icon.png (1024), assets/splash.png + splash-dark.png (2732)');
}
main().catch(e => { console.error(e); process.exit(1); });

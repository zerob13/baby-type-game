import { fraction, type Run } from './game';
import { getLesson } from './lessons';

const palettes = [
  ['#8cc9d2', '#75b6c4', '#afd381', '#85af66', '#ddd4a2'],
  ['#79b6bb', '#64a1ab', '#8fc391', '#649578', '#cbd3ab'],
  ['#b6b0cc', '#9a91bb', '#b3c682', '#8ba365', '#ddc8a3'],
  ['#a8ced0', '#86b7c5', '#b6cb78', '#90ac64', '#e9d09a'],
  ['#81becf', '#61a5bd', '#b6d591', '#91b97a', '#e7d8b0'],
  ['#b8c2b7', '#9eafa4', '#b9c48d', '#93a16f', '#dbcca8'],
  ['#788aa7', '#647893', '#afbd9a', '#849a80', '#c7c7b2'],
  ['#c1c2dc', '#aaaacb', '#bed3a2', '#96b78b', '#ddd6bd'],
];
function hash(index: number, seed: number): number { return Math.abs(Math.imul(index + 71, 2654435761) ^ seed) >>> 0; }
function box(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}
function tree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, enemy: boolean): void {
  const s = size / 20;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(s, s);
  box(ctx, '#00000016', -7, 0, 16, 4); box(ctx, '#776549', -2, -7, 4, 10); box(ctx, '#a18b61', -1, -7, 2, 9);
  box(ctx, enemy ? '#8c7c9d' : '#416f59', -8, -15, 17, 8);
  box(ctx, enemy ? '#a297b5' : '#618e61', -6, -20, 13, 12);
  box(ctx, enemy ? '#b8abc4' : '#83ab6d', -3, -22, 7, 6);
  box(ctx, enemy ? '#bcb2cb' : '#9cbe7c', -5, -17, 5, 3);
  ctx.restore();
}
function actor(ctx: CanvasRenderingContext2D, x: number, y: number, role: 'player' | 'rival' | 'king', at: number, reduced: boolean, back = false): void {
  const bob = reduced ? 0 : Math.round(Math.sin(at / 220) * 1.2);
  ctx.save(); ctx.translate(Math.round(x), Math.round(y + bob));
  box(ctx, '#243d432b', -11, 11 - bob, 23, 4);
  const outline = '#574f49';
  const fill = role === 'king' ? '#e4e0e8' : '#fffdf4';
  box(ctx, outline, -7, -11, 14, 2); box(ctx, outline, -11, -8, 23, 18); box(ctx, outline, -8, 10, 17, 2);
  box(ctx, fill, -7, -9, 15, 20); box(ctx, fill, -10, -6, 21, 14);
  box(ctx, '#e9e6d9', -8, 7, 17, 3); box(ctx, outline, -1, -14, 3, 4); box(ctx, fill, 0, -13, 2, 4);
  box(ctx, outline, -7, 11, 4, 2); box(ctx, outline, 4, 11, 4, 2);
  const scarf = role === 'player' ? '#5e9762' : role === 'rival' ? '#9880b3' : '#b2a6c1';
  box(ctx, scarf, -9, 5, 19, 3); box(ctx, scarf, role === 'rival' ? 9 : -2, 8, 4, 4);
  if (!back) {
    box(ctx, outline, -5, -3, 2, 3); box(ctx, outline, 4, -3, 2, 3);
    box(ctx, '#dca2a1', -8, 1, 3, 1); box(ctx, '#dca2a1', 6, 1, 3, 1);
    box(ctx, outline, 0, 2, 3, 1);
  }
  if (role === 'king') { box(ctx, '#a9956f', -6, -14, 13, 3); box(ctx, '#b8a47f', -6, -19, 3, 6); box(ctx, '#b8a47f', -1, -21, 3, 8); box(ctx, '#b8a47f', 4, -18, 3, 6); }
  box(ctx, '#77634d', 14, -14, 2, 27); box(ctx, scarf, 16, -13, 12, 7); box(ctx, '#fffdf1', 19, -11, 3, 3);
  ctx.restore();
}
function windmill(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, awake: boolean, reduced: boolean): void {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  box(ctx, '#33453d20', -12, 4, 25, 5); box(ctx, awake ? '#d9caa2' : '#c6c2ad', -7, -15, 15, 21);
  box(ctx, '#a08364', -9, -18, 19, 4); box(ctx, '#b2926b', -6, -23, 13, 5); box(ctx, '#74634f', -3, -6, 5, 12);
  box(ctx, '#7799a1', -4, -14, 4, 4); box(ctx, '#f2e9c6', 1, -14, 3, 4);
  ctx.translate(0, -17); ctx.rotate(!awake || reduced ? Math.PI / 4 : time / 5000);
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); box(ctx, '#937858', 1, -1, 15, 2); box(ctx, '#efe5bf', 5, -4, 12, 4); box(ctx, '#c4a97d', 5, 0, 12, 1); }
  box(ctx, '#77644d', -2, -2, 4, 4); ctx.restore();
}
export function drawMap(canvas: HTMLCanvasElement, run: Run, options: { reduced: boolean; fixedView: boolean; time: number }): void {
  const parent = canvas.parentElement!;
  const width = Math.max(280, Math.round(parent.clientWidth / 3));
  const height = Math.max(140, Math.round(parent.clientHeight / 3));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const lesson = getLesson(run.lessonId);
  const [sea, deep, grass, shade, neutral] = palettes[lesson.chapter];
  box(ctx, sea, 0, 0, width, height);
  const clock = options.reduced ? 0 : options.time;
  for (let y = 3; y < height; y += 12) for (let x = 3; x < width; x += 23) {
    const n = hash(x + y * width, run.seed);
    const shift = Math.round(Math.sin(clock / 1800 + n % 30) * 2);
    box(ctx, n % 3 ? '#ffffff22' : deep, x + n % 12 + shift, y + n % 5, 4 + n % 5, 1);
  }
  if (lesson.chapter === 6 || lesson.chapter === 7) {
    for (let i = 0; i < 12; i++) { const n = hash(i, run.seed); const x = n % width; const y = n % height; box(ctx, '#fff9d080', x, y, 1, 3); box(ctx, '#fff9d080', x - 1, y + 1, 3, 1); }
  }
  const tile = Math.max(12, Math.floor(Math.min((width - 44) / 12, (height - 22) / 6)));
  const landWidth = lesson.kind === 'edit' ? 6 : 12;
  const ox = Math.round((width - landWidth * tile) / 2);
  const oy = Math.round((height - 6 * tile) / 2 - tile - 4);
  ctx.save();
  if (!options.fixedView && fraction(run) < 0.12) {
    const zoom = 1 + 0.06 * (1 - fraction(run) / 0.12);
    ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(-width / 2, -height / 2);
  }
  for (let index = 0; index < run.terrain.length; index++) {
    if (!run.terrain[index]) continue;
    const x = ox + index % 12 * tile;
    const y = oy + Math.floor(index / 12) * tile;
    if (!run.terrain[index + 12]) {
      box(ctx, '#53685a38', x - 2, y + tile + 6, tile + 4, 4);
      box(ctx, '#9b9b78', x, y + tile - 1, tile, 6); box(ctx, '#7f866b', x, y + tile + 3, tile, 3);
      box(ctx, '#b9b28b', x + 2, y + tile, 3, 4); box(ctx, '#c2c2a1', x + tile - 5, y + tile + 2, 2, 2);
      box(ctx, '#e1ede08c', x - 1, y + tile + 7, tile + 2, 1);
    }
    if (index % 12 === 0 || !run.terrain[index - 1]) box(ctx, '#e6f4de80', x - 1, y + 3, 1, tile - 3);
    const owner = run.owners[index];
    const base = owner === 1 ? grass : owner === 2 ? '#b5a6ca' : neutral;
    box(ctx, base, x, y, tile, tile);
    box(ctx, owner === 1 ? shade : owner === 2 ? '#a696bf' : '#c9bf93', x, y + tile - 1, tile, 1);
    const n = hash(index, run.seed);
    box(ctx, owner === 2 ? '#cec0dc' : '#e7e5b4', x + 3 + n % Math.max(1, tile - 8), y + 3 + (n >> 5) % Math.max(1, tile - 8), 2, 1);
    if (owner !== 2 && n % 5 === 0) {
      const fx = x + tile / 2; const fy = y + tile / 2;
      box(ctx, '#fbf8df', fx - 1, fy - 2, 3, 5); box(ctx, '#fbf8df', fx - 2, fy - 1, 5, 3); box(ctx, '#d5ae55', fx, fy, 1, 1);
    }
    if (owner) {
      const line = owner === 1 ? '#f1edb4' : '#e3d5ed';
      const edge = owner === 1 ? '#6f9d5e' : '#9279ad';
      if (run.owners[index - 12] !== owner) { box(ctx, edge, x, y, tile, 2); box(ctx, line, x, y, tile, 1); }
      if (run.owners[index + 12] !== owner) box(ctx, edge, x, y + tile - 1, tile, 1);
      if (index % 12 === 0 || run.owners[index - 1] !== owner) box(ctx, line, x, y, 1, tile);
      if (index % 12 === 11 || run.owners[index + 1] !== owner) box(ctx, edge, x + tile - 1, y, 1, tile);
    }
  }
  for (let index = 0; index < run.terrain.length; index++) {
    if (!run.terrain[index] || index === run.home || index === run.flag) continue;
    const n = hash(index, run.seed);
    if (n % 11 === 0 && index % 12 > 1) tree(ctx, ox + (index % 12 + 0.5) * tile, oy + (Math.floor(index / 12) + 0.85) * tile, tile * 0.8, run.owners[index] === 2);
  }
  const building = run.terrain.findIndex((land, index) => land && index > 30 && index % 12 === 3);
  if (building >= 0) windmill(ctx, ox + (building % 12 + 0.5) * tile, oy + (Math.floor(building / 12) + 0.8) * tile, clock, run.owners[building] === 1, options.reduced);
  for (const flash of run.flashes) {
    const age = run.activeMs - flash.at;
    if (age > 650 || options.reduced) continue;
    ctx.globalAlpha = Math.max(0, 0.4 * (1 - age / 650));
    box(ctx, flash.owner === 1 ? '#fff7bf' : '#f0d5ff', ox + flash.tile % 12 * tile, oy + Math.floor(flash.tile / 12) * tile, tile, tile);
    ctx.globalAlpha = 1;
  }
  const player = [...run.flashes].reverse().find(flash => flash.owner === 1 && run.owners[flash.tile] === 1)?.tile ?? run.home;
  const homeX = ox + (run.home % 12 + 0.5) * tile;
  const homeY = oy + (Math.floor(run.home / 12) + 0.5) * tile;
  if (fraction(run) < 0.06) {
    ctx.strokeStyle = '#fff9c8'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(homeX - tile / 2 - 2), Math.round(homeY - tile / 2 - 2), tile + 4, tile + 4);
  }
  actor(ctx, ox + (player % 12 + 0.5) * tile, oy + (Math.floor(player / 12) + 0.6) * tile, 'player', clock, options.reduced);
  if (run.flag >= 0) actor(ctx, ox + (run.flag % 12 + 0.5) * tile, oy + (Math.floor(run.flag / 12) + 0.6) * tile, lesson.chapter === 7 ? 'king' : 'rival', clock + 600, options.reduced);
  if (run.warningUntil !== null) {
    ctx.strokeStyle = '#f4e4af'; ctx.lineWidth = 2;
    const x = ox + run.flag % 12 * tile; const y = oy + Math.floor(run.flag / 12) * tile;
    ctx.strokeRect(x - 3, y - 3, tile + 6, tile + 6);
  }
  ctx.restore();
}

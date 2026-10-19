import { getLesson, type Lesson } from './lessons';

export type Owner = 0 | 1 | 2;
export type Mode = 'learn' | 'challenge';
export interface KeyStat { attempts: number; errors: number }
export interface Run {
  id: string; lessonId: string; revision: 1; mode: Mode; phase: 'ready' | 'playing' | 'paused' | 'won';
  seed: number; rng: number; width: number; height: number; terrain: boolean[]; owners: Owner[]; home: number; flag: number;
  activeMs: number; windowStart: number; recent: number[]; correct: number; wrong: number; keyStats: Record<string, KeyStat>;
  energy: number; combo: number; maxCombo: number; pressure: number; slowMs: number; warningUntil: number | null;
  lastAttack: number; burstLeft: number; prompt: string; cursor: number; bag: string[]; lastTargets: string;
  taskIndex: number; taskMistakes: number; hints: number; flashes: { tile: number; owner: Owner; at: number }[];
}

export function random(run: { rng: number }): number {
  run.rng = (run.rng + 0x6D2B79F5) >>> 0;
  let value = run.rng;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
export function neighbors(run: Pick<Run, 'width' | 'height'>, tile: number): number[] {
  const x = tile % run.width;
  const y = Math.floor(tile / run.width);
  return [x > 0 ? tile - 1 : -1, x + 1 < run.width ? tile + 1 : -1, y > 0 ? tile - run.width : -1, y + 1 < run.height ? tile + run.width : -1].filter(index => index >= 0);
}
export function reachable(run: Pick<Run, 'width' | 'height'>, start: number, valid: (index: number) => boolean): Set<number> {
  const seen = new Set<number>();
  if (!valid(start)) return seen;
  const queue = [start];
  seen.add(start);
  for (let i = 0; i < queue.length; i++) {
    for (const next of neighbors(run, queue[i])) if (!seen.has(next) && valid(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}
export function nextPrompt(run: Run, lesson = getLesson(run.lessonId)): void {
  run.cursor = 0;
  if (lesson.kind === 'edit') { run.prompt = ''; return; }
  if (lesson.prompts.length) {
    const choices = lesson.prompts.filter(text => text !== run.prompt);
    run.prompt = choices[Math.floor(random(run) * choices.length)] ?? lesson.prompts[0];
    return;
  }
  let prompt = '';
  const length = 4 + Math.floor(random(run) * 5);
  for (let index = 0; index < length; index++) {
    if (!run.bag.length) {
      run.bag = [...lesson.keys];
      for (const key of lesson.keys) {
        const stat = run.keyStats[key];
        if (lesson.newKeys.includes(key) || (stat && stat.attempts >= 10 && stat.errors / stat.attempts >= 0.2)) run.bag.push(key);
      }
      for (let i = run.bag.length - 1; i > 0; i--) {
        const j = Math.floor(random(run) * (i + 1));
        [run.bag[i], run.bag[j]] = [run.bag[j], run.bag[i]];
      }
    }
    let key = run.bag.pop()!;
    if (run.lastTargets.endsWith(key.repeat(3))) {
      const other = run.bag.findIndex(item => item !== key);
      if (other >= 0) [key, run.bag[other]] = [run.bag[other], key];
      else key = [...lesson.keys].find(item => item !== key) ?? key;
    }
    prompt += key;
    run.lastTargets = (run.lastTargets + key).slice(-3);
  }
  run.prompt = prompt;
}
export function createRun(lessonId: string, seed: number, id: string, mode: Mode = 'learn'): Run {
  const lesson = getLesson(lessonId);
  const width = 12;
  const height = 8;
  const terrain = Array.from({ length: width * height }, (_, index) => Math.floor(index / width) > 0 && Math.floor(index / width) < height - 1);
  const run: Run = {
    id, lessonId, revision: 1, mode, phase: 'ready', seed: seed >>> 0, rng: seed >>> 0, width, height, terrain,
    owners: terrain.map(() => 0), home: 13, flag: 82, activeMs: 0, windowStart: 0, recent: [], correct: 0, wrong: 0, keyStats: {},
    energy: 0, combo: 0, maxCombo: 0, pressure: 0, slowMs: 0, warningUntil: null, lastAttack: -2000, burstLeft: 0,
    prompt: '', cursor: 0, bag: [], lastTargets: '', taskIndex: 0, taskMistakes: 0, hints: 0, flashes: [],
  };
  if (lesson.kind === 'edit') {
    for (let y = 1; y < 7; y++) for (let x = 6; x < 12; x++) run.terrain[y * 12 + x] = false;
    run.flag = 77;
  } else if (lesson.chapter > 0) {
    const attempts = 4 + lesson.chapter;
    for (let i = 0; i < attempts; i++) {
      const tile = 14 + Math.floor(random(run) * 68);
      if (tile === run.home || tile === run.flag || !run.terrain[tile]) continue;
      run.terrain[tile] = false;
      const total = run.terrain.filter(Boolean).length;
      if (reachable(run, run.home, index => run.terrain[index]).size !== total) run.terrain[tile] = true;
    }
  }
  run.owners[run.home] = 1;
  run.owners[run.flag] = 2;
  nextPrompt(run, lesson);
  return run;
}
export function owned(run: Run, owner: Owner): number { return run.owners.filter(value => value === owner).length; }
export function accuracy(run: Run): number | null { return run.correct + run.wrong ? run.correct / (run.correct + run.wrong) : null; }
export function cpm(run: Run): number | null { return run.activeMs > 0 ? run.correct * 60000 / run.activeMs : null; }
export function recentCPM(run: Run): number { return run.recent.filter(time => time > run.activeMs - 15000).length * 4; }
export function fraction(run: Run): number { return owned(run, 1) / run.terrain.filter(Boolean).length; }
export function stars(run: Run): number {
  if (run.phase !== 'won') return 0;
  if (getLesson(run.lessonId).kind === 'edit') return run.taskMistakes === 0 && run.hints === 0 ? 3 : run.taskMistakes <= 2 ? 2 : 1;
  return (accuracy(run) ?? 0) >= 0.95 && (cpm(run) ?? 0) >= getLesson(run.lessonId).targetCPM ? 3 : (accuracy(run) ?? 0) >= 0.9 ? 2 : 1;
}
function claim(run: Run, actor: 1 | 2): boolean {
  const candidates = run.owners.flatMap((owner, tile) => {
    if (!run.terrain[tile] || owner === actor || (actor === 2 && tile === run.home) || !neighbors(run, tile).some(next => run.owners[next] === actor)) return [];
    if (actor === 2 && owner === 1 && reachable(run, run.home, index => index !== tile && run.owners[index] === 1).size !== owned(run, 1) - 1) return [];
    return [tile];
  });
  if (!candidates.length) return false;
  const distances = Array(run.terrain.length).fill(Infinity) as number[];
  distances[run.home] = 0;
  const queue = [run.home];
  for (let i = 0; i < queue.length; i++) for (const next of neighbors(run, queue[i])) if (run.terrain[next] && distances[next] === Infinity) { distances[next] = distances[queue[i]] + 1; queue.push(next); }
  const best = Math.min(...candidates.map(tile => distances[tile]));
  const choices = candidates.filter(tile => distances[tile] === best);
  const tile = choices[Math.floor(random(run) * choices.length)];
  run.owners[tile] = actor;
  run.flashes.push({ tile, owner: actor, at: run.activeMs });
  run.flashes = run.flashes.slice(-12);
  if (run.owners[run.flag] !== 2) run.flag = run.owners.indexOf(2);
  if (run.flag === -1) { run.pressure = 0; run.warningUntil = null; run.burstLeft = 0; }
  if (run.terrain.every((land, index) => !land || run.owners[index] === 1)) run.phase = 'won';
  return true;
}
function spend(run: Run): void {
  while (run.energy >= 2 && run.phase !== 'won') {
    if (!claim(run, 1)) break;
    run.energy -= 2;
  }
}
function character(run: Run, key: string): boolean {
  if (run.phase === 'paused' || run.phase === 'won' || getLesson(run.lessonId).kind === 'edit') return false;
  const expected = run.prompt[run.cursor];
  if (run.phase === 'ready') {
    if (key !== expected) return false;
    run.phase = 'playing';
    run.windowStart = run.activeMs;
  }
  const stat = run.keyStats[expected] ??= { attempts: 0, errors: 0 };
  stat.attempts++;
  if (key !== expected) {
    run.wrong++; stat.errors++; run.combo = 0;
    if (run.mode === 'challenge') {
      if (run.energy > 0) run.energy--;
      else if (run.flag !== -1) run.pressure = Math.min(3, run.pressure + 1);
    }
    return false;
  }
  run.correct++; run.combo++; run.maxCombo = Math.max(run.maxCombo, run.combo); run.cursor++;
  run.recent.push(run.activeMs);
  run.energy += 1 + (run.combo % 10 === 0 ? 1 : 0);
  spend(run);
  if (run.cursor >= run.prompt.length && fraction(run) < 1) nextPrompt(run);
  return true;
}
function tick(run: Run): void {
  run.recent = run.recent.filter(time => time > run.activeMs - 15000);
  if (run.mode !== 'challenge' || getLesson(run.lessonId).kind === 'edit' || run.flag === -1) return;
  const lesson = getLesson(run.lessonId);
  if (run.activeMs - run.windowStart > 15000 && recentCPM(run) < lesson.targetCPM) {
    run.slowMs += 50;
    if (run.slowMs > 5000) run.pressure = Math.min(3, run.pressure + 0.05 * 0.25 * (1 - recentCPM(run) / lesson.targetCPM));
  } else run.slowMs = 0;
  if (run.warningUntil !== null) {
    if (run.activeMs >= run.warningUntil) {
      const limit = lesson.opponent === 'charge' ? 3 : lesson.opponent === 'periodic' ? 2 : 1;
      run.burstLeft = run.burstLeft || Math.min(limit, Math.floor(run.pressure + 1e-8));
      if (run.pressure + 1e-8 >= 1 && run.burstLeft > 0) {
        run.pressure = Math.max(0, run.pressure - 1); run.burstLeft--; claim(run, 2);
      }
      run.lastAttack = run.activeMs;
      run.warningUntil = run.burstLeft > 0 && run.flag !== -1 ? run.activeMs + 1000 : null;
    }
  } else if (run.pressure + 1e-8 >= 1 && run.activeMs - run.lastAttack >= 2000) {
    const canStart = lesson.opponent === 'steady' || (lesson.opponent === 'charge' ? run.pressure >= 2.99 || run.activeMs - run.lastAttack >= 8000 : Math.floor(run.activeMs / 50) % 160 === 0);
    if (canStart) run.warningUntil = run.activeMs + 2000;
  }
}
export function advance(run: Run, elapsedMs: number, key?: string): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 600000) throw new Error('Invalid elapsed time');
  if (run.phase !== 'playing') return key !== undefined ? character(run, key) : false;
  const target = run.activeMs + elapsedMs;
  let accepted = false;
  let handled = false;
  for (let time = (Math.floor(run.activeMs / 50) + 1) * 50; time <= target && run.phase === 'playing'; time += 50) {
    run.activeMs = time;
    if (time === target && key !== undefined) { accepted = character(run, key); handled = true; }
    if (run.phase === 'playing') tick(run);
  }
  if (run.phase === 'playing') {
    run.activeMs = target;
    if (key !== undefined && !handled) accepted = character(run, key);
  }
  return accepted;
}
export function pause(run: Run): void { if (run.phase === 'playing' || run.phase === 'ready') run.phase = 'paused'; }
export function resume(run: Run): void {
  if (run.phase !== 'paused') return;
  run.phase = 'ready'; run.recent = []; run.windowStart = run.activeMs; run.slowMs = 0;
}
export function completeTask(run: Run, taskIndex: number): void {
  if (getLesson(run.lessonId).kind !== 'edit' || run.phase === 'won' || run.phase === 'paused' || taskIndex !== run.taskIndex || taskIndex >= 6) return;
  run.phase = 'playing'; run.taskIndex++; run.energy += 12; spend(run);
}

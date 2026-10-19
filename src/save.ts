import { accuracy, cpm, createRun, reachable, stars, type KeyStat, type Mode, type Run } from './game';
import { getLesson, lessons } from './lessons';

export interface Settings { music: number; effects: number; motion: 'system' | 'reduce' | 'full'; hints: boolean; fixedView: boolean; platform: 'auto' | 'windows' | 'mac' }
export interface Result {
  learn: boolean; learnStars: number; challengeStars: number; bestAccuracy: number; bestCPM: number;
  speedAttempts: number; speedMs: number; lastRunId: string; lastAccuracy: number; lastCPM: number; lastMs: number; lastMode: Mode;
}
export interface Profile {
  schemaVersion: 1; revision: number; savedAt: number; settings: Settings;
  progress: Record<string, Result>; keyStats: Record<string, KeyStat>; activeRun: Run | null;
}
export const SAVE_KEY = 'keybud.save';
export const BACKUP_KEY = 'keybud.save.backup';
export const RECOVERY_KEY = 'keybud.save.recovery';
export function newProfile(): Profile {
  return { schemaVersion: 1, revision: 0, savedAt: 0, settings: { music: 0.12, effects: 0.28, motion: 'system', hints: true, fixedView: false, platform: 'auto' }, progress: {}, keyStats: {}, activeRun: null };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid integer');
  return value;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid number');
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text');
  return value;
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Invalid boolean'); return value; }
function choice<const T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('Invalid choice');
  return value as T;
}
function stats(value: unknown, allowed: string): Record<string, KeyStat> {
  const output: Record<string, KeyStat> = {};
  for (const [key, item] of Object.entries(object(value))) {
    if (key.length !== 1 || !allowed.includes(key)) throw new Error('Invalid statistic key');
    const stat = object(item);
    const attempts = integer(stat.attempts);
    output[key] = { attempts, errors: integer(stat.errors, 0, attempts) };
  }
  return output;
}
export function decodeRun(value: unknown): Run | null {
  const source = object(value);
  const lesson = getLesson(text(source.lessonId, 64));
  const revision = integer(source.revision, 1);
  const id = text(source.id, 128);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid run ID');
  const run = createRun(lesson.id, integer(source.seed, 0, 0xFFFFFFFF), id, choice(source.mode, ['learn', 'challenge']));
  if (revision !== run.revision) return null;
  if (lesson.kind === 'edit' && run.mode !== 'learn') throw new Error('Invalid editor mode');
  if (source.width !== run.width || source.height !== run.height || source.home !== run.home) throw new Error('Incompatible map');
  if (!Array.isArray(source.terrain) || source.terrain.length !== run.terrain.length || !source.terrain.every((item, index) => item === run.terrain[index])) throw new Error('Invalid terrain');
  if (!Array.isArray(source.owners) || source.owners.length !== run.terrain.length) throw new Error('Invalid owners');
  run.owners = source.owners.map((owner, index) => {
    const validated = integer(owner, 0, 2) as 0 | 1 | 2;
    if (!run.terrain[index] && validated !== 0) throw new Error('Blocked tile owned');
    return validated;
  });
  if (run.owners[run.home] !== 1 || reachable(run, run.home, index => run.owners[index] === 1).size !== run.owners.filter(owner => owner === 1).length) throw new Error('Disconnected home');
  if (run.terrain.every((land, index) => !land || run.owners[index] === 1)) throw new Error('Completed run cannot be active');
  run.flag = integer(source.flag, -1, run.terrain.length - 1);
  if ((run.flag === -1 && run.owners.includes(2)) || (run.flag !== -1 && run.owners[run.flag] !== 2)) throw new Error('Invalid flag');
  choice(source.phase, ['ready', 'playing', 'paused']);
  run.phase = 'paused';
  run.rng = integer(source.rng, 0, 0xFFFFFFFF);
  run.activeMs = number(source.activeMs);
  run.windowStart = run.activeMs;
  run.recent = [];
  run.correct = integer(source.correct);
  run.wrong = integer(source.wrong);
  run.keyStats = stats(source.keyStats, lesson.keys);
  if (Object.values(run.keyStats).reduce((sum, stat) => sum + stat.attempts, 0) !== run.correct + run.wrong || Object.values(run.keyStats).reduce((sum, stat) => sum + stat.errors, 0) !== run.wrong) throw new Error('Inconsistent counters');
  run.combo = integer(source.combo, 0, run.correct);
  run.maxCombo = integer(source.maxCombo, run.combo, run.correct);
  run.energy = integer(source.energy, 0, 1);
  run.pressure = number(source.pressure, 0, 3);
  run.slowMs = 0;
  run.warningUntil = source.warningUntil === null ? null : number(source.warningUntil);
  run.lastAttack = number(source.lastAttack, -2000, run.activeMs);
  run.burstLeft = integer(source.burstLeft, 0, 3);
  run.prompt = text(source.prompt, 512);
  run.cursor = integer(source.cursor, 0, Math.max(0, run.prompt.length - 1));
  if (lesson.kind !== 'edit' && (!run.prompt.length || [...run.prompt].some(key => !lesson.keys.includes(key)))) throw new Error('Invalid prompt');
  if (lesson.prompts.length && !lesson.prompts.includes(run.prompt)) throw new Error('Unknown prompt');
  if (!Array.isArray(source.bag) || source.bag.length > 256 || source.bag.some(key => typeof key !== 'string' || key.length !== 1 || !lesson.keys.includes(key))) throw new Error('Invalid bag');
  run.bag = [...source.bag] as string[];
  run.lastTargets = text(source.lastTargets, 3);
  if ([...run.lastTargets].some(key => !lesson.keys.includes(key))) throw new Error('Invalid target history');
  run.taskIndex = integer(source.taskIndex, 0, 5);
  run.taskMistakes = integer(source.taskMistakes);
  run.hints = integer(source.hints);
  run.flashes = [];
  return run;
}
export class FutureSaveError extends Error {}
export function decodeProfile(raw: string): Profile {
  if (new TextEncoder().encode(raw).byteLength > 1048576) throw new Error('File too large');
  const source = object(JSON.parse(raw));
  const schema = integer(source.schemaVersion, 1);
  if (schema > 1) throw new FutureSaveError('Newer save format');
  const profile = newProfile();
  profile.revision = integer(source.revision);
  profile.savedAt = number(source.savedAt);
  const settings = object(source.settings);
  profile.settings = {
    music: number(settings.music, 0, 1), effects: number(settings.effects, 0, 1), motion: choice(settings.motion, ['system', 'reduce', 'full']),
    hints: boolean(settings.hints), fixedView: boolean(settings.fixedView), platform: choice(settings.platform, ['auto', 'windows', 'mac']),
  };
  for (const [id, value] of Object.entries(object(source.progress))) {
    const lesson = getLesson(id);
    const record = object(value);
    const result: Result = {
      learn: boolean(record.learn), learnStars: integer(record.learnStars, 0, 3), challengeStars: integer(record.challengeStars, 0, 3),
      bestAccuracy: number(record.bestAccuracy, 0, 1), bestCPM: number(record.bestCPM, 0, 100000),
      speedAttempts: integer(record.speedAttempts), speedMs: number(record.speedMs), lastRunId: text(record.lastRunId, 128),
      lastAccuracy: number(record.lastAccuracy, 0, 1), lastCPM: number(record.lastCPM, 0, 100000), lastMs: number(record.lastMs), lastMode: choice(record.lastMode, ['learn', 'challenge']),
    };
    if ((!result.learn && (result.learnStars > 0 || result.challengeStars > 0)) || (lesson.kind === 'edit' && result.challengeStars !== 0) || (result.bestCPM > 0 && (result.speedAttempts < 30 || result.speedMs <= 0))) throw new Error('Inconsistent record');
    profile.progress[id] = result;
  }
  for (let i = 1; i < lessons.length; i++) if (profile.progress[lessons[i].id]?.learn && !profile.progress[lessons[i - 1].id]?.learn) throw new Error('Broken progression');
  profile.keyStats = stats(source.keyStats, lessons.at(-1)!.keys);
  profile.activeRun = source.activeRun === null ? null : decodeRun(source.activeRun);
  if (profile.activeRun) {
    const index = lessons.findIndex(lesson => lesson.id === profile.activeRun!.lessonId);
    if (index > 0 && !profile.progress[lessons[index - 1].id]?.learn) throw new Error('Locked active lesson');
    if (profile.activeRun.mode === 'challenge' && !profile.progress[profile.activeRun.lessonId]?.learn) throw new Error('Locked challenge');
  }
  return profile;
}
export function recordVictory(profile: Profile, run: Run): void {
  if (run.phase !== 'won') return;
  const previous = profile.progress[run.lessonId];
  if (previous?.lastRunId === run.id) return;
  const result = previous ?? { learn: false, learnStars: 0, challengeStars: 0, bestAccuracy: 0, bestCPM: 0, speedAttempts: 0, speedMs: 0, lastRunId: '', lastAccuracy: 0, lastCPM: 0, lastMs: 0, lastMode: 'learn' as Mode };
  if (run.mode === 'learn') { result.learn = true; result.learnStars = Math.max(result.learnStars, stars(run)); }
  else result.challengeStars = Math.max(result.challengeStars, stars(run));
  result.bestAccuracy = Math.max(result.bestAccuracy, accuracy(run) ?? 0);
  const speed = cpm(run) ?? 0;
  if (run.correct + run.wrong >= 30 && speed > result.bestCPM && speed <= 100000) { result.bestCPM = speed; result.speedAttempts = run.correct + run.wrong; result.speedMs = run.activeMs; }
  result.lastRunId = run.id; result.lastAccuracy = accuracy(run) ?? 0; result.lastCPM = Math.min(100000, speed); result.lastMs = run.activeMs; result.lastMode = run.mode;
  profile.progress[run.lessonId] = result;
  for (const [key, stat] of Object.entries(run.keyStats)) {
    const total = profile.keyStats[key] ??= { attempts: 0, errors: 0 };
    total.attempts += stat.attempts; total.errors += stat.errors;
  }
  profile.activeRun = null;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class ProfileStore {
  notice = '';
  saved = false;
  recoveryRaw: string | null = null;
  future = false;
  recoveryBlocked = false;
  constructor(private storage: StorageLike | null, public writable: boolean) {}
  read(): Profile {
    if (!this.storage) { this.notice = '本次进度暂时无法保存，可以导出存档带走。'; return newProfile(); }
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (raw === null) return newProfile();
      try {
        const profile = decodeProfile(raw);
        if (JSON.parse(raw).activeRun && !profile.activeRun) this.notice = '上次战局需要重新开始，已完成的课程都保留了。';
        this.saved = true;
        return profile;
      } catch (error) {
        this.recoveryRaw = raw;
        if (error instanceof FutureSaveError) { this.future = true; this.writable = false; this.notice = '这份存档来自更新的游戏，请先导出原文件并更新页面。'; return newProfile(); }
        const backup = this.storage.getItem(BACKUP_KEY);
        if (backup) {
          try {
            const profile = decodeProfile(backup);
            this.notice = '已找回上一份有效存档，原文件也已保留。';
            return profile;
          } catch { /* Keep both originals until an explicit replacement. */ }
        }
        this.recoveryBlocked = true; this.notice = '存档暂时无法读取，原文件已保留。请在设置中导出原文件，再选择导入或清除。';
        return newProfile();
      }
    } catch {
      this.writable = false; this.notice = '浏览器暂时不能保存进度，请先导出存档。';
      return newProfile();
    }
  }
  write(profile: Profile, replaceCorrupt = false): boolean {
    this.saved = false;
    if (!this.storage || !this.writable || (this.recoveryBlocked && !replaceCorrupt)) return false;
    try {
      const raw = JSON.stringify(profile);
      decodeProfile(raw);
      const previous = this.storage.getItem(SAVE_KEY);
      if (previous) {
        let valid = false;
        try { decodeProfile(previous); valid = true; } catch { /* Preserve a valid backup when primary is corrupt. */ }
        if (valid) this.storage.setItem(BACKUP_KEY, previous);
        else this.storage.setItem(RECOVERY_KEY, previous);
      }
      this.storage.setItem(SAVE_KEY, raw);
      this.saved = true;
      if (this.recoveryBlocked) { this.recoveryBlocked = false; this.notice = ''; }
      return true;
    } catch { this.notice = '这次进度还没有保存成功，请导出存档。'; return false; }
  }
  reset(): boolean {
    if (!this.storage || !this.writable || this.future) return false;
    try { for (const key of [SAVE_KEY, BACKUP_KEY, RECOVERY_KEY]) this.storage.removeItem(key); this.recoveryBlocked = false; return true; }
    catch { return false; }
  }
}
export async function acquireWriter(): Promise<boolean> {
  if (!navigator.locks) return false;
  return new Promise(resolve => {
    void navigator.locks.request('keybud.writer', { ifAvailable: true }, async lock => {
      if (!lock) { resolve(false); return; }
      resolve(true);
      await new Promise<void>(() => {});
    }).catch(() => resolve(false));
  });
}

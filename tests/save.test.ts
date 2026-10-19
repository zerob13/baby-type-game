import { expect, test } from 'vitest';
import { advance, completeTask, createRun } from '../src/game';
import { BACKUP_KEY, decodeProfile, decodeRun, FutureSaveError, newProfile, ProfileStore, recordVictory, RECOVERY_KEY, SAVE_KEY } from '../src/save';

class MemoryStorage {
  data = new Map<string, string>();
  failKey = '';
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { if (key === this.failKey) throw new Error('Storage unavailable'); this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}
test('active typing round-trips into a paused run with the same cursor, map, and random state', () => {
  const profile = newProfile();
  const run = createRun('grassland-01', 177, 'saved-run');
  for (let i = 0; i < 23; i++) advance(run, 1000, run.prompt[run.cursor]);
  profile.activeRun = run;
  const restored = decodeProfile(JSON.stringify(profile));
  expect(restored.activeRun).toMatchObject({ phase: 'paused', correct: 23, cursor: run.cursor, prompt: run.prompt, rng: run.rng, owners: run.owners, activeMs: run.activeMs, recent: [] });
});
test('future formats stay read-only and cannot be replaced by routine saves', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify({ ...newProfile(), schemaVersion: 3 });
  storage.setItem(SAVE_KEY, raw);
  expect(() => decodeProfile(raw)).toThrow(FutureSaveError);
  const store = new ProfileStore(storage, true);
  store.read();
  expect(store.future).toBe(true);
  expect(store.write(newProfile())).toBe(false);
  expect(storage.getItem(SAVE_KEY)).toBe(raw);
  expect(store.reset()).toBe(false);
});
test('corruption recovers a valid backup while keeping the corrupt original', () => {
  const storage = new MemoryStorage();
  const good = newProfile(); good.revision = 7;
  storage.setItem(SAVE_KEY, '{broken'); storage.setItem(BACKUP_KEY, JSON.stringify(good));
  const store = new ProfileStore(storage, true);
  const profile = store.read();
  expect(profile.revision).toBe(7);
  expect(storage.getItem(SAVE_KEY)).toBe('{broken');
  expect(store.write(profile)).toBe(true);
  expect(storage.getItem(RECOVERY_KEY)).toBe('{broken');
  expect(decodeProfile(storage.getItem(BACKUP_KEY)!).revision).toBe(7);
});
test('quota or permission errors leave the last primary intact', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify(newProfile()); storage.setItem(SAVE_KEY, original);
  const store = new ProfileStore(storage, true); store.read();
  storage.failKey = SAVE_KEY;
  const updated = newProfile(); updated.revision = 4;
  expect(store.write(updated)).toBe(false);
  expect(store.saved).toBe(false);
  expect(storage.getItem(SAVE_KEY)).toBe(original);
  expect(storage.getItem(BACKUP_KEY)).toBe(original);
});
test('unreadable saves block routine writes but allow a confirmed replacement with recovery', () => {
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEY, '{broken'); storage.setItem(BACKUP_KEY, 'also broken');
  const store = new ProfileStore(storage, true);
  store.read();
  expect(store.recoveryBlocked).toBe(true);
  expect(store.write(newProfile())).toBe(false);
  expect(storage.getItem(SAVE_KEY)).toBe('{broken');
  expect(store.write(newProfile(), true)).toBe(true);
  expect(storage.getItem(RECOVERY_KEY)).toBe('{broken');
  expect(store.recoveryBlocked).toBe(false);
  expect(store.write(newProfile())).toBe(true);
});
test('a second writer never alters shared storage', () => {
  const storage = new MemoryStorage(); storage.setItem(SAVE_KEY, JSON.stringify(newProfile()));
  const snapshot = storage.getItem(SAVE_KEY);
  const store = new ProfileStore(storage, false); store.read();
  expect(store.write(newProfile())).toBe(false);
  expect(storage.getItem(SAVE_KEY)).toBe(snapshot);
});
test('imports reject oversized, disconnected, unknown, and unsafe numeric state', () => {
  expect(() => decodeProfile(' '.repeat(1048577))).toThrow();
  const profile = newProfile(); profile.activeRun = createRun('grassland-01', 11, 'valid');
  const mutate = (callback: (value: any) => void) => { const value = JSON.parse(JSON.stringify(profile)); callback(value); return JSON.stringify(value); };
  expect(() => decodeProfile(mutate(value => value.activeRun.owners[0] = 1))).toThrow();
  expect(() => decodeProfile(mutate(value => value.activeRun.prompt = '<script>'))).toThrow();
  expect(() => decodeProfile(mutate(value => value.activeRun.lessonId = 'unknown'))).toThrow();
  expect(() => decodeProfile(mutate(value => value.activeRun.pressure = -1))).toThrow();
  expect(() => decodeProfile(mutate(value => value.progress.unknown = {}))).toThrow();
  expect(() => decodeProfile(JSON.stringify(newProfile()).replace('"revision":0', '"revision":1e999'))).toThrow();
});
test('victory is recorded once, unlocks the course, and preserves same-run stars', () => {
  const profile = newProfile();
  const run = createRun('grassland-01', 3, 'winner');
  while (run.phase !== 'won') advance(run, 1000, run.prompt[run.cursor]);
  recordVictory(profile, run);
  const snapshot = JSON.stringify(profile);
  recordVictory(profile, run);
  expect(JSON.stringify(profile)).toBe(snapshot);
  expect(profile.progress['grassland-01']).toMatchObject({ learn: true, learnStars: 3 });
  expect(decodeProfile(snapshot).progress['grassland-01'].learn).toBe(true);
});
test('editor restore keeps completed tasks and resumes only the current task', () => {
  const run = createRun('workshop-03', 12, 'editor');
  completeTask(run, 0); completeTask(run, 1);
  const restored = decodeRun(JSON.parse(JSON.stringify(run)))!;
  expect(restored.taskIndex).toBe(2);
  expect(restored.owners).toEqual(run.owners);
  expect(restored.phase).toBe('paused');
});
test('an incompatible terrain revision drops only the active battle and preserves completed lessons', () => {
  const profile = newProfile();
  for (let index = 1; index <= 4; index++) {
    const run = createRun(`grassland-0${index}`, 37, `finished-${index}`);
    while (run.phase !== 'won') advance(run, 1000, run.prompt[run.cursor]);
    recordVictory(profile, run);
  }
  profile.activeRun = createRun('forest-01', 83, 'old-forest');
  profile.activeRun.revision = 1;
  const restored = decodeProfile(JSON.stringify(profile));
  expect(restored.activeRun).toBeNull();
  expect(Object.values(restored.progress).filter(result => result.learn)).toHaveLength(4);
});

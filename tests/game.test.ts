import { describe, expect, test } from 'vitest';
import { chapters, fingerFor, lessons } from '../src/lessons';
import { accuracy, advance, completeTask, cpm, createRun, fraction, owned, pause, reachable, recentCPM, resume, stars } from '../src/game';

describe('campaign and content', () => {
  test('all 32 lessons have reachable seeded maps and only learned characters', () => {
    expect(chapters).toHaveLength(8);
    expect(lessons).toHaveLength(32);
    expect(new Set(lessons.map(lesson => lesson.id)).size).toBe(32);
    for (const lesson of lessons) {
      for (const prompt of lesson.prompts) for (const key of prompt) expect(lesson.keys).toContain(key);
      for (const seed of [0, 1, 32, 7341, 0xFFFFFFFF]) {
        const run = createRun(lesson.id, seed, 'map-test');
        expect(reachable(run, run.home, index => run.terrain[index]).size).toBe(run.terrain.filter(Boolean).length);
        expect(run.terrain[run.flag]).toBe(true);
        expect(run.owners[run.home]).toBe(1);
      }
    }
  });
  test('the first lesson introduces only f and j and preserves the exact 72-cell map', () => {
    const run = createRun(lessons[0].id, 1, 'first');
    expect(run.terrain.filter(Boolean)).toHaveLength(72);
    expect([...run.prompt].every(key => 'fj'.includes(key))).toBe(true);
    expect(fingerFor('F')).toMatchObject({ hand: 'left', finger: '食指', shift: 'right' });
    expect(fingerFor('!')).toMatchObject({ hand: 'left', finger: '小指', shift: 'right' });
  });
  test('the forest river has one walkable bridge connecting both banks', () => {
    const run = createRun('forest-03', 381, 'bridge');
    for (let y = 1; y < 7; y++) expect(run.terrain[y * 12 + 6]).toBe(y === 3);
    expect(reachable(run, run.home, index => run.terrain[index]).has(run.flag)).toBe(true);
  });
});

describe('typing and territory', () => {
  test('readiness is safe and a correct key is counted exactly once', () => {
    const run = createRun(lessons[0].id, 42, 'ready');
    advance(run, 3000, 'x');
    expect(run.phase).toBe('ready');
    expect(run.wrong).toBe(0);
    expect(accuracy(run)).toBeNull();
    expect(cpm(run)).toBeNull();
    advance(run, 0, run.prompt[run.cursor]);
    expect(run.correct).toBe(1);
    expect(run.energy).toBe(1);
    advance(run, 1500, run.prompt[run.cursor]);
    expect(owned(run, 1)).toBe(2);
    expect(run.energy).toBe(0);
  });
  test('mistakes spend energy or create pressure, while learning never penalizes territory', () => {
    const run = createRun(lessons[0].id, 2, 'challenge', 'challenge');
    advance(run, 0, run.prompt[run.cursor]);
    advance(run, 10, 'x');
    expect(run.energy).toBe(0);
    expect(run.pressure).toBe(0);
    advance(run, 10, 'x');
    expect(run.pressure).toBe(1);
    expect(run.wrong).toBe(2);
    expect(run.combo).toBe(0);
    const learning = createRun(lessons[0].id, 2, 'learning');
    advance(learning, 0, learning.prompt[0]);
    for (let i = 0; i < 20; i++) advance(learning, 1000, 'x');
    expect(learning.energy).toBe(1);
    expect(learning.pressure).toBe(0);
    expect(owned(learning, 2)).toBe(1);
  });
  test('combo energy finishes the grassland in exactly 130 correct characters', () => {
    const run = createRun(lessons[0].id, 44, 'win');
    for (let i = 0; i < 129; i++) advance(run, 1500, run.prompt[run.cursor]);
    expect(run.phase).toBe('playing');
    expect(owned(run, 1)).toBe(71);
    advance(run, 1500, run.prompt[run.cursor]);
    expect(run.phase).toBe('won');
    expect(fraction(run)).toBe(1);
    expect(stars(run)).toBe(3);
    const snapshot = JSON.stringify(run);
    advance(run, 10000, 'f');
    expect(JSON.stringify(run)).toBe(snapshot);
  });
  test('pause freezes all battle effects and resume starts a fresh speed window', () => {
    const run = createRun(lessons[0].id, 2, 'paused', 'challenge');
    advance(run, 0, run.prompt[0]);
    advance(run, 22000);
    expect(run.pressure).toBeGreaterThan(0);
    pause(run);
    const snapshot = JSON.stringify(run);
    advance(run, 60000, 'x');
    expect(JSON.stringify(run)).toBe(snapshot);
    resume(run);
    advance(run, 0, run.prompt[run.cursor]);
    const pressure = run.pressure;
    advance(run, 14900);
    expect(run.pressure).toBeLessThanOrEqual(pressure);
    expect(run.slowMs).toBe(0);
  });
  test('low speed observes both grace periods, while protected home survives idle attacks', () => {
    const run = createRun(lessons[0].id, 22, 'slow', 'challenge');
    advance(run, 0, run.prompt[0]);
    advance(run, 19950);
    expect(run.pressure).toBe(0);
    advance(run, 1050);
    expect(run.pressure).toBeCloseTo(0.25, 2);
    advance(run, 200000);
    expect(run.owners[run.home]).toBe(1);
    expect(owned(run, 1)).toBe(1);
    expect(run.pressure).toBeLessThanOrEqual(3);
    expect(recentCPM(run)).toBe(0);
  });
  test('seeded prompts stay reproducible across paused serialization and avoid four equal targets', () => {
    const a = createRun(lessons[0].id, 183, 'deterministic');
    let text = '';
    for (let i = 0; i < 30; i++) { const key = a.prompt[a.cursor]; text += key; advance(a, 500, key); }
    pause(a);
    const b = JSON.parse(JSON.stringify(a));
    resume(a); resume(b);
    for (let i = 0; i < 40; i++) {
      const key = a.prompt[a.cursor]; text += key;
      advance(a, 500, key); advance(b, 500, key);
    }
    expect(b).toEqual(a);
    expect(text).not.toMatch(/f{4}|j{4}/);
  });
  test('every curriculum map can be completed, including the enemy flag', () => {
    for (const lesson of lessons) {
      const run = createRun(lesson.id, 912, `complete-${lesson.id}`);
      if (lesson.kind === 'edit') {
        for (let i = 0; i < 6; i++) completeTask(run, i);
      } else {
        for (let i = 0; i < 400 && run.phase !== 'won'; i++) advance(run, 1000, run.prompt[run.cursor]);
      }
      expect(run.phase, lesson.id).toBe('won');
      expect(fraction(run)).toBe(1);
    }
  });
  test('editor tasks award only once and the sixth task completes the map', () => {
    const run = createRun('workshop-01', 8, 'tasks');
    completeTask(run, 0);
    const land = owned(run, 1);
    completeTask(run, 0);
    expect(owned(run, 1)).toBe(land);
    for (let i = 1; i < 5; i++) completeTask(run, i);
    expect(run.phase).not.toBe('won');
    completeTask(run, 5);
    expect(run.phase).toBe('won');
    expect(stars(run)).toBe(3);
  });
  test('enemy bursts can reclaim land without disconnecting the protected home', () => {
    for (const lessonId of ['mushroom-01', 'market-01', 'castle-04']) {
      const run = createRun(lessonId, 29, 'invasion', 'challenge');
      for (let i = 0; i < 55; i++) advance(run, 900, run.prompt[run.cursor]);
      const before = owned(run, 1);
      for (let i = 0; i < 6; i++) {
        advance(run, 40000);
        expect(reachable(run, run.home, index => run.owners[index] === 1).size).toBe(owned(run, 1));
        expect(run.owners[run.home]).toBe(1);
      }
      expect(owned(run, 1)).toBeLessThan(before);
    }
  });
  test('frame chunking preserves input timing and seeded battle outcomes', () => {
    const a = createRun('castle-04', 930, 'chunks', 'challenge');
    const b = createRun('castle-04', 930, 'chunks', 'challenge');
    for (let i = 0; i < 90; i++) {
      const key = i % 3 === 1 ? '#' : a.prompt[a.cursor];
      advance(a, 1000, key);
      if (b.phase === 'playing') for (let j = 0; j < 19; j++) advance(b, 51);
      advance(b, b.phase === 'playing' ? 31 : 1000, key);
    }
    expect(b).toEqual(a);
  });
});

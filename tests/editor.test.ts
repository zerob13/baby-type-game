import { expect, test } from 'vitest';
import { editorTask, taskSatisfied } from '../src/editor';
import type { TaskKind } from '../src/lessons';

test('all six tasks of each editor lesson have complete goals and real required actions', () => {
  for (const kind of ['repair', 'focus', 'selection', 'clipboard', 'history', 'mixed'] as TaskKind[]) for (let i = 0; i < 6; i++) {
    const task = editorTask(kind, i);
    expect(task.title.length).toBeGreaterThan(0);
    expect(task.required.length).toBeGreaterThan(0);
    expect(taskSatisfied(task, task.finalSource ?? task.source, task.finalTarget ?? task.target, task.selection?.[0] ?? 0, task.selection?.[1] ?? 0, new Set(), task.focusTarget)).toBe(false);
    expect(taskSatisfied(task, task.finalSource ?? task.source, task.finalTarget ?? task.target, task.selection?.[0] ?? 0, task.selection?.[1] ?? 0, new Set(task.required), task.focusTarget)).toBe(true);
  }
});
test('typing the destination text cannot fake a copy/paste task', () => {
  const task = editorTask('clipboard', 0);
  expect(taskSatisfied(task, 'cat', 'cat', 0, 0, new Set(['insertText']))).toBe(false);
  expect(taskSatisfied(task, 'cat', 'cat', 0, 0, new Set(['copy', 'paste']))).toBe(true);
});
test('undo and redo need observed history actions as well as the final text', () => {
  const task = editorTask('history', 1);
  expect(taskSatisfied(task, 'sun', '', 0, 0, new Set(['typed', 'historyUndo']))).toBe(false);
  expect(taskSatisfied(task, 'sun', '', 0, 0, new Set(['typed', 'historyUndo', 'historyRedo']))).toBe(true);
});

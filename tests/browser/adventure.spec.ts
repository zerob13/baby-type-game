import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { editorTask } from '../../src/editor';
import { lessons } from '../../src/lessons';
import { decodeProfile, SAVE_KEY } from '../../src/save';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '开始冒险 →', exact: true }).click();
  await page.getByRole('button', { name: '手指准备好了 →' }).click();
  await expect(page.locator('#typing-input')).toBeFocused();
}
async function saved(page: Page) {
  return decodeProfile(await page.evaluate(key => localStorage.getItem(key)!, SAVE_KEY));
}
async function typeMap(page: Page): Promise<void> {
  for (let group = 0; group < 70 && await page.locator('#typing-input').count(); group++) {
    const text = await page.locator('.prompt-char:not(.done)').allTextContents();
    await page.keyboard.type(text.join('').replaceAll('␣', ' '), { delay: 8 });
    if (group === 8 && test.info().project.name === 'chromium' && await page.locator('.lesson-heading').textContent().then(text => text?.includes('1-1'))) await page.screenshot({ path: 'test-results/keybud-gameplay.png' });
  }
  await expect(page.getByRole('heading', { name: /这片土地，点亮啦|整个世界，都亮起来了/ })).toBeVisible();
}
async function editorMap(page: Page, kind: NonNullable<(typeof lessons)[number]['taskKind']>): Promise<void> {
  const mod = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform)) ? 'Meta' : 'Control';
  for (let index = 0; index < 6; index++) {
    const task = editorTask(kind, index);
    await expect(page.getByRole('heading', { name: task.title, exact: true })).toBeVisible();
    const source = page.locator('#native-source');
    if (task.kind === 'focus') {
      await expect(page.locator('[data-resume-focus]')).toBeFocused();
      const option = test.info().project.name === 'webkit' && mod === 'Meta' ? 'Alt+' : '';
      await page.keyboard.press(`${option}${task.direction === 'backward' ? 'Shift+' : ''}Tab`);
    } else {
      await expect(source).toBeFocused();
      if (task.kind === 'repair') {
        if (index === 0) await page.keyboard.press('Backspace');
        else if (index === 1) await page.keyboard.press('Delete');
        else if (task.source === 'cot') { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Backspace'); await page.keyboard.type('a'); }
        else if (index === 3) { await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); }
        else if (index === 4) { for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace'); await page.keyboard.type('dog'); }
        else { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Backspace'); }
      } else if (task.kind === 'selection') {
        if (task.required.includes('selectAll')) await page.keyboard.press(`${mod}+a`);
        else for (let i = 0; i < task.selection![1] - task.selection![0]; i++) await page.keyboard.press(task.caret > 0 ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
      } else if (task.kind === 'clipboard') {
        await page.keyboard.press(`${mod}+a`);
        await page.keyboard.press(`${mod}+${task.required.includes('cut') ? 'x' : 'c'}`);
        await page.keyboard.press('Tab');
        await expect(page.locator('#native-target')).toBeFocused();
        await page.keyboard.press(`${mod}+v`);
      } else {
        await page.keyboard.type(task.typed!, { delay: 12 });
        for (let step = 0; step < task.typed!.length; step++) {
          await page.keyboard.press(`${mod}+z`);
          const remaining = await page.locator('#editor-host').evaluate(host => host.querySelector('textarea')?.value);
          if (!remaining) break;
        }
        if (task.required.includes('historyRedo')) {
          await expect(source).toHaveValue('');
          for (let step = 0; step < task.typed!.length; step++) {
            await page.keyboard.press(mod === 'Meta' ? 'Meta+Shift+z' : 'Control+y');
            const restored = await page.locator('#editor-host').evaluate(host => host.querySelector('textarea')?.value);
            if (restored === undefined || restored === task.typed) break;
          }
        }
      }
    }
    if (index < 5) await page.getByRole('button', { name: '下一个任务 →' }).click();
  }
  await expect(page.getByRole('heading', { name: '这片土地，点亮啦！' })).toBeVisible();
}

test('one key is one attempt; pause, reload, resume and export preserve the battle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  const initial = await saved(page);
  const target = initial.activeRun!.prompt[0];
  await page.keyboard.press('x');
  await page.keyboard.down(target); await page.keyboard.down(target); await page.keyboard.up(target);
  await page.getByRole('button', { name: 'Ⅱ 暂停' }).click();
  const before = (await saved(page)).activeRun!;
  expect(before.correct).toBe(1); expect(before.wrong).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: '继续冒险 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: '歇一小会儿' })).toBeVisible();
  expect((await saved(page)).activeRun!.owners).toEqual(before.owners);
  await page.getByRole('button', { name: '继续冒险 →', exact: true }).click();
  const current = (await page.locator('#typing-input').getAttribute('aria-label'))!.split('：')[1];
  await page.keyboard.press(current);
  await page.getByRole('button', { name: 'Ⅱ 暂停' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const file = await (await download).path();
  const exported = decodeProfile(await readFile(file!, 'utf8'));
  expect(exported.activeRun!.correct).toBe(2);
  await page.getByRole('button', { name: '保存并返回' }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入存档', exact: true }).click();
  await (await chooser).setFiles(file!);
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续冒险 →', exact: true })).toBeVisible();
  expect((await saved(page)).activeRun!.correct).toBe(2);
});

test('challenge attacks warn, freeze while paused, and produce a separate result', async ({ page }) => {
  await start(page); await typeMap(page);
  await page.getByRole('button', { name: '试试领地挑战', exact: true }).click();
  await page.getByRole('button', { name: '手指准备好了 →' }).click();
  const input = page.locator('#typing-input');
  await page.keyboard.press((await input.getAttribute('aria-label'))!.split('：')[1]);
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await expect(page.locator('#world-message')).toContainText('正在蓄力');
  await page.getByRole('button', { name: 'Ⅱ 暂停' }).click();
  const before = (await saved(page)).activeRun!;
  await page.waitForTimeout(2300);
  const after = (await saved(page)).activeRun!;
  expect(after.activeMs).toBe(before.activeMs); expect(after.owners).toEqual(before.owners);
  await page.getByRole('button', { name: '继续冒险 →', exact: true }).click();
  await page.keyboard.press((await input.getAttribute('aria-label'))!.split('：')[1]);
  await expect.poll(async () => (await saved(page)).activeRun!.owners.filter(owner => owner === 2).length).toBeGreaterThan(1);
  await typeMap(page);
  expect((await saved(page)).progress['grassland-01'].challengeStars).toBeGreaterThan(0);
});

test('the complete 32-lesson campaign works through real typing and native editing', async ({ page }) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  for (let index = 0; index < lessons.length; index++) {
    const lesson = lessons[index];
    await test.step(lesson.id, async () => {
      if (lesson.kind === 'edit') await editorMap(page, lesson.taskKind!); else await typeMap(page);
    });
    const profile = await saved(page);
    expect(Object.keys(profile.progress)).toHaveLength(index + 1);
    expect(profile.progress[lesson.id].learn).toBe(true);
    expect(profile.activeRun).toBeNull();
    await expect(page.getByText('进度已保存', { exact: false })).toBeVisible();
    if (index < lessons.length - 1) {
      await page.getByRole('button', { name: '下一站 →', exact: true }).click();
      await page.getByRole('button', { name: '手指准备好了 →' }).click();
    }
  }
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: '看看我的大陆 →' }).click();
  await expect(page.locator('.atlas-count')).toContainText('32');
  await expect(page.locator('.save-notice')).toHaveCount(0);
});

test('only one tab can write; releasing the tab allows a fresh writer', async ({ page, context }) => {
  await start(page);
  await page.getByRole('button', { name: 'Ⅱ 暂停' }).click();
  const previous = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('.save-notice')).toContainText('另一个窗口');
  await second.getByRole('button', { name: '设置', exact: true }).click();
  await second.getByLabel('键盘与手位提示').uncheck();
  expect(await second.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBe(previous);
  await page.close();
  await second.reload();
  await expect(second.locator('.save-notice')).toHaveCount(0);
  await second.getByRole('button', { name: '设置', exact: true }).click();
  await second.getByLabel('键盘与手位提示').uncheck();
  expect((await saved(second)).settings.hints).toBe(false);
});

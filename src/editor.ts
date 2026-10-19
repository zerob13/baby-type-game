import type { Run } from './game';
import { getLesson, type TaskKind } from './lessons';

export interface EditorTask {
  title: string; hint: string; source: string; target: string; caret: number;
  kind: 'repair' | 'focus' | 'selection' | 'clipboard' | 'history'; required: string[];
  selection?: [number, number]; finalSource?: string; finalTarget?: string; focusTarget?: number;
  typed?: string; direction?: 'forward' | 'backward';
}
export function editorTask(kind: TaskKind, index: number): EditorTask {
  if (kind === 'mixed') {
    const sequence: [TaskKind, number][] = [['selection', 0], ['clipboard', 1], ['repair', 2], ['history', 0], ['history', 1], ['clipboard', 4]];
    return editorTask(...sequence[index]);
  }
  if (kind === 'repair') {
    return [
      { title: '用退格删掉多出来的 t', hint: '光标已在 catt 后面，按一次 Backspace。', source: 'catt', caret: 4, finalSource: 'cat', required: ['deleteContentBackward'] },
      { title: '向前删除多出来的 t', hint: '光标在最后一个 t 前。按 Delete；Mac 键盘通常用 Fn + Delete。', source: 'catt', caret: 3, finalSource: 'cat', required: ['deleteContentForward'] },
      { title: '把 cot 修成 cat', hint: '先左移一格，退格删掉 o，再输入 a。', source: 'cot', caret: 3, finalSource: 'cat', required: ['ArrowLeft', 'deleteContentBackward', 'insertText'] },
      { title: '让 Sam 到下一行', hint: '光标在空格后。先退格去掉空格，再按 Enter 换行。', source: 'Hello Sam', caret: 6, finalSource: 'Hello\nSam', required: ['deleteContentBackward', 'insertLineBreak'] },
      { title: '把小猫改成小狗', hint: '按三次退格去掉 cat，再输入 dog。', source: 'red cat', caret: 7, finalSource: 'red dog', required: ['deleteContentBackward', 'insertText'] },
      { title: '保留句号，删掉多余的 p', hint: '先左移一格到句号前，再按一次退格。', source: 'The sun is upp.', caret: 15, finalSource: 'The sun is up.', required: ['ArrowLeft', 'deleteContentBackward'] },
    ].map(task => ({ ...task, target: '', kind: 'repair' as const }))[index];
  }
  if (kind === 'focus') {
    const targets = [0, 2, 1, 4, 3, 5];
    const backward = index === 2 || index === 4;
    const names = ['草地灯', '木桥灯', '风车灯', '海岸灯', '山谷灯', '城门灯'];
    return { title: `用${backward ? ' Shift + Tab ' : ' Tab '}找到${names[targets[index]]}`, hint: backward ? '按住 Shift，再按一次 Tab，焦点会回到前一个控件。' : '按一次 Tab，焦点会前往下一个控件。', source: '', target: '', caret: 0, kind, required: ['Tab'], focusTarget: targets[index], direction: backward ? 'backward' : 'forward' };
  }
  if (kind === 'selection') {
    const all = index === 3 || index === 5;
    const sources = ['sun sky', 'tree bird', 'bird boat', 'wood stone', 'red boat', 'Open the gate'];
    const source = sources[index];
    const from = index === 4 ? 4 : 0;
    const to = all ? source.length : index === 4 ? source.length : source.indexOf(' ');
    return { title: all ? '用全选选中整段文字' : `用 Shift 和方向键选中 ${source.slice(from, to)}`, hint: all ? '在左侧文本框里使用“全选”组合键。' : index === 4 ? '光标已在末尾，按住 Shift 再按四次左方向键。' : `光标在开头，按住 Shift 再按 ${to} 次右方向键。`, source, target: '', caret: index === 4 ? source.length : 0, selection: [from, to], kind, required: [all ? 'selectAll' : 'select'] };
  }
  if (kind === 'clipboard') {
    const cut = index % 2 === 1;
    const source = ['cat', 'sun', 'green leaf', 'a little bird', 'Gate 3', 'Hello, Sam!'][index];
    return { title: `${cut ? '剪切' : '复制'} ${source} 到右边`, hint: `先在左边全选，再${cut ? '剪切' : '复制'}，用 Tab 到右边后粘贴。`, source, target: '', caret: source.length, finalSource: cut ? '' : source, finalTarget: source, kind, required: [cut ? 'cut' : 'copy', 'paste'] };
  }
  const redo = index % 2 === 1;
  const typed = ['a', 'sun', 'cat', 'bird', 'light', 'Hello'][index];
  return { title: redo ? `输入 ${typed}，撤销，再重做` : `输入 ${typed}，再撤销`, hint: redo ? '先完整输入，撤销到空白，再重做到文字完整。浏览器可能分几次处理，可以重复组合键。' : '先完整输入左侧要求的文字，再撤销到空白。浏览器可能分几次处理，可以重复撤销。', source: '', target: '', caret: 0, finalSource: redo ? typed : '', typed, kind: 'history', required: redo ? ['typed', 'historyUndo', 'historyRedo'] : ['typed', 'historyUndo'] };
}
export function taskSatisfied(task: EditorTask, source: string, target: string, start: number, end: number, events: ReadonlySet<string>, focusTarget?: number): boolean {
  if (!task.required.every(event => events.has(event))) return false;
  if (task.kind === 'focus') return focusTarget === task.focusTarget;
  if (task.selection) return source === task.source && start === task.selection[0] && end === task.selection[1];
  return (task.finalSource === undefined || source === task.finalSource) && (task.finalTarget === undefined || target === task.finalTarget);
}
export function mountEditor(host: HTMLElement, run: Run, mac: boolean, callbacks: { activity: () => void; complete: () => void; mistake: () => void; hint: () => void; next: () => void }): () => void {
  const task = editorTask(getLesson(run.lessonId).taskKind!, run.taskIndex);
  const events = new Set<string>();
  const abort = new AbortController();
  let alive = true;
  let completed = false;
  const mod = mac ? '⌘' : 'Ctrl';
  host.innerHTML = `<div class="editor-heading"><span class="task-count">任务 ${run.taskIndex + 1} / 6</span><h2></h2></div><div class="editor-fields"><label>来源<textarea id="native-source" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="来源文本"></textarea></label><span class="transfer-arrow" aria-hidden="true">→</span><label>目标<textarea id="native-target" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="目标文本"></textarea></label></div><div class="focus-controls" hidden><button id="focus-start" type="button">起点</button>${['草地灯', '木桥灯', '风车灯', '海岸灯', '山谷灯', '城门灯'].map((name, index) => `<button type="button" data-focus="${index}">${name}</button>`).join('')}</div><div class="task-toolbar"><button type="button" id="task-hint" class="quiet-button">看看提示</button><button type="button" id="task-check" class="small-button">检查任务</button><span class="shortcut-reference">全选 ${mod}+A · 复制 ${mod}+C · 粘贴 ${mod}+V</span></div><p class="task-message" aria-live="polite"></p>`;
  host.querySelector('h2')!.textContent = task.title;
  const source = host.querySelector<HTMLTextAreaElement>('#native-source')!;
  const target = host.querySelector<HTMLTextAreaElement>('#native-target')!;
  const message = host.querySelector<HTMLElement>('.task-message')!;
  source.value = task.source; target.value = task.target;
  if (task.kind !== 'clipboard') { target.closest('label')!.hidden = true; host.querySelector<HTMLElement>('.transfer-arrow')!.hidden = true; }
  if (task.kind === 'focus') {
    host.querySelector<HTMLElement>('.editor-fields')!.hidden = true;
    host.querySelector<HTMLElement>('.focus-controls')!.hidden = false;
    const goal = host.querySelector<HTMLElement>(`[data-focus="${task.focusTarget}"]`)!;
    goal.classList.add('focus-goal'); goal.setAttribute('aria-label', `${goal.textContent}，当前目标`);
  }
  const reference = host.querySelector<HTMLElement>('.shortcut-reference')!;
  if (task.kind === 'history') reference.textContent = mac ? '撤销 ⌘+Z · 重做 ⌘+Shift+Z' : '撤销 Ctrl+Z · 重做 Ctrl+Y';
  if (task.kind === 'focus') reference.textContent = mac ? 'Tab 前进 · Shift+Tab 返回；Safari 可加 Option' : 'Tab 前进 · Shift+Tab 返回';
  if (task.kind === 'repair') reference.textContent = mac ? '退格 Delete · 向前删除 Fn+Delete' : '退格 Backspace · 向前删除 Delete';
  if (task.kind === 'selection') reference.textContent = `选择 Shift+←/→ · 全选 ${mod}+A`;
  function check(manual = false): void {
    if (!alive || completed || !['ready', 'playing'].includes(run.phase)) return;
    const focused = document.activeElement instanceof HTMLElement ? Number(document.activeElement.dataset.focus ?? -1) : -1;
    if (taskSatisfied(task, source.value, target.value, source.selectionStart, source.selectionEnd, events, focused)) {
      completed = true; callbacks.complete();
      if (run.phase === 'won') return;
      host.innerHTML = '<div class="task-success"><span class="success-mark" aria-hidden="true">✓</span><h2>小机关修好了！</h2><p>新的光已经送往地图。</p><button type="button" class="primary-button" id="next-task">下一个任务 →</button></div>';
      const button = host.querySelector<HTMLButtonElement>('#next-task')!;
      button.addEventListener('click', callbacks.next, { signal: abort.signal }); button.focus();
    } else if (manual) { callbacks.mistake(); message.textContent = `再检查一下：${task.hint}`; }
  }
  const soon = () => requestAnimationFrame(() => check());
  host.addEventListener('keydown', event => {
    if (completed || run.phase === 'paused') return;
    callbacks.activity();
    const cmd = mac ? event.metaKey : event.ctrlKey;
    if (event.key === 'Tab' && !event.repeat) {
      if ((event.shiftKey ? 'backward' : 'forward') === task.direction) events.add('Tab');
      else events.delete('Tab');
    }
    if (event.target === source) {
      if (event.key.startsWith('Arrow')) events.add(event.key);
      if (event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) events.add('select');
      if (cmd && event.key.toLowerCase() === 'a') events.add('selectAll');
    }
    soon();
  }, { signal: abort.signal });
  source.addEventListener('input', event => {
    const type = (event as InputEvent).inputType;
    events.add(type === 'insertParagraph' ? 'insertLineBreak' : type);
    if (type === 'insertText' && task.typed && source.value === task.typed) events.add('typed');
    callbacks.activity(); soon();
  }, { signal: abort.signal });
  for (const type of ['copy', 'cut'] as const) source.addEventListener(type, () => {
    callbacks.activity();
    if (source.value.slice(source.selectionStart, source.selectionEnd) === task.source) events.add(type);
    else { callbacks.mistake(); message.textContent = '先选中这张纸条上的全部文字。'; }
    soon();
  }, { signal: abort.signal });
  target.addEventListener('paste', event => {
    callbacks.activity();
    if (event.clipboardData?.getData('text/plain') === task.finalTarget) events.add('paste');
    soon();
  }, { signal: abort.signal });
  target.addEventListener('input', soon, { signal: abort.signal });
  source.addEventListener('select', soon, { signal: abort.signal });
  host.addEventListener('focusin', soon, { signal: abort.signal });
  host.querySelector('#task-check')!.addEventListener('click', () => { callbacks.activity(); check(true); }, { signal: abort.signal });
  host.querySelector('#task-hint')!.addEventListener('click', () => { callbacks.hint(); message.textContent = task.hint; }, { signal: abort.signal });
  requestAnimationFrame(() => {
    if (!alive) return;
    if (task.kind === 'focus') {
      const start = task.direction === 'backward' ? task.focusTarget! + 1 : task.focusTarget! - 1;
      const control = host.querySelector<HTMLElement>(start < 0 ? '#focus-start' : `[data-focus="${start}"]`)!;
      control.dataset.resumeFocus = 'true'; control.focus();
    } else { source.focus(); source.setSelectionRange(task.caret, task.caret); }
  });
  return () => { alive = false; abort.abort(); };
}

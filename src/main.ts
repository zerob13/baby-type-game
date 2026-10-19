import './styles.css';
import portraits from './assets/portraits.png';
import { accuracy, advance, completeTask, cpm, createRun, fraction, pause, resume, stars, type Mode, type Run } from './game';
import { chapters, fingerFor, getLesson, lessons } from './lessons';
import { mountEditor } from './editor';
import { acquireWriter, decodeProfile, newProfile, ProfileStore, recordVictory, type Profile } from './save';
import { drawMap } from './render';

const app = document.querySelector<HTMLDivElement>('#app')!;
const dialog = document.createElement('dialog'); dialog.className = 'paper-dialog'; document.body.append(dialog);
document.documentElement.style.setProperty('--portraits', `url("${portraits}")`);
const canLock = Boolean(navigator.locks);
const writer = await acquireWriter();
let storage: Storage | null = null;
try { storage = window.localStorage; } catch { /* Memory-only play remains available. */ }
const store = new ProfileStore(storage, writer && storage !== null);
let profile = store.read();
if (!writer && !store.notice) store.notice = canLock ? '另一个窗口正在冒险。本窗口可以临时练习，但不会写入存档。' : '当前浏览器暂时不能保存进度，可以导出存档带走。';
let run: Run | null = profile.activeRun;
let screen: 'home' | 'atlas' | 'game' | 'results' = 'home';
let selectedChapter = 0;
let lastWon: Run | null = null;
let cleanupEditor: (() => void) | null = null;
let lastFrame = performance.now();
let lastSave = lastFrame;
let lastDraw = 0;
let promptSignature = '';
let errorUntil = 0;
let errorKey = '';
let remountOnResume = false;
let toastTimeout = 0;
let audio: AudioContext | null = null;
let nextNote = 0;
let noteIndex = 0;
const preview = createRun('grassland-01', 71, 'preview');
for (let i = 0; i < 46; i++) advance(preview, 500, preview.prompt[preview.cursor]);

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const completedCount = () => Object.values(profile.progress).filter(value => value.learn).length;
const unlocked = (index: number) => index === 0 || Boolean(profile.progress[lessons[index - 1].id]?.learn);
const mac = () => profile.settings.platform === 'mac' || (profile.settings.platform === 'auto' && /Mac|iPhone|iPad/.test(navigator.platform));
const reduced = () => profile.settings.motion === 'reduce' || (profile.settings.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const starText = (value: number) => '★'.repeat(value) + '☆'.repeat(3 - value);
const duration = (milliseconds: number) => `${Math.floor(milliseconds / 60000)} 分 ${Math.floor(milliseconds / 1000) % 60} 秒`;
function avatar(role: 'player' | 'teacher' | 'rival' | 'king', extra = ''): string { return `<span class="portrait ${role} ${extra}" role="img" aria-label="${{ player: '点点', teacher: '慢慢老师', rival: '团团', king: '灰云王' }[role]}"></span>`; }
function shell(content: string): void {
  cleanupEditor?.(); cleanupEditor = null;
  app.innerHTML = `<header class="app-header"><button class="wordmark" data-action="home" aria-label="返回首页"><span class="sprout-mark" aria-hidden="true"></span>键芽大陆</button><span class="header-motto">让每一次敲击，都长出一点光</span><nav aria-label="游戏导航"><button data-action="atlas">大陆地图</button><button data-action="handbook">指法手册</button><button data-action="settings">设置</button></nav></header>${store.notice ? `<div class="save-notice" role="status">${escape(store.notice)} <button data-action="export">导出存档</button>${!writer && canLock ? '<button data-action="reload">重新检查</button>' : ''}</div>` : ''}${content}<div id="toast" class="toast" role="status"></div>`;
  document.body.dataset.screen = screen;
  document.documentElement.dataset.motion = reduced() ? 'reduce' : 'full';
  lastFrame = performance.now(); promptSignature = '';
}
function toast(message: string): void {
  const element = app.querySelector<HTMLElement>('#toast');
  if (!element) return;
  element.textContent = message; element.classList.add('visible'); clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => element.classList.remove('visible'), 3500);
}
function persist(target = profile, replaceCorrupt = false): boolean {
  target.revision++; target.savedAt = Date.now(); lastSave = performance.now();
  const previousNotice = store.notice;
  const saved = store.write(target, replaceCorrupt);
  if (!saved && store.notice !== previousNotice) toast(store.notice);
  const label = app.querySelector('#save-label');
  if (label) label.textContent = saved ? '进度已保存' : '本次进度未保存 · 可导出';
  return saved;
}
function note(frequency: number, volume: number, length = 0.12): void {
  if (!audio || audio.state !== 'running' || volume <= 0) return;
  const oscillator = audio.createOscillator(); const gain = audio.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, audio.currentTime); gain.gain.linearRampToValueAtTime(volume * 0.18, audio.currentTime + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + length + 0.02);
}
function unlockAudio(): void { try { audio ??= new AudioContext(); void audio.resume(); } catch { /* Audio is optional. */ } }
function pauseGame(): void {
  if (screen !== 'game' || !run || run.phase === 'won') return;
  pause(run); profile.activeRun = run; persist();
  const overlay = app.querySelector<HTMLElement>('#pause-overlay'); if (overlay) overlay.hidden = false;
}
function resumeGame(): void {
  if (!run) return;
  resume(run); lastFrame = performance.now();
  const overlay = app.querySelector<HTMLElement>('#pause-overlay'); if (overlay) overlay.hidden = true;
  if (getLesson(run.lessonId).kind === 'edit') {
    if (remountOnResume || !cleanupEditor) { attachEditor(); remountOnResume = false; }
    else app.querySelector<HTMLElement>('#next-task, [data-resume-focus], .editor-fields:not([hidden]) textarea')?.focus();
  } else app.querySelector<HTMLInputElement>('#typing-input')?.focus();
  unlockAudio();
}
function openDialog(title: string, content: string): void {
  pauseGame();
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${escape(title)}</h2><button data-action="close-dialog" aria-label="关闭">×</button></div>${content}`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  if (!dialog.open) dialog.showModal();
}
function closeDialog(): void { dialog.close(); }
function confirmAction(title: string, message: string, action: () => void): void {
  openDialog(title, `<p class="dialog-copy">${escape(message)}</p><div class="dialog-actions"><button class="quiet-button" data-action="close-dialog">先不动</button><button class="primary-button" id="confirm-action">确认</button></div>`);
  dialog.querySelector('#confirm-action')!.addEventListener('click', () => { closeDialog(); action(); }, { once: true });
}
function leaveTo(next: 'home' | 'atlas'): void {
  if (screen === 'game' && run && run.phase !== 'won') { pause(run); profile.activeRun = run; persist(); }
  if (next === 'home') showHome(); else { const nextIndex = lessons.findIndex(lesson => !profile.progress[lesson.id]?.learn); selectedChapter = nextIndex < 0 ? 7 : Math.floor(nextIndex / 4); showAtlas(); }
}
function showHome(): void {
  screen = 'home';
  const next = lessons.findIndex((_, index) => unlocked(index) && !profile.progress[lessons[index].id]?.learn);
  const nextLesson = lessons[next < 0 ? 31 : next];
  shell(`<main class="home-screen"><div class="home-scene"><canvas id="home-map" role="img" aria-label="白团子点点的草原小岛"></canvas><div class="home-cloud cloud-one"></div><div class="home-cloud cloud-two"></div><div class="home-menu"><div class="adventure-label">一场指尖上的小小冒险</div><h1>从一点光开始，<br>唤醒整个大陆。</h1><p>找准手指的位置。<br>敲下字母，让家园慢慢长大。</p><div class="home-actions">${profile.activeRun ? '<button class="primary-button big-button" data-action="continue">继续冒险 <span>→</span></button>' : `<button class="primary-button big-button" data-start="${nextLesson.id}">开始冒险 <span>→</span></button>`}<button class="secondary-button big-button" data-action="atlas">探索大陆</button><button class="text-button" data-action="practice">轻松练一练</button></div><div class="home-progress"><span class="tiny-flag" aria-hidden="true"></span>已点亮 ${completedCount()} / 32 片土地</div></div>${avatar('player', 'home-player')}<div class="home-scene-label">萌芽草原 · 你的第一束光</div></div><footer class="home-footer"><span>实体键盘 · 英文输入 · 随时可以休息</span><span id="save-label">${store.saved ? '进度已保存' : store.writable ? '进度保存在这台浏览器' : '临时练习 · 可导出存档'}</span></footer></main>`);
}
function showAtlas(): void {
  screen = 'atlas';
  const chapter = chapters[selectedChapter];
  shell(`<main class="atlas-screen"><div class="atlas-heading"><div><p class="overline">点点的冒险地图</p><h1>每一片土地，都在等你。</h1><p>按自己的节奏前进。学会一关，就能走到下一站。</p></div><span class="atlas-count">${completedCount()}<small> / 32 已点亮</small></span></div><div class="chapter-route" aria-label="八章冒险路线">${chapters.map((item, index) => { const count = lessons.filter(lesson => lesson.chapter === index && profile.progress[lesson.id]?.learn).length; return `<button class="chapter-stop ${selectedChapter === index ? 'selected' : ''} ${unlocked(index * 4) ? '' : 'unreached'}" data-chapter="${index}" aria-pressed="${selectedChapter === index}" style="--island:${item.color}"><span class="island-drawing" aria-hidden="true"><i></i><b>${index + 1}</b></span><strong>${item.name}</strong><span>${count ? `${count} / 4 已点亮` : unlocked(index * 4) ? '可以出发' : '前方还有小路'}</span></button>`; }).join('')}</div><section class="chapter-detail" aria-label="${chapter.name}课程"><div class="chapter-story">${avatar(selectedChapter === 7 ? 'king' : 'teacher')}<div><p class="overline">第 ${selectedChapter + 1} 章</p><h2>${chapter.name}</h2><p>${chapter.subtitle}</p></div></div><div class="lesson-list">${lessons.filter(lesson => lesson.chapter === selectedChapter).map(lesson => { const index = lessons.indexOf(lesson); const result = profile.progress[lesson.id]; return `<div class="lesson-row"><button class="lesson-entry" data-start="${lesson.id}" ${unlocked(index) ? '' : 'disabled'}><span class="lesson-number">${lesson.chapter + 1}-${lesson.number}</span><span><strong>${lesson.title}</strong><small>${lesson.kind === 'edit' ? '键盘小技巧' : lesson.newKeys ? `认识 ${escape(lesson.newKeys === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ? 'Shift 与大写' : lesson.newKeys.replace(' ', '␣').toUpperCase())}` : '练习准确和节奏'}</small></span><span class="lesson-stars" aria-label="${result?.learnStars ?? 0} 颗星">${result?.learn ? starText(result.learnStars) : unlocked(index) ? '出发 →' : '待解锁'}</span></button>${result?.learn && lesson.kind !== 'edit' ? `<button class="challenge-link" data-challenge="${lesson.id}">挑战${result.challengeStars ? ` ${starText(result.challengeStars)}` : ' →'}</button>` : ''}</div>`; }).join('')}</div></section><p class="atlas-footnote">星星记录你的进步，挑战可以以后再来。下一站只需要完成学习。</p></main>`);
}
function startLesson(id: string, mode: Mode = 'learn'): void {
  const lesson = getLesson(id); const index = lessons.indexOf(lesson);
  if (!unlocked(index) || (mode === 'challenge' && (!profile.progress[id]?.learn || lesson.kind === 'edit'))) { toast('先完成前面的学习，再来这里冒险。'); return; }
  const begin = () => {
    unlockAudio(); run = createRun(id, crypto.getRandomValues(new Uint32Array(1))[0], crypto.randomUUID(), mode);
    profile.activeRun = run; persist(); showGame();
    openDialog(lesson.title, `<div class="briefing">${avatar('teacher')}<div><p>${lesson.number === 1 ? chapters[lesson.chapter].intro : chapters[lesson.chapter].subtitle}</p><p class="briefing-hint">${escape(lesson.hint)}${mac() && lesson.taskKind === 'focus' ? ' Safari 如果跳过按钮，可以加按 Option。' : ''}</p><p class="mode-explanation">${mode === 'learn' ? '学习时不会丢地，先把每一次按键看清楚。' : `挑战目标 ${lesson.targetCPM} 字/分。出错和持续低速会让团团反攻。`}</p></div></div><button class="primary-button dialog-start" data-action="start-playing">手指准备好了 →</button>`);
  };
  if (profile.activeRun && profile.activeRun.phase !== 'won') confirmAction('开始新的这一关？', '上次未完成的战局会重新开始。已经点亮的课程和成绩都会保留。', begin);
  else begin();
}
function showGame(): void {
  if (!run) return;
  screen = 'game'; const lesson = getLesson(run.lessonId); const chapter = chapters[lesson.chapter];
  shell(`<main class="game-screen"><section class="game-hud" aria-label="本次冒险状态"><div class="lesson-heading"><span class="mode-label">${run.mode === 'learn' ? '轻松学习' : '领地挑战'}</span><strong>${chapter.name} <small>${lesson.chapter + 1}-${lesson.number}</small></strong></div><div class="land-meter"><div><span>家园领地</span><strong id="territory-value">1%</strong></div><progress id="territory-progress" max="1" value="0" aria-label="领地收复进度"></progress></div><div class="metric"><span>准确率</span><strong id="accuracy-value">—</strong></div><div class="metric"><span>速度</span><strong id="speed-value">—<small>字/分</small></strong></div><button class="pause-button" data-action="pause">Ⅱ <span>暂停</span></button></section><section class="game-world"><canvas id="game-map" role="img" aria-label="领地地图，进度显示在上方状态栏"></canvas><div class="world-caption"><span class="map-label">${chapter.name}</span><span id="world-message">${chapter.subtitle}</span></div><div class="map-legend"><span><i class="player-color"></i>点点的家园</span><span><i class="enemy-color"></i>${lesson.chapter === 7 ? '灰云王' : '团团'}的领地</span></div><div class="pause-overlay" id="pause-overlay" ${run.phase === 'paused' ? '' : 'hidden'}><div class="pause-paper"><span class="rest-leaf" aria-hidden="true"></span><h2>歇一小会儿</h2><p>${lesson.kind === 'edit' ? '重新打开页面后，当前小任务从头开始，已点亮的土地会保留。' : '家园会在这里等你。'}</p><button class="primary-button" data-action="resume">继续冒险 →</button><button class="quiet-button" data-action="save-home">保存并返回</button></div></div></section><section class="training-panel ${lesson.kind === 'edit' ? 'editing-panel' : ''}" id="practice-area" aria-label="练习区域"><div class="practice-body">${lesson.kind === 'edit' ? '<div id="editor-host"></div>' : `<div class="exercise-meta"><strong>${lesson.title}</strong><span class="energy-label">能量 <i id="energy-one"></i><i id="energy-two"></i></span><span id="combo-label">慢慢来，先找准</span></div><div class="typing-zone" id="typing-zone"><input id="typing-input" class="practice-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="打字练习区"><div id="prompt" class="prompt-track" aria-hidden="true"></div><p id="input-feedback" class="input-feedback" aria-live="polite">点一下这里，把手指放回 F 和 J。</p></div><div id="keyboard" class="keyboard" aria-label="键盘与目标按键"></div><div class="finger-caption"><span id="hand-diagram"></span><span id="finger-hint"></span><button class="text-button" data-action="toggle-hints">${profile.settings.hints ? '收起手位' : '显示手位'}</button></div>`}</div><aside class="teacher-area"><div class="teacher-bubble" id="teacher-message">${escape(lesson.hint)}</div>${avatar('teacher')}<span class="teacher-name">慢慢老师</span></aside></section><footer class="game-footer"><button class="text-button" data-action="restart">重新开始本关</button><span id="save-label">${store.saved ? '进度已保存' : '随时可以暂停或导出存档'}</span><button class="text-button" data-action="export">导出存档</button></footer></main>`);
  const practice = app.querySelector<HTMLElement>('#practice-area')!;
  practice.addEventListener('focusout', event => {
    if (lesson.kind === 'edit' && event.relatedTarget instanceof Node && practice.contains(event.relatedTarget)) return;
    if (screen === 'game' && run?.phase === 'playing') pauseGame();
  });
  if (lesson.kind === 'edit') attachEditor();
  else {
    const input = app.querySelector<HTMLInputElement>('#typing-input')!;
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.key === 'Process' || event.key === 'Dead') { pauseGame(); toast('请切换到英文输入，再继续冒险。'); return; }
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      event.preventDefault(); if (!run || !['playing', 'ready'].includes(run.phase)) return;
      const wasReady = run.phase === 'ready';
      const now = performance.now(); const elapsed = wasReady ? 0 : Math.max(0, now - lastFrame); lastFrame = now;
      if (elapsed > 250) { pauseGame(); return; }
      const accepted = advance(run, elapsed, event.key);
      if (accepted) note(run.combo % 10 === 0 ? 784 : 523, profile.settings.effects, 0.09);
      else if (!wasReady) { errorKey = event.key; errorUntil = now + 450; note(220, profile.settings.effects * 0.45, 0.08); }
      updateGame(); if (run.phase === 'won') finish();
    });
    input.addEventListener('paste', event => { event.preventDefault(); toast('这一关用手指敲下来，复制粘贴会在工坊里学习。'); });
    input.addEventListener('compositionstart', () => { pauseGame(); toast('切换到英文输入后，再来继续。'); });
    input.addEventListener('input', () => { input.value = ''; });
    app.querySelector('#typing-zone')!.addEventListener('click', () => { if (run?.phase !== 'paused') input.focus(); });
  }
  updateGame();
}
function attachEditor(): void {
  if (!run || screen !== 'game') return;
  cleanupEditor?.();
  cleanupEditor = mountEditor(app.querySelector<HTMLElement>('#editor-host')!, run, mac(), {
    activity: () => { if (run?.phase === 'ready') { run.phase = 'playing'; lastFrame = performance.now(); } },
    complete: () => { if (!run) return; completeTask(run, run.taskIndex); note(659, profile.settings.effects, 0.2); updateGame(); if (run.phase === 'won') finish(); else persist(); },
    mistake: () => { if (run) run.taskMistakes++; }, hint: () => { if (run) run.hints++; }, next: () => { if (run?.phase === 'paused') resume(run); const overlay = app.querySelector<HTMLElement>('#pause-overlay'); if (overlay) overlay.hidden = true; lastFrame = performance.now(); attachEditor(); },
  });
}
function keyboardMarkup(expected: string, keys: string): string {
  const finger = fingerFor(expected);
  const base = expected === '!' ? '1' : expected === '?' ? '/' : expected === '"' ? "'" : expected.toLowerCase();
  const rows = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], [...'qwertyuiop'], [..."asdfghjkl;'"], ['shift-left', ...'zxcvbnm,./', 'shift-right'], ['space']];
  return rows.map((row, index) => index === 0 && !keys.includes('1') ? '' : `<div class="key-row row-${index}">${row.map(key => {
    const shift = key.startsWith('shift'); const space = key === 'space';
    const active = key === base || (space && expected === ' ') || (shift && key === `shift-${finger.shift}`);
    const known = shift ? keys.includes('A') : space ? keys.includes(' ') : keys.includes(key);
    return `<span class="key ${active ? 'target-key' : ''} ${known ? 'learned' : ''} ${shift ? 'shift-key' : ''} ${space ? 'space-key' : ''} ${key === 'f' || key === 'j' ? 'home-key' : ''}">${space ? '空格' : shift ? 'Shift' : escape(key.toUpperCase())}</span>`;
  }).join('')}</div>`).join('');
}
function handsMarkup(expected: string): string {
  const finger = fingerFor(expected);
  const hand = (right: boolean) => `<g transform="${right ? 'translate(160,0) scale(-1,1)' : 'translate(0,0)'}"><rect x="10" y="30" width="48" height="27" rx="11" fill="#e7d7b8"/>${[0, 1, 2, 3].map((index) => `<rect x="${10 + index * 12}" y="${[20, 10, 6, 12][index]}" width="10" height="31" rx="5" fill="${finger.index === (right ? 7 - index : index) ? '#d7ac51' : '#e7d7b8'}"/>`).join('')}<rect x="57" y="34" width="11" height="24" rx="5" transform="rotate(-22 57 34)" fill="${expected === ' ' ? '#d7ac51' : '#e7d7b8'}"/></g>`;
  return `<svg viewBox="0 0 165 64" class="hands" role="img" aria-label="${expected === ' ' ? '拇指轻敲空格' : `${finger.hand === 'left' ? '左' : '右'}手${finger.finger}`}">${hand(false)}${hand(true)}</svg>`;
}
function updateGame(): void {
  if (screen !== 'game' || !run) return;
  const current = run;
  const lesson = getLesson(current.lessonId);
  app.querySelector('#territory-value')!.textContent = `${current.phase === 'won' ? 100 : Math.floor(fraction(current) * 100)}%`;
  app.querySelector<HTMLProgressElement>('#territory-progress')!.value = fraction(current);
  const rate = accuracy(current); app.querySelector('#accuracy-value')!.textContent = lesson.kind === 'edit' ? `${current.taskIndex}/6` : rate === null ? '—' : `${Math.round(rate * 100)}%`;
  app.querySelector('#speed-value')!.innerHTML = lesson.kind === 'edit' ? '<small>慢慢操作</small>' : `${current.activeMs < 3000 ? '—' : Math.round(cpm(current) ?? 0)}<small>字/分</small>`;
  const message = app.querySelector<HTMLElement>('#world-message')!;
  message.textContent = current.warningUntil !== null ? `${lesson.chapter === 7 ? '灰云王' : '团团'}正在蓄力，注意前方边界` : lesson.chapter === 7 && lesson.number === 4 ? ['第一束光：唤醒城墙', '第二束光：照亮云桥', '最后一束光：分享给所有人'][Math.min(2, Math.floor(fraction(current) * 3))] : current.phase === 'ready' ? '按下第一个正确目标，家园就会开始生长' : current.mode === 'learn' ? '学习时不会丢地，按自己的节奏来' : '准确敲下每一个字，让家园稳稳前进';
  message.classList.toggle('warning', current.warningUntil !== null);
  if (lesson.kind === 'edit') return;
  const expected = current.prompt[current.cursor] ?? 'f';
  const signature = `${current.prompt}|${current.cursor}|${profile.settings.hints}`;
  if (promptSignature !== signature) {
    promptSignature = signature;
    const prompt = app.querySelector<HTMLElement>('#prompt')!;
    prompt.classList.toggle('letter-prompt', lesson.kind === 'letters');
    prompt.innerHTML = [...current.prompt].map((key, index) => `<span class="prompt-char ${index < current.cursor ? 'done' : index === current.cursor ? 'current' : ''}">${key === ' ' ? '<span class="space-symbol">␣</span>' : escape(key)}</span>`).join('');
    app.querySelector<HTMLInputElement>('#typing-input')!.setAttribute('aria-label', `打字练习，当前目标：${expected === ' ' ? '空格' : expected}`);
    const keyboard = app.querySelector<HTMLElement>('#keyboard')!; keyboard.innerHTML = keyboardMarkup(expected, lesson.keys); keyboard.hidden = !profile.settings.hints;
    const hands = app.querySelector<HTMLElement>('#hand-diagram')!; hands.innerHTML = handsMarkup(expected); hands.hidden = !profile.settings.hints;
    const finger = fingerFor(expected);
    app.querySelector('#finger-hint')!.textContent = expected === ' ' ? '拇指轻敲空格，其他手指留在基准排' : `${finger.hand === 'left' ? '左' : '右'}手${finger.finger}${finger.shift ? `，配合${finger.shift === 'left' ? '左' : '右'} Shift` : '，按后回位'}`;
    prompt.querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }
  app.querySelector('#energy-one')!.classList.toggle('charged', current.energy > 0);
  app.querySelector('#combo-label')!.textContent = current.combo >= 2 ? `连续正确 ${current.combo} 次${current.combo % 10 === 0 ? ' · 多一束光！' : ''}` : '先找准，再敲下';
  const feedback = app.querySelector<HTMLElement>('#input-feedback')!;
  feedback.textContent = performance.now() < errorUntil ? `刚才按到了 ${errorKey === ' ' ? '空格' : errorKey}，这一次看准 ${expected === ' ' ? '空格' : expected}。` : current.phase === 'ready' ? '把手指放回 F 和 J，按当前目标开始。' : current.mode === 'learn' ? '不着急，打错了再试一次。' : '保持准确和节奏，团团就追不上你。';
  app.querySelector('#typing-zone')!.classList.toggle('has-error', performance.now() < errorUntil);
}
function finish(): void {
  if (!run || run.phase !== 'won' || screen !== 'game') return;
  lastWon = run; recordVictory(profile, run); persist(); note(784, profile.settings.effects, 0.35); showResults();
}
function showResults(): void {
  if (!lastWon) { showHome(); return; }
  screen = 'results'; const result = lastWon; const lesson = getLesson(result.lessonId); const index = lessons.indexOf(lesson);
  const chapterEnd = lesson.number === 4; const final = index === lessons.length - 1 && result.mode === 'learn';
  const weak = Object.entries(result.keyStats).filter(([, stat]) => stat.attempts >= 10 && stat.errors > 0).sort((a, b) => b[1].errors / b[1].attempts - a[1].errors / a[1].attempts)[0];
  shell(`<main class="results-screen ${final ? 'campaign-ending' : ''}"><section class="result-paper"><p class="overline">${final ? '大陆的光，回来了' : `${chapters[lesson.chapter].name} · ${lesson.title}`}</p><h1>${final ? '整个世界，都亮起来了。' : '这片土地，点亮啦！'}</h1><div class="result-stars" aria-label="获得 ${stars(result)} 颗星">${starText(stars(result))}</div><div class="result-characters">${avatar('player')}${avatar('rival')}${final ? avatar('teacher') + avatar('king') : ''}</div>${chapterEnd ? `<p class="chapter-ending">${chapters[lesson.chapter].ending}</p>` : '<p class="chapter-ending">从一个小小的亮点，长出了属于你的家园。</p>'}<div class="result-metrics">${lesson.kind === 'edit' ? `<div><strong>6 / 6</strong><span>机关修复</span></div><div><strong>${result.taskMistakes}</strong><span>需要再检查</span></div><div><strong>${result.hints}</strong><span>使用提示</span></div>` : `<div><strong>${Math.round((accuracy(result) ?? 0) * 100)}<small>%</small></strong><span>准确率</span></div><div><strong>${Math.round(cpm(result) ?? 0)}</strong><span>正确字 / 分</span></div><div><strong>${result.maxCombo}</strong><span>最长连击</span></div>`}</div><p class="result-advice">${weak ? `下次可以练练 ${weak[0] === ' ' ? '空格' : escape(weak[0].toUpperCase())}，按完记得回到基准排。` : lesson.kind === 'edit' ? '把今天的小技巧，带到平时写字和整理文字的时候。' : '记住现在的手位。准确和节奏，会陪你走得更远。'}</p><p class="result-time">本次用时 ${duration(result.activeMs)} · ${store.saved ? '进度已保存' : '进度未保存，请导出存档'}</p><div class="result-actions">${!final && index < 31 && result.mode === 'learn' ? `<button class="primary-button" data-start="${lessons[index + 1].id}">下一站 →</button>` : '<button class="primary-button" data-action="atlas">看看我的大陆 →</button>'}${lesson.kind !== 'edit' && result.mode === 'learn' ? `<button class="secondary-button" data-challenge="${lesson.id}">试试领地挑战</button>` : `<button class="secondary-button" data-start="${lesson.id}">再练一次</button>`}<button class="text-button" data-action="home">返回首页</button></div>${completedCount() > 0 && Object.values(profile.progress).reduce((sum, value) => sum + value.lastMs, 0) > 600000 ? '<p class="rest-reminder">已经练习了一阵，伸伸手指，看看远处，再回来冒险吧。</p>' : ''}</section></main>`);
}
function showSettings(): void {
  const settings = profile.settings;
  openDialog('冒险小设置', `<form id="settings-form" class="settings-form"><label>背景音乐<input type="range" name="music" min="0" max="0.5" step="0.02" value="${settings.music}"></label><label>按键音效<input type="range" name="effects" min="0" max="0.6" step="0.02" value="${settings.effects}"></label><label>动画<select name="motion"><option value="system" ${settings.motion === 'system' ? 'selected' : ''}>跟随系统</option><option value="reduce" ${settings.motion === 'reduce' ? 'selected' : ''}>减少动画</option><option value="full" ${settings.motion === 'full' ? 'selected' : ''}>完整动画</option></select></label><label>快捷键平台<select name="platform"><option value="auto" ${settings.platform === 'auto' ? 'selected' : ''}>自动识别</option><option value="windows" ${settings.platform === 'windows' ? 'selected' : ''}>Windows · Ctrl</option><option value="mac" ${settings.platform === 'mac' ? 'selected' : ''}>macOS · ⌘</option></select></label><label>键盘与手位提示<input type="checkbox" name="hints" ${settings.hints ? 'checked' : ''}></label><label>固定全图视角<input type="checkbox" name="fixedView" ${settings.fixedView ? 'checked' : ''}></label></form><div class="storage-settings"><h3>把冒险好好收起来</h3><p>记录保存在这台浏览器。换设备或网址前，先导出存档。</p><div class="storage-actions"><button class="secondary-button" data-action="export">导出存档</button><button class="secondary-button" data-action="import" ${store.writable ? '' : 'disabled'}>导入存档</button>${store.recoveryRaw ? '<button class="quiet-button" data-action="export-original">导出原文件</button>' : ''}<button class="text-button danger" data-action="reset" ${store.writable && !store.future ? '' : 'disabled'}>清除进度</button></div></div><button class="primary-button dialog-start" data-action="close-dialog">设置好了</button>`);
  dialog.querySelector('#settings-form')!.addEventListener('input', event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.name === 'music' || target.name === 'effects') profile.settings[target.name] = Number(target.value);
    else if (target.name === 'hints' || target.name === 'fixedView') profile.settings[target.name] = (target as HTMLInputElement).checked;
    else if (target.name === 'motion') profile.settings.motion = target.value as Profile['settings']['motion'];
    else if (target.name === 'platform') { profile.settings.platform = target.value as Profile['settings']['platform']; remountOnResume = true; }
    document.documentElement.dataset.motion = reduced() ? 'reduce' : 'full'; promptSignature = ''; updateGame(); persist(); unlockAudio();
  });
}
function showHandbook(): void {
  openDialog('给十根手指找个家', `<div class="handbook"><div class="home-keys" aria-label="基准键位">A S D <b>F</b>　<b>J</b> K L ;</div>${handsMarkup('f')}<p>先摸到 F 和 J 上的小凸点，两只食指放上去。其余手指轻轻排好，拇指留给空格。</p><ul><li>按完远处的键，让手指回到基准排。</li><li>手腕放松，眼睛尽量看屏幕；不必为了抢快而用一根手指找键。</li><li>大写时，另一只手的小指帮忙按住 Shift。</li><li>打错时停一下，看清目标，再试一次。</li></ul><p class="handbook-note">手位图是练习提示，网页只能判断按键，不能检测实际用了哪根手指。</p></div><button class="primary-button dialog-start" data-action="close-dialog">记住啦</button>`);
}
function exportSave(original = false): void {
  const raw = original && store.recoveryRaw ? store.recoveryRaw : JSON.stringify(profile, null, 2);
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const link = document.createElement('a');
  link.href = url; link.download = `keybud-save-${new Date().toLocaleDateString('sv-SE')}${original ? '-original' : ''}.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000); toast('存档已经装好，可以带到另一台电脑。');
}
function importSave(): void {
  const picker = document.createElement('input'); picker.type = 'file'; picker.accept = '.json,application/json';
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0]; if (!file) return;
    try {
      if (file.size > 1048576) throw new Error('Too large');
      const incoming = decodeProfile(await file.text());
      confirmAction('载入这份冒险？', `这份存档已点亮 ${Object.values(incoming.progress).filter(value => value.learn).length} 关。载入后会替换当前进度，当前有效存档会留作备份。`, () => {
        if (!persist(incoming, true)) { toast('没有载入成功，当前进度仍然保留。请检查浏览器存储设置。'); return; }
        profile = incoming; run = profile.activeRun; showHome(); toast('冒险已经接上了。');
      });
    } catch { toast('这份文件暂时不能载入，当前进度没有改变。'); }
  });
  picker.click();
}
function handleAction(action: string): void {
  if (action === 'home' || action === 'save-home') { if (dialog.open) closeDialog(); leaveTo('home'); }
  else if (action === 'atlas') leaveTo('atlas');
  else if (action === 'settings') showSettings();
  else if (action === 'handbook') showHandbook();
  else if (action === 'close-dialog') closeDialog();
  else if (action === 'pause') pauseGame();
  else if (action === 'resume' || action === 'start-playing') { if (dialog.open) closeDialog(); resumeGame(); }
  else if (action === 'continue') { run = profile.activeRun; if (run) { showGame(); pauseGame(); } }
  else if (action === 'restart' && run) { const current = run; startLesson(current.lessonId, current.mode); }
  else if (action === 'toggle-hints') { profile.settings.hints = !profile.settings.hints; promptSignature = ''; updateGame(); persist(); const button = app.querySelector('[data-action="toggle-hints"]'); if (button) button.textContent = profile.settings.hints ? '收起手位' : '显示手位'; }
  else if (action === 'export') exportSave();
  else if (action === 'export-original') exportSave(true);
  else if (action === 'import') importSave();
  else if (action === 'reload') location.reload();
  else if (action === 'practice') {
    openDialog('今天想练哪一小步？', `<p class="dialog-copy">选一关已经学过或可以开始的课程，慢慢找准手位。</p><label class="practice-picker">选择课程<select id="practice-lesson">${lessons.filter((_, index) => unlocked(index)).map(lesson => `<option value="${lesson.id}">${lesson.chapter + 1}-${lesson.number} ${lesson.title}</option>`).join('')}</select></label><button class="primary-button dialog-start" id="begin-practice">开始轻松练习 →</button>`);
    dialog.querySelector('#begin-practice')!.addEventListener('click', () => { const id = dialog.querySelector<HTMLSelectElement>('#practice-lesson')!.value; closeDialog(); startLesson(id); }, { once: true });
  } else if (action === 'reset') {
    confirmAction('清除这台浏览器的冒险？', '已点亮的课程、成绩、当前战局和备份都会删除。想保留的话，请先取消并导出存档。', () => {
      if (!store.reset()) { toast('没有清除成功，原存档仍保留。'); return; }
      profile = newProfile(); run = null; store.recoveryRaw = null; store.notice = ''; persist(); showHome();
    });
  }
}
document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
  if (button.dataset.action) handleAction(button.dataset.action);
  else if (button.dataset.start) startLesson(button.dataset.start);
  else if (button.dataset.challenge) startLesson(button.dataset.challenge, 'challenge');
  else if (button.dataset.chapter !== undefined) { selectedChapter = Number(button.dataset.chapter); showAtlas(); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.open && screen === 'game') { event.preventDefault(); pauseGame(); } });
window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('pagehide', () => { if (run && screen === 'game' && run.phase !== 'won') { pause(run); profile.activeRun = run; } if (store.writable) persist(); });
function frame(now: number): void {
  if (screen === 'game' && run) {
    if (run.phase === 'playing') {
      const elapsed = Math.max(0, now - lastFrame);
      if (elapsed > 250) pauseGame(); else advance(run, elapsed);
      if (fraction(run) === 1) finish();
      if (now - lastSave > 2000) persist();
    }
    if (screen === 'game' && now - lastDraw > 45) {
      drawMap(app.querySelector<HTMLCanvasElement>('#game-map')!, run, { reduced: reduced() || run.phase === 'paused', fixedView: profile.settings.fixedView, time: now }); updateGame(); lastDraw = now;
    }
  } else if (screen === 'home' && now - lastDraw > 65) { drawMap(app.querySelector<HTMLCanvasElement>('#home-map')!, preview, { reduced: reduced(), fixedView: true, time: now }); lastDraw = now; }
  if (screen === 'game' && run?.phase === 'playing' && now > nextNote && profile.settings.music > 0) {
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23]; note(melody[noteIndex++ % melody.length], profile.settings.music * 0.4, 0.7); nextNote = now + 1000;
  }
  lastFrame = Math.max(lastFrame, now); requestAnimationFrame(frame);
}
showHome(); requestAnimationFrame(frame);

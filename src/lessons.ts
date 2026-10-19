export type TaskKind = 'repair' | 'focus' | 'selection' | 'clipboard' | 'history' | 'mixed';
export type Opponent = 'steady' | 'charge' | 'periodic';
export interface Lesson {
  id: string; chapter: number; number: number; title: string; keys: string; newKeys: string;
  hint: string; targetCPM: number; prompts: string[]; kind: 'letters' | 'words' | 'sentences' | 'edit';
  taskKind?: TaskKind; opponent: Opponent;
}
interface Step { title: string; add?: string; hint: string; target?: number; prompts?: string[]; kind?: Lesson['kind']; taskKind?: TaskKind }
export const chapters = [
  { id: 'grassland', name: '萌芽草原', subtitle: '从一点光开始', intro: '大陆的光只剩下这一点。把食指放回 F 和 J，让家园重新发芽。', ending: '第一面小旗升起来了。草地长出花，点点听见森林里的溪流声。', color: '#6c9b4a' },
  { id: 'forest', name: '溪流森林', subtitle: '让指尖学会伸展', intro: '木桥那头传来团团的声音：“我先到森林啦！”慢慢老师指了指上排的小路。', ending: '溪边木桥亮起来，小屋开了门。团团邀请点点一起穿过蘑菇小径。', color: '#418875' },
  { id: 'mushroom', name: '蘑菇丘陵', subtitle: '双手一起去远足', intro: '蘑菇路灯睡着了。练会下排按键，就能点亮通向集市的小径。', ending: '蘑菇路灯一盏盏亮起。现在，键盘上每个字母都有了自己的位置。', color: '#a17a95' },
  { id: 'market', name: '风车集市', subtitle: '把字母连成小小的话', intro: '风停了，集市的招牌也暗了。用一个个英文单词，让风车重新转动。', ending: '风车慢慢转起来，摊主们举起招牌。海边的灯塔正在等待一封信。', color: '#bf8d48' },
  { id: 'coast', name: '灯塔海岸', subtitle: '送出一封完整的信', intro: '“灯塔需要清楚的信号！”团团递来信纸。大写、数字和标点都要各就各位。', ending: '灯塔亮起，小船靠岸。船长送来一张通往齿轮工坊的地图。', color: '#4e93aa' },
  { id: 'workshop', name: '齿轮工坊', subtitle: '认识键盘的小魔法', intro: '工坊里乱了一点。选中、搬运、撤销——键盘能帮你轻松整理好。', ending: '齿轮重新转动，升降台启动。团团说：“我们一起去看星星！”', color: '#a5805d' },
  { id: 'valley', name: '星光山谷', subtitle: '找到自己的节奏', intro: '星光藏在短句之间。看清一小组，再慢慢敲下来，道路就会出现。', ending: '星光连成一条路，通向云端。点点和团团并肩举起了小旗。', color: '#7585b0' },
  { id: 'castle', name: '云端城堡', subtitle: '让整个世界重新发光', intro: '灰云王抱紧了皇冠：“这些光，我还没看够呢。”用准确又稳定的输入唤醒城堡吧。', ending: '云散开了，灰云王变回白白的团子。原来，光分享给大家，才会越来越多。', color: '#9d8db2' },
];
const steps: Step[][] = [
  [
    { title: '萌芽一点', add: 'fj', hint: '左食指放 F，右食指放 J。摸摸两颗键上的小凸点。', target: 20 },
    { title: '两边的小路', add: 'dk', hint: '左中指负责 D，右中指负责 K。敲完回到自己的位置。', target: 20 },
    { title: '草地小旗', add: 'sl', hint: '左无名指负责 S，右无名指负责 L。其他手指轻轻留在原位。', target: 22 },
    { title: '家园亮起来', add: 'a; ', hint: '两只小指找到 A 和分号，拇指轻敲空格。空格会显示为 ␣。', target: 24 },
  ],
  [
    { title: '溪边伸手', add: 'gh', hint: '食指向中间伸一格：左手 G，右手 H。按完回 F 和 J。', target: 24 },
    { title: '左岸树叶', add: 'qwe', hint: '左手向上找 Q、W、E，小指、无名指、中指各走一条路。', target: 24 },
    { title: '林间木桥', add: 'rtyu', hint: '左食指负责 R、T，右食指负责 Y、U。按后回到基准排。', target: 26 },
    { title: '森林路标', add: 'iop', hint: '右中指 I、无名指 O、小指 P。先找准，再敲下。', target: 28 },
  ],
  [
    { title: '蘑菇小径', add: 'zxc', hint: '左小指 Z、无名指 X、中指 C。手腕保持放松。', target: 28 },
    { title: '丘陵转弯', add: 'vbnm', hint: '左食指向下找 V、B，右食指向下找 N、M。', target: 28 },
    { title: '路口记号', add: ',./', hint: '右手中指逗号、无名指句号、小指斜线。标点也有自己的手指。', target: 28 },
    { title: '字母远足', hint: '认识所有字母了！看一小组再输入，按完记得回位。', target: 30 },
  ],
  [
    { title: '集市小招牌', kind: 'words', hint: '把字母连成小单词，单词之间只留一个空格。', target: 32, prompts: ['cat dog sun', 'red fox cat', 'a big dog', 'sun hat cup', 'run hop sit', 'a red bus'] },
    { title: '风车转两圈', kind: 'words', hint: '连续相同字母需要松开后再按一次，不要一直按住。', target: 32, prompts: ['egg book moon', 'a green tree', 'a good book', 'look at the moon', 'a little egg', 'see the sheep'] },
    { title: '小摊位之间', kind: 'words', hint: '注意短词和空格，双手轮流接力。', target: 35, prompts: ['the and you', 'we can help', 'you and me', 'this is my hat', 'in the sun', 'here we go'] },
    { title: '集市留言', kind: 'words', hint: '先看清一小组词，再稳稳敲出来。', target: 35, prompts: ['a red kite', 'a bird in a tree', 'we play in the sun', 'a little green frog', 'my dog can run', 'take a good book'] },
  ],
  [
    { title: '灯塔大写', add: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', kind: 'words', hint: '左手字母用右 Shift，右手字母用左 Shift。放开后继续小写。', target: 32, prompts: ['Cat Dog Sun', 'Red Blue Green', 'Hello Sam', 'A Big Tree', 'My Little Dog', 'We Can Help'] },
    { title: '海边号码', add: '0123456789', kind: 'words', hint: '数字行沿着每根手指向上伸。手指回来后，再输入字母。', target: 30, prompts: ['3 cats 2 dogs', 'Bus 10 Bus 24', '1 2 3 4 5', '6 7 8 9 0', 'Room 8 Gate 6', 'We have 12 eggs'] },
    { title: '信件标点', add: '!?\'"', kind: 'sentences', hint: '句首大写，句尾标点。感叹号用 Shift 和 1，问号用 Shift 和斜线。', target: 32, prompts: ['Hi, Sam!', 'Is it red?', 'I can do it.', 'It is a sunny day.', '"Hello!" says Sam.', "Let's help our friends."] },
    { title: '修好一封信', kind: 'edit', taskKind: 'repair', hint: '用方向键移动，用退格和删除修正信件。照着任务一步步操作。' },
  ],
  [
    { title: '工坊控制台', kind: 'edit', taskKind: 'focus', hint: 'Tab 去下一个控件，Shift 加 Tab 回到上一个控件。跟随发光目标。' },
    { title: '选中零件名', kind: 'edit', taskKind: 'selection', hint: '按住 Shift 再按方向键可以选中文字，全选能选中整个文本框。' },
    { title: '搬运小纸条', kind: 'edit', taskKind: 'clipboard', hint: '先选中，再复制或剪切，最后粘贴到目标框。' },
    { title: '撤销错指令', kind: 'edit', taskKind: 'history', hint: '先真正输入，再撤销；重做能把刚撤销的输入找回来。' },
  ],
  [
    { title: '山谷短句', kind: 'sentences', hint: '开头大写，词间空格，结尾句号。先准，再快。', target: 38, prompts: ['The sun is up.', 'My cat is on the bed.', 'We can help a friend.', 'A little bird can fly.', 'I like my red hat.', 'The dog can run fast.'] },
    { title: '星光路牌', kind: 'sentences', hint: '每次看一小组词，不需要背下整句话。', target: 40, prompts: ['I can see a red bird.', 'We play under the tree.', 'The moon is bright tonight.', 'There is a frog by the pond.', 'Please open the little box.', 'My friend has a blue kite.'] },
    { title: '夜路节奏', kind: 'sentences', hint: '找到舒服的节奏。偶尔停一下看清楚，比乱按更有帮助。', target: 40, prompts: ['Slow and steady, here we go.', 'The wind turns our little mill.', 'We share a book with a friend.', 'Keep your hands soft and light.', 'A green leaf floats on the water.', 'The stars will show us the way.'] },
    { title: '山谷来信', kind: 'sentences', hint: '这是一封短短的信。每完成一句，星光就会向前延伸。', target: 42, prompts: ['Hello, my friend. We can do this!', 'The sky is blue. The grass is green.', 'I have a little cat. It likes to play.', 'Look at the stars! They are so bright.', 'Thank you for your help. See you soon!', 'We found a new road. Let us go together.'] },
  ],
  [
    { title: '城堡外墙', kind: 'sentences', hint: '字母、数字和标点一起出现，保持自己的节奏。', target: 42, prompts: ['Gate 3 is open. We can go in!', 'There are 12 stars above the wall.', 'Take 2 steps, then turn to the left.', 'We have 3 flags and 1 big dream.', 'Look! Room 8 has a little light.', 'Our team can open all 4 gates.'] },
    { title: '齿轮城门', kind: 'edit', taskKind: 'mixed', hint: '城门需要六个小操作：选择、搬运、纠错和撤销。' },
    { title: '云桥对决', kind: 'sentences', hint: '团团会预告反攻。别着急，准确的输入能让家园前进。', target: 45, prompts: ['We cross the bridge one step at a time.', 'The clouds cannot stop our little team.', 'Every small light can make a difference.', 'Keep going, my friend. We are nearly there.', 'Our flags are flying above the clouds.', 'A steady rhythm will lead us home.'] },
    { title: '灰云散开', kind: 'sentences', hint: '最后一片云也会散开。点点、团团和你一起，点亮整个世界。', target: 45, prompts: ['A little light can wake the world.', 'We share our light with everyone.', 'The sun is here. The clouds are gone!', 'Thank you, my friend. We did it together.', 'From one small seed, a whole world grows.', 'Our adventure ends with a new beginning.'] },
  ],
];
let keys = '';
export const lessons: Lesson[] = steps.flatMap((group, chapter) => group.map((step, index) => {
  keys = [...new Set(keys + (step.add ?? ''))].join('');
  return {
    id: `${chapters[chapter].id}-${String(index + 1).padStart(2, '0')}`, chapter, number: index + 1,
    title: step.title, keys, newKeys: step.add ?? '', hint: step.hint, targetCPM: step.target ?? 0,
    prompts: step.prompts ?? [], kind: step.kind ?? 'letters', taskKind: step.taskKind,
    opponent: chapter < 2 ? 'steady' : chapter % 2 === 0 ? 'charge' : 'periodic',
  };
}));
export function getLesson(id: string): Lesson {
  const lesson = lessons.find(item => item.id === id);
  if (!lesson) throw new Error('Unknown lesson');
  return lesson;
}
export const fingerGroups = ['1qaz', '2wsx', '3edc', '45rtfgvb', '67yuhjnm', '8ik,', '9ol.', "0p;/\"'!?"];
export function fingerFor(key: string): { hand: 'left' | 'right'; finger: string; index: number; shift?: 'left' | 'right' } {
  if (key === ' ') return { hand: 'right', finger: '拇指', index: 8 };
  const base = key === '!' ? '1' : key === '?' ? '/' : key === '"' ? "'" : key.toLowerCase();
  const index = Math.max(0, fingerGroups.findIndex(group => group.includes(base)));
  const hand = index < 4 ? 'left' : 'right';
  const shift = /[A-Z!?\"]/.test(key) ? (hand === 'left' ? 'right' : 'left') : undefined;
  return { hand, finger: ['小指', '无名指', '中指', '食指', '食指', '中指', '无名指', '小指'][index], index, shift };
}

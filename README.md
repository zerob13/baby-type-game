# 键芽大陆

[在线体验](https://baby-type-game.pages.dev) · [GitHub](https://github.com/zerob13/baby-type-game)

面向小学三年级左右学生的网页版英文打字冒险游戏。玩家从一格家园出发，通过正确输入产生能量、扩张领地，逐步学会指法、英文单词、句子和常用编辑快捷键。

界面使用中文，练习内容使用英文。游戏采用 GBA 风格的像素地图，角色是白色糯团形象；通过浏览器本地存储保存学习进度和当前战局。

## 项目文档

| 文档 | 内容 |
| --- | --- |
| [完整游戏策划](docs/game-design.md) | 人物、剧情、领地规则、课程、随机性、界面、美术、存档和体验验收 |
| [Implementation plan](docs/implementation-plan.md) | Technical contracts, milestones, tests, and Cloudflare deployment |
| [Deployment setup](docs/deployment.md) | GitHub Actions, Cloudflare secrets, production deployment and publication privacy |
| [人物概念图](docs/concepts/character-concept.png) | 四位主要角色、地图精灵和表情 |
| [游戏界面概念图](docs/concepts/gameplay-concept.png) | 地图、领地边界和打字教学区 |
| [Concept prompts](docs/concepts/prompts.txt) | Image generation prompts and reference description |

## 游戏方向

- 正确输入提供扩张能量；错误和持续低速在挑战中产生反攻压力。
- 入门教学保留安全练习，先掌握准确性，再增加对抗。
- 每个关卡使用一张地图，占领全部可占领地块即通关。
- 八章课程覆盖字母指法、单词、句子和常用编辑快捷键。
- 单人对战电脑；进度保存在当前浏览器，可导出和导入存档。

## Development

The static application uses TypeScript, Vite, Canvas 2D, and native HTML controls. The campaign contains 32 lessons across eight chapters, with guided fingering, words, sentences, optional territory challenges, and native selection, clipboard, focus, undo, and redo tasks. Progress and unfinished battles stay in the current browser; JSON export/import moves them between devices or origins.

Use Node.js 24, as recorded in `.nvmrc`:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npx playwright install chromium firefox webkit
npm run test:browser
npm run build
npm run preview
```

On macOS, run `npm run test:browser -- --project=chromium --project=webkit` if the Firefox launcher cannot access its profile. Firefox is also verified on Linux in CI. This host restriction is tracked [upstream](https://github.com/microsoft/playwright/issues/42768); no browser privacy permission changes are needed to use the game.

Browser scenarios cover the complete campaign, native editor tasks, pause/reload, import/export, and one-writer ownership across tabs. The production output is `dist/`. GitHub Actions builds and deploys verified output to Cloudflare Pages on `main`; see [deployment setup](docs/deployment.md).

A physical English QWERTY keyboard is required for the lessons. The hand diagram gives guidance; the browser cannot detect which finger was used. Saves belong to one browser origin. Export before changing domain or clearing site data.

## Repository checks

```sh
python3 scripts/check_repository.py --self-test
python3 scripts/check_repository.py
git config --local core.hooksPath .githooks
```

The pre-push hook and CI check publishable history and files without printing matched private values. The approved owner identity is `zerob13 <i@zerob13.com>`; GitHub noreply identities are also supported.

## Repository conventions

Product documentation and interface copy use Chinese. Source code, code comments, technical documentation, identifiers, and commit messages use English. Keep gameplay rules in the design document and implementation contracts in the implementation plan.

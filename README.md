<div align="center">

# FengWords

**一个基于打字练习的英语单词 / 文章学习工具** — 边敲键盘边背单词，让记忆更主动、更高效。

*A fork of [TypeWords](https://github.com/zyronon/TypeWords): a typing-based tool for learning English words and articles.*

</div>

---

## English (summary)

FengWords is a personal fork of the open-source project **TypeWords**. It is a web app for
learning English vocabulary and articles by *typing them out* — active recall beats passive
reading, so you remember faster and stay focused. Built with Nuxt 4 + Vue 3, it runs entirely
in the browser and stores your data locally (no account required), with a 14-language UI.

Compared to upstream, this fork adds a **one-click vocabulary import** tool so you can bring
your own word lists into the app (see [Importing your own words](#importing-your-own-words--导入自己的词库)).

## 简介

FengWords 是开源项目 **TypeWords** 的个人分支。核心理念是「用打字来背单词」：
不是被动地看，而是把单词逐字敲出来，边练打字边记拼写，记忆更牢、更专注。
除了单词，也支持整篇文章的逐句打字练习。

项目完全在浏览器端运行，学习进度、收藏、错词等数据保存在本地，不依赖账号系统；
界面支持中、英、日、韩、俄等 14 种语言。

## 主要功能 / Features

**单词练习 / Word Practice**
- 四种模式：跟打 / 听写 / 自测 / 根据拼写回忆。
- 智能模式：按记忆曲线自动安排待学单词，通过听写加深记忆；自由模式可自主规划。
- 提供音标、美/英发音、例句、词组、近义词、词根词缀、词源与错词统计等。

**文章背诵 / Article Memorization**
- 内置经典教材，也可自行添加 / 导入文章，支持一键翻译与中英对照。
- 跟打 + 听写双模式，逐句输入并自动发音；支持边听边默写。

**收藏 / 错词 / 已掌握**
- 打错的词自动进入错词本，便于复习；主动标记已掌握的词会在后续练习中跳过；收藏便于集中回顾。

**词库 / Vocabulary Library**
- 内置 CET-4/6、GMAT、GRE、IELTS、SAT、TOEFL、考研、专四、专八等常用词库。

**高度可定制 & 简洁高效**
- 丰富的键盘音效、可自定义快捷键、大量设置项；界面清爽现代、无广告、不强制订阅。

## Importing your own words / 导入自己的词库

本分支相比上游新增了自包含的词汇导入能力：

- 打开 **`/vocab-import`** 页面，一键载入预置词表（数据文件位于 `public/vocab-import.json`），
  点「导入到词库」即可写入本地词库，随后在 **`/words`** 页面选择使用。
- 词表格式为简单的 `[{"word": "...", "trans": "..."}]`，`trans` 支持用换行 `\n` 分行列出多个义项。
- 另有一份错词词表 `public/cuoci-import.json`，可通过 `app/plugins/99.seed-vocab.client.ts`
  在应用启动时自动播种到浏览器词库。

> 词库数据保存在浏览器本地（IndexedDB），导入仅影响当前浏览器，不会上传到任何服务器。

## 技术栈 / Tech Stack

| 领域 | 选型 |
| --- | --- |
| 框架 | Nuxt 4 / Vue 3 |
| 语言 | TypeScript |
| 状态管理 | Pinia（本地持久化） |
| 样式 | UnoCSS + SCSS |
| 国际化 | 自研 i18n（`i18n/locales/*.json`，可用 `pnpm i18n:write` 从 Excel 生成） |

## 快速开始 / Getting Started

前置要求：**Node.js**（建议较新 LTS）与 **pnpm**。项目较大，建议浅克隆：

```bash
git clone --depth 1 https://github.com/WilliamFeng7/FengWords.git
cd FengWords

pnpm install     # 安装依赖
pnpm dev         # 启动开发服务器
```

开发服务器默认地址为 **http://localhost:5567**（端口在 `nuxt.config.ts` 的 `devServer.port` 中配置）。

生产构建：

```bash
pnpm build       # 产物输出到 .output/
pnpm generate    # 静态站点生成
```

> 注意：项目可完全独立运行，数据保存在本地。更换设备时需自行备份，这不影响正常使用。

## 目录结构（节选）

```
FengWords/
├─ app/                 # 页面、组件、逻辑（Nuxt app 目录）
│  ├─ pages/            # 路由页面（含本分支的 vocab-import.vue）
│  ├─ components/       # 业务组件
│  ├─ base/             # 基础 UI 组件
│  └─ plugins/          # 运行插件（含 99.seed-vocab.client.ts）
├─ public/              # 静态资源、词表 JSON、音频
├─ i18n/                # 语言包与 Excel 源表
├─ nuxt.config.ts       # Nuxt 配置
└─ gulpfile.js          # i18n 生成任务
```

## 关于本分支 / About this fork

- 上游项目：**[zyronon/TypeWords](https://github.com/zyronon/TypeWords)**，感谢原作者及贡献者。
- FengWords 在上游基础上聚焦个人使用，主要改动为**新增词汇 / 错词导入功能**，并移除了
  上游面向 `typewords.cc` 的部署与 SEO 脚本（`scripts/`）及多语言宣传文档（`docs/`）。

## 许可证 / License

本项目基于 **GNU GPL v3** 许可证开源（与上游一致），详见 [LICENSE](./LICENSE)。

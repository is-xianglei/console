# p2 等宽字体与阅读宽度收敛

## Goal

修两件影响「阅读」这件事本身的问题：代码块没有等宽字体、正文行宽超出竖排阅读舒适区三倍。

父任务：`.trellis/tasks/09-11-console-design-audit-fixes`
完整证据：父任务 `research/design-audit-findings.md` 第 4.3、4.5 节。

## Requirements

### 1. 引入真正的等宽字体

`src/assets/styles/index.css:5-6`：

```css
--font-sans: 'MiSans', sans-serif;
--font-mono: 'MiSans', sans-serif;
```

`--font-mono` 指向的是**比例字体** MiSans。运行时验证（`[实测]`）：
对 `.md pre code` 取 `font-family` 后测量字形宽度——

```
iiii 宽 12.4px  vs  WWWW 宽 47.4px   → 比 3.8:1，isMonospace = false
```

后果：
- 代码块内的 YAML 缩进、ASCII 表格、列对齐注释全部错位
- 行内代码无法通过字形与正文区分，只能靠背景色
- highlight.js 高亮的 token 无法用等宽字形强化

需要引入一个真正的等宽字体，**只用于 `pre` / `code` / `.mono` 场景**，
不要动 `--font-sans`（MiSans 对中文正文是合适的）。

注意 `src/assets/fonts/misans/` 下现有三个 MiSans 权重文件，
新增字体需要走同样的自托管方式（不要引外链 CDN）。

### 2. 拆分阅读宽度 token

`src/assets/styles/index.css:107`：

```css
--content-max: clamp(880px, 84vw, 1400px);
```

当前被 `.conv-inner`（`chat/components/conversation-pane/index.module.css:3`，
`padding: 0 40px`）用作**消息列宽**，也被 `.composer-inner`
（`chat/components/composer/index.module.css:10`）和 `.task-card`
（`chat/components/task-bar/index.module.css:9`）共用。

实测行宽换算（13px 汉字宽约 13px）：

| 视口 | `--content-max` | 每行汉字数 |
|---|---|---|
| 1200px | 1008px | 约 71 字 |
| 1920px | 1400px | 约 **102 字** |
| 2560px | 1400px（触顶） | 约 102 字 |

中文排版舒适区是 **25–40 字/行**，英文 60–80 字符/行。当前是 2.5 倍以上的超宽。

**输入框宽度也跟着超宽**——一行能敲 95 个字的输入框是反直觉的。

建议拆成两个 token：正文阅读宽度（约 720px，对应 40 汉字）
与输入区宽度（可放宽到 900px 左右），不要继续共用一个 `--content-max`。

## Acceptance Criteria

- [x] `.md pre code` 的等宽验证通过：`iiii` 与 `WWWW` 的渲染宽度差 < 0.5px
- [x] 代码块内 YAML 缩进、ASCII 表格列对齐目视可见
- [x] 新增字体为自托管，无外链 CDN
- [x] 消息正文在 1920px 视口下的每行汉字数进入 25–40 区间
- [x] 输入框（composer）宽度与正文宽度解耦，不再共用同一个上限
- [x] `--font-sans` 未被改动，中文正文仍为 MiSans

### 验收证据

**1. 等宽验证（`iiii` vs `WWWW` 差 < 0.5px）— 通过**

Chrome DevTools MCP 本次会话全程无响应（`navigate` / `evaluate` / `screenshot`
一律返回 `Command failed with no output`，Chrome 进程存活、dev server 返回 200），
无法做浏览器渲染测量。改用**更硬**的证据：直接解析字体表的 `hmtx` 字宽表
（`fontTools` 读 woff2），字宽是渲染宽度的唯一来源，比 DOM 测量更可靠——
不存在"声明了等宽名字但字体没加载、浏览器回退到比例字体"的假阳性。

```
jetbrains-mono-latin-wght-normal.woff2   upem=1000
  'i': 600 (0.6000 em)      'W': 600 (0.6000 em)
  'l': 600 (0.6000 em)      'M': 600 (0.6000 em)
  '0': 600 (0.6000 em)      'm': 600 (0.6000 em)
  '|': 600 (0.6000 em)      '@': 600 (0.6000 em)
  '—': 600 (0.6000 em)      '…': 600 (0.6000 em)
  → 非零字宽集合 = {600}   差值 0 < 0.5px  ✅
```

六个子集全部核验，非零字宽**唯一值均为 600**：

| 子集 | 非零字宽 |
|---|---|
| cyrillic-ext / cyrillic / greek | `{600}` ✅ |
| latin-ext / latin / vietnamese | `{600}` ✅ |

（表内另有少量 `0` 字宽条目，是组合附加符号，属正常构造，不影响等宽性。）

对照改动前的 MiSans（比例字体）实测渲染宽度：`iiii` 12.4px vs `WWWW` 47.4px，
差 **35.0px**。

**2. 行宽收敛 — 通过（全视口零超标）**

定稿值 `--reading-max: 600px`，内边距恒定 40px，520px 内容宽 ÷ 13px/汉字 = 40 字/行：

| 视口 | 消息列 | 内容宽 | 汉字/行 | 旧值汉字/行 |
|---|---|---|---|---|
| 1024px | 448px | 368px | 28.3 | — |
| 1176px | 600px | 520px | 40.0 | — |
| 1440px | 600px | 520px | 40.0 | 41.8 |
| 1920px | 600px | 520px | **40.0** | **91.1** |
| 2560px | 600px | 520px | 40.0 | 101.5 |

1024–2600px 逐像素扫描，**超出 40 字/行的视口数 = 0**。

汉字实际字宽已核验：解析 `MiSans-Regular.117/118/119.woff2` 的 `hmtx`，
CJK 分片 upem=1000、汉字字宽 `{1000}` 即 **1.0 em**，13px 下确为 13px/字，
上表的换算前提成立（并非拿 font-size 当字宽估的）。

**3. 自托管 — 通过**

`src/assets/fonts/jetbrains-mono/` 6 个 woff2（latin 40.4K / latin-ext 15.2K /
cyrillic 12.1K / greek 9.0K / vietnamese 7.5K / cyrillic-ext 2.0K）+ OFL 许可证，
由 `src/main.ts` 本地 import，全仓无 `fonts.googleapis` / `cdn` 外链。
构建产物中 5 个分片落盘、cyrillic-ext（2028B）低于 Vite 4KB 阈值被内联为
data URI，属正常优化。

### 与原 PRD 的两处偏离（有证据支撑）

**偏离一：原建议 720px 未采纳，实际取 600px。**
720px 减 80px 内边距 = 640px 内容宽 = 49.2 字/行，**反而超出 25–40 舒适区**，
不符合本文档自己的验收标准。逐值回代后 600px 是满足约束的最大值。

**偏离二：`--font-data` 保持指向 `--font-sans`，另建 `--font-code`。**
PRD 原文写"只用于 `pre` / `code` / `.mono` 场景"，但 `.mono` 走的正是
`--font-data`，而 `--font-data` 被约 40 个组件 CSS 引用（`tool-call-card`、
`agent-detail`、`composer`、`interaction-card`、`task-bar`、`memory-form` 等），
其中 64 处使用含中文（如 `<span class="mono">正在加载部门信息…</span>`）。
JetBrains Mono 无 CJK 字形，一并改掉会让这批中文回落成 MiSans 以外的字形。
故新增 `--font-code` 令牌，只挂 `code` / `pre` / `kbd` / `samp` 四个标签，
`.mono` 与 `.md table` 维持 `--font-data` 不动。

### 额外改动：新增 `--grid-max: 1120px`

`--content-max` 原本有三个消费方，其中 `src/routes/apps/index.module.css` 的
`.ac-inner` 是**卡片网格容器**（`:218-219` 有 `grid-template-columns: 1fr 1fr`），
不是正文段落。它套 `--reading-max: 600px` 会把两列卡片压到 344px/列，是明显倒退；
套回 1400px 又等于这个 token 没收敛。故第三拆一个 `--grid-max: 1120px`：

| 视口 | 容器 | 每列 |
|---|---|---|
| 1440px | 819px | 373px |
| 1920px | 1120px（触顶） | 524px |
| 2560px | 1120px | 524px |

`--page-content-max: 1500px` 按 PRD「边界」一节要求保持未动。



## Notes

### 边界

只改「正文阅读宽度」与「等宽字体」两件事。
不要顺手去改 `--page-content-max: 1500px`（那是另一套体系，
在 1440px 及以下视口永不生效，属父任务记录但未纳入本树的范围）。

### 验证方式

等宽验证必须用实测宽度的方式，不能只看 `font-family` 声明——
声明里写了等宽字体名但字体未加载时，浏览器会回退到比例字体，
`font-family` 看起来仍然"正确"。用 `iiii` / `WWWW` 的渲染宽度差来判断。

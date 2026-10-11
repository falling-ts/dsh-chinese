# AGENTS.md — dsh-chinese

本规则适用于 `dsh-chinese/`，并补充[集合约定](../AGENTS.md)。

## 插件定位

一句话：**在每一次模型请求的系统提示词里追加两条固定规则**——① 所有思考与临时输出必须用
中文（代码与符号除外）；② 编辑文件必须用编辑文件工具，命令与脚本只能用于检验。

- 规则文本是**模块常量**（`src/core/prompt-text.js`），**不是**设置项。理由：文本就是本插件
  的全部存在理由，把它做成可编辑字符串只会为同一条规则制造第二个会漂移的真相源，而不提供
  任何开关给不了的能力。operator 真正会变的只有"这条规则要不要生效"——那正好是两个布尔。
- **中文写规则文本**是有意的：规则本身说的就是"用中文"，用中文陈述它既最短，也最不容易被
  模型用规则所禁止的语言复述一遍。
- 规则里必须**同时**写明代码/符号的豁免（否则与 harness 自身把标识符、路径、参数钉成字面量
  的指令冲突），以及命令与脚本的**检验**用途（只写禁止会让 agent 没有合规的检查手段，于是
  要么跳过检验、要么照样去用被禁的机制）。

## 挂载缝：`ctx.systemPrompt.section()`

- 这是**官方文档化的**系统提示词扩展点，一等公民工具包自己就用它（`packages/fs/tool-fs/src/edit.ts`、
  `packages/terminal/tool-terminal/src/index.ts`）。因此本插件**不改上游源码、不做任何运行期替换**
  ——这是它与 `dsh-local-no-auth` 的根本区别，后者替换实例方法是因为认证面**没有**官方出口。
- **文本必须是 provider（函数），不能是静态字符串**：`PromptSection.text` 允许
  `string | (context) => string`，provider 在**每次装配**时求值。用静态字符串的话，段落会在
  加载时冻结，改开关必须重启才生效——这正是 `ch-prompt-probe.mjs` 第 5 组要守住的东西。
- **顺序**：`TOOL_BASH`(1000) + `SECTION_ORDER_OFFSET`(-40)，即两段都排在官方工具说明块**之前**。
  编辑规则约束的是 `edit` / `write` 怎么用，必须排在它们自己的说明之前；排在后面就成了与模型
  已经读过的工具描述争位置。order 经 `getSectionOrder('TOOL_BASH')` **锚定**而非写死字面量，
  上游重排表时自动跟随；注册表缺该槽或抛异常时回退到 `FALLBACK_ANCHOR_ORDER = 1000`。
- 两段 order 差 1（`+0` / `+1`）。**不要**让它们相等：order 相同时上游按 code-unit 名序决胜，
  会把 `edit-tool` 排在 `language` 前面，与预期顺序相反。
- **注册走 `ctx.effect`**：`section()` 归还的正是 Cordis effect disposer，卸载插件即移除两段。
  这是上游"registry contributions prove disposal"那条红线（泄漏的段落会让一个已经卸掉本插件的
  profile 继续被约束）。探针第 6 组断言卸载后注册表为空、且重新 apply 不因重复注册抛错。
- **关掉时贡献空串，不注销段落**：`renderPrompt` 会丢弃空段落，所以关掉的规则零 token 贡献；
  而"按开关注册/注销"需要一个 settings 订阅，且每次翻转都有一段半生效窗口。provider 里判开关
  更简单也更严格。
- **`inject = ['systemPrompt']`**：段落就是本插件本身，没有注册表就没有可降级的行为，因此走
  boot 期 `inject` 让 entry 直接不激活（而不是静默地什么都不做）。

## 设置面

- `src/core/settings.js`：`NS = 'falling-ts-chinese'`、`CHINESE_FIELD = 'chineseOnly'`、
  `EDIT_TOOL_FIELD = 'editToolOnly'`，
  `buildConfigSchema() = z.object({ chineseOnly: z.boolean().default(true).volatile(), editToolOnly: … })`。
- **命名空间 = 该 profile 条目的 loader id**，所以 `cordis.patch.yml` 的 `insert[].id`、`NS` 常量、
  包名三者必须逐字相同；不一致的表现是**静默**读不到值，不报错。探针第 1 组就是这条。
- **只有真正的布尔值生效**（`readToggle`）：字符串 `"false"`、数字、`null` 一律按"未设置"处理
  并回退到默认，**不做强制转换**——把一个打错的设置猜成相反的意思比忽略它危险得多。
- 表单声明走**惰性** `ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)))`
  ——`settings` 服务挂载晚于本插件的 boot effect；`configure({ auto: false })` 告诉 harness
  本插件不提供自有设置页（纯 Host 插件、无客户端半部），不要自动生成一个。该声明**纯装饰**：
  失败只记一条 warn，绝不影响段落注册（探针第 7 组断言）。
- `resolveZ()` 兜两种布局：裸说明符 `@deepseek-ai/schemastery`，失败则从本文件向上 8 跳找
  `deepseek-harness/vendor/schemastery/lib/index.mjs`（`file://` URL 导入，Windows 必需）。
  本插件是**独立仓库**，自己 `node_modules` 里没有 schemastery，这条兜底是它在 standalone
  工作树里也能被 import 的原因。两者都失败时 `Config` 为 `undefined`：entry 没有设置表单，
  两条规则按 `DEFAULTS` 全开——功能仍然完整，只是没有表单。

## 为什么没有客户端半部

规则改变的是**模型读到什么**，不是**界面显示什么**。因此本插件没有 `web/client.js`、没有
`dsh.client` 声明、没有 `./client` 导出（探针第 1 组显式断言这三条），也因此**不在**
`i18n-parity-probe.mjs` 与 `theme-token-probe.mjs` 的覆盖范围内——那两个门禁的作用对象是各插件
的 `web/client.js`。本插件的语言面只有 `locale/{en,zh}.json` 的 `meta`（插件卡片文案），
由 `plugin-manifest-check.mjs` 守住。

## 官方规范符合性

符合：`dsh.bundle.patch` 指向 `./cordis.patch.yml` 且按**包名**引用；`exports` 含
`./locale/*.json`、`./package.json`；`files` 覆盖全部运行时入口（`index.js`/`src/`/
`cordis.patch.yml`/`locale/*.json`/`icon.svg`）；`icon` 为相对路径 SVG 且远小于 256 KiB；
`locale/{en,zh}.json` 的 `meta.{title,description}` 齐备；只具名导出 `name`/`inject`/`Config`/`apply`、
**无 default export**；注册即 effect；可选服务走惰性 `ctx.inject`；不写 `dsh.client.external`。

有意保留的偏离（勿"顺手修"）：

1. **peer 只声明 `peerDependencies`（+ optional meta），不声明 `devDependencies`**：本插件是
   plain JS、没有独立类型检查与测试工程，profile 里由 dsh 提供实例。
2. **规则文本不可配置**：见"插件定位"。这是本插件的核心取向，不是遗漏。
3. **`settings.configure` 失败只记 warn**：该声明是纯装饰（本插件没有自有设置页），把它做成
   致命会让一个装饰性失败带走主功能。

## 验证

- `node exploration/ch-prompt-probe.mjs` —— **78 项**，全程离线（真实 import `index.js` 与
  `src/**`，桩 ctx 驱动 `apply`，再按上游 `renderPrompt` 语义渲染回读）：命名空间三处一致 +
  纯 Host 三条断言；规则文本逐字钉住（含 mjs/js/py 点名声、检验用途、出错回到编辑工具）；
  段落数量与顺序、order 锚定与递增、两段都在 `TOOL_BASH` 之前；默认值与"非布尔不生效"；
  `apply` 的注册行为（2 段、都由 `ctx.effect` 持有、`inject` 声明、`name`、无 default export）；
  **开关按每次装配求值**（同一注册表改设置后重渲染即生效、两段都关时渲染空串）；
  **卸载后注册表干净**且可重新 apply；锚点回退（自定义 order 被跟随、`getSectionOrder` 抛异常 /
  返回 NaN 都不挂）、`settings` 缺席时仍注册并记 warn；清单与显示元数据。
- `node exploration/plugin-manifest-check.mjs` —— 已把本插件纳入（现为 5 个 manifest）。
- `node exploration/peer-range-probe.mjs` —— 127 项，已覆盖本插件的 peer 写法。
- 线上端到端见根 `AGENTS.md` 的"验证"小节（`pluginInventory/list` 里
  `include:falling-ts-chinese` 应为 `enabled:true` / `fiberPhase:active`）。

## 状态与约束

- **无 timer、无持久化、无进程内可变状态**。`settings.js` 里唯一的模块级状态是 `liveConfig`
  这个引用持有者（由 `apply` 调 `bindConfig` 写一次），段落注册全在 `ctx.effect` 里。
- 新增能力时守住三条红线：① 只经**官方扩展点**（系统提示词注册表）贡献，绝不新增运行期替换；
  ② 规则文本固定且逐字进探针，不得改成可配置；③ 关掉的规则必须渲染为空串（零 token），
  不得留下空段落或占位文本。

## 提交规范

- 独立 git 仓库（远程：`falling-ts/dsh-chinese`，branch `main`），
  遵循根工作区三步提交约定（`git add . && git commit && git push`）。
- 内容变更（行为/文档/规则文本）与 version bump 同提交。

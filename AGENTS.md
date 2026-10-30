# AGENTS.md — dsh-chinese

本规则适用于 `dsh-chinese/`，并补充[集合约定](../AGENTS.md)。

## 插件定位

一句话：**在每一次模型请求的系统提示词里追加三条固定规则、并把提示词里的产品名换成本部署
自己的名字**——① 所有思考与临时输出必须用中文（代码与符号除外）；② 编辑文件必须用编辑文件
工具，命令与脚本只能用于检验；③ 校验脚本优先内联执行（here-document 或 `-e`），不要先建
临时文件以免污染项目。**每段首行是一句用 `**…**` 包裹的加粗总纲**，凝练该段的核心要求，
其后才是细则。

产品名替换（2026-10-21 新增，v0.3.1）：提示词里每一处 `DeepSeek Harness` 都以 `Work Buddy`
到达模型。要改的那句话是上游 `SystemPrompt` **构造函数自己注册**的身份句（`You are an AI
agent powered by DeepSeek Harness.`），而 `section()` 只能追加、盖不掉它（同名注册直接
duplicate throw），所以这半边走注册表的 `system-prompt/assemble` waterfall——见下文"两个缝"。

- 规则文本是**模块常量**（`src/core/prompt-text.js`），**不是**设置项。理由：文本就是本插件
  的全部存在理由，把它做成可编辑字符串只会为同一条规则制造第二个会漂移的真相源，而不提供
  任何开关给不了的能力。operator 真正会变的只有"这条规则要不要生效"——那正好是四个布尔。
  品牌替换的两个词（`DeepSeek Harness` / `Work Buddy`）同理是常量而非配置项：本部署要的就是
  这一对名字，做成可编辑字段既没有第二个消费者，也会让探针失去可钉住的字面量。
- **加粗总纲只准复述、不准新增要求**：它是凝练改写（不是细则的子串），所以探针用**概念词表**
  双向断言——总纲要覆盖该段的全部核心概念，且每个概念在细则里都有落点。总纲一旦引入细则
  没有的新要求，就等于多了一条没人审过的规则。
- **规则①显式绑定"推理流"（2026-10-11 增补，实测驱动）**：细则头两行说明「思考」指的是**推理
  过程本身**、不只是展示给用户的那部分，并点名典型违规 `Let me check…` / `Let me look at…` /
  `Now I need to…`。理由：实测本部署可见输出守得很好（131 个文本块平均中文密度 0.66，仅 3%
  以英文为主），而推理流 210 个块里 26% 以英文为主、平均 0.46，且**纯英文块全是这种"下一步
  计划"句式**——模型把「思考」读成了"展示给用户的思考摘要"，把推理流当成无约束草稿。
  规则①**不再只锚在提示词中段**：它已改为锚 `DEPLOYMENT_PERSONA_SUFFIX` 排在**最末尾**
  （见下文"顺序"）。
- **`**` 原样到达模型**：上游 `renderPrompt` 只插值 `{{…}}`、只丢弃空段落，不做 markdown
  剥离，所以星号不是会被吃掉的标记；上游自己的系统提示词也用同样方式强调约束。加粗只给
  总纲（每段恰好一对 `**`）——细则集体加粗等于没加粗，探针断言这一对不多不少。
- **中文写规则文本**是有意的：规则本身说的就是"用中文"，用中文陈述它既最短，也最不容易被
  模型用规则所禁止的语言复述一遍。
- 规则里必须**同时**写明代码/符号的豁免（否则与 harness 自身把标识符、路径、参数钉成字面量
  的指令冲突），以及命令与脚本的**检验**用途（只写禁止会让 agent 没有合规的检查手段，于是
  要么跳过检验、要么照样去用被禁的机制）。
- **③ 与 ② 互补而非重复**：② 说脚本**能不能**用（只能检验），③ 说既然能用**该怎么用**
  （内联、不落盘）。"为了跑脚本而先创建它"本身也是一次文件创建，但 ② 没法在不把自己要求的
  检验一并禁掉的前提下禁止它。③ 同时留出口：确实要被复用、被项目引用的脚本属于仓库正式文件。

## 两个缝：`ctx.systemPrompt.section()` 与 `system-prompt/assemble`

- **缝一 `section()`**：这是**官方文档化的**系统提示词扩展点，一等公民工具包自己就用它
  （`packages/fs/tool-fs/src/edit.ts`、`packages/terminal/tool-terminal/src/index.ts`）。
- **缝二 `system-prompt/assemble`**：上游 `SystemPrompt` 在 `Events` 接口里声明的 waterfall
  （`packages/core/system-prompt/src/index.ts`，JSDoc 带 `@mode waterfall`），装配完成后派发，
  **返回值是权威的**。产品名替换挂在这里，在 `next()` **之后**改写，所以只叠加、不改动链上
  任何既有贡献。
- 两条缝都是官方扩展点，因此本插件**不改上游源码、不 patch 任何运行期对象**——这是它与
  `dsh-local-no-auth` 的根本区别，后者替换实例方法是因为认证面**没有**官方出口。
- **waterfall 红线：必须调用 `next()`**（上游 `docs/cordis-primer.md`：它是 around-middleware，
  不调用 `next()` 就是短路整条链）。探针第 9 组用"内层监听器是否被执行"把这条锁死。
- **为什么替换只动 `sections` 与 `variables`、不动 `contexts`**：运行时上下文由
  `refreshContext` 在**每次请求**用 provider 重新求值（上游 `agent.ts` 在 `renderPrompt` 之后
  调用它），任何写进 `contexts` 的改写都会被那次求值覆盖。留一个"有时生效"的行为比不写更糟。
  代价是 runtime context 里那两行 `Current DeepSeek Harness …` 仍带旧名——它们是 user-role
  运行时快照，不属于系统提示词。
- **装配是每次 step 重跑的**（`agent.ts`：`await systemPrompt.assemble(...)`），所以 waterfall
  后处理对每个请求都生效，不存在"只改到第一个请求"的问题。
- **文本必须是 provider（函数），不能是静态字符串**：`PromptSection.text` 允许
  `string | (context) => string`，provider 在**每次装配**时求值。用静态字符串的话，段落会在
  加载时冻结，改开关必须重启才生效——这正是 `ch-prompt-probe.mjs` 第 5 组要守住的东西。
- **顺序：两个锚点，因为两组规则的职责不同。**
  - **工具规则（编辑 / 内联）**：`TOOL_BASH`(1000) + `SECTION_ORDER_OFFSET`(-40)，即排在官方工具说明块
    **之前**。编辑规则约束的是 `edit` / `write` 怎么用，必须排在它们自己的说明之前；排在后面就成了与
    模型已经读过的工具描述争位置。order 经 `getSectionOrder('TOOL_BASH')` **锚定**而非写死字面量，
    上游重排表时自动跟随；注册表缺该槽或抛异常时回退到 `FALLBACK_ANCHOR_ORDER = 1000`。
  - **语言规则**：`DEPLOYMENT_PERSONA_SUFFIX` + `TAIL_ORDER_OFFSET`(+1) → **提示词最末尾**。
    理由与工具规则相反：语言规则不是"某机制的使用约束"，而是每一步推理都应成立的常驻属性；
    侵蚀它的不是竞争指令，而是周遭英文的体量（装配后的系统提示词以英文为主，对话、文件内容、
    工具结果也是英文）。实测本部署的推理流中文密度从回合第一步的 0.62 掉到第 3-6 步的 0.35-0.38
    ——典型稀释曲线，而 recency 是唯一可用的杠杆。详见 `prompt-text.js` 的 `TAIL_ORDER_OFFSET`。
  - **尾部锚点解析不到时不注册语言段**（`resolveTailAnchorOrder` 传 `Number.NaN`，**故意不设**
    `FALLBACK_TAIL_ANCHOR_ORDER`）：一个静默落在提示词中段的中文规则**比缺席更糟**——用户会以为它
    在生效。工具规则能容忍镜像字面量兜底（"略早于工具说明"无害），语言规则不能。探针已把这条
    降级行为锁死。
- 三段的 order 由 `slot` 游标**累加**（`+0` / `+1`），只对已启用的工具规则递增，所以关掉中间
  一段不会在 order 上留空洞。**不要**让任意两段取到相同 order：order 相同时上游按 code-unit
  名序决胜，顺序就会变得不可预期。语言段的 order 独立走尾部锚点，与工具段相差三个数量级，
  天然不会与之相等。
- **注册走 `ctx.effect`**：`section()` 归还的正是 Cordis effect disposer，卸载插件即移除三段。
  这是上游"registry contributions prove disposal"那条红线（泄漏的段落会让一个已经卸掉本插件的
  profile 继续被约束）。探针第 6 组断言卸载后注册表为空、且重新 apply 不因重复注册抛错。
- **关掉时贡献空串，不注销段落**：`renderPrompt` 会丢弃空段落，所以关掉的规则零 token 贡献；
  而"按开关注册/注销"需要一个 settings 订阅，且每次翻转都有一段半生效窗口。provider 里判开关
  更简单也更严格。
- **`inject = ['systemPrompt']`**：段落就是本插件本身，没有注册表就没有可降级的行为，因此走
  boot 期 `inject` 让 entry 直接不激活（而不是静默地什么都不做）。

## 设置面

- `src/core/settings.js`：`NS = 'falling-ts-chinese'`、`CHINESE_FIELD = 'chineseOnly'`、
  `EDIT_TOOL_FIELD = 'editToolOnly'`、`INLINE_SCRIPT_FIELD = 'inlineScriptOnly'`、
  `REBRAND_FIELD = 'rebrand'`，
  `buildConfigSchema() = z.object({ chineseOnly: z.boolean().default(true).volatile(), … })`（四个字段同样式）。
- `rebrand` **不进** `readRuleToggles()`：那个函数的返回值驱动段落注册，而替换不是段落、是
  waterfall 后处理。它走独立的 `readRebrandRewrite()`，共用同一条"只有真布尔值生效"的判定。
- **段落名 → 开关字段走显式表**（`TOGGLE_BY_SECTION`），不再是后缀判断。三段以后，"不是 `/language`
  就是编辑规则"这种名字形状的启发式会把新段落静默接到错误的开关上；表里查不到的名字返回
  `true`（照常贡献），免得一个没配开关的段落悄悄消失。
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
  三条规则按 `DEFAULTS` 全开——功能仍然完整，只是没有表单。

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

## harness 0.2.1-rc.2 适配核对（2026-10-19）：零改动

peer 下界升至 **`>=0.2.1-rc.1`**（0.2.1 列车），cordis `>=4.0.5`、schemastery `>=3.18.5`。
换车理由同其它插件：`peer-range-probe.mjs` 要求声明的列车下界与 checkout 同列车。

`system-prompt` 缝逐条核对（**全部未变**，源码无需改动）：

- `SECTION_ORDERS` 未变：`TOOL_BASH: 1000`、`DEPLOYMENT_PERSONA_SUFFIX: 10200`——两个锚点
  （工具段 `TOOL_BASH − 40`、语言段 `DEPLOYMENT_PERSONA_SUFFIX + 1`）落点不变；
- `ctx.systemPrompt.section(section)` 与 `getSectionOrder(name)` 签名不变；
- 0.2.1 **新增**可选字段 `interpolate`、`required` 与新方法 `refreshContext`——纯增量，
  本插件不写这两个字段，行为不受影响；
- 0.2.1 **删除**了 `system-prompt/invariant` 导出，本插件未使用；
- `settings.configure({ auto: false })`、`ctx.locale`（仅 `locale/*.json` 的 meta 用）未变。

端到端复核（3099 隔离实例，`DSH_HOME=~/.dsh-web`，0.2.1-rc.2）：
`node exploration/ch-live-probe.mjs 3099` **27/28 通过**——唯一失败仍是"模型回答里复述了内联执行
规则"这一条**模型输出随机性**断言（同一轮里其它 27 条已证明提示词逐字包含三段规则、来源标记是
`system-prompt`、四个锚点顺序全对，且身份句已是 `powered by Work Buddy`、整份提示词里不再出现
`DeepSeek Harness`）；`ch-prompt-probe.mjs` **158 项全绿**（离线）；
`pluginInventory/list` 中 `include:falling-ts-chinese` 为 `enabled:true` / `fiberPhase:active`；
`settings/describe` 出现 `falling-ts-chinese`（`applies: live`）。

## harness 0.2.1-rc.5 适配核对（2026-10-30）：零改动

基线切到 **`dsh-v0.2.1-rc.5`**（`b830ec950f`）——npm 上 `@deepseek-ai/dsh-*` 的
**`next` dist-tag** 所指版本，即「线上最新 rc」。

**先看清这条线的拓扑**（上一节容易误读）：rc.4 / rc.5 是从 **rc.3 tag 拉出的 release 分支**
（`worktree/release-dsh-0.2.1-rc.5`），相对 rc.3 只多 **13 个修复提交**——`ui-chat` 的 thinking
块渲染、`ui-conversation` 的 slot 目录、`llm-deepseek-account` / `mcp-client` 的 stdout 诊断。
它们**不包含** master 主线上 rc.3 之后的 1500+ 个提交（那条线版本号已升到 `0.2.2-alpha.2`，
`alpha` dist-tag 指的正是它）。所以上一节（2026-10-24）记录的“变更”——
`system-prompt/assemble` 入参换成 `PromptPresentation`（收窄掉 `tools`）、`agent/pre-step` 新增
`modelSelection`、`agent/request` 被标 `@deprecated`——**在 rc.5 上根本不存在**，它们是 0.2.2
方向的工作。日后若把基线推到 `0.2.2-alpha`／0.2.2，才需要按那一节的结论办。

`system-prompt` 缝在 rc.5 上逐条核对（**与 rc.2 时的形态一致，全部未变**，源码无需改动）：

- `system-prompt/assemble` 的声明仍是
  `(assembly: PromptAssembly, context: AssembleContext, next) => Promise<PromptAssembly>`，
  **仍然带 `tools`**；仓库里搜不到 `PromptPresentation` / `modelSelection` / `toolSet` 任何一个；
- `SECTION_ORDERS` 逐字未变：`TOOL_BASH: 1000`（`index.ts:138`）、
  `DEPLOYMENT_PERSONA_SUFFIX: 10200`（`index.ts:164`）——两个锚点落点不变；
- `section(section: PromptSection): () => void`（`index.ts:478`）签名与归还 disposer 的语义未变；
- 故 `rebrandAssembly`（只重建 `sections`/`variables`、其余按引用透传）与三段规则注册
  **一行都不用改**。

端到端复核（3099 隔离实例，`DSH_HOME=~/.dsh-web`，页面版本串 `0.2.1-rc.5`）：
`node exploration/ch-live-probe.mjs 3099` **27/28 通过**——失败项仍是那条
“模型回答里复述了内联执行规则”的**软判据**（探针注释自述是软判据：靠模型自述侧面印证它读到了
规则），而**同轮 22 项硬证据全绿**：`system/message` 里逐字出现三条规则与三个加粗总纲、来源是
`system-prompt`、三条规则相对官方工具说明的顺序全对、中文规则稳落提示词尾部、身份句已是
`powered by Work Buddy` 且全文不再出现 `DeepSeek Harness`。离线 `ch-prompt-probe.mjs`
**158 项全绿**。

**环境备忘（踩过一次）**：该隔离 home 的 `agent-default-model` 曾被配成
`provider: work-buddy`，而 `llm-pi-ai.providers` 里没有 `work-buddy` → 回合以 `NO_ADAPTER`
结束、会话里没有 `assistant/message`，探针那 3 项软判据全红（**看起来像插件坏了，实际是模型
根本没被调到**）。改回 `provider: autodl` / `model: DeepSeek-V4.1-Flash-1017` 后恢复 27/28。
判据：`session/page` 的事件里**有没有 `assistant/message`**。

## harness 0.2.1-rc.3 适配核对（2026-10-24）：零改动

上游 `687f282e86`（rc.2）→ `22ddee3792`（master HEAD，`dsh-v0.2.1-rc.3-1533-g22ddee3792`）
共 **1539 个提交**，版本列车仍是 **0.2.1**（rc.2 → rc.3），vendor `cordis 4.0.5` /
`schemastery 3.18.5` 均未变，故 peer 下界 **`>=0.2.1-rc.1` 保持不变**——同列车补丁收窄下界只
会让 rc.1 运行时被 boot 期预检静默禁用。

`system-prompt` 缝逐条核对（**全部未变**，源码无需改动）：

- `SECTION_ORDERS` 逐字未变（`TOOL_BASH: 1000`、`DEPLOYMENT_PERSONA_SUFFIX: 10200` 仍在原位），
  两个锚点落点不变；
- `ctx.systemPrompt.section(section)`、`getSectionOrder(name)` 签名不变；`section()` 仍归还 disposer；
- **`system-prompt/assemble` waterfall 的入参类型改名并收窄**：`PromptAssembly` 拆成
  `PromptPresentation`（`sections` / `contexts` / `variables`）+ 完整 `PromptAssembly`
  （多一个 `tools`）。**waterfall 监听器现在收到的是 `PromptPresentation`——没有 `tools` 字段**，
  且工具声明不再允许被 waterfall 替换（`assemble()` 在 waterfall 之后自行贴回 `tools`）。
  对本插件**零影响**：`rebrandAssembly` 只重建 `sections` 与 `variables`、其余字段按引用透传
  （`{...assembly}` 展开），本来就不读写 `tools`；`ch-prompt-probe.mjs` 第 9 组的
  "tools 字段按引用透传"一项在 rc.3 上仍然通过。
- 新增（纯增量，本插件不用）：`text({ scope, toolSet })` / `ctx.tools.get(name, scope, toolSet)`
  可按步骤工具集选片段；`assemble(context)` 现在带 `context.modelSelection` 与 `context.toolSet`。

端到端复核（3099 隔离实例，`DSH_HOME=~/.dsh-web`，0.2.1-rc.3）：
`node exploration/ch-live-probe.mjs 3099` **27/28 通过**——唯一失败仍是那条
"模型回答里复述了内联执行规则"的**模型输出随机性**断言；其余 27 条证明提示词逐字包含三段规则、
来源标记是 `system-prompt`、四个锚点顺序全对、身份句已是 `powered by Work Buddy`。
离线 `ch-prompt-probe.mjs` **158 项全绿**；`pluginInventory/list` 中
`include:falling-ts-chinese` 为 `enabled:true` / `fiberPhase:active`。

## 关于 `engines.dsh`（0.2.1 新规范）：有意不迁移

0.2.1 的 boot 期兼容闸门（`packages/boot/app-boot/src/plugin-compatibility.ts`）新增优先级：
**清单里有 `engines.dsh` 时只看它、忽略全部 `peerDependencies`**；没有则回退旧的逐 peer 判定。
本集合五个插件**都保留逐 peer 声明，不写 `engines.dsh`**，理由：

1. 插件确实依赖那些具体包（`system-prompt`、`settings`、`agents`……），逐包下界既表达
   "最低可用的 harness 版本"，也是一份**依赖清单**——出问题时 `pluginInventory` 能指出
   *哪个* peer 不满足；`engines.dsh` 只给一个笼统的版本范围，诊断价值低。
2. 旧写法在 0.2.1 上**完全有效**（闸门只在 `engines.dsh` 存在时才忽略 peer），迁移没有收益。
3. 迁移会**丢失粒度**：`engines.dsh` 只能写一条范围，而本集合的 peer 里还混着 vendor
   包（cordis / schemastery），它们不属于 dsh 列车，只能留在 peer 里——两套机制并存反而更乱。

**若将来要迁移**：删掉全部 `@deepseek-ai/dsh*` peer、加 `"engines": { "dsh": ">=0.2.1-rc.1" }`，
并同步改 `peer-range-probe.mjs` 与 `plugin-manifest-check.mjs` 的判定逻辑（它们目前断言的是
peer 逐字等于列车下界）。这不是"顺手就能改"的事，需要单独决策。

## 验证

- `node exploration/ch-prompt-probe.mjs` —— **158 项**，全程离线（真实 import `index.js` 与
  `src/**`，桩 ctx 驱动 `apply`，再按上游 `renderPrompt` 语义渲染回读；桩 ctx 也实现了 `ctx.on`
  与 waterfall 链式调用，所以第 9 组能在离线复现装配后处理）：命名空间三处一致 +
  纯 Host 三条断言；规则文本逐字钉住（含**每段首行的加粗总纲**与"每段恰好一对 `**`"、
  总纲/细则的概念词表双向断言，以及 mjs/js/py 点名声、检验用途、出错回到编辑工具，
  内联规则的 python3/node 两种方式、here-document/-e 传法、"长期留存才写文件"出口）；
  **规则①对推理流的绑定**（"「思考」指的是你的推理过程本身"、"不只是你展示给用户的那部分"、
  "即使上下文中其他内容都是英文"、"即使你在分析英文文件或英文报错"、以及点名的典型违规
  `Let me check` / `Let me look at` / `Now I need to`）；
  段落数量与顺序、**两个锚点各自的落点**（工具段 = `TOOL_BASH`−40 且排在 `TOOL_BASH` 之前、
  语言段 = `DEPLOYMENT_PERSONA_SUFFIX`+1 且**渲染后是最后一块**）、"关掉中间一段不留 order 空洞"、
  **尾部锚点不可解析（NaN / undefined）时不产出语言段**；
  默认值与"非布尔不生效"；
  `apply` 的注册行为（3 段、都由 `ctx.effect` 持有、`inject` 声明、`name`、无 default export）；
  **开关按每次装配求值**（同一注册表改设置后重渲染即生效、三个开关互不连坐、三段落都关时渲染空串）；
  **卸载后注册表干净**且可重新 apply；锚点回退（自定义 order 被跟随、`getSectionOrder` 抛异常 /
  返回 NaN 都不挂）、`settings` 缺席时仍注册并记 warn；清单与显示元数据；
  **第 9 组·产品名替换**：两个常量逐字、文本里每一处都被换（不是只换第一处）、单独的
  `DeepSeek` 不受影响、非字符串与空串原样返回、身份句渲染为 `powered by Work Buddy`、结果里
  不再出现旧名、`contexts`/`tools` 按引用透传、下游监听器确实被执行（未短路 waterfall）、
  关掉开关后一个字节都不改、重新打开后下一次装配立即生效、字符串 `"false"` 回退默认、
  卸载后监听器被摘掉。
- `node exploration/plugin-manifest-check.mjs` —— 已把本插件纳入（现为 5 个 manifest）。
- `node exploration/peer-range-probe.mjs` —— 127 项，已覆盖本插件的 peer 写法。
- 线上端到端见根 `AGENTS.md` 的"验证"小节（`pluginInventory/list` 里
  `include:falling-ts-chinese` 应为 `enabled:true` / `fiberPhase:active`）。

## 状态与约束

- **无 timer、无持久化、无进程内可变状态**。`settings.js` 里唯一的模块级状态是 `liveConfig`
  这个引用持有者（由 `apply` 调 `bindConfig` 写一次），段落注册全在 `ctx.effect` 里。
- 新增能力时守住三条红线：① 只经**官方扩展点**贡献——系统提示词注册表，或上游在 `Events` 里
  声明的事件；**绝不 patch 运行期对象**（`dsh-local-no-auth` 那种实例方法替换在本插件一律不
  接受）。② 规则文本固定且逐字进探针，不得改成可配置（**加粗总纲同样固定**：它也是文本，也要
  逐字进探针，且只准复述该段细则已有的要求）；品牌替换词（`REBRAND_FROM`/`REBRAND_TO`）同理
  是逐字进探针的常量。③ 关掉的规则必须渲染为空串（零 token），不得留下空段落或占位文本；
  关掉的替换必须**一个字节都不改**装配结果。
- 位置约定（改动时必须一并考虑）：**工具规则**锚 `TOOL_BASH`−40（在工具说明之前）；
  **语言规则**锚 `DEPLOYMENT_PERSONA_SUFFIX`+1（提示词最末尾），且**尾部锚点解析不到时宁可不注册**。
  语言规则的位置不是装饰——它靠 recency 对抗稀释，挪回中段就等于放弃那条实测依据。

## 提交规范

- 独立 git 仓库（远程：`falling-ts/dsh-chinese`，branch `main`），
  遵循根工作区三步提交约定（`git add . && git commit && git push`）。
- 内容变更（行为/文档/规则文本）与 version bump 同提交。

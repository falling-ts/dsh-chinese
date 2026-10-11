# dsh-chinese

> DSH Cordis 插件 —— 为**每一次**模型请求的系统提示词追加三条固定规则。

[English](README.md)

## 功能

插件在 harness 的系统提示词注册表上注册三个段落,于是这三条规则在本部署的每一次请求里
都会到达模型:

1. **所有思考和临时输出都必须使用中文**,而代码、标识符、文件路径、命令、命令行参数、
   配置键、API 名称和各种符号保持原样,不翻译、不改写。
2. **编辑或修改文件必须使用编辑文件工具**。禁止使用命令行或脚本(mjs、js、py 等任何
   脚本语言)创建、写入、修改、删除文件。命令和脚本**只能用于检验**修改结果——跑测试、
   类型检查、格式检查,或把文件读回来确认。检验发现错误时,修正也仍须使用编辑工具。
3. **校验脚本优先内联执行**,不要先创建临时文件再运行,以免遗留临时文件、污染项目。
   多行代码用 here-document 或 `-e` 直接传给解释器:

   ```sh
   python3 - <<'PY'
   ...
   PY
   python3 -c '...'
   node --input-type=module -e '...'
   node - <<'JS'
   ...
   JS
   ```

   仅当脚本需要长期留存、被复用、或被项目正式引用时,才把它写进仓库文件。

三条规则默认全开,可以分别关闭。

## 为什么第二条规则要写明"检验"这条出路

一条只写"禁止脚本"的规则会让 agent 没有合规的办法检查自己的改动——而一个无法检验的
agent 要么跳过检验,要么照样伸手去用被禁的机制。把命令与脚本**指定**为检验手段,并要求
检验失败后回到编辑工具,正好堵上这个缺口:禁止什么、允许什么,在同一处讲清楚。

## 为什么第三条要单独成段

第二条说的是脚本**能不能**用(只能用于检验),第三条说的是既然能用、**该怎么用**(内联,
不落盘)。"为了跑一个脚本而先创建它"本身也是一次文件创建,但第二条没法在不把自己要求的
检验也一并禁掉的前提下禁止它——所以用第三条把这个缺口补上,而不是和第二条打架。

留出口同样重要:一个**确实**要被复用、或被项目引用的脚本属于仓库里的正式文件,不写进去
反而会把有用的工具挤出版本控制。

## 挂载缝

`ctx.systemPrompt.section()` —— 官方文档化的系统提示词扩展点,一等公民工具包自己就用它
(`packages/fs/tool-fs/src/edit.ts`、`packages/terminal/tool-terminal/src/index.ts`)。
不改上游任何源码,也不做运行期替换。

段落文本是 **provider 而非静态字符串**,因此每次装配系统提示词时都会重新求值:改开关
**下一个请求**即生效,不需要重启,也不需要重新注册。关掉的规则渲染成空串,由 harness
丢弃,因此不占用任何 token。

三个段落都排在官方工具说明块(`TOOL_BASH` 及以后)之**前**。编辑规则约束的是 `edit` /
`write` 工具怎么用,所以必须排在它们自己的说明之前,而不是去和模型已经读过的工具描述
争位置。

注册走 Cordis effect,卸载插件即移除三个段落。

## 目录结构

```
dsh-chinese/
├── index.js                 # Cordis 插件入口
├── src/
│   ├── core/
│   │   ├── prompt-text.js   # 三条固定中文规则 + 段落名与 order
│   │   └── settings.js      # falling-ts-chinese 的 Config(三个开关)
│   └── hooks/
│       └── sections.js      # 在实时系统提示词注册表上注册
├── cordis.patch.yml         # 可叠加的 patch 层(按包名引用)
├── locale/{en,zh}.json      # 插件卡片标题/描述
└── icon.svg
```

刻意只做 Host 半部:规则改变的是模型读到什么,不是界面显示什么,因此没有
`web/client.js`、没有 `dsh.client` 声明、也没有 `./client` 导出。

## 配置

三个开关,走该 entry 自己的 Config。默认都是 `true`:

| 字段 | 默认 | 作用 |
|---|---|---|
| `chineseOnly` | `true` | 贡献中文语言规则。 |
| `editToolOnly` | `true` | 贡献编辑工具规则。 |
| `inlineScriptOnly` | `true` | 贡献校验脚本内联执行规则。 |

可在 profile 的 `cordis.yml` 里该插件的 entry 上设置,或从设置面修改。只有真正的布尔值
才算数——写错的值按"未设置"处理并回退到默认,不做强制转换,所以一个打错的设置绝不至于
静默地生效成相反的意思。

## 安装

```sh
dsh plugin --profile web add github:falling-ts/dsh-chinese      # 安装
dsh web --patch dsh-chinese/cordis.patch.yml                     # 开发期叠加
```

装进 profile 是热重载的,不需要重启。改**清单**(icon、locale、exports)才需要重启,因为
profile 在启动时快照插件的 exports 表——那是 harness 的规则,不是本插件的性质。

## 验证

```sh
node exploration/ch-prompt-probe.mjs        # 99 项,全程离线
node exploration/plugin-manifest-check.mjs  # 共用清单门禁(5 个插件)
```

探针逐字钉住规则文本(一段被静默丢弃的规则本身不会报错),并覆盖开关语义、关掉后零 token
的空渲染路径、命名空间三处拼写一致,以及卸载后注册表干净。

## 许可

MIT

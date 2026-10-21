/**
 * dsh-chinese settings — four boolean toggles, nothing else.
 *
 * The prompt TEXT is not configurable (see src/core/prompt-text.js): the rule
 * is the plugin's purpose, and an editable copy would only create a second
 * place for it to drift. What a deployment legitimately varies is whether each
 * rule applies at all — a Chinese-speaking operator wants all three rules,
 * while a polyglot deployment may want the language rule off and the edit-tool
 * rule on — plus, for the product-name substitution, whether that substitution
 * runs at all (see src/core/rebrand.js). That is exactly four booleans, and
 * none has a real third state.
 *
 * Harness 0.1.7 replaced the old `settings.register(ns, schema, { base })` API
 * with a Config-driven model: the plugin exports `Config`, the settings form
 * namespace is the LOADER ENTRY ID (`falling-ts-chinese`, see
 * cordis.patch.yml), defaults come from `.default()`, and only `.volatile()`
 * fields may be written by the form.
 *
 * @module @falling-ts/dsh-chinese/settings
 */

/**
 * The settings form namespace key. It MUST equal this plugin's LOADER ENTRY ID
 * (`falling-ts-chinese`, see cordis.patch.yml): the harness derives the form
 * namespace from `entry.options.id`. A mismatch is SILENT — the form simply
 * reads nothing — so `exploration/ch-prompt-probe.mjs` asserts all three
 * spellings (entry id, this constant, the package name) agree.
 */
export const NS = 'falling-ts-chinese'

/** Field name: the Chinese-language rule toggle. */
export const CHINESE_FIELD = 'chineseOnly'

/** Field name: the edit-tool rule toggle. */
export const EDIT_TOOL_FIELD = 'editToolOnly'

/** Field name: the inline-verification-script rule toggle. */
export const INLINE_SCRIPT_FIELD = 'inlineScriptOnly'

/**
 * 字段名:产品名替换开关。
 *
 * 它不是一条"规则",而是一次改写——把系统提示词里已经存在的产品名换成本部署自己的名字
 * (见 src/core/rebrand.js)。因此它不进 {@link readRuleToggles},那个函数喂给段落注册。
 */
export const REBRAND_FIELD = 'rebrand'

/**
 * Defaults — the schema `.default()` values in {@link buildConfigSchema}.
 * All default ON: installing the plugin is the opt-in, and a plugin that does
 * nothing until a second switch is found is a worse failure than a rule an
 * operator explicitly turns off.
 */
export const DEFAULTS = Object.freeze({
  chineseOnly: true,
  editToolOnly: true,
  inlineScriptOnly: true,
  rebrand: true,
})

/**
 * Live Config refs handed to `apply`. The rule toggle is read through this
 * holder on every assembly, so a settings-form edit is picked up on the next
 * request (the ConfigForm volatile-commit contract) without a restart and
 * without re-registering the prompt section. Set once by the plugin entry.
 */
let liveConfig

/**
 * Bind the resolved plugin Config.
 * @param {object|undefined} config schemastery-resolved Config (volatile refs).
 */
export function bindConfig(config) {
  liveConfig = config
}

/**
 * Read ONE live config field. Never throws.
 *
 * Returns `undefined` for an absent Config (standalone tree, unresolvable
 * schemastery) as well as for an unset field, so callers cannot tell the two
 * apart — deliberately: both mean "no override", and both fall back to
 * {@link DEFAULTS}.
 * @param {string} field - the config key to read.
 * @returns {unknown} the current value, or `undefined` when unset/unavailable.
 */
export function readConfigField(field) {
  try {
    const ref = liveConfig === null || liveConfig === undefined ? undefined : liveConfig[field]
    if (ref === undefined || ref === null || typeof ref.get !== 'function') return undefined
    return ref.get()
  } catch {
    return undefined
  }
}

/**
 * Read one boolean toggle, falling back to its default for any non-boolean.
 *
 * Only a real `true` / `false` counts. A malformed value (string `"false"`, a
 * number, `null`) is treated as unset rather than coerced: guessing at a
 * mistyped setting would silently apply the opposite of what it says.
 * @param {string} field - the config key to read.
 * @param {boolean} fallback - the default from {@link DEFAULTS}.
 * @returns {boolean} the effective toggle.
 */
export function readToggle(field, fallback) {
  const raw = readConfigField(field)
  return typeof raw === 'boolean' ? raw : fallback
}

/**
 * Resolve all rule toggles for one assembly.
 * @returns {{chinese: boolean, editTool: boolean, inlineScript: boolean}} the
 *   effective toggles.
 */
export function readRuleToggles() {
  return {
    chinese: readToggle(CHINESE_FIELD, DEFAULTS.chineseOnly),
    editTool: readToggle(EDIT_TOOL_FIELD, DEFAULTS.editToolOnly),
    inlineScript: readToggle(INLINE_SCRIPT_FIELD, DEFAULTS.inlineScriptOnly),
  }
}

/**
 * 读产品名替换开关。
 *
 * 与 {@link readRuleToggles} 分开:那个函数的返回值驱动**段落注册**,而替换是 waterfall
 * 后处理,不是段落。两者共用 {@link readToggle} 的判定——只有真正的布尔值生效,打错的
 * 值按未设置处理并回退到默认。
 * @returns {boolean} 本次装配是否执行产品名替换。
 */
export function readRebrandRewrite() {
  return readToggle(REBRAND_FIELD, DEFAULTS.rebrand)
}

/**
 * Resolve the schemastery `z` constructor, tolerating BOTH layouts:
 *  - a monorepo/dev layout where `@deepseek-ai/schemastery` resolves as a
 *    bare specifier;
 *  - this plugin as a STANDALONE repo whose node_modules lacks schemastery
 *    (it lives in the sibling `deepseek-harness/vendor/` copy). Then walk up
 *    from this file looking for the vendored build and import it via a
 *    file:// URL (required on Windows).
 * @returns {Promise<object|undefined>} resolved `z`, or undefined.
 */
async function resolveZ() {
  try {
    const mod = await import('@deepseek-ai/schemastery')
    const z = mod.default ?? mod
    if (typeof z.object === 'function') return z
  } catch { /* fall through to candidate 2 */ }
  try {
    const { fileURLToPath, pathToFileURL } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const { existsSync } = await import('node:fs')
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let hop = 0; hop < 8; hop += 1) {
      const cand = join(dir, 'deepseek-harness/vendor/schemastery/lib/index.mjs')
      if (existsSync(cand)) {
        const mod = await import(pathToFileURL(cand).href)
        const z = mod.default ?? mod
        if (typeof z.object === 'function') return z
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch { /* candidate 2 unavailable */ }
  return undefined
}

/**
 * Build the plugin's schemastery `Config` — the settings form namespace the
 * Loader auto-derives for this entry.
 *
 * Returns `undefined` when schemastery is unresolvable: the entry then simply
 * has no settings form, and the prompt sections fall back to {@link DEFAULTS}
 * (every rule on). The plugin still works — only its form is missing.
 * @returns {Promise<object|undefined>} the Config schema, or undefined.
 */
export async function buildConfigSchema() {
  try {
    const z = await resolveZ()
    if (z === undefined) return undefined
    return z.object({
      chineseOnly: z.boolean().default(DEFAULTS.chineseOnly).volatile(),
      editToolOnly: z.boolean().default(DEFAULTS.editToolOnly).volatile(),
      inlineScriptOnly: z.boolean().default(DEFAULTS.inlineScriptOnly).volatile(),
      rebrand: z.boolean().default(DEFAULTS.rebrand).volatile(),
    })
  } catch {
    return undefined
  }
}

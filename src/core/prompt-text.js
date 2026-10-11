/**
 * dsh-chinese prompt text — the three fixed model-facing sections this plugin
 * contributes to every request's system prompt.
 *
 * WHY FIXED TEXT, NOT A SETTING: the text is the plugin's whole reason to
 * exist, and both rules are behavioral constraints an operator either wants or
 * does not. Exposing them as editable strings would create a second, silent
 * source of truth for the rule while adding no capability a toggle does not
 * already give (see the `Config` surface in src/core/settings.js). The text is
 * therefore a module constant, pinned verbatim by
 * `exploration/ch-prompt-probe.mjs` so an accidental edit fails the gate
 * instead of silently changing every request.
 *
 * LANGUAGE: Chinese, deliberately. The rule itself is "think and speak in
 * Chinese"; a Chinese rule is both the shortest statement of it and the least
 * likely to be restated by the model in the language the rule forbids.
 *
 * MODEL-FACING WRITING RULES (upstream `packages/AGENTS.md`, "Write
 * model-facing contracts from the model's perspective"): the text names only
 * task-relevant concepts, never this plugin, the harness, its settings, or any
 * UI/transport vocabulary. It reads as a standing deployment instruction.
 *
 * EMPHASIS (`**…**`): each rule opens with a bolded one-line digest of its core
 * requirement. The digest is not a summary for human readers — it is what makes
 * the rule register as a standing constraint rather than another paragraph of
 * prose among the official tool descriptions these sections sit next to. Two
 * properties keep it honest: it restates the requirement, never adds one (the
 * detail lines below it remain the contract, and the probe pins both), and it
 * is emitted verbatim because `renderPrompt` only interpolates `{{…}}` and
 * drops empty sections — the asterisks reach the model as written. Upstream
 * itself relies on this: its own system prompts bold their binding rules.
 *
 * @module @falling-ts/dsh-chinese/prompt-text
 */

/**
 * The Chinese-language rule: every thought and every intermediate output is
 * written in Chinese, while code and symbols keep their original form.
 *
 * The code/symbol carve-out is not decoration — without it the rule collides
 * with the harness's own instructions, which pin identifiers, paths, flags, and
 * tool arguments to their literal spelling. Stating the exemption in the same
 * breath keeps prose Chinese and technical tokens untouched.
 */
export const CHINESE_RULE_TEXT = [
  '**必须用中文思考和输出；代码、标识符与符号保持原样，不翻译、不改写。**',
  '所有思考过程和临时输出都必须使用中文。',
  '这包括你的内部分析、推理、计划、进度说明、以及对结果的解释。',
  '以下内容保持原样，不翻译、不改写：代码、标识符、函数名与变量名、文件路径、命令、命令行参数、配置键、API 名称、以及各种符号。',
  '代码注释同样用中文书写，除非该注释引用的是外部既有代码的原文。',
].join('\n')

/**
 * The edit-tool rule: file changes go through the editing tools, never through
 * a command or a script.
 *
 * The second half matters as much as the prohibition. A rule that only forbids
 * scripts would leave the agent with no sanctioned way to verify an edit, and
 * it would then either skip verification or reach for the forbidden mechanism.
 * Naming commands and scripts as the verification surface — and requiring a
 * return to the editing tool when verification fails — closes that gap.
 */
export const EDIT_TOOL_RULE_TEXT = [
  '**修改文件必须用编辑文件工具；命令与脚本只能用于检验，检验出错必须回到编辑工具修正。**',
  '编辑或修改文件时，必须使用专门的编辑文件工具。',
  '禁止使用命令行或脚本（包括 mjs、js、py 等任何脚本语言）来创建、写入、修改、删除文件。',
  '命令和脚本只能用于检验文件修改的结果，例如运行测试、类型检查、格式化检查、或读取文件确认内容。',
  '如果检验发现错误，必须再次使用编辑文件工具来修正文件，不得改用命令或脚本绕过。',
  '这条规则的唯一例外是检验本身：凡是会改变文件内容的动作，都必须回到编辑工具。',
].join('\n')

/**
 * The inline-verification rule: a verification script is executed in place
 * rather than written to a file first.
 *
 * WHY THIS IS A SEPARATE RULE FROM {@link EDIT_TOOL_RULE_TEXT}: that rule says
 * WHETHER a script may be used (verification only); this one says HOW to run it
 * once it may be (inline, leaving nothing behind). A script that is written to
 * disk in order to be run is itself a file creation — but one the edit-tool rule
 * cannot forbid without also forbidding the verification it mandates. Stating the
 * inline form closes that gap instead of contradicting the other rule.
 *
 * The escape hatch matters as much as the default: a helper that is genuinely
 * reused, or referenced by the project, belongs in the repository as a real
 * file. Without it the rule would push useful tooling out of version control.
 */
export const INLINE_SCRIPT_RULE_TEXT = [
  '**校验脚本一律内联执行，不要先写临时文件；只有需长期留存的脚本才写进仓库。**',
  '需要执行校验脚本时，优先直接内联执行，不要先创建临时文件再运行，以免遗留临时文件、污染项目。',
  '用 here-document 或 -e 传入多行代码：python3 - <<\'PY\' … PY，或 python3 -c \'…\'；node --input-type=module -e \'…\'，或 node - <<\'JS\' … JS。',
  '仅当脚本需要长期留存、被复用、或被项目正式引用时，才将它写入仓库文件。',
].join('\n')

/**
 * Stable section names. They are the registry keys for
 * `ctx.systemPrompt.section()` and appear in assembled prompts' section lists,
 * so they are part of this plugin's observable surface (the probe asserts them,
 * and a future reader greps them to find the contributor).
 */
export const CHINESE_RULE_SECTION = 'falling-ts:dsh-chinese/language'
export const EDIT_TOOL_RULE_SECTION = 'falling-ts:dsh-chinese/edit-tool'
export const INLINE_SCRIPT_RULE_SECTION = 'falling-ts:dsh-chinese/inline-script'

/**
 * The fixed, non-negative offset applied to the anchored section orders below.
 *
 * All sections are placed immediately BEFORE the first-party tool guidance
 * (`TOOL_BASH` = 1000 and up). Rationale: the edit-tool rule constrains how the
 * `edit` / `write` tools are used, so it must be read before their own
 * descriptions rather than appended after — a trailing constraint competes with
 * tool descriptions the model has already committed to. Sitting before them
 * also keeps this deployment's policy out of the per-tool guidance block, which
 * upstream owns and may reorder.
 */
export const SECTION_ORDER_OFFSET = -40

/**
 * Compose the ordered section contributions for one assembly.
 *
 * The caller passes the three resolved toggles; this function owns only the
 * mapping from "which rules are on" to "which sections exist", which is the
 * part the probe can assert without a live harness.
 *
 * @param {object} options - resolved rule toggles.
 * @param {boolean} options.chinese - include {@link CHINESE_RULE_TEXT}.
 * @param {boolean} options.editTool - include {@link EDIT_TOOL_RULE_TEXT}.
 * @param {boolean} options.inlineScript - include {@link INLINE_SCRIPT_RULE_TEXT}.
 * @param {number} options.anchorOrder - the registry's `TOOL_BASH` order, used
 *   as the anchor for every section (see {@link SECTION_ORDER_OFFSET}).
 * @returns {Array<{name: string, order: number, text: string}>} zero to three
 *   sections in assembly order. Empty when every rule is disabled.
 */
export function buildSections({ chinese, editTool, inlineScript, anchorOrder }) {
  const order = anchorOrder + SECTION_ORDER_OFFSET
  const sections = []
  let slot = 0
  if (chinese) {
    sections.push({ name: CHINESE_RULE_SECTION, order: order + slot, text: CHINESE_RULE_TEXT })
    slot += 1
  }
  if (editTool) {
    // Distinct, strictly increasing orders keep the intended order deterministic
    // when several rules are on: sections with equal orders are tie-broken by
    // code-unit name order, which would put "edit-tool" before "language" and
    // read the tool rule first. Naming the intended order explicitly is cheaper
    // than relying on that coincidence.
    sections.push({ name: EDIT_TOOL_RULE_SECTION, order: order + slot, text: EDIT_TOOL_RULE_TEXT })
    slot += 1
  }
  if (inlineScript) {
    // Last of the three: it refines the edit-tool rule (HOW to run the
    // verification script that rule permits), so it reads directly after it.
    sections.push({ name: INLINE_SCRIPT_RULE_SECTION, order: order + slot, text: INLINE_SCRIPT_RULE_TEXT })
    slot += 1
  }
  return sections
}

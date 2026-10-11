/**
 * dsh-chinese section registration — mount the two fixed prompt sections on the
 * system-prompt registry.
 *
 * THE SEAM: `ctx.systemPrompt.section({ name, order, text })`
 * (`@deepseek-ai/dsh-system-prompt`). It is the documented extension point for
 * contributing to the system prompt — first-party tool packages use the same
 * call (`packages/fs/tool-fs/src/edit.ts`, `packages/terminal/tool-terminal/
 * src/index.ts`) — so this plugin adds no new mechanism and touches no upstream
 * source.
 *
 * WHY THE TEXT IS A PROVIDER, NOT A STRING: `PromptSection.text` accepts either
 * a string or `(context) => string`. A provider is re-evaluated on EVERY
 * assembly, which is what makes a settings toggle apply to the next request
 * without re-registering anything. With a static string the section would
 * freeze at load time and a toggle would only take effect after a restart.
 *
 * ORDERING: anchored off the registry's own `TOOL_BASH` slot via
 * `getSectionOrder` rather than a bare literal, so the sections stay pinned
 * relative to first-party tool guidance even if upstream renumbers the table.
 * See {@link SECTION_ORDER_OFFSET} for why they precede the tool block.
 *
 * DISPOSAL: `section()` returns the Cordis effect disposer; registration goes
 * through `ctx.effect` so unloading the plugin (or an HMR reload) removes both
 * sections. This is the upstream "registry contributions prove disposal" rule —
 * a leaked section would keep injecting the rules into a profile that had
 * dropped this plugin.
 *
 * @module @falling-ts/dsh-chinese/sections
 */

import {
  buildSections,
  SECTION_ORDER_OFFSET,
} from '../core/prompt-text.js'
import { readRuleToggles } from '../core/settings.js'

/**
 * The registry slot the sections anchor to before applying
 * {@link SECTION_ORDER_OFFSET}. `TOOL_BASH` is the first first-party tool
 * guidance slot; anchoring to it keeps these deployment rules immediately
 * ahead of the tool block.
 */
const ANCHOR_SLOT = 'TOOL_BASH'

/**
 * Fallback anchor order, used only when the live registry does not expose
 * {@link ANCHOR_SLOT}. Mirrors `SECTION_ORDERS.TOOL_BASH` in
 * `@deepseek-ai/dsh-system-prompt`. Kept as a fallback rather than the primary
 * source so a renumbered upstream table is followed automatically; kept at all
 * so a registry lacking that slot degrades to "slightly misplaced rules"
 * instead of "no rules".
 */
const FALLBACK_ANCHOR_ORDER = 1000

/**
 * Resolve the numeric order the sections anchor to.
 * @param {object} systemPrompt - the live `ctx.systemPrompt` service.
 * @returns {number} the anchor order.
 */
function resolveAnchorOrder(systemPrompt) {
  try {
    if (typeof systemPrompt.getSectionOrder !== 'function') return FALLBACK_ANCHOR_ORDER
    const order = systemPrompt.getSectionOrder(ANCHOR_SLOT)
    return Number.isFinite(order) ? order : FALLBACK_ANCHOR_ORDER
  } catch {
    return FALLBACK_ANCHOR_ORDER
  }
}

/**
 * Register the plugin's prompt sections on the live system-prompt service.
 *
 * Registration is unconditional and the toggles are applied per assembly by the
 * text providers. An alternative — registering and unregistering on toggle
 * changes — would need a settings subscription and would briefly expose a
 * half-applied state on every flip; a provider that returns `''` costs nothing,
 * because `renderPrompt` drops empty sections.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context with
 *   `systemPrompt` active (declared in this plugin's `inject`).
 * @returns {number} how many sections were registered (0 when both rules are
 *   disabled at load and the caller chose to skip registration entirely).
 */
export function registerPromptSections(ctx) {
  const systemPrompt = ctx.systemPrompt
  const anchorOrder = resolveAnchorOrder(systemPrompt)

  // Register every section the plugin can contribute, not just the currently
  // enabled ones: the provider below decides per assembly, so flipping a toggle
  // later needs no re-registration.
  const declared = buildSections({ chinese: true, editTool: true, anchorOrder })

  for (const section of declared) {
    ctx.effect(() => systemPrompt.section({
      name: section.name,
      order: section.order,
      // Evaluated per assembly: reads the live toggle and yields '' when off.
      // `renderPrompt` drops empty sections, so a disabled rule contributes
      // nothing at all to the rendered prompt.
      text: () => (isEnabled(section.name) ? section.text : ''),
    }), `dsh-chinese: prompt section ${section.name}`)
  }

  return declared.length
}

/**
 * Whether the rule owning `sectionName` is currently enabled.
 *
 * The name → toggle mapping lives here rather than being embedded in each
 * provider closure so the two sections cannot disagree about which field they
 * read.
 * @param {string} sectionName - one of the registered section names.
 * @returns {boolean} the live toggle for that section.
 */
function isEnabled(sectionName) {
  const toggles = readRuleToggles()
  return sectionName.endsWith('/language') ? toggles.chinese : toggles.editTool
}

/**
 * The section names this module registers, in assembly order. Exported for the
 * probe, which asserts the live registry gained exactly these.
 */
export { SECTION_ORDER_OFFSET }

/**
 * dsh-chinese section registration — mount the three fixed prompt sections on
 * the system-prompt registry.
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
 * ORDERING: two anchors, because the rules have two different jobs. The
 * edit-tool and inline-script rules anchor off the registry's own `TOOL_BASH`
 * slot via `getSectionOrder` rather than a bare literal, so they stay pinned
 * immediately ahead of first-party tool guidance even if upstream renumbers the
 * table (see {@link SECTION_ORDER_OFFSET}). The language rule anchors off
 * `DEPLOYMENT_PERSONA_SUFFIX` instead — the registry's last slot — so it lands
 * at the very end of the prompt (see {@link TAIL_ORDER_OFFSET} for the dilution
 * measurement that motivated the split).
 *
 * DISPOSAL: `section()` returns the Cordis effect disposer; registration goes
 * through `ctx.effect` so unloading the plugin (or an HMR reload) removes every
 * section. This is the upstream "registry contributions prove disposal" rule —
 * a leaked section would keep injecting the rules into a profile that had
 * dropped this plugin.
 *
 * @module @falling-ts/dsh-chinese/sections
 */

import {
  buildSections,
  CHINESE_RULE_SECTION,
  EDIT_TOOL_RULE_SECTION,
  INLINE_SCRIPT_RULE_SECTION,
  SECTION_ORDER_OFFSET,
  TAIL_ANCHOR_SLOT,
  TAIL_ORDER_OFFSET,
} from '../core/prompt-text.js'
import { readRuleToggles } from '../core/settings.js'

/**
 * The registry slot the tool rules anchor to before applying
 * {@link SECTION_ORDER_OFFSET}. `TOOL_BASH` is the first first-party tool
 * guidance slot; anchoring to it keeps the tool rules immediately ahead of the
 * tool block.
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
 * Resolve the numeric order the tool rules anchor to.
 * @param {object} systemPrompt - the live `ctx.systemPrompt` service.
 * @returns {number} the anchor order.
 */
function resolveAnchorOrder(systemPrompt) {
  return resolveOrder(systemPrompt, ANCHOR_SLOT, FALLBACK_ANCHOR_ORDER)
}

/**
 * Resolve the numeric order the language rule anchors to.
 *
 * Unlike {@link resolveAnchorOrder} this never falls back to a guess when the
 * lookup fails: getting the tail slot wrong lands the language rule somewhere
 * in the middle of the prompt, which is the exact dilution this placement
 * exists to avoid. A `NaN` propagates instead, and `buildSections` then omits
 * the language section rather than misplacing it — the probe asserts this
 * degradation, because a silently mid-prompt language rule is worse than an
 * absent one (a user who turned it on would believe it was working).
 *
 * Deliberately there is no `FALLBACK_TAIL_ANCHOR_ORDER` counterpart to
 * {@link FALLBACK_ANCHOR_ORDER}: a mirrored literal would reintroduce exactly
 * the guessed placement this function exists to refuse, and the tool rules'
 * fallback is safe only because being slightly early among tool guidance is
 * harmless — being early for a rule whose whole point is recency is not.
 *
 * @param {object} systemPrompt - the live `ctx.systemPrompt` service.
 * @returns {number} the tail anchor order, or `NaN` when it cannot be resolved.
 */
function resolveTailAnchorOrder(systemPrompt) {
  return resolveOrder(systemPrompt, TAIL_ANCHOR_SLOT, Number.NaN)
}

/**
 * Read one registry order, degrading to `fallback` when it cannot be resolved.
 * @param {object} systemPrompt - the live `ctx.systemPrompt` service.
 * @param {string} slot - the `SECTION_ORDERS` key to read.
 * @param {number} fallback - the value returned when the slot is unavailable.
 * @returns {number} the resolved order, or `fallback`.
 */
function resolveOrder(systemPrompt, slot, fallback) {
  try {
    if (typeof systemPrompt.getSectionOrder !== 'function') return fallback
    const order = systemPrompt.getSectionOrder(slot)
    return Number.isFinite(order) ? order : fallback
  } catch {
    return fallback
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
 * @returns {number} how many sections were registered.
 */
export function registerPromptSections(ctx) {
  const systemPrompt = ctx.systemPrompt
  const anchorOrder = resolveAnchorOrder(systemPrompt)
  const tailAnchorOrder = resolveTailAnchorOrder(systemPrompt)

  // Register every section the plugin can contribute, not just the currently
  // enabled ones: the providers below decide per assembly, so flipping a toggle
  // later needs no re-registration.
  const declared = buildSections({
    chinese: true,
    editTool: true,
    inlineScript: true,
    anchorOrder,
    tailAnchorOrder,
  })

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
 * Section name → toggle field. An explicit table rather than a suffix test:
 * with three sections a name-shape heuristic ("anything not `/language` is the
 * edit rule") would silently hand the inline-script section the wrong toggle the
 * moment a fourth section is added.
 */
const TOGGLE_BY_SECTION = Object.freeze({
  [CHINESE_RULE_SECTION]: 'chinese',
  [EDIT_TOOL_RULE_SECTION]: 'editTool',
  [INLINE_SCRIPT_RULE_SECTION]: 'inlineScript',
})

/**
 * Whether the rule owning `sectionName` is currently enabled.
 *
 * The name → toggle mapping lives here rather than being embedded in each
 * provider closure so the sections cannot disagree about which field they read.
 * An unmapped name resolves to `true` (contribute the rule): a section
 * registered without a toggle should not silently vanish.
 * @param {string} sectionName - one of the registered section names.
 * @returns {boolean} the live toggle for that section.
 */
function isEnabled(sectionName) {
  const toggle = TOGGLE_BY_SECTION[sectionName]
  if (toggle === undefined) return true
  return readRuleToggles()[toggle]
}

/**
 * The order offsets this module applies, re-exported for the probe so it can
 * assert the placement arithmetic without re-deriving it.
 */
export { SECTION_ORDER_OFFSET, TAIL_ORDER_OFFSET }

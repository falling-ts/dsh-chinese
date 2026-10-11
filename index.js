/**
 * dsh-chinese — a DSH Cordis function plugin.
 *
 * Appends three standing rules to the system prompt of EVERY model request in
 * this deployment:
 *
 *   1. All thinking and temporary output must be written in Chinese, while
 *      code, identifiers, paths, commands, and symbols stay in their original
 *      form.
 *   2. Editing or modifying a file must go through the file-editing tools.
 *      Commands and scripts (mjs, js, py, …) may only VERIFY an edit; when
 *      verification fails, the fix must also be made with the editing tool.
 *   3. A verification script must be run inline — a here-document or `-e`
 *      payload — instead of being written to a temporary file first, so no
 *      scratch file is left behind. Only a script meant to be kept, reused, or
 *      referenced by the project is written into the repository.
 *
 * Each rule opens with a bolded one-line digest of its core requirement
 * (`**…**`); the detail lines under it remain the contract. The emphasis is
 * emitted verbatim — upstream's `renderPrompt` interpolates only `{{…}}` and
 * drops empty sections — and mirrors how first-party system prompts mark their
 * own binding rules.
 *
 * THE SEAM: `ctx.systemPrompt.section()` — the documented system-prompt
 * extension point first-party tool packages use. No upstream source is touched
 * and no runtime object is patched.
 *
 * WHY THIS IS A HOST-ONLY PLUGIN: the sections are registered on the Host's
 * `systemPrompt` registry, which is where the model request is assembled. There
 * is therefore no client half, no `dsh.client` declaration, and no `./client`
 * export — the rules are not user-visible UI, they change what the model reads.
 *
 * Layout:
 * - index.js            — this file; the Cordis plugin entry.
 * - core/prompt-text.js — the three fixed Chinese rules and their section names/orders.
 * - core/settings.js    — the `falling-ts-chinese` settings namespace (three toggles).
 * - hooks/sections.js   — registration on the live system-prompt registry.
 *
 * @module @falling-ts/dsh-chinese
 */

import { bindConfig, buildConfigSchema } from './src/core/settings.js'
import { registerPromptSections } from './src/hooks/sections.js'

/** @type {string} the function plugin's display name. */
export const name = 'chinese'

/**
 * The system-prompt registry must be active before a section can be registered
 * on it. Declared as a boot-time injection (unlike the optional `settings`
 * service below) because the sections ARE the plugin: without the registry
 * there is nothing to degrade to, and a silently-absent rule is worse than a
 * plugin that refuses to activate.
 */
export const inject = ['systemPrompt']

/**
 * The plugin's schemastery `Config` — the settings form namespace the Loader
 * auto-derives for this entry. `apply` receives the resolved values and the
 * section providers read them through `bindConfig`, so a form edit applies to
 * the next request. Top-level await because schemastery is resolved lazily
 * (bare specifier first, vendored copy second). `undefined` simply leaves the
 * entry with no settings form, and every rule then stays at its default.
 */
export const Config = await buildConfigSchema()

/**
 * Register the plugin's prompt sections and declare its settings form.
 *
 * No request-time listener is needed: the sections are evaluated during prompt
 * assembly, which happens for every request by construction. That is the whole
 * reason this plugin contributes sections instead of hooking a turn event — a
 * section cannot be skipped by a request path, an event listener can.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context with
 *   `systemPrompt` active.
 * @param {object|undefined} config - resolved plugin Config (schemastery volatile refs).
 */
const __applyInner = (ctx, config) => {
  bindConfig(config)

  // The `settings` service mounts later than this plugin's boot effect, so the
  // form declaration rides a lazy `ctx.inject` instead of `inject` above.
  // `configure({ auto: false })` tells the harness this plugin ships no page of
  // its own — this is a Host-only plugin with no client half — so no
  // auto-generated form section is wanted; the toggles are read from cordis.yml
  // / the entry's own config surface.
  try {
    ctx.inject(['settings'], (child) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.logger.warn(`[dsh-chinese] settings.configure declaration failed (cosmetic only) — ${message}`)
  }

  // ── system prompt: the three standing rules ──
  // Registration is an effect, so unloading the plugin removes every section.
  const count = registerPromptSections(ctx)

  ctx.logger.info(`[dsh-chinese] active: ${count} system-prompt section(s) registered (rules apply to every request)`)
}

/**
 * Plugin entry.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object|undefined} config - resolved plugin Config (schemastery volatile refs).
 */
export const apply = (ctx, config) => {
  try {
    return __applyInner(ctx, config)
  } catch (error) {
    const message = error instanceof Error ? (error.stack || error.message) : String(error)
    try {
      ctx.logger.error(`[dsh-chinese] apply FAILED — ${message}`)
    } catch { /* never mask the original failure */ }
    throw error
  }
}

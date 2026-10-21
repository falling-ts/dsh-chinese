/**
 * dsh-chinese 产品名替换的挂载 —— 在 `system-prompt/assemble` waterfall 上挂一个后处理。
 *
 * 为什么走 waterfall 而不是 `section()`:见 `src/core/rebrand.js` 的模块说明。一句话,
 * `section()` 只能追加,而被换掉的名字已经在上游注册的段落里了。
 *
 * WATERFALL 语义(上游 `docs/cordis-primer.md`):它是 around-middleware,监听器收到
 * `(...args, next)`,**必须**调用 `next()` 把链交给下游,不调用就是短路整条链——上游把这条
 * 写成了红线。所以本模块在 `next()` **之后**替换:拿到的是链上最终的装配结果,替换只叠加
 * 在它之上,不改变任何既有贡献。
 *
 * 开关按**每次装配**求值:读取发生在监听器体内,因此 settings 表单里翻转 `rebrand` 对下一个
 * 请求立即生效,既不需要重启也不需要重新注册。
 *
 * 注册走 `ctx.effect`:卸载插件(HMR 重载)会摘掉监听器,与段落注册同属上游那条
 * "registry contributions prove disposal" 红线。
 *
 * @module @falling-ts/dsh-chinese/rebrand-hook
 */

import { rebrandAssembly } from '../core/rebrand.js'
import { readRebrandRewrite } from '../core/settings.js'

/**
 * 上游在 `Events` 接口里声明的装配 waterfall 事件名。
 * @type {string}
 */
const ASSEMBLE_EVENT = 'system-prompt/assemble'

/**
 * 把产品名替换挂到装配 waterfall 上。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 插件上下文。
 * @returns {void}
 */
export function registerRebrandRewrite(ctx) {
  ctx.effect(
    () => ctx.on(ASSEMBLE_EVENT, async (assembly, _context, next) => {
      // 先委派。waterfall 的最终值由 `next()` 决定,不调用它就是短路整条链。
      const resolved = await next()
      return readRebrandRewrite() ? rebrandAssembly(resolved) : resolved
    }),
    'dsh-chinese: rebrand rewrite',
  )
}

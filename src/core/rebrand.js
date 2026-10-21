/**
 * dsh-chinese 产品名替换 —— 把 harness 写进系统提示词的产品名换成本部署自己的名字。
 *
 * 为什么是"改写"而不是再加一个段落:注册表的 `ctx.systemPrompt.section()` 只能**追加**
 * 文本,而本功能要换掉的名字**已经存在**于提示词里。身份句
 * `You are an AI agent powered by DeepSeek Harness.` 由 `SystemPrompt` 的构造函数自己注册
 * (`packages/core/system-prompt/src/index.ts`),本插件无法用同名段落盖掉它——同名注册直接
 * duplicate throw。因此走注册表公开的 `system-prompt/assemble` waterfall:它同样在上游
 * `Events` 接口里声明、带 `@mode waterfall` 文档,是官方扩展点而不是运行期替换实例方法,
 * 本插件仍然不 patch 任何上游对象。
 *
 * 改写范围:`sections`(系统提示词正文)与 `variables`(插值变量)。`contexts` **刻意不动**
 * ——运行时上下文由 `refreshContext` 在每次请求用 provider 重新求值(上游 `agent.ts` 在
 * `renderPrompt` 之后调用它),任何写进 `contexts` 的改写都会被那次求值覆盖。留一个"有时
 * 生效"的行为比不写更糟,所以这里不写。
 *
 * @module @falling-ts/dsh-chinese/rebrand
 */

/** 被替换的产品名,逐字。 */
export const REBRAND_FROM = 'DeepSeek Harness'

/** 替换后的名字,逐字。 */
export const REBRAND_TO = 'Work Buddy'

/**
 * 把一段文本里的产品名**全部**换掉。
 *
 * 用 `replaceAll` 而不是带 `g` 的正则:替换词是两个普通字面量,不含正则元字符,逐个替换比
 * 构造正则更直白,也不会因为将来改动常量而引入正则转义问题。
 * @param {unknown} value - 待处理的值;非字符串(含 `undefined`)原样返回。
 * @returns {unknown} 替换后的值。
 */
export function rebrandText(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  return value.replaceAll(REBRAND_FROM, REBRAND_TO)
}

/**
 * 对一次装配结果做整体替换。
 *
 * 只重建 `sections` 与 `variables` 两个字段,其余字段按引用透传:链上可能还有别的
 * waterfall 监听器,重建整个 assembly 会把它们加进来的字段丢掉。
 * @param {unknown} assembly - 上游 `system-prompt/assemble` 的装配结果。
 * @returns {unknown} 替换后的装配结果;非对象输入原样返回。
 */
export function rebrandAssembly(assembly) {
  if (assembly === null || typeof assembly !== 'object') return assembly
  const next = { ...assembly }
  if (Array.isArray(assembly.sections)) {
    next.sections = assembly.sections.map((section) =>
      (section === null || typeof section !== 'object'
        ? section
        : { ...section, text: rebrandText(section.text) }))
  }
  const values = assembly.variables
  if (values !== null && typeof values === 'object') {
    const variables = {}
    // 插值变量的值同样会进模型请求(`renderPrompt` 用它替换 `{{…}}`),所以一起换。
    for (const key of Object.keys(values)) variables[key] = rebrandText(values[key])
    next.variables = variables
  }
  return next
}

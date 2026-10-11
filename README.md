# dsh-chinese

> DSH Cordis plugin — appends two standing rules to the system prompt of **every** model request.

[中文说明](README.cn.md)

## What it does

The plugin registers two sections on the harness system-prompt registry, so both rules
reach the model on every request in this deployment:

1. **All thinking and temporary output must be written in Chinese**, while code,
   identifiers, file paths, commands, flags, configuration keys, API names, and symbols
   stay in their original form and are never translated or rewritten.
2. **Every file edit must go through the file-editing tools.** Commands and scripts
   (mjs, js, py, or any other scripting language) are forbidden from creating, writing,
   modifying, or deleting files. They may only **verify** an edit — running tests, type
   checks, format checks, or reading a file back. When verification fails, the fix must
   also be made with the editing tool.

Both rules are on by default and can be toggled independently.

## Why the second rule names the verification path

A rule that only forbids scripts would leave the agent with no sanctioned way to check
its own work — and an agent that cannot verify will either skip verification or reach
for the forbidden mechanism anyway. Naming commands and scripts as the verification
surface, and requiring a return to the editing tool when verification fails, closes that
gap: the prohibition and the permitted use are stated in the same breath.

## How it hooks in

`ctx.systemPrompt.section()` — the documented system-prompt extension point that
first-party tool packages use themselves (`packages/fs/tool-fs/src/edit.ts`,
`packages/terminal/tool-terminal/src/index.ts`). No upstream source is touched and no
runtime object is patched.

The section text is a **provider**, not a static string, so it is re-evaluated on every
prompt assembly: flipping a toggle applies to the next request with no restart and no
re-registration. A disabled rule renders to an empty string, which the harness drops, so
it costs no tokens.

Both sections are placed immediately **before** the first-party tool guidance block
(`TOOL_BASH` and up). The edit-tool rule constrains how the `edit` and `write` tools are
used, so it must be read before their own descriptions rather than competing with
descriptions the model has already committed to.

Registration is a Cordis effect, so unloading the plugin removes both sections.

## Layout

```
dsh-chinese/
├── index.js                 # the Cordis plugin entry
├── src/
│   ├── core/
│   │   ├── prompt-text.js   # the two fixed Chinese rules + section names/orders
│   │   └── settings.js      # the falling-ts-chinese Config (two toggles)
│   └── hooks/
│       └── sections.js      # registration on the live system-prompt registry
├── cordis.patch.yml         # the opt-in patch layer (references the package by name)
├── locale/{en,zh}.json      # plugin card title/description
└── icon.svg
```

Host-only by design: the rules change what the model reads, not what the UI shows, so
there is no `web/client.js`, no `dsh.client` declaration, and no `./client` export.

## Configuration

Two toggles, read through the entry's own Config. Both default to `true`:

| Field | Default | Effect |
|---|---|---|
| `chineseOnly` | `true` | Contribute the Chinese-language rule. |
| `editToolOnly` | `true` | Contribute the edit-tool rule. |

Set them in the profile's `cordis.yml` on this plugin's entry, or from the settings
surface. Only a real boolean counts — a malformed value is treated as unset and falls
back to the default rather than being coerced, so a mistyped setting can never silently
apply the opposite of what it says.

## Install

```sh
dsh plugin --profile web add github:falling-ts/dsh-chinese      # install
dsh web --patch dsh-chinese/cordis.patch.yml                     # dev overlay
```

Installing into a profile is hot-reloaded; no restart is needed. Changing the manifest
(icon, locale, exports) does require a restart, because the profile snapshots plugin
exports at startup — that is a harness rule, not a property of this plugin.

## Verification

```sh
node exploration/ch-prompt-probe.mjs        # 78 checks, fully offline
node exploration/plugin-manifest-check.mjs  # shared manifest gate (5 plugins)
```

The probe pins the rule text verbatim (a silently dropped rule cannot fail loudly on its
own), and covers the toggle semantics, the empty-render zero-token path, the
namespace/package-name agreement across all three spellings, and that unload leaves the
registry clean.

## License

MIT

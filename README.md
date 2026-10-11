# dsh-chinese

> DSH Cordis plugin — appends three standing rules to the system prompt of **every** model request.

[中文说明](README.cn.md)

## What it does

The plugin registers three sections on the harness system-prompt registry, so all three rules
reach the model on every request in this deployment. Each rule opens with a **bolded one-line
digest** (`**…**`) of its core requirement, followed by the detail lines that remain the
actual contract:

1. **All thinking and temporary output must be written in Chinese**, while code,
   identifiers, file paths, commands, flags, configuration keys, API names, and symbols
   stay in their original form and are never translated or rewritten. The rule states
   explicitly that "thinking" means the **reasoning stream itself**, not just the part
   shown to the user, and names the observed slip — English step planning such as
   "Let me check…", "Let me look at…", "Now I need to…". See "Why rule 1 names the
   reasoning stream" below.
2. **Every file edit must go through the file-editing tools.** Commands and scripts
   (mjs, js, py, or any other scripting language) are forbidden from creating, writing,
   modifying, or deleting files. They may only **verify** an edit — running tests, type
   checks, format checks, or reading a file back. When verification fails, the fix must
   also be made with the editing tool.
3. **A verification script must run inline**, never be written to a temporary file first,
   so no scratch file is left behind to pollute the project. Multi-line code goes straight
   to the interpreter through a here-document or `-e`:

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

   Only a script meant to be kept, reused, or referenced by the project is written into
   the repository.

All three rules are on by default and can be toggled independently.

## Why the second rule names the verification path

A rule that only forbids scripts would leave the agent with no sanctioned way to check
its own work — and an agent that cannot verify will either skip verification or reach
for the forbidden mechanism anyway. Naming commands and scripts as the verification
surface, and requiring a return to the editing tool when verification fails, closes that
gap: the prohibition and the permitted use are stated in the same breath.

## Why the third rule is its own section

The second rule says **whether** a script may run (verification only); the third says
**how** to run it once it may (inline, leaving nothing behind). Creating a script in order
to run it is itself a file creation — but one the second rule cannot forbid without also
forbidding the verification it mandates, so the third rule closes that gap instead of
contradicting the other.

The escape hatch matters as much as the default: a helper that is genuinely reused, or
referenced by the project, is a real repository file, and keeping it out would only push
useful tooling out of version control.

## Why rule 1 names the reasoning stream

Measured on this deployment's session log (Chinese density = `CJK/(CJK + Latin)`, computed
after stripping code blocks, per content-block kind):

| Block kind | Blocks | Mean Chinese density | Predominantly English (len > 40) |
|------------|--------|----------------------|----------------------------------|
| visible output `text` | 131 | 0.660 | 3% |
| reasoning stream `reasoning` | 210 | 0.460 | 26% |

Visible output held up; the reasoning stream did not — and every predominantly English
block was the same register: "Let me…" step planning, which the rule already names as
"计划、进度说明". The model was reading "思考" as "the thinking I show the user" and
treating the reasoning stream as unconstrained scratch space. Rule 1 therefore binds the
clause to the reasoning stream by name, states that the surrounding context's language is
irrelevant (the rest of the system prompt, file contents, and tool results are all
English), and names the observed pattern so the slip is recognizable in the act.

## Why rule 1 sits at the very end of the prompt

The two rule groups fail differently, so they are placed differently:

- The **tool rules** (edit / inline) scope a mechanism the model is about to use, so they
  must precede the first-party tool guidance.
- The **language rule** is a standing property of every reasoning step. What erodes it is
  not a competing instruction but the sheer volume of English around it (the assembled
  system prompt is mostly English, as are the conversation, file contents, and tool
  results). Within one session, the reasoning stream's Chinese density fell from 0.616 at
  the turn's first step to 0.382 / 0.353 / 0.378 by steps 3, 5, and 6 — the classic
  dilution profile. Recency is the lever available for that, so the language section
  anchors to the registry's final slot, `DEPLOYMENT_PERSONA_SUFFIX`, + 1.

When that tail anchor cannot be resolved the plugin **omits the language section** rather
than guessing a position: a silently mid-prompt Chinese rule is worse than an absent one,
because a user who turned it on would believe it was working. (Mirroring a literal for the
tool anchor is fine — landing slightly early among tool guidance is harmless.)

## How it hooks in

`ctx.systemPrompt.section()` — the documented system-prompt extension point that
first-party tool packages use themselves (`packages/fs/tool-fs/src/edit.ts`,
`packages/terminal/tool-terminal/src/index.ts`). No upstream source is touched and no
runtime object is patched.

The section text is a **provider**, not a static string, so it is re-evaluated on every
prompt assembly: flipping a toggle applies to the next request with no restart and no
re-registration. A disabled rule renders to an empty string, which the harness drops, so
it costs no tokens.

Two anchors place the sections in two different spots:

- The **tool rules** (edit / inline) go immediately **before** the first-party tool
  guidance block (`TOOL_BASH` and up). The edit-tool rule constrains how the `edit` and
  `write` tools are used, so it must be read before their own descriptions rather than
  competing with descriptions the model has already committed to. When that anchor cannot
  be resolved the rules fall back to the mirrored literal `1000` (slightly early among
  tool guidance — harmless).
- The **language rule** goes at the **very end of the prompt**
  (`DEPLOYMENT_PERSONA_SUFFIX` + 1), for the reason above. When that anchor cannot be
  resolved the section is **omitted** instead of misplaced.

Registration is a Cordis effect, so unloading the plugin removes all three sections.

## Layout

```
dsh-chinese/
├── index.js                 # the Cordis plugin entry
├── src/
│   ├── core/
│   │   ├── prompt-text.js   # the three fixed Chinese rules (each with a bolded digest) + section names/orders
│   │   └── settings.js      # the falling-ts-chinese Config (three toggles)
│   └── hooks/
│       └── sections.js      # registration on the live system-prompt registry
├── cordis.patch.yml         # the opt-in patch layer (references the package by name)
├── locale/{en,zh}.json      # plugin card title/description
└── icon.svg
```

Host-only by design: the rules change what the model reads, not what the UI shows, so
there is no `web/client.js`, no `dsh.client` declaration, and no `./client` export.

## Configuration

Three toggles, read through the entry's own Config. All default to `true`:

| Field | Default | Effect |
|---|---|---|
| `chineseOnly` | `true` | Contribute the Chinese-language rule. |
| `editToolOnly` | `true` | Contribute the edit-tool rule. |
| `inlineScriptOnly` | `true` | Contribute the inline-verification-script rule. |

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
node exploration/ch-prompt-probe.mjs        # 131 checks, fully offline
node exploration/plugin-manifest-check.mjs  # shared manifest gate (5 plugins)
```

The probe pins the rule text verbatim (a silently dropped rule cannot fail loudly on its
own), and covers the toggle semantics, the empty-render zero-token path, the
namespace/package-name agreement across all three spellings, and that unload leaves the
registry clean. Placement and the degradation path are asserted too: the two tool rules
before `TOOL_BASH`, the language section as the **last** rendered block, and **no**
language section at all when the tail anchor cannot be resolved.

## License

MIT

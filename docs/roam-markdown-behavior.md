# Roam MCP agent-markdown: the wire format, old vs new, and the per-transport transition

> **What this is.** A reference for the markdown format Roam's MCP servers emit on reads and accept
> on writes — how it behaved, how it changed, and the transition state you have to reason about
> right now because the change is deployed unevenly across transports.
>
> **History.** This started as a bug report: three round-trip data-loss bugs, measured against a live
> graph on 2026-07-09/10 on **both** transports and confirmed against the rendered page. Those bugs
> are now **fixed** in relemma PR **#2659** (`fix/mcp-italics-headings-etc`, merged to relemma master
> 2026-07-15, merge `43a4e9c73`) — largely as this doc recommended. The measurements are kept below
> as the evidence for _why_ the format changed. Where a fact still says "measured on old format," note
> that the **remote transport still emits that old format until it redeploys** (§5).

---

## 1. Background: the wire format and two transports

Roam exposes graph data to AI agents over MCP. Agents read with `get_page` / `get_block` / `search`
/ `get_backlinks` / `get_comments` and write with `create_page` / `create_block` / `update_block`
/ `move_block` / `delete_*`. There are two server implementations, both backed by shared Clojure(Script)
in the `relemma` repo (`../relemma-2`):

| Transport  | Where                                                                         | Notes                      |
| ---------- | ----------------------------------------------------------------------------- | -------------------------- |
| **Local**  | Desktop app's local HTTP API (`user_api/*.cljs`)                              | bundled with Roam Desktop  |
| **Remote** | hosted `mcp.roamresearch.com` (`functions_ts` → backend `mcp_action_api.clj`) | proxies to the AWS backend |

Both render/parse through shared code under `src/common/relemma/common/api/`
(`ai_markdown.cljc` = the read/export layer; `import/markdown.cljc` = the write/import parser;
`preprocessors.cljc` = the write-normalization choke point). That shared layer is why the two
transports agree on almost everything — and why a format change ships to both once each deploys.

**The one root cause behind all three original bugs:** reads returned a _rendering_ of a block while
`update_block` stored its `string` **verbatim**. So the most ordinary edit — read a block, change a
word, write it back — fed rendered text into a literal-text sink and corrupted it. For two of the
three, the corruption was **invisible through the MCP read channel** (`get_block` returned
byte-identical text before and after); only a raw `datalog_query` on `:block/string`, or the Roam UI,
revealed it.

> **Measurement technique (still the way to check anything here):** `datalog_query` on `:block/string`
> is the only way to see what Roam actually _stored_. `get_page`/`get_block` accept only
> `title`/`uid`/`maxDepth` — no `raw` option — so they always return the processed rendering. Every
> finding below compares (1) markdown sent in, (2) `:block/string` stored, (3) markdown read back,
> (4) the rendered page.

---

## 2. Why it changed: three measured round-trip bugs (now fixed by #2659)

Each bug is shown as it behaved on the **old** format, with the fix that shipped.

### 2a. Italics — `__x__` stored, `*x*` emitted → corrupted on write-back → **fixed** (`7b7e1c1f9`)

Roam stores italics as `__x__`. The old export emitted `*x*`, but **`*x*` is not italics in Roam** —
it renders as literal characters. Measured:

| raw `:block/string`     | rendered as                     |
| ----------------------- | ------------------------------- |
| `__double underscore__` | _italics_                       |
| `*single asterisk*`     | literal `*single asterisk*`     |
| `_single underscore_`   | literal `_single underscore_`   |
| `**double asterisk**`   | **bold** (bold was always safe) |

The round trip, measured (page `zzz-roundtrip`): a control and a victim block both stored
`__italics__`. The agent read the victim — old export returned `*italics*` — and wrote that back
verbatim. Raw storage after: the victim now holds `*italics*` (italics destroyed); `get_block`
returned byte-identical text before and after, so the damage was undetectable through the read
channel. The control, never touched, still rendered italic.

**Fix:** the export now emits `__x__` (`ai_markdown.cljc` `:italics` method). Reads and writes speak
the same italics dialect, so copy-back is lossless. (Agents that don't know `__x__` learn it from the
`roamSyntax` guide — see §7.)

### 2b. Headings — `# ` prefix reconstructed on read → doubled on write-back → **fixed** (`94e1032f0`)

The old export prepended `# `/`## `/`### ` reconstructed from the `:block/heading` attribute; the
`:block/string` itself held no hashes. Measured (page `zzz-heading-test`): `# H1 at start` written →
stored string `H1 at start` with `:block/heading 1`; `get_page` reconstructed `# H1 at start`; writing
that back stored the literal `# H1 at start` **and kept** `:block/heading 1`, so `get_block` then
returned `# # H1 at start` — the marker doubled every round trip.

**Fix:** heading level now rides the metadata tag — `<roam uid="…" heading="N"/>` — instead of a `# `
prefix, so the block _string_ round-trips verbatim. On write, heading is set via `update_block`'s
existing `heading` param. Companion commit `4aa373d0e` moved child view type onto the tag the same way
(`childrenViewType="numbered|document"`, uniform `- ` bullet for every block), and `bd2fd859f` made the
importer keep headings **flat** for outliner-shaped agent markdown (see §6 for the residual import-side
`####` clamp).

### 2c. Block refs — `((uid))` emitted as a writable alias → froze the reference → **fixed** (`38bb2771f`)

The old export expanded a first-level `((uid))` into `[resolved text](((uid)))` — genuine Roam **alias**
syntax. Measured (page `zzz-rem-ref`): a block `Referencing: ((5GBrPB5KH)) end` read back as
`Referencing: [Target block with *italics* inside](((5GBrPB5KH))) end` (note the target's italics
already corrupted inside the label). Writing that back stored the alias — the live reference was gone,
replaced by a static snapshot that would never track edits to the target. Invisible through the read
channel, again. This was the most destructive of the three because it silently severed a graph edge.

**Fix — and it differs from this doc's original proposal.** This doc had recommended keeping the
faithful `((uid))` in the markdown and returning resolutions in a uid-keyed **sibling field**
(`blockRefs`). #2659 instead kept the preview **inline** but as a **server-decoded wire annotation**:

```
((uid))<ref>resolved preview text</ref>
```

and added `decode-ai-annotations` on **every shared write path**, which strips `<ref>…</ref>` back to
`((uid))` (and drops stray `<roam …/>` tags) — so an agent editing a block can leave the
`((uid))<ref>…</ref>` annotation in place and the server reduces it to `((uid))` (it must still drop the
line's leading `- `/indent and the `<roam>` tag; see §3 write-back). Previews are sanitized
(`</ref>`/backtick escaped) so a line always decodes cleanly; genuine
aliases `[text](((uid)))` stay raw. This is a cleaner mechanism than the sibling-map for the common
case (the preview stays adjacent in reading order; no correlation step) — its cost is that write-path
coverage must be exhaustive (see the encrypted-capture gap in §6, since fixed).

---

## 3. The new wire format (post-#2659) — reference

What a read emits once a transport has deployed #2659:

- **One line per block:** `- <content> <roam uid="…" [heading="N"] [childrenViewType="…"] [refs="N"] [hiddenChildren="N"]/>`.
  Uniform `- ` marker regardless of view type.
- **`<roam>` tag attributes**, in order: `uid` (always), then optional `heading` (1–3, only when the
  block is a heading), `childrenViewType` (`numbered`|`document`, only when not a plain bullet), `refs`
  (backlink count, when >0), `hiddenChildren` (children truncated by maxDepth). Attribute names
  deliberately match the `update_block` write params. Strip the whole tag before showing content to a
  user; honor `heading`/`childrenViewType` when reconstructing structure.
- **Italics** `__x__`; **bold** `**x**`; **highlight** `^^x^^`; **strike** `~~x~~`.
- **Block reference** `((uid))<ref>preview</ref>` — `<ref>` holds the referenced block's resolved text.
  For display, show the preview and drop the `((uid))` + tag.
- **Write-back:** to edit a block via `update_block`, pass its **content** — first drop the leading
  `- `/indentation and the trailing `<roam …/>` tag (they aren't part of the block string), but **keep any
  `((uid))<ref>…</ref>` intact**: the server decodes it back to `((uid))`. Do NOT write the display-cleaned
  text (a preview without its `((uid))`) — that replaces the live reference with static text; and a
  tags-only strip that leaves the `<ref>` preview behind stores it as duplicate content.

(Source of truth: relemma `src/common/relemma/common/api/ai_markdown.cljc` `block-metadata-tag` +
`:block-ref` emit; agent-facing summary in `.../export/ai_markdown.cljs` "Syntax Quick Reference".)

---

## 4. Old vs new, at a glance

| Construct                 | OLD format (pre-#2659)             | NEW format (post-#2659)                               |
| ------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Italics                   | `*x*`                              | `__x__`                                               |
| Heading                   | `# `/`## `/`### ` content prefix   | `heading="N"` on the `<roam>` tag                     |
| Child view type           | (not surfaced)                     | `childrenViewType="…"` on the `<roam>` tag            |
| Block reference           | `[text](((uid)))` (writable alias) | `((uid))<ref>preview</ref>` (server-decoded on write) |
| Bullet marker             | varied                             | uniform `- `                                          |
| Write-back of a read line | **corrupts** italics/headings/refs | **safe** — server decodes wire annotations            |

Bold, highlight, strike, `{{[[TODO]]}}`, `Name:: value`, `[[Page]]`/`#tag` links, tables (write pipe →
stored `{{[[table]]}}` + nested children → read back nested), and the escape rule are unchanged across
both formats.

---

## 5. Per-transport deployment state — the transition window (READ THIS)

**#2659 is merged to relemma master but rolling out unevenly.** The parity this doc measured
("reproduces identically on local and remote") is **temporarily FALSE** while the change deploys:

- **Remote / hosted MCP** is served by the `remote-mcp-additions` branch (PR #2634), which until its
  next deploy **lacks #2659 → still emits the OLD format** (`*italics*`, `# ` prefixes,
  `[text](((uid)))` aliases). Master has been merged into that branch and the follow-up fixes staged;
  the next deploy of it is what flips remote to the new format. The hosted MCP also pins
  `roam-tools-core ^0.8.0`, so this repo's new-format tool descriptions / `roamSyntax` reach hosted
  only after that pin moves to `^0.9.0` and functions_ts redeploys (§7).
- **Local / Desktop MCP** emits the new format once a Desktop build carrying #2659 ships (separate
  cadence).

| Behavior                   | Local (Desktop)              | Remote (hosted, today)     |
| -------------------------- | ---------------------------- | -------------------------- |
| Italics on read            | new `__x__` once build ships | **old `*x*`** until deploy |
| Heading on read            | `heading=` tag once shipped  | **old `# ` prefix**        |
| Block ref on read          | `((uid))<ref>` once shipped  | **old `[text](((uid)))`**  |
| Write-back safety (decode) | present once shipped         | **absent** until deploy    |

**Implication:** any agent-facing guidance that assumes the new format is _wrong for remote graphs
until remote redeploys._ This is the deployment gate that paces the roam-tools syntax work (§7).

---

## 6. Residual gaps & accepted divergences

- **`####` clamps to H3 (import side, still present).** `#### H4 at start` stores `H4 at start` with
  `:block/heading 3` — H3 and H4 silently merge into one visual tier. #2659 moved heading _off_ the read
  string (fixing the round-trip), but the importer still maps level 4→3. Open: reject `####`, keep it
  literal, or support deeper levels. Reproduced on both transports.
- **Headings restructure the outline on write.** A heading nests the blocks after it as its children
  until the next equal-or-higher heading (measured: seven flat sibling bullets → a three-level tree; a
  bullet meant for page root landed two levels deep). This is the standard markdown→outline mapping and
  is arguably correct; `bd2fd859f`'s `flat-headings-when-outline?` keeps outliner-shaped agent markdown
  flat, mitigating the surprise for API writes.
- **Nested-ref uid loss (still present in #2659).** Only a _first-level_ ref gets the `((uid))<ref>`
  form; a ref nested inside a resolved preview is emitted as bare text with **no uid** — unrecoverable.
  Derived from the code; any future ref fix should cover both levels.
- **Encrypted-capture decode bypass — WAS a gap, now FIXED.** The encrypted-graph Append API path
  (`append_api_capture.cljs`) parses markdown outside the shared preprocessors, so it would have
  persisted `<ref>`/`<roam>` annotations and slurped heading children. The relemma agent gated it on
  the MCP `attribute-to-ai-user` flag and now runs `decode-ai-annotations` + `flat-headings-when-outline?`
  there too (staged alongside the #2634 integration).
- **Ordered-list marker divergence — accepted.** Same `create_block` input `1. first item`: local
  (cljs `marked`) stores literal `"1. first item"`, remote (clj `nextjournal`) stores `"first item"`.
  Neither sets `childrenViewType`, so `1.`/`2.` never makes a numbered list on either — use
  `childrenViewType: "numbered"` on the parent. Documented as accepted dialect drift in
  `import/markdown.cljc` (`:accepted-divergence` fixtures). Agent guidance is identical either way
  ("never write `1.`"), so it's not a defect — just the one genuine local/remote difference.

---

## 7. What this means for roam-tools (this repo)

The format change is _why_ this repo now ships syntax guidance written to the new format:

- **`roamSyntax`** — a graph-agnostic guide added to `get_graph_guidelines`' output
  (`packages/core/src/roam-syntax.ts` → attached in `operations/pages.ts`). It teaches the new format
  once per graph, through the orientation call agents are already required to make. Reaches the local
  transport and the hosted transport for **non-encrypted** graphs (both dispatch `get_graph_guidelines`
  through core's `getGuidelines`); hosted **encrypted**-graph guidelines are synthesized in functions_ts
  and bypass core, so that path must include `ROAM_SYNTAX` separately (a relemma-side change).
- **Read-tool descriptions** (`packages/core/src/tools.ts`, shared `READ_FORMAT_NOTE`) tell agents how to
  read `<roam>`/`<ref>` output and how to write it back without losing block references.
- **`skills/roam-syntax/`** — a fuller Agent Skill for clients that install it.

All of this is **gated on deployment (§5):** it must not be published/released for a transport until
that transport actually emits the new format — remote via the `remote-mcp-additions` deploy + the
`^0.9.0` core pin bump, local via the Desktop build. `roamSyntax` is the canonical source; the skill
and descriptions restate the same invariants.

---

## Appendix: reproducing / verifying any claim here

1. Write with `create_page` / `create_block`.
2. Read `:block/string` with `datalog_query` — **not** `get_page` — to see what was actually stored.
3. Read the same block with `get_page` / `get_block` to see the rendering layer.
4. Feed that rendering back through `update_block`, then re-read `:block/string` to expose (old format)
   or confirm the absence of (new format) round-trip corruption.
5. Screenshot the page — for the italics and block-ref cases on the old format, the rendered view is
   the only channel that shows the corruption; the MCP read output is unchanged.

Because remote and local can be on different formats during the transition (§5), **run against the
transport you actually mean to characterize**, and note which format it's emitting before drawing
conclusions.

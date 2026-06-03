/**
 * A compact, graph-agnostic guide to writing into a Roam graph, returned by
 * get_graph_guidelines so an agent sees it before its first write.
 *
 * This is universal Roam knowledge — distinct from the user's own
 * `[[roam/agent guidelines]]` page, which is surfaced separately as the
 * `guidelines` field. Keep it tight: deep per-feature detail belongs in the
 * roam-syntax skill / Roam's hosted help, not here.
 */
export const ROAM_SYNTAX = [
  "Writing into a Roam graph (applies to every graph). Use the graph — don't dump prose:",
  "",
  "MODEL. A page is a tree of blocks (one bullet = one block); write in short blocks and nest them (indentation = hierarchy), and link liberally — that structure and those links are the point of Roam, not flat paragraphs. Soft line break = Shift+Enter (text stays in one block).",
  "",
  "LINK. [[Page]] (page link + backlink); ((uid)) block reference (uids are usually 9 chars but can be any length — preserve them, never duplicate); #tag / #[[multi word]]; alias [label]([[Page]]) / [label](((uid))) / [label](https://url). Mention an entity, link it.",
  "",
  "STRUCTURE. Headings #/##/### (H1-H3); attributes Name:: value (queryable metadata); tasks {{[[TODO]]}} / {{[[DONE]]}}.",
  "",
  "FORMATTING. Bold **text**; italics __text__ (double-underscore is ITALICS, not bold); highlight ^^text^^; strikethrough ~~text~~; `inline code`; fenced code + language; math $$KaTeX$$; > blockquote; --- rule; image ![](url) or /upload.",
  "",
  "QUERIES & DATA. {{query: {and: [[A]] {not: [[B]]}}}} (the {{[[query]]: ...}} form also renders) for a live list. {search: text} is a sub-clause nested inside {and:}/{or:}, not standalone. {between: [[start]] [[end]]} works on Daily Notes pages only and takes date shorthands like [[today]] / [[last week]]. For arbitrary-date or graph-wide queries, use a :q Datalog block.",
  "",
  "COMPONENTS ({{[[name]]: arg}} or /name): video (YouTube/Vimeo/Loom), table, kanban (1st-level children = columns, their children = cards), mermaid (source in child blocks), embed ({{embed: ((uid))}}; also embed-children, embed-path), mentions, calc, roam/render, roam/css. A block ref ((uid)) points to a block; an embed renders a live editable copy — don't conflate them.",
  "",
  "GOOD SHAPE. A few heading blocks (often [[refs]]) with content nested under; reuse with ((refs))/{{embed:}} when identity or edit-propagation matters, copy text when you want an independent copy.",
  "",
  "ESCAPING (only when writing ABOUT syntax). Markup renders live, which is what you want when you mean it. If your text documents syntax — explaining how [[links]] or {{[[TODO]]}} work — wrap those examples in `inline code` so they do not become real pages/refs.",
  "",
  "WHEN THIS IS NOT ENOUGH: (1) call get_graph_guidelines for graph-specific rules; (2) search THIS graph (the search tool, then get_page / get_backlinks) for prior art and copy what works — you are in the USER's graph, not Roam's help graph, so pages like [[Query]] or [[Kanban]] may be absent or user-specific; (3) for full syntax, components, and :q/Datalog, read Roam's hosted help at https://roamresearch.com/#/app/help and the dev docs at https://roamresearch.com/#/app/developer-documentation . If you cannot source it, say what is uncertain before writing live syntax.",
].join("\n");

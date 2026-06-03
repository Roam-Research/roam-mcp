# Roam attributes and class-tag styling

Every example is shown in `code` so it stays literal — type it without the backticks to make it live.

## Attributes

- `Name:: value` (double colon) creates a queryable attribute page; a single `:` or `**bold:**` does not. Values can be text, `[[page]]`, `#tag`, embeds, or child blocks.
- The help graph uses empty-value attributes as section labels (`## Community Videos::`, `Articles::`, `Key Commands::`) — a convention, not required syntax.
- A page-level `Type:: #TypeName` attribute (multi-type allowed, e.g. `Type:: #Project #Blog`) shows a chip by the page title that opens a typed-fields sidebar panel.
- The attribute-table macro `{{=: ...}}` appears once in the corpus and is otherwise undocumented — verify before relying on it. Source: Attributes.md, roam/templates.md, Change Log.md.

## Class-tags (styling)

- Any `#.classname` adds that CSS class to the block; Tailwind + Blueprint ship built in (`#.bg-blue-500`, `#.text-xl`, `#.bp3-card`).
- `#.rm-E` — shows immediate children inline (first level only; re-tag to go deeper).
- `#.rm-g` — hides the container and promotes children up one level (use `[[.rm-g]]` to keep it visible).
- `#.rm-hide` — collapses the block to a thin bar until clicked open (for hiding metadata).
- `.rm-grid` is NOT a documented class. Source: Tag Styles.md.

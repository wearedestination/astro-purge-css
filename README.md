# Astro PurgeCSS

Astro integration that removes unused CSS from a static build, then inlines the stylesheets that are small enough
and rehashes the rest.

It runs [PurgeCSS](https://purgecss.com/) over the built site rather than the source, so classes that only appear in
CMS content are kept. Scripts are scanned too, both those bundled into `_astro/` and those inline in pages, so
classes they add at runtime are kept as long as they appear in the script whole.

## Installation

```console
npm install --save-dev @destination/astro-purge-css
```

## Usage

```js
// astro.config.mjs
import purgeCss from "@destination/astro-purge-css";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [
		purgeCss({
			// Inline stylesheets that gzip to 12 KiB or less once purged; link the rest.
			inlineLimit: 12 * 1024,
		}),
	],
});
```

| Option              | Default | Description                                                                                                                                                         |
|---------------------|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `inlineLimit`       | `0`     | Largest gzipped size, in bytes, of a purged stylesheet to inline into the pages that link it. `0` inlines nothing.                                                  |
| `safelist`          | `[]`    | Selectors to keep that don't appear whole in any built file, such as class names a library builds from a prefix (`[/swiper-/]`). Passed to PurgeCSS's `safelist`. |
| `dynamicAttributes` | `[]`    | Attributes scripts set on the page, so selectors on them are kept even when no built page has them (`["hidden", "aria-invalid"]`).                                  |

The integration sets Astro's `build.inlineStylesheets` to `"never"`, because a stylesheet Astro inlines itself can't
be purged; `inlineLimit` takes its place.

A stylesheet that isn't inlined is written under a new hash of its purged content. `/_astro/` is normally cached as
immutable, and the purged CSS can change when only the content does.

## Requirements

Every page must be prerendered. A page rendered on request has no HTML to scan, and its server code links
stylesheets by their original names, so the build fails if any route isn't prerendered.

## Compared to astro-purgecss

[astro-purgecss](https://www.npmjs.com/package/astro-purgecss) is a more general PurgeCSS wrapper. This integration
is narrower:

- **Small stylesheets are still inlined.** Both integrations need Astro's `inlineStylesheets` set to `"never"`; this
  one inlines stylesheets that are small after purging, through `inlineLimit`.
- **HTML is parsed rather than matched with a regex**, so attribute values are read whole and selectors such as
  `[href$="/contact/"]` are kept.
- **Static sites only.** It fails the build rather than risk purging CSS a page rendered on request still needs. For
  SSR, use astro-purgecss.
- **Few options.** It exposes `safelist` and `dynamicAttributes` rather than every PurgeCSS option.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development and release steps.

## License

MIT

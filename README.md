# Astro PurgeCSS

Astro integration that removes unused CSS from a static build, then inlines the stylesheets that are small enough
and rehashes the rest.

It runs [PurgeCSS](https://purgecss.com/) over the built site rather than the source, so classes that only appear in
CMS content are kept. Scripts are scanned too, both those bundled into `_astro/` and those inline in pages, so
classes they add at runtime are kept as long as they appear in the script whole.

## Installation

```console
pnpm add -D @destination/astro-purge-css
```

## Usage

```js
// astro.config.mjs
import purgeCss from "@destination/astro-purge-css";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [purgeCss({ inlineLimit: 12 * 1024 })],
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

## Development

```console
npm ci
npm run check
npm run type-check
npm test
```

The tests build the sites in `test/fixtures` with Astro and check their output.

To release, bump `version` in `package.json`, commit, and push a matching `v<version>` tag. The publish workflow
tests the package and publishes it to npm through trusted publishing (GitHub OIDC), so it needs no token.

## License

MIT

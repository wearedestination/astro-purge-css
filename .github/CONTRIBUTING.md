# Contributing

## Development

```console
npm ci
npm run check
npm run type-check
npm test
```

`test/index.test.ts` builds the sites in `test/fixtures` with Astro and checks their output. The other test files
unit test the module of the same name in `src`.

## Pull requests

- Cover any change in behaviour with a test in `test/index.test.ts`. If the existing sites don't show the case,
  add a fixture site under `test/fixtures`. Edge cases of a module's own logic can go in its unit test instead.
- Update the README when an option or its behaviour changes.
- CI runs the check, type-check and tests on every pull request, so run them locally first.
- You're the author of every commit in your pull request, however it was written. Don't add `Co-Authored-By`
  trailers or other credit for AI tools.

## Releasing

Bump `version` in `package.json`, commit, and push a matching `v<version>` tag. The publish workflow tests the
package and publishes it to npm through trusted publishing (GitHub OIDC), so it needs no token.

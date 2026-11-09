# Contributing

## Development

```console
npm ci
npm run check
npm run type-check
npm test
```

The tests build the sites in `test/fixtures` with Astro and check their output.

## Pull requests

- Cover any change in behaviour with a test in `test/index.test.ts`. If the existing sites don't show the case,
  add a fixture site under `test/fixtures`.
- Update the README when an option or its behaviour changes.
- CI runs the check, type-check and tests on every pull request, so run them locally first.

## Releasing

Bump `version` in `package.json`, commit, and push a matching `v<version>` tag. The publish workflow tests the
package and publishes it to npm through trusted publishing (GitHub OIDC), so it needs no token.

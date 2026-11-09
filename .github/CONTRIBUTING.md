# Contributing

## Development

```console
npm ci
npm run check
npm run type-check
npm test
```

The tests build the sites in `test/fixtures` with Astro and check their output.

## Releasing

Bump `version` in `package.json`, commit, and push a matching `v<version>` tag. The publish workflow tests the
package and publishes it to npm through trusted publishing (GitHub OIDC), so it needs no token.

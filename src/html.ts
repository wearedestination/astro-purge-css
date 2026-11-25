/**
 * Points a page's stylesheets at their purged versions. A `<link>` to a
 * stylesheet in `inlined` becomes a `<style>` element holding its CSS; any
 * other reference to a stylesheet in `renamed` takes its new name. Both maps
 * are keyed by the original file name in `/_astro/`.
 */
export function rewriteStylesheets(
  page: string,
  inlined: ReadonlyMap<string, string>,
  renamed: ReadonlyMap<string, string>,
): string {
  return page
    .replaceAll(/<link rel="stylesheet" href="\/_astro\/([\w.-]+\.css)">/g, (match, name: string) => {
      const css = inlined.get(name);

      // A literal `</style` would end the element early.
      return css === undefined ? match : `<style>${css.replaceAll("</style", String.raw`<\/style`)}</style>`;
    })
    .replaceAll(/\/_astro\/([\w.-]+\.css)/g, (match, name: string) => {
      const newName = renamed.get(name);

      return newName === undefined ? match : `/_astro/${newName}`;
    });
}

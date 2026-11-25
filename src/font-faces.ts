import { type AtRule, parse } from "postcss";

/**
 * Removes `@font-face` rules whose family no remaining declaration names.
 * PurgeCSS's own `fontFace` option reads only `font-family`, so it drops a
 * family named in the `font` shorthand or only in a custom property, as in
 * `--font-text: Inter; font: 1rem var(--font-text)`. This reads all three. A
 * custom property counts even if nothing uses it, which can keep a font but
 * never drops one that's needed.
 */
export function purgeFontFaces(css: string): string {
  if (!css.includes("@font-face")) {
    return css;
  }

  const root = parse(css);
  const values: string[] = [];

  root.walkDecls((decl) => {
    const parent = decl.parent;

    if (parent?.type === "atrule" && (parent as AtRule).name === "font-face") {
      return;
    }

    if (decl.prop === "font-family" || decl.prop === "font" || decl.prop.startsWith("--")) {
      values.push(decl.value);
    }
  });

  root.walkAtRules("font-face", (rule) => {
    let family = "";

    rule.walkDecls("font-family", (decl) => {
      family = decl.value.trim().replace(/^(["'])(.*)\1$/, "$2");
    });

    if (!family) {
      return;
    }

    const escaped = family.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    // Family names are case-insensitive, and the name may be quoted, or end a
    // shorthand like `900 1rem/1 Inter`.
    const named = new RegExp(`(^|[\\s,"'])${escaped}($|[\\s,"'!])`, "i");

    if (!values.some((value) => named.test(value))) {
      rule.remove();
    }
  });

  return root.toString();
}

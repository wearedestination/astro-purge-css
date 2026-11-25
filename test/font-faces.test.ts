import { describe, expect, test } from "vitest";
import { purgeFontFaces } from "../src/font-faces";

const face = (family: string) => `@font-face{font-family:${family};src:url(x.woff2)}`;

describe("purgeFontFaces", () => {
  test("returns CSS without font faces unchanged", () => {
    const css = ".a { color: red }";
    expect(purgeFontFaces(css)).toBe(css);
  });

  test.each([
    ["font-family", "body{font-family:Inter,sans-serif}"],
    ["the font shorthand", "body{font:900 1rem/1 Inter}"],
    ["a custom property", ":root{--font-text:Inter}"],
    ["a different case", "body{font-family:inter}"],
    ["a quoted name", `body{font-family:"Inter"}`],
    ["!important", "body{font-family:Inter!important}"],
  ])("keeps a face named in %s", (_, rule) => {
    expect(purgeFontFaces(face("Inter") + rule)).toContain("@font-face");
  });

  test("keeps a quoted family with spaces", () => {
    const css = face(`"Family Sans"`) + `body{font-family:"Family Sans",serif}`;
    expect(purgeFontFaces(css)).toContain("@font-face");
  });

  test("removes a face no declaration names", () => {
    expect(purgeFontFaces(face("Orphan") + "body{font-family:Inter}")).not.toContain("Orphan");
  });

  test("doesn't count a family name inside a longer one", () => {
    expect(purgeFontFaces(face("Inter") + "body{font-family:InterVariable}")).not.toContain("@font-face");
  });

  test("doesn't count the face's own font-family", () => {
    expect(purgeFontFaces(face("Inter"))).not.toContain("@font-face");
  });

  test("escapes regex characters in the family", () => {
    expect(purgeFontFaces(face(`"A+B"`) + `body{font-family:"A+B"}`)).toContain("@font-face");
    expect(purgeFontFaces(face(`"A+B"`) + `body{font-family:"AAB"}`)).not.toContain("@font-face");
  });

  test("keeps a face with no font-family", () => {
    const css = "@font-face{src:url(x.woff2)}";
    expect(purgeFontFaces(css)).toContain("@font-face");
  });
});

import { describe, expect, test } from "vitest";
import { rewriteStylesheets } from "../src/html";

const link = (name: string) => `<link rel="stylesheet" href="/_astro/${name}">`;

describe("rewriteStylesheets", () => {
  test("inlines a stylesheet in the inlined map", () => {
    const page = `<head>${link("a.123.css")}</head>`;
    expect(rewriteStylesheets(page, new Map([["a.123.css", ".a{}"]]), new Map())).toBe(
      "<head><style>.a{}</style></head>",
    );
  });

  test("escapes </style in inlined CSS", () => {
    const page = link("a.123.css");
    const css = `.a::after{content:"</style>"}`;
    expect(rewriteStylesheets(page, new Map([["a.123.css", css]]), new Map())).toBe(
      String.raw`<style>.a::after{content:"<\/style>"}</style>`,
    );
  });

  test("renames every reference to a renamed stylesheet", () => {
    const page = `<link rel="preload" href="/_astro/a.123.css">${link("a.123.css")}`;
    expect(rewriteStylesheets(page, new Map(), new Map([["a.123.css", "a.456.css"]]))).toBe(
      `<link rel="preload" href="/_astro/a.456.css">${link("a.456.css")}`,
    );
  });

  test("leaves other stylesheets alone", () => {
    const page = `${link("b.123.css")}<link rel="stylesheet" href="https://example.com/c.css">`;
    expect(rewriteStylesheets(page, new Map([["a.123.css", ".a{}"]]), new Map([["a.123.css", "a.456.css"]]))).toBe(
      page,
    );
  });
});

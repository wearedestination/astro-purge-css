import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type AstroIntegration, build } from "astro";
import { describe, expect, test } from "vitest";
import purgeCss, { type Options } from "../src/index";

const fixture = (name: string) =>
	fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));

async function buildStatic(name: string, options: Options) {
	const root = fixture("static");
	const outDir = `${root}dist/${name}/`;
	await build({
		root,
		outDir,
		logLevel: "silent",
		integrations: [purgeCss(options)],
		// Emits the page's processed script as a file rather than inlining it,
		// so bundled scripts are scanned from `_astro/`.
		vite: { build: { assetsInlineLimit: 0 } },
	});
	const html = await readFile(`${outDir}index.html`, "utf8");
	const assets = await readdir(`${outDir}_astro`);
	return {
		outDir,
		html,
		css: assets.filter((f) => f.endsWith(".css")),
		js: assets.filter((f) => f.endsWith(".js")),
	};
}

describe("a linked stylesheet", async () => {
	const { outDir, html, css, js } = await buildStatic("linked", {
		safelist: [/^swatch-/],
		dynamicAttributes: ["data-open"],
	});
	const [file] = css;
	const purged = await readFile(`${outDir}_astro/${file}`, "utf8");

	test("is rewritten under a new hash and relinked", () => {
		expect(css).toHaveLength(1);
		expect(html).toContain(`href="/_astro/${file}"`);
		expect(html).not.toContain("<style");
	});

	test("keeps selectors the build uses", () => {
		expect(js).toHaveLength(1);
		expect(purged).toContain(".used");
		expect(purged).toContain('a[href$="/contact/"]');
		expect(purged).toContain(".from-bundled-script");
		expect(purged).toContain(".from-inline-script");
	});

	test("keeps the safelist and dynamic attributes", () => {
		expect(purged).toContain(".swatch-red");
		expect(purged).toContain("[data-open]");
	});

	test("removes everything else", () => {
		expect(purged).not.toContain(".unused");
		expect(purged).not.toContain("/nowhere/");
		expect(purged).not.toContain("unused-spin");
	});
});

describe("a stylesheet within inlineLimit", async () => {
	const { html, css } = await buildStatic("inlined", { inlineLimit: 1024 });

	test("is inlined and its file removed", () => {
		expect(css).toHaveLength(0);
		expect(html).not.toContain('rel="stylesheet"');
		expect(html).toMatch(/<style>[^<]*\.used/);
		expect(html).not.toContain(".unused");
	});
});

test("fails the build when a route is rendered on request", async () => {
	const root = fixture("on-demand");
	const adapter: AstroIntegration = {
		name: "fixture-adapter",
		hooks: {
			"astro:config:done": ({ setAdapter }) =>
				setAdapter({
					name: "fixture-adapter",
					serverEntrypoint: `${root}adapter.mjs`,
					supportedAstroFeatures: { serverOutput: "stable" },
				}),
		},
	};
	await expect(
		build({
			root,
			logLevel: "silent",
			adapter,
			integrations: [purgeCss()],
		}),
	).rejects.toThrow("rendered on request: /");
});

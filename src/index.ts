import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { AstroIntegration } from "astro";
import postcss from "postcss";
import { PurgeCSS, type UserDefinedSafelist } from "purgecss";
import purgeHtml from "purgecss-from-html";

/**
 * Removes CSS that no built page uses.
 *
 * Runs on the build output rather than the source, so classes that only
 * appear in CMS content are seen. The site's scripts, bundled and inline, are
 * scanned too, which keeps the classes they add at runtime, as they appear
 * there as plain strings.
 *
 * A stylesheet whose purged CSS gzips to `inlineLimit` bytes or fewer is
 * inlined into each page that links it, which takes it off the critical path.
 * Any other is written under a new hash of its purged content: `/_astro/` is
 * cached as immutable, and the purged CSS can change with content alone. This
 * replaces Astro's own `build.inlineStylesheets`, which it sets to "never".
 *
 * Every page must be prerendered: a page rendered on request has no HTML to
 * scan, and its server code links stylesheets by their original names. The
 * build fails if any route isn't.
 */
export interface Options {
	/** Largest gzipped size, in bytes, of a stylesheet to inline. Defaults to 0, which inlines nothing. */
	inlineLimit?: number;
	/**
	 * Selectors to keep that don't appear whole in any built file, e.g. class
	 * names a library builds from a prefix. Passed to PurgeCSS as is.
	 */
	safelist?: UserDefinedSafelist;
	/**
	 * Attributes scripts set on the page, so attribute selectors on them are
	 * kept even when no built page has them, e.g. `hidden`.
	 */
	dynamicAttributes?: string[];
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

/**
 * Removes `@font-face` rules whose family no remaining declaration names.
 * PurgeCSS's own `fontFace` option reads only `font-family`, so it drops a
 * family named in the `font` shorthand or only in a custom property, as in
 * `--font-text: Inter; font: 1rem var(--font-text)`. This reads all three. A
 * custom property counts even if nothing uses it, which can keep a font but
 * never drops one that's needed.
 */
function purgeFontFaces(css: string): string {
	if (!css.includes("@font-face")) return css;
	const root = postcss.parse(css);
	const values: string[] = [];
	root.walkDecls((decl) => {
		const parent = decl.parent;
		if (
			parent?.type === "atrule" &&
			(parent as postcss.AtRule).name === "font-face"
		)
			return;
		if (
			decl.prop === "font-family" ||
			decl.prop === "font" ||
			decl.prop.startsWith("--")
		) {
			values.push(decl.value);
		}
	});
	root.walkAtRules("font-face", (rule) => {
		let family = "";
		rule.walkDecls("font-family", (decl) => {
			family = decl.value.trim().replace(/^(["'])(.*)\1$/, "$2");
		});
		if (!family) return;
		const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// Family names are case-insensitive, and the name may be quoted, or end a
		// shorthand like `900 1rem/1 Inter`.
		const named = new RegExp(`(^|[\\s,"'])${escaped}($|[\\s,"'!])`, "i");
		if (!values.some((value) => named.test(value))) rule.remove();
	});
	return root.toString();
}

async function files(dir: string, ext: string): Promise<string[]> {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true });
	return entries
		.filter((e) => e.isFile() && e.name.endsWith(ext))
		.map((e) => join(e.parentPath, e.name));
}

export default function purgeCss({
	inlineLimit = 0,
	safelist = [],
	dynamicAttributes = [],
}: Options = {}): AstroIntegration {
	let onDemand: string[] = [];

	return {
		name: "@destination/astro-purge-css",
		hooks: {
			// Stylesheets Astro inlines itself can't be purged, so they're all
			// emitted as files; the purged size then decides what's inlined.
			"astro:config:setup": ({ updateConfig }) => {
				updateConfig({ build: { inlineStylesheets: "never" } });
			},
			"astro:routes:resolved": ({ routes }) => {
				onDemand = routes
					.filter((r) => r.origin === "project" && !r.isPrerendered)
					.map((r) => r.pattern);
			},
			"astro:build:start": () => {
				if (onDemand.length) {
					throw new Error(
						`astro-purge-css needs every page prerendered, but these are rendered on request: ${onDemand.join(", ")}`,
					);
				}
			},
			"astro:build:done": async ({ dir, logger }) => {
				const outDir = fileURLToPath(dir);
				const assetsDir = join(outDir, "_astro");
				const html = await files(outDir, ".html");
				const js = await files(assetsDir, ".js").catch(() => []);
				// The HTML extractor skips script contents, so a page's inline scripts
				// are scanned as JS.
				const inlineJs: { raw: string; extension: string }[] = [];
				for (const file of html) {
					for (const [, raw] of (await readFile(file, "utf8")).matchAll(
						/<script\b[^>]*>([\s\S]*?)<\/script>/g,
					)) {
						if (raw.trim()) inlineJs.push({ raw, extension: "js" });
					}
				}

				const renamed = new Map<string, string>();
				const inlined = new Map<string, string>();
				for (const file of await files(assetsDir, ".css").catch(() => [])) {
					const before = await readFile(file, "utf8");
					const [result] = await new PurgeCSS().purge({
						content: [...html, ...js, ...inlineJs],
						css: [{ raw: before }],
						// Reads attributes whole, which selectors like `[href$="/contact/"]`
						// need; the default extractor splits values into words.
						extractors: [{ extractor: purgeHtml, extensions: ["html"] }],
						safelist,
						dynamicAttributes,
						keyframes: true,
					});
					const after = purgeFontFaces(result.css);
					const gzipped = gzipSync(after).length;
					const sizes = `${kib(before.length)} → ${kib(after.length)} (${kib(gzipped)} gzipped)`;
					await rm(file);
					if (gzipped <= inlineLimit) {
						inlined.set(basename(file), after);
						logger.info(`${basename(file)}: ${sizes}, inlined`);
						continue;
					}
					const hash = createHash("sha256")
						.update(after)
						.digest("base64url")
						.slice(0, 8);
					const name = basename(file).replace(/\.[\w-]+\.css$/, `.${hash}.css`);
					await writeFile(join(assetsDir, name), after);
					renamed.set(basename(file), name);
					logger.info(`${name}: ${sizes}`);
				}

				for (const file of html) {
					const page = await readFile(file, "utf8");
					const updated = page
						.replace(
							/<link rel="stylesheet" href="\/_astro\/([\w.-]+\.css)">/g,
							(match, name) =>
								inlined.has(name)
									? // A literal `</style` would end the element early.
										`<style>${inlined.get(name)?.replaceAll("</style", "<\\/style")}</style>`
									: match,
						)
						.replace(/\/_astro\/([\w.-]+\.css)/g, (match, name) =>
							renamed.has(name) ? `/_astro/${renamed.get(name)}` : match,
						);
					if (updated !== page) await writeFile(file, updated);
				}
			},
		},
	};
}

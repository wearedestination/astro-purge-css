import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { AstroIntegration } from "astro";
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
		name: "@wearedestination/astro-purge-css",
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
						fontFace: true,
					});
					const gzipped = gzipSync(result.css).length;
					const sizes = `${kib(before.length)} → ${kib(result.css.length)} (${kib(gzipped)} gzipped)`;
					await rm(file);
					if (gzipped <= inlineLimit) {
						inlined.set(basename(file), result.css);
						logger.info(`${basename(file)}: ${sizes}, inlined`);
						continue;
					}
					const hash = createHash("sha256")
						.update(result.css)
						.digest("base64url")
						.slice(0, 8);
					const name = basename(file).replace(/\.[\w-]+\.css$/, `.${hash}.css`);
					await writeFile(join(assetsDir, name), result.css);
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

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Each test runs a full Astro build.
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});

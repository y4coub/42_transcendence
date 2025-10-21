import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/app.ts'],
	format: ['esm'],
	target: 'node20',
	platform: 'node',
	clean: true,
	splitting: false,
	sourcemap: true,
	dts: false,
	shims: false,
	minify: false,
	outDir: 'dist',
	tsconfig: './tsconfig.json',
	esbuildOptions(options) {
		options.banner = {
			js: 'import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);',
		};
	},
});

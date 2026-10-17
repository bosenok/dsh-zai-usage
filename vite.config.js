import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vue(), cssInjectedByJs()],
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		lib: {
			entry: "src/main.js",
			name: "ZaiUsageVue",
			formats: ["iife"],
			fileName: () => "vue-app.js",
		},
	},
});

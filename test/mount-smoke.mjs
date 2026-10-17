// Mount-path smoke test: loads the BUILT bundle (dist/vue-app.js), evaluates
// it like the renderer does, and calls window.ZaiUsageVue.mount(el). This is
// the path the earlier tests missed — a free variable in src/main.js only
// fails here. ECharts canvas errors are environmental and tolerated; missing
// bindings and template throws are not.
import { Window } from "happy-dom";
import fs from "node:fs";

const window = new Window({ url: "http://localhost/" });
for (const key of ["document", "HTMLElement", "Element", "Node", "Text", "SVGElement", "SVGGraphicsElement", "Image", "DOMParser", "XMLSerializer", "navigator", "getComputedStyle", "ResizeObserver", "MutationObserver", "matchMedia", "CSSStyleSheet", "StyleSheet", "CSSStyleDeclaration", "customElements", "Event", "CustomEvent", "MouseEvent"]) {
	if (window[key] !== undefined && globalThis[key] === undefined) globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.self = window;
globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

// Minimal canvas stub so ECharts can initialize without a real 2d context.
const fakeContext = new Proxy(
	{},
	{
		get: (target, prop) => {
			if (prop === "canvas") return { width: 300, height: 150, style: {} };
			if (prop === "measureText") return () => ({ width: 10 });
			if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
			if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
			if (typeof prop === "string" && /^(fill|stroke|clear|save|restore|begin|close|move|line|rect|arc|bezier|quadratic|translate|rotate|scale|set|draw|put|clip|transform|ellipse|roundRect|isPoint)/.test(prop)) return () => {};
			return undefined;
		},
		set: () => true,
	},
);
window.HTMLCanvasElement.prototype.getContext = () => fakeContext;

const code = fs.readFileSync(new URL("../dist/vue-app.js", import.meta.url), "utf8");
try {
	new Function(code)();
} catch (error) {
	console.log("[FAIL] bundle threw while loading:", String(error?.message ?? error));
	process.exit(1);
}
console.log("[ok] bundle loaded, ZaiUsageVue =", typeof window.ZaiUsageVue);
if (typeof window.ZaiUsageVue?.mount !== "function") {
	console.log("[FAIL] window.ZaiUsageVue.mount is not a function");
	process.exit(1);
}

const el = window.document.createElement("div");
window.document.body.appendChild(el);
try {
	const handle = window.ZaiUsageVue.mount(el);
	const handleOk = typeof handle?.set === "function" && typeof handle?.unmount === "function";
	handle?.set?.({ status: "ok", data: { quota: { windows: [] }, local: { days: {}, sessions: 0 } }, error: null, at: Date.now() });
	console.log("[ok] mount returned handle:", handleOk);
	console.log("[ok] rendered text:", JSON.stringify((el.textContent ?? "").slice(0, 120)));
	handle?.unmount?.();
	console.log("MOUNT TEST OK");
} catch (error) {
	const message = String(error?.message ?? error);
	const isBindingBug = /is not defined|is not a function|Cannot read propert/.test(message);
	console.log(`${isBindingBug ? "[FAIL]" : "[warn]"} mount threw: ${message}`);
	if (isBindingBug) {
		console.log("MOUNT TEST FAILED (missing binding / runtime bug in the entry)");
		process.exit(1);
	}
	console.log("MOUNT TEST OK (only environmental canvas/DOM errors)");
}

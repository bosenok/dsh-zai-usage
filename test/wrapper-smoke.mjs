// Wrapper integration test: evaluates the BUILT bundle with the renderer's
// module-loader contract stubbed, then exercises the exported parsing helper
// against the real RemoteResult shapes the host sends.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bundlePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "client.js");
const code = fs.readFileSync(bundlePath, "utf8");

let registered = null;
globalThis.window = {
	__ModuleLoader__: {
		load(module) {
			registered = module;
		},
	},
};

const reactStub = {
	useRef: () => ({ current: null }),
	useReducer: () => [null, () => {}],
	useState: () => [null, () => {}],
	useCallback: (fn) => fn,
	useEffect: () => {},
};
const jsxStub = { jsx: () => null, jsxs: () => null, Fragment: null };
const requireStub = (specifier) => {
	if (specifier === "react") return reactStub;
	if (specifier === "react/jsx-runtime") return jsxStub;
	throw new Error(`unexpected require("${specifier}")`);
};

try {
	new Function(code)();
} catch (error) {
	console.log("[FAIL] bundle threw on load:", String(error?.message ?? error));
	process.exit(1);
}
if (registered == null || registered.id !== "dsh-zai-usage") {
	console.log("[FAIL] bundle did not register under the expected id");
	process.exit(1);
}
console.log("[ok] bundle registers:", registered.id);

const exported = registered.factory(requireStub);
console.log("[ok] exports:", Object.keys(exported).join(", "));
if (typeof exported.apply !== "function") {
	console.log("[FAIL] exports.apply is missing");
	process.exit(1);
}
if (typeof exported.__test?.snapshotTextOf !== "function") {
	console.log("[FAIL] snapshotTextOf test hook is missing");
	process.exit(1);
}

const { snapshotTextOf } = exported.__test;
const body = JSON.stringify({ generatedAt: 1, quota: {}, local: { days: {}, sessions: 2 } });
const cases = [
	["real read envelope", { ok: true, value: { text: body, lines: 1, eof: true, offset: 1 } }, body],
	["bare page object", { text: body }, body],
	["bare string", body, body],
];
let failed = false;
for (const [label, input, expected] of cases) {
	try {
		const actual = snapshotTextOf(input);
		const ok = actual === expected;
		console.log(`${ok ? "[ok]" : "[FAIL]"} ${label} -> ${JSON.stringify(actual.slice(0, 40))}`);
		if (!ok) failed = true;
	} catch (error) {
		console.log(`[FAIL] ${label} threw: ${String(error?.message ?? error)}`);
		failed = true;
	}
}
const errorCases = [
	["failure envelope", { ok: false, error: { message: "workspace-file/not-found" } }],
	["empty page", { ok: true, value: { text: "" } }],
	["object without text", { ok: true, value: { lines: 0 } }],
];
for (const [label, input] of errorCases) {
	try {
		snapshotTextOf(input);
		console.log(`[FAIL] ${label} did not throw`);
		failed = true;
	} catch (error) {
		console.log(`[ok] ${label} throws: ${String(error?.message ?? error).slice(0, 60)}`);
	}
}
console.log(failed ? "WRAPPER TEST FAILED" : "WRAPPER TEST OK");
process.exit(failed ? 1 : 0);

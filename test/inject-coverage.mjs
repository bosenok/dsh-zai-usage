// Guards the client plugin's service dependencies: every ctx.<service> the
// wrapper touches must be declared in exports.inject, with remote namespaces
// addressed by their full dotted service name (remote.session, not remote).
import fs from "node:fs";

const src = fs.readFileSync(new URL("../build/wrapper.js", import.meta.url), "utf8");
const injectMatch = src.match(/exports\.inject\s*=\s*\[([^\]]*)\]/);
if (injectMatch == null) {
	console.log("[FAIL] exports.inject was not found in the wrapper");
	process.exit(1);
}
const injected = new Set([...injectMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));

const required = new Set();
for (const match of src.matchAll(/ctx\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)) {
	const segments = match[1].split(".");
	// A `$`-prefixed member (remote.$host) is a facade built-in of the service
	// itself — the reference plugin uses it with inject: ["remote"] alone — and
	// is not a separately injectable namespace.
	if (segments[1]?.startsWith("$") === true) {
		required.add(segments[0]);
		continue;
	}
	required.add(segments[0] === "remote" && segments.length > 1 ? segments.slice(0, 2).join(".") : segments[0]);
}

let failed = false;
for (const service of required) {
	if (!injected.has(service)) {
		console.log(`[FAIL] ctx.${service} is used but not declared in inject`);
		failed = true;
	}
}
console.log("inject:  ", [...injected].join(", "));
console.log("required:", [...required].join(", "));
console.log(failed ? "INJECT COVERAGE FAILED" : "INJECT COVERAGE OK");
process.exit(failed ? 1 : 0);

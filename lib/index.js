// Host half of the dsh-zai-usage plugin: the server side of the Z.AI coding
// plan only (quota windows, tool calls, plan). Local session statistics live in
// the separate dsh-app-usage plugin. Zero dependencies by design.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const name = "zai-usage";
/**
 * Plugin state lives in the Harness home, never in a user project directory:
 * a snapshot written into a workspace shows up as an "edited file" in every
 * project and pollutes repositories.
 */
const harnessHome = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
const usageDir = path.join(harnessHome, "usage");
const SNAPSHOT_PATH = path.join(usageDir, "zai-usage.json");
const POLL_MS = 5 * 60 * 1000;
const ZAI_BASE = "https://api.z.ai";
const sessionsRoot = process.env.DSH_SESSIONS_ROOT ?? path.join(os.homedir(), ".dsh", "sessions");

/**
 * Resolve the ZAI key through the harness credential service — the same
 * canonical mechanism the native web-search backend uses for DEEPSEEK_API_KEY.
 */
async function resolveApiKey(ctx, debug) {
	let credentials;
	try {
		credentials = ctx.get("credentials");
	} catch (error) {
		debug.credsService = `get threw: ${String(error?.message ?? error)}`;
		return "";
	}
	debug.credsService = credentials === undefined ? "missing" : typeof credentials.resolve === "function" ? "ok" : `unexpected(${typeof credentials})`;
	if (credentials === undefined) return "";
	try {
		const resolved = await credentials.resolve("ZAI_API_KEY");
		debug.resolve = resolved === undefined ? "undefined" : `value(${resolved.value?.length ?? "?"}) source=${resolved.source}`;
		return typeof resolved?.value === "string" ? resolved.value : "";
	} catch (error) {
		debug.resolve = `error: ${String(error?.message ?? error)}`;
		return "";
	}
}

/** Human label for one quota window, derived the way ZCode derives it. */
function windowLabel(limit) {
	const count = Number(limit.number ?? 1);
	const unit = Number(limit.unit);
	if (unit === 3) return count === 1 ? "1 hour" : `${count} hours`;
	if (unit === 6) return count === 1 ? "1 day" : `${count} days`;
	if (unit === 5) return count === 1 ? "monthly" : `${count} months`;
	if (unit === 4) return count === 1 ? "1 minute" : `${count} minutes`;
	return `window ${unit}x${count}`;
}

async function fetchJson(url, key, signal) {
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${key}`, accept: "application/json" },
		signal,
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.json();
}

/** Query Z.AI coding-plan quota + subscription info. Returns the quota section. */
async function fetchQuota(key) {
	const quota = {};
	try {
		const body = await fetchJson(`${ZAI_BASE}/api/monitor/usage/quota/limit`, key, AbortSignal.timeout(15000));
		const limits = body?.data?.limits ?? [];
		// ZCode renders whichever windows the account returns, selected by the
		// (type, unit, number) triple: unit 3 = hours, 6 = days, 5 = months.
		const windows = [];
		for (const limit of limits) {
			if (limit.type === "TOKENS_LIMIT" || limit.type === "CREDIT_LIMIT") {
				windows.push({
					kind: limit.unit === 3 ? "session" : limit.unit === 6 ? "weekly" : "other",
					label: windowLabel(limit),
					kindLabel: limit.type === "CREDIT_LIMIT" ? "credits" : "tokens",
					unit: limit.unit,
					number: limit.number,
					// The server reports the CONSUMED share; ZCode displays the remainder.
					usedPercentage: Number(limit.percentage ?? 0),
					remainingPercentage: Math.max(0, Math.min(100, 100 - Number(limit.percentage ?? 0))),
					used: limit.currentValue ?? null,
					limit: limit.usage ?? null,
					remaining: limit.remaining ?? null,
					resetsAt: limit.nextResetTime ?? null,
				});
			} else if (limit.type === "TIME_LIMIT") {
				quota.tools = {
					label: windowLabel(limit),
					usedPercentage: Number(limit.percentage ?? 0),
					remainingPercentage: Math.max(0, Math.min(100, 100 - Number(limit.percentage ?? 0))),
					used: limit.currentValue ?? null,
					limit: limit.usage ?? null,
					remaining: limit.remaining ?? null,
					resetsAt: limit.nextResetTime ?? null,
					details: (limit.usageDetails ?? []).map((detail) => ({ model: detail.modelCode, usage: detail.usage })),
				};
			}
		}
		const order = { session: 0, weekly: 1, other: 2 };
		windows.sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3));
		quota.windows = windows;
		if (typeof body?.data?.level === "string" && body.data.level.length > 0) quota.level = body.data.level;
	} catch (error) {
		quota.error = String(error?.message ?? error);
	}
	try {
		const body = await fetchJson(`${ZAI_BASE}/api/biz/subscription/list`, key, AbortSignal.timeout(15000));
		const plan = (body?.data ?? []).find((item) => item.status === "VALID") ?? body?.data?.[0];
		if (plan) quota.plan = { productName: plan.productName, nextRenewTime: plan.nextRenewTime ?? null };
	} catch {
		// plan info is cosmetic; quota errors already surfaced above
	}
	return quota;
}

/** Write the snapshot into the Harness home (never into a project folder). */
function writeSnapshot(snapshot) {
	fs.mkdirSync(usageDir, { recursive: true });
	fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
	return SNAPSHOT_PATH;
}

/** Wait for the credential service before apply runs: its values load in an
 * async service init, so without this dependency the first poll can race an
 * empty store (observed: first resolve undefined, later polls succeed). */
const inject = ["credentials"];

function apply(ctx) {
	ctx.effect(() => {
		const running = { current: false };
		const run = async () => {
			if (running.current) return;
			running.current = true;
			try {
				const debug = {};
				const key = await resolveApiKey(ctx, debug);
				const quota = key.length > 0 ? await fetchQuota(key) : { error: "ZAI_API_KEY is not set in the credential store" };
				const snapshot = { generatedAt: Date.now(), quota, path: SNAPSHOT_PATH };
				if (Object.keys(debug).length > 0) snapshot.debug = debug;
				const written = writeSnapshot(snapshot);
				console.log(`[zai-usage] quota snapshot written to ${written}`);
			} catch (error) {
				console.error(`[zai-usage] refresh failed: ${String(error)}`);
			} finally {
				running.current = false;
			}
		};
		void run();
		const timer = setInterval(() => void run(), POLL_MS);
		return () => clearInterval(timer);
	}, "zai-usage: snapshot poll");
}

export { SNAPSHOT_PATH, apply, inject, name };

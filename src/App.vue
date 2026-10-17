<script setup>
import { computed, inject } from "vue";

const state = inject("zaiState");

function fmt(n) {
	const value = Number(n ?? 0);
	if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e10 ? 0 : 1) + "B";
	if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1) + "M";
	if (value >= 1e3) return (value / 1e3).toFixed(0) + "K";
	return String(value);
}

function fmtReset(iso) {
	if (!iso) return "";
	const diffMs = Number(iso) - Date.now();
	if (Number.isNaN(diffMs)) return "";
	const minutes = Math.max(0, Math.round(diffMs / 60000));
	const hours = Math.floor(minutes / 60);
	return hours > 0 ? `reset in ${hours}h ${minutes % 60}m` : `reset in ${minutes}m`;
}

function remainingOf(window) {
	if (typeof window?.remainingPercentage === "number") return Math.max(0, Math.min(100, Math.round(window.remainingPercentage)));
	return Math.max(0, Math.min(100, 100 - Number(window?.usedPercentage ?? 0)));
}

const windows = computed(() => state.data?.quota?.windows ?? []);
const tools = computed(() => state.data?.quota?.tools ?? null);
const planName = computed(() => {
	const product = state.data?.quota?.plan?.productName;
	if (product) return product;
	const level = state.data?.quota?.level;
	return level ? `GLM Coding ${String(level).replace(/^./u, (ch) => ch.toUpperCase())}` : "GLM Coding Plan";
});
const quotaError = computed(() => state.data?.quota?.error ?? null);
const updatedAt = computed(() => (state.at ? new Date(state.at).toLocaleTimeString() : ""));

function refresh() {
	state.refresh?.();
}
</script>

<template>
	<div class="zai-usage-root">
		<div class="zai-header">
			<div class="zai-title">
				Z.AI Usage
				<span class="zai-plan">{{ planName }}</span>
			</div>
			<div class="zai-meta">
				<span v-if="updatedAt">updated {{ updatedAt }}</span>
				<button class="zai-refresh" :disabled="state.status === 'loading'" @click="refresh">Refresh</button>
			</div>
		</div>

		<div v-if="state.status === 'error'" class="zai-error">{{ state.error }}</div>

		<template v-else>
			<div v-if="quotaError" class="zai-warn">Quota API: {{ quotaError }}</div>

			<div class="zai-cards">
				<div v-for="window in windows" :key="window.label + window.kind" class="zai-card">
					<div class="zai-card-head">
						<span>{{ window.label }}<span v-if="window.kindLabel === 'credits'" class="zai-dim"> · credits</span></span>
						<span class="zai-strong">{{ remainingOf(window) }}%</span>
					</div>
					<div class="zai-bar">
						<div class="zai-bar-fill blue" :style="{ width: remainingOf(window) + '%' }" />
					</div>
					<div class="zai-card-foot">
						<span v-if="window.limit != null">{{ fmt(window.used) }} / {{ fmt(window.limit) }} used</span>
						<span v-else>remaining quota</span>
						<span class="zai-dim"> · {{ window.usedPercentage }}% used</span>
						<span v-if="window.resetsAt" class="zai-dim"> · {{ fmtReset(window.resetsAt) }}</span>
					</div>
				</div>
				<div v-if="tools" class="zai-card">
					<div class="zai-card-head">
						<span>Tool calls<span class="zai-dim"> · {{ tools.label }}</span></span>
						<span class="zai-strong">{{ remainingOf(tools) }}%</span>
					</div>
					<div class="zai-bar">
						<div class="zai-bar-fill purple" :style="{ width: remainingOf(tools) + '%' }" />
					</div>
					<div class="zai-card-foot">
						<span v-if="tools.limit != null">{{ fmt(tools.used) }} / {{ fmt(tools.limit) }} used</span>
						<span class="zai-dim"> · {{ tools.usedPercentage }}% used</span>
						<span v-for="detail in tools.details" :key="detail.model" class="zai-dim"> · {{ detail.model }} {{ fmt(detail.usage) }}</span>
					</div>
				</div>
			</div>

			<div v-if="windows.length === 0 && !quotaError" class="zai-empty">
				The API returned no quota windows for this account.
			</div>

			<div class="zai-foot">
				Server-side Z.AI coding-plan data · local token statistics live in the separate "App Usage" panel
			</div>
		</template>
	</div>
</template>

<style>
.zai-usage-root {
	--zai-bg: #1b1b1b;
	--zai-panel: #232323;
	--zai-line: #303030;
	--zai-text: #e8e8e8;
	--zai-dim: #9a9a9a;
	--zai-blue: #4f8ef7;
	--zai-purple: #8b5cf6;
	color: var(--zai-text);
	font-family: inherit;
	font-size: 13px;
	padding: 16px 20px 24px;
	min-height: 200px;
	box-sizing: border-box;
	background: var(--zai-bg);
}
.zai-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 14px;
}
.zai-title {
	font-size: 20px;
	font-weight: 700;
	display: flex;
	align-items: center;
	gap: 10px;
}
.zai-plan {
	font-size: 11px;
	font-weight: 600;
	color: var(--zai-dim);
	border: 1px solid var(--zai-line);
	border-radius: 999px;
	padding: 2px 9px;
}
.zai-meta {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--zai-dim);
	font-size: 11px;
}
.zai-refresh {
	background: var(--zai-panel);
	color: var(--zai-text);
	border: 1px solid var(--zai-line);
	border-radius: 7px;
	padding: 4px 12px;
	font-size: 12px;
	cursor: pointer;
}
.zai-refresh:hover {
	border-color: #4a4a4a;
}
.zai-refresh:disabled {
	opacity: 0.5;
	cursor: default;
}
.zai-cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 10px;
}
.zai-card {
	background: var(--zai-panel);
	border-radius: 10px;
	padding: 12px 14px;
}
.zai-card-head {
	display: flex;
	justify-content: space-between;
	font-size: 12px;
	color: var(--zai-dim);
	margin-bottom: 8px;
}
.zai-strong {
	color: var(--zai-text);
	font-weight: 700;
	font-size: 14px;
}
.zai-bar {
	height: 6px;
	border-radius: 3px;
	background: #171717;
	overflow: hidden;
	margin-bottom: 8px;
}
.zai-bar-fill {
	height: 100%;
	border-radius: 3px;
}
.zai-bar-fill.blue {
	background: var(--zai-blue);
}
.zai-bar-fill.purple {
	background: var(--zai-purple);
}
.zai-card-foot {
	font-size: 11px;
	color: var(--zai-dim);
}
.zai-dim {
	color: #6d6d6d;
}
.zai-empty {
	margin-top: 10px;
	font-size: 12px;
	color: var(--zai-dim);
}
.zai-error,
.zai-warn {
	background: #2a1d1d;
	border: 1px solid #4a2a2a;
	color: #f0a0a0;
	border-radius: 8px;
	padding: 8px 12px;
	font-size: 12px;
	margin-bottom: 10px;
}
.zai-warn {
	background: #2a2517;
	border-color: #4a3f1d;
	color: #e5c07b;
}
.zai-foot {
	margin-top: 12px;
	font-size: 11px;
	color: #6d6d6d;
}
</style>

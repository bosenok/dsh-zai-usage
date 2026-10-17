window.__ModuleLoader__.load({
	id: "dsh-zai-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		let jsx = require("react/jsx-runtime");
		const PANEL_ID = "zai-usage";
		const SNAPSHOT_FILE = "zai-usage.json";

		/**
		 * Unwrap one workspaceFiles.read RemoteResult into the page text.
		 * The host returns `{ ok, value: { text, lines, eof, offset, ... } }`;
		 * a failure envelope carries `error.message`, and an empty page must not
		 * reach JSON.parse as "[object Object]".
		 */
		function snapshotTextOf(result) {
			if (result?.ok === false) throw new Error(result?.error?.message ?? "snapshot read failed");
			const page = result?.value ?? result;
			const text = typeof page === "string" ? page : page?.text;
			if (typeof text !== "string" || text.length === 0) throw new Error("snapshot file is empty or unreadable");
			return text;
		}

		function PanelIcon({ size }) {
			return jsx.jsx(
				"svg",
				{
					width: size,
					height: size,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					"stroke-width": 1.7,
					"stroke-linecap": "round",
					"stroke-linejoin": "round",
					children: [
						jsx.jsx("path", { d: "M21 12A9 9 0 1 1 12 3" }),
						jsx.jsx("path", { d: "M12 3a9 9 0 0 1 9 9h-9z", fill: "currentColor", stroke: "none", opacity: 0.45 }),
						jsx.jsx("path", { d: "M12 12l5.5-5.5" }),
					],
				},
			);
		}

		function apply(ctx) {
			function Panel() {
				const containerRef = react.useRef(null);
				const handleRef = react.useRef(null);
				const [mountError, setMountError] = react.useState(null);
				const stateRef = react.useRef({ status: "loading", data: null, error: null, at: null, refresh: null });
				const [, force] = react.useReducer((count) => count + 1, 0);
				const sync = () => {
					stateRef.current.refresh = load;
					handleRef.current?.set({ ...stateRef.current });
				};
				const load = react.useCallback(async () => {
					stateRef.current.status = stateRef.current.data === null ? "loading" : stateRef.current.status;
					sync();
					try {
						const listed = await ctx.remote.session.list({});
						if (listed?.ok === false) throw new Error(listed?.error?.message ?? "session list failed");
						const items = listed?.value?.items ?? listed?.items ?? [];
						const sorted = [...items].sort((a, b) => Number(b.lastActivityAt ?? b.updatedAt ?? b.createdAt ?? 0) - Number(a.lastActivityAt ?? a.updatedAt ?? a.createdAt ?? 0));
						const sessionId = sorted[0]?.sessionId ?? sorted[0]?.id;
						if (sessionId == null) throw new Error("no sessions yet - run any session first");
						const home = ctx.remote.$host?.home;
						if (typeof home !== "string" || home.length === 0) throw new Error("harness home directory is unavailable");
						const result = await ctx.remote.workspaceFiles.read(sessionId, `${home}/.dsh/usage/${SNAPSHOT_FILE}`, {});
						const data = JSON.parse(snapshotTextOf(result));
						if (!data || typeof data !== "object") throw new Error("snapshot is empty");
						stateRef.current.data = data;
						stateRef.current.status = "ok";
						stateRef.current.error = null;
						stateRef.current.at = Date.now();
					} catch (error) {
						stateRef.current.status = "error";
						stateRef.current.error = String(error?.message ?? error).replace(/^Error:\s*/u, "");
					}
					sync();
					force();
				}, []);
				react.useEffect(() => {
					const vue = window.ZaiUsageVue;
					if (vue == null) {
						setMountError("dashboard runtime is missing (the bundle did not initialize)");
						return;
					}
					if (containerRef.current == null) return;
					let handle;
					try {
						handle = vue.mount(containerRef.current);
					} catch (error) {
						setMountError(String(error?.stack ?? error?.message ?? error).split("\n")[0]);
						return;
					}
					handleRef.current = handle;
					sync();
					return () => {
						handleRef.current = null;
						handle.unmount?.();
					};
				}, []);
				react.useEffect(() => {
					void load();
					const timer = setInterval(() => void load(), 60000);
					return () => clearInterval(timer);
				}, [load]);
				if (mountError != null) {
					return jsx.jsx(
						"div",
						{ style: { padding: 16, color: "#f0a0a0", fontSize: 13 } },
						"ZAI Usage failed to mount: " + mountError,
					);
				}
				return jsx.jsx(
					"div",
					{
						ref: containerRef,
						style: { height: "100%", minHeight: "320px", overflowY: "auto" },
						children: "Loading Z.AI Usage dashboard...",
					},
				);
			}
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{
						name: "sidebar.panellist",
						id: PANEL_ID,
						order: 60,
						label: "Z.AI Usage",
					},
					PanelIcon,
				),
			);
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{
						name: "main",
						key: PANEL_ID,
						inject: () => ({}),
					},
					Panel,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "remote", "remote.session", "remote.workspaceFiles"];
		exports.__test = { snapshotTextOf };
		return module.exports;
	},
});

import { createApp, reactive } from "vue";
import App from "./App.vue";

// Mounted by the React adapter half. The state store is created per mount so
// repeated panel open/close cycles never leak listeners.
let instance = null;

window.ZaiUsageVue = {
	mount(el) {
		instance?.unmount();
		const state = reactive({ status: "loading", data: null, error: null, at: null });
		instance = createApp(App).provide("zaiState", state);
		instance.config.warnHandler = () => {};
		instance.mount(el);
		return {
			set(next) {
				Object.assign(state, next);
			},
			unmount() {
				instance?.unmount();
				instance = null;
			},
		};
	},
};

import { createApp } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import { router } from "./router.js";
import "./styles.css";

createApp(App)
  .use(router)
  .use(VueQueryPlugin, {
    queryClientConfig: { defaultOptions: { queries: { staleTime: 30_000 } } },
  })
  .mount("#root");

import { defineBoot } from "#q-app";
import VueGtagPlugin from "vue-gtag";
import { config } from "@/utils/config";

/**
 * Add Google Tag to the app so it can send anonymous events to Google Analytics.
 */
export default defineBoot(({app, router}) => {
  const gtagId = config.GTAG_ID;
  if (gtagId) {
    app.use(VueGtagPlugin, {
      config: { id: gtagId },
    }, router);
  }
})

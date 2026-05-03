import { useRoute } from "vue-router";
import { computed } from "vue";

export const useRedirectQuery = () => {
  const route = useRoute();
  // The boot handler will redirect logged in users from "/" to their group home.
  return computed(() => typeof route.query.redirect === "string" ? route.query.redirect : '/');
}

import { boot } from "quasar/wrappers";
import store from "src/store";


export default boot(({ router }) => {
  // Prevent access to paths that need authorization.
  router.beforeEach(async (to) => {
    try {
      if (to.query.token) {
        // Login with url token.
        await store.dispatch("authorizeWithCode", {code: to.query.token});
      } else {
        // Login with stored credentials
        await store.dispatch("authorize");
      }
      // User is logged in.
      if (to.path == "/" || to.path.startsWith("/login")) {
        
        if (to.query.redirect) {
          return to.query.redirect as string;
        }
        const myMember = store.getters.myMember;
        const state = myMember?.attributes.state;
        const groupCode = myMember?.group.attributes.code;
        
        if (state === "active") {
          // Redirect active members to member's feed on the homepage.
          return '/home'
        } else if (state === "draft") {
          // Redirect "draft" members to signup page.
          return `/groups/${groupCode}/signup-member`;
        } else if (["pending", "disabled", "suspended"].includes(state)) {
          // Redirect not enabled users to their own profile page.
          return `/groups/${groupCode}/members/${myMember.attributes.code}`
        } else if (state === undefined) {
          // This is the case for users who have requested a new group and are pending acceptance.
          return "/groups";
        }
      }
      
      return true
    } catch {
      // User is not logged in. If user is trying to access a private node, bring them to login page
      // so they are redirected to the desired path after login.
      
      // Public pages have a special flag.
      if (!to.meta.public) {
        return {
          path: "/login-mail",
          query: {
            redirect: to.path
          }};
      }
      return true
    }
  });
});

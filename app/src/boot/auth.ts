import { boot } from "quasar/wrappers";
import store from "src/store";


export default boot(({ router }) => {
  // Prevent access to paths that need authorization.
  router.beforeEach(async (to) => {
    try {
      if (!store.getters.isLoggedIn) {
        await store.dispatch("authorize");
      }
      // User is logged in.
      if (to.path == "/" || to.path.startsWith("/login")) {
        
        if (to.query.redirect) {
          return to.query.redirect as string;
        }
        const myMember = store.getters.myMember;
        const memberStatus = myMember?.attributes.status;
        const groupCode = myMember?.group.attributes.code;
        
        if (memberStatus === "active") {
          // Redirect active members to member's feed on the homepage.
          return '/home'
        } else if (memberStatus === "draft") {
          // Redirect "draft" members to signup page.
          return `/groups/${groupCode}/signup-member`;
        } else if (["pending", "disabled", "suspended"].includes(memberStatus)) {
          // Redirect not enabled users to their own profile page.
          return `/groups/${groupCode}/members/${myMember.attributes.code}`
        } else if (memberStatus === undefined) {
          // This is the case for users who have requested a new group and are pending acceptance.
          return "/groups";
        }
      }
      const requiredAdmin = to.meta.requiresAdmin
      if (requiredAdmin) {
        const requestedGroupCode = to.params.code
        const isRequestedGroupAdmin = requiredAdmin === "group"
          && store.getters.isAdmin
          && store.getters.myGroup?.attributes.code === requestedGroupCode

        if (!store.getters.isSuperadmin && !isRequestedGroupAdmin) {
          return {
            path: "/logout",
            query: {
              redirect: to.path
            }
          }
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

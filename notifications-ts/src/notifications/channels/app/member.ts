import { EnrichedMemberHasExpiredPostsEvent } from "../../enriched-events";

export const handleMemberHasExpiredPosts = async (event: EnrichedMemberHasExpiredPostsEvent) => {
  await handleNotificationForUsers(event, event.users, ({ t }) => {
    
  })
}
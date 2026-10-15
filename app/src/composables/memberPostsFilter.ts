export const getMemberPostsFilter = (
  memberId: string,
  myMemberId: string | undefined,
  isAdmin: boolean
) => {
  const canEdit = memberId === myMemberId || isAdmin

  return {
    member: memberId,
    expired: canEdit ? "false,true" : "false",
    status: canEdit ? "published,hidden,draft" : "published"
  }
}

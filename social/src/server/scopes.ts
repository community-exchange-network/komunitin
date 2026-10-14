export const Scope = {
  AccountingRead: 'accounting:read',
  AccountingWrite: 'accounting:write',
  SocialRead: 'social:read',
  SocialWrite: 'social:write',
  NotificationsWrite: 'notifications:write',
  Superadmin: 'superadmin',
} as const

export type SocialScope = typeof Scope.SocialRead | typeof Scope.SocialWrite

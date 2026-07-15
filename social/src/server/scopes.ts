export const Scope = {
  AccountingRead: 'accounting:read',
  AccountingWrite: 'accounting:write',
  SocialRead: 'social:read',
  SocialWrite: 'social:write',
  Superadmin: 'superadmin',
} as const

export type SocialScope = typeof Scope.SocialRead | typeof Scope.SocialWrite

import type { RouteRecordRaw } from 'vue-router'
import { topupSettingsRoutes } from '@/features/topup/routes'

const communitySettingsRoutes: RouteRecordRaw[] = [
  {
    path: '',
    name: 'EditGroupSettings',
    component: () => import('../pages/admin/settings/SignupSettings.vue')
  },
  {
    path: 'signup',
    component: () => import('../pages/admin/settings/SignupSettings.vue')
  },
  {
    path: 'marketplace',
    component: () => import('../pages/admin/settings/MarketplaceSettings.vue')
  },
  {
    path: 'emails',
    component: () => import('../pages/admin/settings/EmailSettings.vue')
  },
  {
    path: 'external-transfers',
    component: () => import('../pages/admin/settings/ExternalTransferSettings.vue')
  },
  {
    path: 'permissions',
    component: () => import('../pages/admin/settings/AccountPermissionsSettings.vue')
  },
  {
    path: 'account-rules',
    component: () => import('../pages/admin/settings/AccountPreferencesSettings.vue')
  },
  {
    path: 'status',
    component: () => import('../pages/admin/settings/StatusSettings.vue')
  },
  ...topupSettingsRoutes
]

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/groups/:code/admin',
    name: 'GroupAdmin',
    redirect: { name: 'EditGroup' },
    meta: {
      requiresAdmin: 'group'
    },
    children: [
      {
        path: 'edit',
        props: true,
        name: 'EditGroup',
        component: () => import('../pages/admin/EditGroup.vue'),
      },
      {
        path: 'settings',
        props: true,
        component: () => import('../pages/admin/settings/EditGroupSettings.vue'),
        children: communitySettingsRoutes,
      },
      {
        path: 'accounts',
        props: true,
        name: 'ManageAccounts',
        component: () => import('../pages/admin/ManageAccounts.vue'),
        meta: {
          rootPage: true
        }
      },
      {
        path: 'members/:memberCode/profile',
        props: true,
        name: 'AdminEditProfile',
        component: () => import('../pages/members/EditProfile.vue')
      },
      {
        path: 'members/:memberCode/settings',
        props: true,
        name: 'AdminEditSettings',
        component: () => import('../pages/settings/EditSettings.vue')
      },
      {
        path: 'transactions',
        props: true,
        name: 'AdminTransactionList',
        component: () => import('../pages/admin/Transactions.vue'),
        meta: {
          rootPage: true
        }
      }
    ]
  },
  {
    path: '/superadmin',
    meta: {
      requiresAdmin: 'superadmin'
    },
    children: [
      {
        path: '',
        redirect: '/superadmin/groups',
      },
      {
        path: 'groups',
        name: 'ManageGroups',
        component: () => import('../pages/superadmin/ManageGroups.vue'),
      },
      {
        path: 'migrations',
        children: [
          {
            path: '',
            name: 'MigrationList',
            component: () => import('../pages/superadmin/MigrationList.vue'),
            meta: {
              rootPage: true
            }
          },
          {
            path: ':id',
            props: true,
            name: 'MigrationDetails',
            component: () => import('../pages/superadmin/MigrationDetails.vue'),
          },
          {
            path: 'new',
            props: true,
            name: 'CreateMigration',
            component: () => import('../pages/superadmin/CreateMigration.vue'),
          }
        ]
      }
    ]
  },
]

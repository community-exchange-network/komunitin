import type { RouteRecordRaw } from 'vue-router'

export const topupRoutes: RouteRecordRaw[] = []
export const topupSettingsRoutes: RouteRecordRaw[] = []
export const topupAdminRoutes: RouteRecordRaw[] = []

if (import.meta.env.FEAT_TOPUP === 'true') {
  topupRoutes.push({
    path: '/groups/:code/members/:memberCode/topup',
    props: true,
    name: 'CreateTopup',
    component: () => import('./CreateTopup.vue')
  },
  {
    path: '/groups/:code/topups/:id',
    props: true,
    name: 'TopupDetails',
    component: () => import('./TopupDetails.vue')
  })

  topupSettingsRoutes.push({
    path: 'contributions',
    name: 'TopupSettings',
    component: () => import('./TopupSettings.vue'),
    props: true,
    meta: { settingsSection: 'contributions' }
  })

  topupAdminRoutes.push({
    path: 'topup-settings',
    redirect: { name: 'TopupSettings' }
  })
}

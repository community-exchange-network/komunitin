import type { RouteRecordRaw } from 'vue-router'
import type { Composer } from 'vue-i18n'

export const topupRoutes: RouteRecordRaw[] = []
export const topupSettingsRoutes: RouteRecordRaw[] = []

/** Build the optional settings entry using the current locale. */
export const getTopupSettingsNav = (t: Composer['t']) => {
  if (import.meta.env.FEAT_TOPUP === 'true') {
    return [{ id: 'contributions', label: t('topupSettings'), icon: 'credit_card' }]
  }
  return []
}

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
    component: () => import('./TopupSettings.vue')
  })
}

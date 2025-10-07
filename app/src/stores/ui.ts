import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
  // State
  const drawerPersistent = ref(true)
  const drawerState = ref(true)
  
  const notificationsBannerDismissed = ref(false)
  const locationBannerDismissed = ref(false)
  const inactiveBannerDismissed = ref(false)

  const previousRoute = ref<string | undefined>(undefined)
  const loggingOut = ref(false)

  // Getters
  const drawerExists = computed(() => {
    // TODO: This depends on user store's isComplete getter
    // Will be updated when user store is migrated
    // For now, return true as a safe default
    return true
    // Don't show the drawer for draft/pending users.
    // return userStore.isComplete
  })

  // Actions
  const toggleDrawer = () => {
    drawerState.value = !drawerState.value
  }

  return {
    // State (directly exposed refs)
    drawerPersistent,
    drawerState,
    notificationsBannerDismissed,
    locationBannerDismissed,
    inactiveBannerDismissed,
    previousRoute,
    loggingOut,
    
    // Getters
    drawerExists,
    
    // Actions
    toggleDrawer
  }
})
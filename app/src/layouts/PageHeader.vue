<template>
  <q-header>
    <div
      class="header flex row justify-between items-center q-pt-sm q-pb-xs q-pr-md text-on-surface-medium"
      :class="[
        showBalance ? 'wrap' : 'q-pt-xs no-wrap',
        scrollOffset > 0 ? 'bg-surface-container-high' : 'bg-surface-container'
      ]"
      :style="`height: ${computedHeight}px;`"
    >
        <!-- render back button, menu button, profile button or none -->
        <q-btn
          v-if="showBack"
          id="back"
          class="q-ml-sm q-mr-xs"
          flat
          round
          icon="arrow_back"
          :aria-label="$t('back')"
          @click="goUp"
        />
        <q-btn
          v-if="showMenu"
          id="menu"
          class="q-ml-sm q-mr-xs"
          flat
          round
          icon="menu"
          :aria-label="$t('menu')"
          @click="store.dispatch('toogleDrawer')"
        />
        <profile-btn-menu
          v-if="showProfile"
          id="profile"
          class="q-ml-auto"
          :class="!showBalance ? 'order-last' : ''"
        />
      <div
        v-if="showBalance"
        class="col self-center column items-center"
        :style="{ minWidth: '100%', maxWidth: '100%', '--balance-scale': toValue(balanceScaleFactor) }"
      > 
        <div 
          class="text-body-medium balance-label"
        >
          {{ $t('balance') }}
        </div>
        <div 
          class="text-display-medium balance-value"
        >
          {{
            FormatCurrency(
              myAccount.attributes.balance,
              myAccount.currency
            )
          }}
        </div>
      </div>
      <q-toolbar
        class="no-wrap"
        style="max-width: none; min-width: 0;flex: 1 1 0%; padding-right: 0;"
        :class="inlineLeftButton ? 'q-pl-none' : 'q-pl-md'"
      >
        <q-toolbar-title 
          v-if="!searchActive"
          class="text-title-large">
          {{ title }}
        </q-toolbar-title>
        <q-input
          v-if="searchActive"
          v-model="searchText"
          dense
          outlined
          rounded
          bg-color="surface-container-highest"
          class="q-mr-xs search-box input-outlined-borderless"
          type="search" 
          debounce="250"
          autofocus
          @update:model-value="onUpdateSearchText"
          @keyup.enter="onSearch"
        >
          <template #append>
            <q-icon
              v-if="searchText === ''"
              name="search"
              class="cursor-pointer"
              @click="searchActive = false"
            />
            <q-icon
              v-else
              name="clear"
              class="cursor-pointer"
              @click="clearSearchText"
            />
          </template>
        </q-input>
        <q-btn
          v-if="search && !searchActive"
          flat
          round
          icon="search"
          @click="searchActive = true"
        />
        <!-- slot for right buttons -->
        <slot name="buttons" >
          <q-btn
            v-if="showLogOut"
            icon="logout"
            flat
            round
            to="/logout"
          />
        </slot>
        <q-scroll-observer
          @scroll="scrollHandler"
        />
      </q-toolbar>
    </div>
    <banner />
    <q-linear-progress
      v-if="showLoading"
      indeterminate
      size="2px"
      color="primary"
      class="absolute-bottom"
      :aria-label="$t('loading')"
    />
  </q-header>
</template>
<script setup lang="ts">
/**
 * Header component with some features for the Komunitin app
 *  - In small screens, shows a menu button or a back button depending on wether 
 * exists the left drawer, which in turn depends on whether the user is logged in.
 *  - If balance prop is set to true, shows a section with the logged in account 
 * balance. This section shrinks on scroll.
 *  - If search prop is set to true, provides a search box that emits the `search` event.
 *  - Provides a slot #buttons to be able to customize the right toolbar buttons 
 * depending on the page content.
 */

import { ref, computed, watch, type MaybeRef, toValue } from "vue";
import { useStore } from "vuex"
import { useRoute, useRouter } from "vue-router"
import FormatCurrency from "../plugins/FormatCurrency";
import Banner from "./Banner.vue";
import ProfileBtnMenu from '@/components/ProfileBtnMenu.vue';

const props = withDefaults(defineProps<{
  title?: string;
  search?: boolean;
  balance?: boolean;
  back?: string;
  loading?: boolean
}>(), {
  title: "",
  search: false,
  balance: false,
  back: "",
  loading: false,
})

const emit = defineEmits<{
  (e: 'search-input', value: string): void,
  (e: 'search', value: string): void
}>()

const store = useStore()

const showLoading = ref(false)
// Fast refreshes stay silent; cancel the delay when loading ends or the page unmounts.
watch(() => props.loading, (loading, _, onCleanup) => {
  showLoading.value = false
  if (loading) {
    const timer = setTimeout(() => { showLoading.value = true }, 300)
    onCleanup(() => clearTimeout(timer))
  }
}, { immediate: true })

const searchActive = ref(false)
const searchText = ref("")
const scrollOffset = ref(0)
const offset = ref(0)

const myAccount = computed(() => store.getters.myAccount)

const route = useRoute()
/**
 * Show the back button.
 */
const showBack = computed(() => !!props.back || !route.meta.rootPage || !store.getters.drawerExists)
/**
 * Show the menu button.
 */
const showMenu = computed(() => !showBack.value && !store.state.ui.drawerPersistent)
/**
 * Show the profile button when the user is logged in (and not pending, not superadmin).
 */
const showProfile = computed(() => store.getters.isLoggedIn && store.getters.isComplete && !store.getters.isSuperadmin);

/**
 * Show the log-out button when user is logged and is either pending or superadmin. 
 */
const showLogOut = computed(() => store.getters.isLoggedIn && (!store.getters.isComplete || store.getters.isSuperadmin))


/**
  * Constant value for the thin header height.
  * Keep in sync with $toolbar-min-height in css/quasar.variables.scss.
  */
const headerHeight = 64
let computedHeight: MaybeRef<number> = headerHeight
let requireBalance: MaybeRef<boolean> = false
let showBalance: MaybeRef<boolean> = false
let balanceScaleFactor: MaybeRef<number> = 0

// Keep the header darkened while content is scrolled underneath it.
const scrollHandler = (details: { position: { top: number } }) => {
  scrollOffset.value = details.position.top

  // If balance feature is enabled, handle balance scaling
  if (import.meta.env.FEAT_HEADER_BALANCE === 'true') {
    const originalHeight = toValue(requireBalance) ? 2 * 50 + 70 : headerHeight
    offset.value = Math.min(details.position.top, originalHeight - headerHeight)
  }
}

// This code is stripped out if the feature is disabled
if (import.meta.env.FEAT_HEADER_BALANCE === 'true') {
  /**
   * Constant value for the toolbar height.
   */
  const toolbarHeight = 50
  /**
   * Constant value for the height of the balance section.
   */
  const balanceHeight = 70

  const prominentHeight = 2 * toolbarHeight + balanceHeight
  
  requireBalance = computed(() => props.balance && !!myAccount.value)  

  const originalHeight = computed(() => toValue(requireBalance) ? prominentHeight : headerHeight)

  computedHeight = computed(() => originalHeight.value - offset.value)
  balanceScaleFactor = computed(() => Math.max(0, 1 - offset.value / balanceHeight))
  showBalance = computed(() => toValue(requireBalance) && offset.value < balanceHeight)
}

// Computes whether there is a button on the left of the title, to help adjusting the title padding.
const inlineLeftButton = computed(() => {
  return !toValue(showBalance) && (showBack.value || showMenu.value)
})

const clearSearchText = () => {
  searchText.value = ""
  emit('search-input', "")
  onSearch()
}

const onUpdateSearchText = () => {
  emit('search-input', searchText.value)
}

const onSearch = () => {
  emit('search', searchText.value)
}

const router = useRouter()

const goUp = () => {
  if (store.state.ui.previousRoute !== undefined) {
    router.back()
  } else if (props.back){
    router.push(props.back)
  } else {
    router.push('/')
  }
}

</script>
<style lang="scss" scoped>
.header {
  transition: background-color 0.3s ease-in-out;
}

// Animate the token sizes as the balance section collapses on scroll.
.balance-label {
  font-size: calc(#{type-value('body-medium', size)} * var(--balance-scale));
  line-height: calc(#{type-value('body-medium', line-height)} * var(--balance-scale));
}
.balance-value {
  font-size: calc(#{type-value('display-medium', size)} * var(--balance-scale));
  line-height: calc(#{type-value('display-medium', line-height)} * var(--balance-scale));
}

// We need to say that the search box takes all horizontal space, but the
// quasar class full-width does not work for us because it overwrites the margins.
.search-box {
  width: 100%;
}
</style>

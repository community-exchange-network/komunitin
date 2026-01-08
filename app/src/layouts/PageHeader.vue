<template>
  <q-header>
    <div
      id="header"
      :class="`bg-primary flex row ${showBalance ? '' : 'q-pt-xs'} ${balanceScaleFactor > 0 ? 'wrap' : 'no-wrap' } justify-between items-center q-pt-sm q-pb-xs q-pl-sm q-pr-md`"
      :style="`height: ${computedHeight}px;`"
    >
        <!-- render back button, menu button, profile button or none -->
        <q-btn
          v-if="showBack"
          id="back"
          flat
          round
          icon="arrow_back"
          :aria-label="$t('back')"
          @click="goUp"
        />
        <q-btn
          v-if="showMenu"
          id="menu"
          flat
          round
          icon="menu"
          :aria-label="$t('menu')"
          @click="$store.dispatch('toogleDrawer')"
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
        style="min-width: 100%; max-width: 100%;"
      > 
        <div 
          class="text-body2 text-onprimary-m"
          :style="`font-size: ${0.875*balanceScaleFactor}rem; line-height: ${1.25*balanceScaleFactor}rem;`"
        >
          {{ $t('balance') }}
        </div>
        <div 
          class="text-h3 text-onprimary-m"
          :style="`font-size: ${3*balanceScaleFactor}rem; line-height: ${3.125*balanceScaleFactor}rem`"
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
        :style="showBalance ? 'padding-left:18px;' : 'padding-left:0;'"
      >
        <q-toolbar-title v-if="!searchActive">
          {{ title }}
        </q-toolbar-title>
        <q-input
          v-if="searchActive"
          v-model="searchText"
          dark
          dense
          standout
          class="q-mr-xs search-box"
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
            v-if="!isComplete"
            icon="logout"
            flat
            round
            to="/logout"
          />
        </slot>
        <q-scroll-observer
          v-if="requireBalance"
          @scroll="scrollHandler"
        />
      </q-toolbar>
    </div>
    <banner />
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
 *  - If profile prop is set to true, shows a profile button and menu.
 *  - Provides a slot #buttons to be able to customize the right toolbar buttons 
 * depending on the page content.
 */

import { ref, computed, type MaybeRef, toValue } from "vue";
import { useStore } from "vuex"
import { useRoute, useRouter } from "vue-router"
import FormatCurrency from "../plugins/FormatCurrency";
import Banner from "./Banner.vue";
import ProfileBtnMenu from 'src/components/ProfileBtnMenu.vue';

const props = withDefaults(defineProps<{
  title?: string;
  search?: boolean;
  balance?: boolean;
  back?: string;
  profile?: boolean;
}>(), {
  title: "",
  search: false,
  balance: false,
  back: "",
  profile: false,
})

const emit = defineEmits<{
  (e: 'search-input', value: string): void,
  (e: 'search', value: string): void
}>()

const store = useStore()

const searchActive = ref(false)
const searchText = ref("")
const scrollOffset = ref(0)
const offset = ref(0)

const myAccount = computed(() => store.getters.myAccount)



const route = useRoute()
/**
 * Show the back button.
 */
const showBack = computed(() => !route.meta.rootPage || !store.getters.drawerExists)
/**
 * Show the menu button.
 */
const showMenu = computed(() => !showBack.value && !store.state.ui.drawerPersistent)
/**
 * Show the profile button only on (non-admin) root pages. 
 */
const showProfile = computed(() => route.meta.rootPage && !route.path.includes('/admin'));


/**
  * Constant value for the thin header height.
  */
const headerHeight = 64
let computedHeight: MaybeRef<number> = headerHeight
let requireBalance: MaybeRef<boolean> = false
let showBalance: MaybeRef<boolean> = false
let balanceScaleFactor: MaybeRef<number> = 0
let scrollHandler: (details: {position: {top: number}}) => void | undefined = undefined

// This code is stripped out if the feature is disabled
if (process.env.FEAT_HEADER_BALANCE === 'true') {
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

  
  scrollHandler = (details: { position: { top: number; }; }) => {
    offset.value = Math.min(details.position.top, originalHeight.value - headerHeight)
    scrollOffset.value = details.position.top
  }
}


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

const isComplete = computed(() => store.getters.isComplete)

</script>
<style lang="scss" scoped>
// Toolbar has a default padding of 12px. That's ok when there's a button,
// but it is too low when there's the title directly.
.no-button {
  padding-left: 16px;
}

// We need to say that the search box takes all horizontal space, but the
// quasar class full-width does not work for us because it overwrites the margins.
.search-box {
  width: 100%;
}
</style>

<template>
  <q-header>
    <div
      id="header"
      class="bg-primary items-center no-wrap"
      :class="showBalance ? '' : 'flex'"
      :style="`height: ${computedHeight}px;`"
    >
      <div
        class="flex q-py-xs"
        :class="[noButton ? '' : 'q-pl-sm q-pr-xs']"
        style="height: 50px;"
      >
        <!-- render back button, menu button or none -->
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
      </div>
      <div
        v-if="showBalance"
        class="col self-center column items-center"
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
        :class="((noButton || showBalance) ? 'no-button ' : '') + (showBalance ? '' : 'col-grow q-pl-none')"
        style="max-width: none; flex: 1 1 0%"
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
            @click="logout"
          />
        </slot>
        <q-scroll-observer
          v-if="balance"
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
 *  - Provides a slot #buttons to be able to customize the right toolbar buttons 
 * depending on the page content.
 */

import { ref, computed } from "vue";
import { useStore } from "vuex"
import { useRouter } from "vue-router"
import FormatCurrency from "../plugins/FormatCurrency";
import Banner from "./Banner.vue";

const props = withDefaults(defineProps<{
  title?: string;
  search?: boolean;
  balance?: boolean;
  back?: string;
}>(), {
  title: "",
  search: false,
  balance: false,
  back: ""
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
/**
 * Show the back button.
 */
const showBack = computed(() => props.back != "" || !store.getters.drawerExists)
/**
 * Show the menu button.
 */
const showMenu = computed(() => !showBack.value && !store.state.ui.drawerPersistent)
/**
 * Show no button
 */
const noButton = computed(() => !showBack.value && !showMenu.value)
/**
 * Constant value for the thin header height.
 */
const headerHeight = 64
/**
 * Constant value for the toolbar height.
 */
const toolbarHeight = 50
/**
 * Constant value for the height of the balance section.
 */
const balanceHeight = 70
const prominentHeight = 2 * toolbarHeight + balanceHeight
const originalHeight = computed(() => props.balance && myAccount.value ? prominentHeight : headerHeight)
const computedHeight = computed(() => originalHeight.value - offset.value)
const balanceScaleFactor = computed(() => Math.max(0, 1 - offset.value / balanceHeight))
const showBalance = computed(() => props.balance && myAccount.value && offset.value < balanceHeight)

const clearSearchText = () => {
  searchText.value = ""
  emit('search-input', "")
  onSearch()
}

const scrollHandler = (details: { position: { top: number; }; }) => {
  offset.value = Math.min(details.position.top, originalHeight.value - headerHeight)
  scrollOffset.value = details.position.top
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
  } else {
    router.push(props.back)
  }
}

const isComplete = computed(() => store.getters.isComplete)
const logout = async () => {
  await store.dispatch("logout")
  await router.push("/")
}
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

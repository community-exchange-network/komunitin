<template>
  <div class="bg-outside column full-height">
    <div
      id="container"
      class="q-mx-auto bg-surface"
      :class="drawerExists ? 'with-drawer' : 'without-drawer'"
    >
      <q-layout
        id="layout"
        view="LHH LpR LFR"
        container
      >
        <q-drawer
          v-if="drawerExists"
          v-model="drawerState"
          bordered
          show-if-above
          :width="256"
          @on-layout="drawerChange"
        >
          <menu-drawer v-if="!isSuperadmin"/>
          <superadmin-menu-drawer v-else/>
        </q-drawer>
        <router-view />
        <q-footer class="lt-md" v-if="myMember">
          <q-toolbar>
            <q-tabs breakpoint="1024" class="full-width">
              <q-route-tab :to="{ name: 'Home' }" name="home" icon="home" :label="t('home')" />
              <q-route-tab :to="{ name: 'TransactionList', params: { code: groupCode, memberCode: myMember.attributes.code}}" name="account" icon="account_balance_wallet" :label="t('account')" />
              <q-route-tab :to="{ name: 'MemberList', params: { code: groupCode }}" name="group" icon="diversity_3" :label="t('group')" />
            </q-tabs>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Main app layout.
 * 
 * Contains the left drawer but not the header, which should be defined by each page
 * using the PageHeader component.
 */
import MenuDrawer from "../components/MenuDrawer.vue";
//import SuperadminMenuDrawer from "../pages/superadmin/MenuDrawer.vue";
import { useStore } from "vuex";

import { useI18n } from 'vue-i18n';
import { computed, defineAsyncComponent } from "vue"

const store = useStore()
const { t } = useI18n();

const isSuperadmin = computed(() => store.getters.isSuperadmin)

const drawerExists = computed(() => store.getters.drawerExists || isSuperadmin.value)

const drawerState = computed({
  get: () => store.state.ui.drawerState,
  set: (val) => store.commit('drawerState', val)
})

const drawerChange = (state: boolean) => store.commit("drawerPersistent", state)

const myMember = computed(() => store.getters.myMember)
const groupCode = computed(() => myMember.value?.group.attributes.code)
// Lazy load the superadmin menu drawer in order to not load it for regular users.
const SuperadminMenuDrawer = defineAsyncComponent(() => import("../pages/superadmin/MenuDrawer.vue"))

</script>
<style lang="scss" scoped>
// Container takes 100% with in small screens. In large screens, wrap the content in a
// centered box. The width of the box depends on whether there is drawer or not.
@mixin wrap-main-container($width) {
  // The 18px is an estimation of the scroll-bar width.
  @media (min-width: $width + 18px) {
    width: $width;
    height: calc(100% - 24px);
    margin-top: 24px;
  }
}
#container {
  width: 100%;
  height: 100%;
  &.with-drawer {
    @include wrap-main-container(1280px);
  }
  &.without-drawer {
    @include wrap-main-container(1024px);
  }
}
</style>

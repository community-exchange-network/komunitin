<!-- TODO: add FAB to top of rail on pages that have them -->
<template>
  <q-drawer
    v-model="drawerState"
    show-if-above
    :width="230"
    :mini="!props.expanded"
    :mini-width="100"
    :mini-to-overlay="false"
    @on-layout="drawerChange"
    class="bg-surface-container"
  >
    <q-list
      padding
      class="navigation-rail"
      :class="{ 'navigation-rail--expanded': props.expanded }"
    >
      <div class="rail-header">
        <q-btn
          flat
          round
          dense
          :icon="props.expanded ? 'menu_open' : 'menu'"
          :aria-label="t('menu')"
          :aria-expanded="props.expanded"
          @click="emit('update:expanded', !props.expanded)"
        />
      </div>

      <NavRailItem
        id="my-group"
        :title="myMember.group.attributes.name"
        :to="`/groups/${groupCode}`"
        :active="groupActive"
        :avatar-image="myMember.group.attributes.image"
        :avatar-text="myMember.group.attributes.code"
        :expanded="props.expanded"
      />
      <NavRailItem
        id="menu-home"
        icon="home"
        :title="t('home')"
        to="/home"
        :expanded="props.expanded"
      />
      <NavRailItem
        id="menu-transactions"
        icon="account_balance_wallet"
        :title="t('transactions')"
        :to="`/groups/${groupCode}/members/${myMember.attributes.code}/transactions`"
        :expanded="props.expanded"
      />

      <q-separator spaced="md" />

      <NavRailItem
        id="menu-needs"
        icon="loyalty"
        :title="t('needs')"
        :to="`/groups/${groupCode}/needs`"
        :expanded="props.expanded"
      />
      <NavRailItem
        id="menu-offers"
        icon="local_offer"
        :title="t('offers')"
        :to="`/groups/${groupCode}/offers`"
        :expanded="props.expanded"
      />
      <NavRailItem
        id="menu-members"
        icon="people"
        :title="t('members')"
        :to="`/groups/${groupCode}/members`"
        :expanded="props.expanded"
      />
      <NavRailItem
        v-if="!isLegacyAccounting"
        id="menu-stats"
        icon="insert_chart"
        :title="t('statistics')"
        :to="`/groups/${groupCode}/stats`"
        :expanded="props.expanded"
      />

      <template v-if="isAdmin && props.expanded">
        <q-separator spaced="md" />
        <NavRailItem
          id="menu-edit-group"
          icon="edit"
          :title="t('editGroup')"
          :to="`/groups/${groupCode}/admin/edit`"
          :expanded="props.expanded"
        />
        <NavRailItem
          id="menu-group-settings"
          icon="settings"
          :title="t('groupSettings')"
          :to="`/groups/${groupCode}/admin/settings`"
          :expanded="props.expanded"
        />
        <NavRailItem
          id="menu-manage-members"
          icon="manage_accounts"
          :title="t('manageMembers')"
          :to="`/groups/${groupCode}/admin/accounts`"
          :expanded="props.expanded"
        />
        <NavRailItem
          id="menu-admin-transactions"
          icon="list_alt"
          :title="t('transactions')"
          :to="`/groups/${groupCode}/admin/transactions`"
          :expanded="props.expanded"
        />
      </template>

      <q-separator spaced="md" />

      <NavRailItem
        id="menu-other-groups"
        icon="group_work"
        :title="t('otherGroups')"
        to="/groups"
        :expanded="props.expanded"
      />
    </q-list>
  </q-drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import NavRailItem from "./NavRailItem.vue";

const props = defineProps<{
  expanded: boolean
}>()
const emit = defineEmits<{
  (event: "update:expanded", value: boolean): void
}>()

const store = useStore()
const route = useRoute()
const { t } = useI18n()

const myMember = computed(() => store.getters.myMember)
const drawerState = computed({
  get: () => store.state.ui.drawerState,
  set: (value) => store.commit("drawerState", value)
})
const groupCode = computed(() => myMember?.value.group.attributes.code)
const isAdmin = computed(() => store.getters.isAdmin)
const isLegacyAccounting = computed(() => store.getters.isLegacyAccounting)
const groupActive = computed(() => route.fullPath === `/groups/${groupCode.value}`)
const drawerChange = (state: boolean) => store.commit("drawerPersistent", state)
</script>

<style lang="scss" scoped>
.navigation-rail {
  padding-inline: 16px;

  .rail-header {
    display: flex;
    height: 56px;
    align-items: center;
    justify-content: center;
  }

  &.navigation-rail--expanded {
    .rail-header {
      justify-content: flex-start;
      padding-left: 16px;
    }
  }
}
</style>

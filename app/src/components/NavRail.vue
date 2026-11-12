<template>
  <q-drawer
    v-model="drawerState"
    show-if-above
    :width="256"
    :mini="!props.expanded"
    :mini-width="80"
    :mini-to-overlay="false"
    @on-layout="drawerChange"
  >
    <q-list
      class="navigation-rail"
      :class="{ 'navigation-rail--expanded': props.expanded }"
    >
      <div class="rail-header">
        <q-btn
          flat
          round
          dense
          icon="menu"
          :aria-label="t('menu')"
          :aria-expanded="props.expanded"
          @click="emit('update:expanded', !props.expanded)"
        />
      </div>

      <q-item
        id="my-group"
        class="rail-item group-item"
        :to="`/groups/${groupCode}`"
        :active="groupActive"
        active-class="rail-item--active"
        :aria-label="myMember.group.attributes.name"
      >
        <q-item-section avatar>
          <avatar
            :img-src="myMember.group.attributes.image"
            :text="myMember.group.attributes.code"
            size="32px"
          />
        </q-item-section>
        <q-item-section
          class="group-label text-label-medium"
          :class="groupActive ? 'text-primary-variant' : 'text-on-surface-medium'"
        >
          {{ myMember.group.attributes.name }}
        </q-item-section>
      </q-item>

      <template
        v-for="item in navigationItems"
        :key="item.id"
      >
        <q-separator v-if="item.separatorBefore" />
        <q-item
          :id="item.id"
          class="rail-item navigation-item"
          :to="item.to"
          :active="route.path === item.to"
          active-class="rail-item--active"
        >
          <q-item-section avatar>
            <q-icon
              :name="item.icon"
              :color="route.path === item.to ? 'primary' : 'icon'"
            />
          </q-item-section>
          <q-item-section
            class="navigation-label text-label-medium"
            :class="route.path === item.to ? 'text-primary-variant' : 'text-on-surface-medium'"
          >
            {{ item.title }}
          </q-item-section>
        </q-item>
      </template>
    </q-list>
  </q-drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import Avatar from "./Avatar.vue";

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
const groupActive = computed(() => route.fullPath === `/groups/${myMember.value.group.attributes.code}`)
const drawerChange = (state: boolean) => store.commit("drawerPersistent", state)

const navigationItems = computed(() => [
  { id: "menu-home", icon: "home", title: t("home"), to: "/home" },
  {
    id: "menu-transactions",
    icon: "account_balance_wallet",
    title: t("transactions"),
    to: `/groups/${groupCode.value}/members/${myMember.value.attributes.code}/transactions`
  },
  {
    id: "menu-needs",
    icon: "loyalty",
    title: t("needs"),
    to: `/groups/${groupCode.value}/needs`,
    separatorBefore: true
  },
  {
    id: "menu-offers",
    icon: "local_offer",
    title: t("offers"),
    to: `/groups/${groupCode.value}/offers`
  },
  {
    id: "menu-members",
    icon: "people",
    title: t("members"),
    to: `/groups/${groupCode.value}/members`
  },
  ...(!isLegacyAccounting.value ? [{
    id: "menu-stats",
    icon: "insert_chart",
    title: t("statistics"),
    to: `/groups/${groupCode.value}/stats`
  }] : []),
  ...(isAdmin.value ? [
    {
      id: "menu-edit-group",
      icon: "edit",
      title: t("editGroup"),
      to: `/groups/${groupCode.value}/admin/edit`,
      separatorBefore: true
    },
    {
      id: "menu-group-settings",
      icon: "settings",
      title: t("groupSettings"),
      to: `/groups/${groupCode.value}/admin/settings`
    },
    {
      id: "menu-manage-members",
      icon: "manage_accounts",
      title: t("manageMembers"),
      to: `/groups/${groupCode.value}/admin/accounts`
    },
    {
      id: "menu-admin-transactions",
      icon: "list_alt",
      title: t("transactions"),
      to: `/groups/${groupCode.value}/admin/transactions`
    }
  ] : []),
  {
    id: "menu-other-groups",
    icon: "group_work",
    title: t("otherGroups"),
    to: "/groups",
    separatorBefore: true
  }
])
</script>

<style lang="scss" scoped>
.navigation-rail {
  width: 80px;
  min-width: 80px;
  padding: 8px 0;

  .rail-header {
    display: flex;
    height: 56px;
    align-items: center;
    justify-content: center;
  }

  :deep(.q-separator) {
    width: 32px;
    margin: 8px auto;
  }

  .rail-item {
    min-height: 56px;
    padding: 2px 0;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;

    :deep(.q-item__section--avatar) {
      position: relative;
      flex: none;
      width: 56px;
      min-width: 56px;
      height: 32px;
      align-self: center;
      margin: 0;
      padding: 0;
      align-items: center;
      justify-content: center;
    }

    :deep(.q-item__section--avatar::before) {
      position: absolute;
      z-index: 0;
      width: 56px;
      height: 32px;
      border-radius: 16px;
      pointer-events: none;
      content: "";
    }

    :deep(.q-avatar),
    :deep(.q-icon) {
      z-index: 1;
    }

    :deep(.q-icon) {
      font-size: 24px;
    }

    :deep(.q-item__section--main) {
      position: relative;
      z-index: 1;
      display: flex;
      flex: none;
      width: 100%;
      min-height: 16px;
      margin: 4px 0 0;
      padding: 0;
      align-items: center;
      justify-content: center;
      text-align: center;
      line-height: 16px;
      white-space: normal;
    }

    &.rail-item--active :deep(.q-item__section--avatar::before) {
      background: $active;
    }

    &:hover:not(:focus-visible) :deep(.q-focus-helper) {
      background: transparent;
      opacity: 0;
    }

    :deep(.q-item__section--avatar:hover::before) {
      background: $surface-container-high;
    }

    &.rail-item--active :deep(.q-item__section--avatar:hover::before) {
      background: $active;
    }
  }

  &.navigation-rail--expanded {
    width: 256px;
    min-width: 256px;

    .rail-header {
      justify-content: flex-start;
      padding-left: 16px;
    }

    :deep(.q-separator) {
      width: calc(100% - 32px);
      margin: 8px 16px;
    }

    .rail-item {
      padding: 4px 16px;
      flex-direction: row;
      justify-content: flex-start;

      &.rail-item--active :deep(.q-item__section--avatar::before) {
        width: 224px;
        height: 40px;
        border-radius: 20px;
      }

      :deep(.q-item__section--avatar) {
        align-self: auto;
      }

      :deep(.q-item__section--main) {
        flex: 1;
        width: auto;
        margin: 0 0 0 16px;
        align-items: flex-start;
        justify-content: flex-start;
        text-align: left;
      }
    }
  }
}
</style>

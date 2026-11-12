<template>
  <q-list class="navigation-rail">
    <q-item
      id="my-group"
      class="menu-item--rail group-item"
      :active="groupActive"
      active-class="menu-item--rail-active"
      :clickable="!groupActive"
      :aria-label="myMember.group.attributes.name"
      @click="$router.push(`/groups/${groupCode}`)"
    >
      <q-item-section avatar>
        <avatar
          :img-src="myMember.group.attributes.image"
          :text="myMember.group.attributes.code"
          size="32px"
        />
      </q-item-section>
      <q-item-section
        class="text-label-medium group-label"
        :class="groupActive ? 'text-primary-variant' : 'text-on-surface-medium'"
      >
        {{ myMember.group.attributes.name }}
      </q-item-section>
    </q-item>

    <q-separator />

    <menu-item
      icon="home"
      :title="$t('home')"
      to="/home"
      rail
    />

    <menu-item
      id="menu-transactions"
      icon="account_balance_wallet"
      :title="$t('transactions')"
      :to="`/groups/${groupCode}/members/${myMember.attributes.code}/transactions`"
      rail
    />

    <q-separator />

    <menu-item
      id="menu-needs"
      icon="loyalty"
      :title="$t('needs')"
      :to="`/groups/${groupCode}/needs`"
      rail
    />
    <menu-item
      id="menu-offers"
      icon="local_offer"
      :title="$t('offers')"
      :to="`/groups/${groupCode}/offers`"
      rail
    />
    <menu-item
      id="menu-members"
      icon="people"
      :title="$t('members')"
      :to="`/groups/${groupCode}/members`"
      rail
    />
    <menu-item
      v-if="!isLegacyAccounting"
      id="menu-stats"
      icon="insert_chart"
      :title="$t('statistics')"
      :to="`/groups/${groupCode}/stats`"
      rail
    />

    <template v-if="isAdmin">
      <q-separator />
      <menu-item
        icon="edit"
        :title="$t('editGroup')"
        :to="`/groups/${groupCode}/admin/edit`"
        rail
      />
      <menu-item
        icon="settings"
        :title="$t('groupSettings')"
        :to="`/groups/${groupCode}/admin/settings`"
        rail
      />
      <menu-item
        icon="manage_accounts"
        :title="$t('manageMembers')"
        :to="`/groups/${groupCode}/admin/accounts`"
        rail
      />
      <menu-item
        icon="list_alt"
        :title="$t('transactions')"
        :to="`/groups/${groupCode}/admin/transactions`"
        rail
      />
    </template>

    <q-separator />

    <menu-item
      icon="group_work"
      :title="$t('otherGroups')"
      to="/groups"
      rail
    />
  </q-list>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import Avatar from "./Avatar.vue";
import MenuItem from "./MenuItem.vue";

const store = useStore()
const route = useRoute()

const myMember = computed(() => store.getters.myMember)
const groupCode = computed(() => myMember?.value.group.attributes.code)
const isAdmin = computed(() => store.getters.isAdmin)
const isLegacyAccounting = computed(() => store.getters.isLegacyAccounting)
const groupActive = computed(() => route.fullPath === `/groups/${myMember.value.group.attributes.code}`)
</script>

<style lang="scss" scoped>
.navigation-rail {
  width: 80px;
  min-width: 80px;
  padding: 8px 0;

  :deep(.q-item) {
    min-height: 56px;
  }

  :deep(.q-separator) {
    width: 32px;
    margin: 8px auto;
  }

  .group-item {
    padding: 4px 0;
    flex-direction: column;
    justify-content: flex-start;

    :deep(.q-item__section--avatar) {
      position: relative;
      width: 56px;
      min-width: 56px;
      height: 32px;
      align-self: center;
      padding-right: 0;
      justify-content: center;
    }

    :deep(.q-item__section--avatar::before) {
      position: absolute;
      z-index: 0;
      width: 56px;
      height: 32px;
      border-radius: 16px;
      content: "";
    }

    :deep(.q-avatar) {
      z-index: 1;
    }

    :deep(.q-item__section:not(.q-item__section--avatar)) {
      display: flex;
      flex: none;
      width: 100%;
      min-height: 14px;
      align-items: center;
      text-align: center;
      line-height: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &.menu-item--rail-active :deep(.q-item__section--avatar::before) {
      background: $active;
    }

    &:hover :deep(.q-item__section--avatar::before) {
      background: $surface-container-high;
    }

    &.menu-item--rail-active:hover :deep(.q-item__section--avatar::before) {
      background: $active;
    }
  }
}
</style>

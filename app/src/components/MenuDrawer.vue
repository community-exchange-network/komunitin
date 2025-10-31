<template>
  <q-list>
    <member-header
      id="my-member" 
      :member="myMember" 
      :to="`/groups/${groupCode}/members/${myMember.attributes.code}`"
      active-class="bg-active"
    >
      <template #caption>
        {{ myAccount?.attributes.code }}
      </template>
      <template #side>
        <q-btn
          flat
          round
          color="icon-dark"
          icon="expand_more"
          @click.stop
        >
          <q-menu
            auto-close
            anchor="bottom right"
            self="top right"
          >
            <q-list>
              <menu-item
                icon="edit"
                :title="$t('editProfile')"
                to="/profile"
              />
              <menu-item  
                icon="settings"
                :title="$t('settings')"
                to="/settings"
              />
              <menu-item
                id="user-menu-logout"
                icon="logout"
                :title="$t('logout')"
                to="/logout"
              />
            </q-list>
          </q-menu>
        </q-btn>
      </template>
    </member-header>

    <q-separator />

    <!--menu-item icon="home" :title="$t('home')"  /-->
    <menu-item 
      id="menu-transactions" 
      icon="account_balance_wallet"
      :title="$t('transactions')" 
      :to="`/groups/${groupCode}/members/${myMember.attributes.code}/transactions`"
    />

    <q-separator />

    <!-- Group -->
    <group-header 
      id="my-group"
      :clickable="!groupActive"
      :active="groupActive"
      active-class="bg-active text-primary"
      :group="myMember.group" 
      @click="$router.push(`/groups/${groupCode}`)"
    />

    <q-separator />
    
    <menu-item
      id="menu-needs"
      icon="loyalty"
      :title="$t('needs')"
      :to="`/groups/${groupCode}/needs`"
    />
    <menu-item
      id="menu-offers"
      icon="local_offer"
      :title="$t('offers')"
      :to="`/groups/${groupCode}/offers`"
    />
    <menu-item
      id="menu-members"
      icon="people"
      :title="$t('members')"
      :to="`/groups/${groupCode}/members`"
    />
    <menu-item
      v-if="!isLegacyAccounting"  
      id="menu-stats"
      icon="insert_chart"
      :title="$t('statistics')"
      :to="`/groups/${groupCode}/stats`"
    />

    <template v-if="isAdmin">
      <q-separator />
      <div class="text-overline text-onsurface-d q-pl-md q-pt-md text-uppercase">
        {{ $t('administration') }}
      </div>
      <menu-item
        icon="edit"
        :title="$t('editGroup')"
        :to="`/groups/${groupCode}/admin/edit`"
      />
      <menu-item
        icon="settings"
        :title="$t('groupSettings')"
        :to="`/groups/${groupCode}/admin/settings`"
      />
      <menu-item
        icon="manage_accounts"
        :title="$t('accounts')"
        :to="`/groups/${groupCode}/admin/accounts`"
      />
      <menu-item
        icon="list_alt"
        :title="$t('transactions')"
        :to="`/groups/${groupCode}/admin/transactions`"
      />
    </template>
    <q-separator />

    <menu-item
      icon="group_work"
      :title="$t('otherGroups')"
      to="/groups"
    />
    <menu-item
    icon="info"
    :title="$t('komunitinProject')"
    href="https://github.com/komunitin/komunitin"
    />
    <menu-item 
      v-if="feedbackURL"
      icon="feedback"
      :title="$t('feedback')"
      :href="feedbackURL"
    />
  </q-list>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import MemberHeader from "./MemberHeader.vue";
import MenuItem from "./MenuItem.vue";
import GroupHeader from "./GroupHeader.vue";
import { useRoute } from "vue-router";
import { config } from "src/utils/config";

const feedbackURL = config.FEEDBACK_URL;
const store = useStore()
const route = useRoute()

const myMember = computed(() => store.getters.myMember)
const myAccount = computed(() => store.getters.myAccount)
const groupCode = computed(() => myMember?.value.group.attributes.code)

const isAdmin = computed(() => store.getters.isAdmin)

const isLegacyAccounting = computed(() => store.getters.isLegacyAccounting)

const groupActive = computed(() => (route.fullPath ==`/groups/${myMember.value.group.attributes.code}`))
</script>

<style lang="scss" scoped>
#my-member,
#my-group {
  height: $header-height;
}
</style>

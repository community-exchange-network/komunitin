<template>
  <q-btn
    flat 
    round
    size="md"
    :aria-label="$t('profile')"
    @click.stop
  >
    
    <avatar
      class="profile-btn"
      size="md"
      :img-src="myMember?.attributes.image"
      :text="myMember?.attributes.name || ''"
    />
    

    <q-menu
      fit
      auto-close
      anchor="bottom right"
      self="top right"
      max-height="none"
    >
      <q-list style="min-width: 250px;">

        <!-- Profile details -->
        <div 
          class="column items-center q-pa-md" 
          data-testid="profile-details"
          @click.stop>
          <avatar
            size="4rem"
            :img-src="myMember?.attributes.image"
            :text="myMember?.attributes.name || ''"
          />
          <span class="text-center text-subtitle1 q-mt-md">
            {{ myMember?.attributes.name }}
          </span>
          <span class="text-center text-grey-7">
            {{ account }}
          </span>
        </div>

        <q-separator />

        <menu-item
          icon="sym_r_account_circle"
          :title="$t('myProfile')"
          :to="`/groups/${groupCode}/members/${myMember?.attributes.code}`"
        />
        <notifications-menu-item />
        <menu-item
          icon="sym_r_loyalty"
          :title="$t('myNeeds')"
          :to="`/groups/${groupCode}/members/${myMember?.attributes.code}#needs`"
        />
        <menu-item
          icon="sym_r_local_offer"
          :title="$t('myOffers')"
          :to="`/groups/${groupCode}/members/${myMember?.attributes.code}#offers`"
        />
        <menu-item
          icon="sym_r_edit"
          :title="$t('editProfile')"
          to="/profile"
        />
        <menu-item  
          icon="sym_r_settings"
          :title="$t('settings')"
          to="/settings"
        />
        <menu-item
          id="user-menu-logout"
          icon="sym_r_logout"
          :title="$t('logout')"
          to="/logout"
        />

        <q-separator />

        <menu-item
          icon="sym_r_info"
          :title="$t('about')"
          href="https://github.com/komunitin/komunitin"
          />
        <menu-item 
          v-if="feedbackURL"
          icon="sym_r_feedback"
          :title="$t('feedback')"
          :href="feedbackURL"
        />
      </q-list>
    </q-menu>
  </q-btn>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from 'vuex';
import { config } from 'src/utils/config';

import Avatar from "./Avatar.vue";
import MenuItem from '../components/MenuItem.vue';
import NotificationsMenuItem from './NotificationsMenuItem.vue';

const store = useStore();

const myMember = computed(() => store.getters.myMember);
const groupCode = computed(() => myMember.value?.group?.attributes.code ?? '');
const account = computed(() => myMember?.value.account.attributes.code || '')

const feedbackURL = config.FEEDBACK_URL;


</script>
<style lang="scss" scoped>
.profile-btn {
  outline: 1px solid rgba($onprimary, 0.2); 
}
</style>
<template>
  <q-btn
    outline 
    round
    size="sm"
    :aria-label="$t('profile')"
    @click.stop
  >
    <avatar
      size="sm"
      :img-src="myMember.attributes.image"
      :text="myMember.attributes.name"
    />

    <q-menu
      auto-close
      anchor="bottom right"
      self="top right"
    >
      <q-list>
        <member-header
          id="my-member" 
          :member="myMember" 
          :to="`/groups/${groupCode}/members/${myMember.attributes.code}`"
          active-class="bg-active"
          />
        <menu-item
          icon="loyalty"
          :title="$t('myNeeds')"
          :to="`/groups/${groupCode}/members/${myMember.attributes.code}#needs`"
        />
        <menu-item
          icon="local_offer"
          :title="$t('myOffers')"
          :to="`/groups/${groupCode}/members/${myMember.attributes.code}#offers`"
        />
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

        <q-separator />

        <menu-item
          icon="info"
          :title="$t('about')"
          href="https://github.com/komunitin/komunitin"
          />
        <menu-item 
          v-if="feedbackURL"
          icon="feedback"
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
import MemberHeader from '../components/MemberHeader.vue';
import MenuItem from '../components/MenuItem.vue';

const store = useStore();

const myMember = computed(() => store.getters.myMember);
const groupCode = computed(() => myMember?.value.group.attributes.code);

const feedbackURL = config.FEEDBACK_URL;


</script>

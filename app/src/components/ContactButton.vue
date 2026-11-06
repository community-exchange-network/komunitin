<template>
  <q-btn
    v-bind="$attrs"
    @click="show"
  >
    <slot />
    <q-dialog v-model="contactsView">
      <q-card>
        <q-card-section class="q-pb-none">
          <div class="text-h6">
            {{ $t("contact") }}
          </div>
        </q-card-section>
        <q-card-section>
          <social-network-list
            type="contact"
            :contacts="contacts"
            flat
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-btn>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import SocialNetworkList from "./SocialNetworkList.vue";

export default defineComponent({
  name: "ContactButton",
  components: {
    SocialNetworkList
  },
  props: {
    contacts: {
      type: Array,
      required: true
    },
  },
  data: () => ({
    contactsView: false
  }),
  methods: {
    show() {
      this.contactsView = true;
    }
  }
});

</script>

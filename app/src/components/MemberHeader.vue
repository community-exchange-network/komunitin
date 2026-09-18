<template>
  <q-item
    v-bind="$attrs"
    :clickable="clickable ?? ((to != '') && !active)"
    :active="active"
    @click="click"
  >
    <!-- Member avatar & name -->
    <q-item-section avatar>
      <avatar
        :img-src="member.attributes.image"
        :text="member.attributes.name"
      />
    </q-item-section>
    <q-item-section>
      <q-item-label
        lines="1"
        class="text-weight-bold text-onsurface"
      >
        {{ member.attributes.name }}
      </q-item-label>
      <q-item-label caption>
        <slot name="caption">
          {{ account }}
        </slot>
      </q-item-label>
    </q-item-section>
    <slot name="extra" />
    <q-item-section side>
      <!-- No content by default on the side slot -->
      <slot name="side" />
    </q-item-section>
  </q-item>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import Avatar from "./Avatar.vue";

export default defineComponent({
  name: "MemberHeader",
  components: {
    Avatar
  },
  props: {
    member: {
      type: Object,
      required: true,
    },
    to: {
      type: String,
      required: false,
      default: null
    },
    clickable: {
      type: Boolean,
      required: false,
      default: null
    }
  },
  emits: ["click"],
  computed: {
    active(): boolean {
      return this.to == this.$route.path;
    },
    account(): string {
      return (this.member.account) ? this.member.account.attributes.code : "";
    },
  },
  methods: {
    click() {
      if (this.to) {
        this.$router.push(this.to);
      }
      this.$emit("click");
    }
  }
});
</script>

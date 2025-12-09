<template>
  <div>
    <page-header
      :title="group ? group.attributes.name : ''"
      :back="own ? '' : '/groups'" 
    >
      <template #buttons>
        <contact-button
          v-if="group"
          icon="message"
          round
          flat
          :contacts="group.contacts"
        />
        <share-button
          v-if="group"
          icon="share"
          flat
          round
          :title="$t('checkTheExchangeCommunityGroup', {group: group.attributes.name})"
          :text="group.attributes.description"
        />
      </template>
    </page-header>
    <q-page-container>
      <q-page class="q-pa-md">
        <!-- Loading spinner -->
        <q-inner-loading
          :showing="isLoading"
          color="icon-dark"
        />
        <!-- Group view -->
        <group-page-header
          v-if="group"
          :group="group"
          :tab="'overview'"
          @tab-change="onTabChange"
        />
        <q-tab-panels
          :model-value="hashTab"  
          @update:model-value="onTabChange"
        >
          <q-tab-panel
            name="overview"
            keep-alive
          >
            <p>overview</p>
          </q-tab-panel>
          <q-tab-panel
            name="members"
            keep-alive
          >
            <p>members</p>
          </q-tab-panel>
        </q-tab-panels>
      </q-page>
    </q-page-container>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import md2html from "../../plugins/Md2html";

import PageHeader from "../../layouts/PageHeader.vue";

import GroupPageHeader from './GroupPageHeader.vue';
import ContactButton from "../../components/ContactButton.vue";
import ShareButton from "../../components/ShareButton.vue";
import type { Group, Contact, Category, Currency } from "../../store/model";

/**
 * Page for Group details.
 */
export default defineComponent({
  name: "Group",
  components: {
    ShareButton,
    ContactButton,
    PageHeader,
    GroupPageHeader
  },
  props: {
    code: {
      type: String,
      required: true
    }
  },
  setup() {
    const ready = ref(false)
    const route = useRoute();
    const router = useRouter();
    return {
      link(link: string): string {
        return link.replace(/(https|http):\/\//, "");
      },
      md2html,
      ready,
      route,
      router
    }
  },
  data() {
    return {
      socialButtonsView: false
    };
  },
  computed: {
    isLoggedIn(): boolean {
      return this.$store.getters.isLoggedIn
    },
    group(): Group & { contacts: Contact[]; categories: Category[]; currency: Currency } {
      return this.$store.getters["groups/current"];
    },
    currency(): Currency {
      return this.group?.currency;
    },
    own(): boolean {
      return this.group && this.$store.getters["myMember"] && this.group.id == this.$store.getters["myMember"].group.id
    },
    currencyItems(): string[] {
      return [];
      // FIXME: https://github.com/komunitin/komunitin/issues/81
    },
    offersItems(): string[] {
      return this.group.categories ? this.buildCategoryItems("offers") : []
    },
    needsItems(): string[] {
      return this.group.categories ? this.buildCategoryItems("needs") : []
    },
    center(): [number, number] | undefined {
      return this.group?.attributes.location.coordinates;
    },
    marker(): [number, number] | undefined {
      return this.center
    },
    isLoading(): boolean {
      return !(this.ready || this.currency && this.group && this.group.contacts && this.group.categories);
    },
    hashTab(): string {
      const hash = this.route.hash.slice(1)
      const tabs = ['overview', 'offers', 'needs', 'members', 'statistics']
      return tabs.includes(hash) ? hash : 'overview'
    },
  }, 
  created() {
    // If I just call the fetch functions in created or mounted hook, then navigation from
    // `/groups/GRP1` to `/groups/GRP2` doesn't trigger the action since the
    // component is reused. If I otherwise add the `watch` Vue component member, the
    // tests fail and give "You may have an infinite update loop in a component
    // render function". So that's the way I found to make it work.
    //
    // https://router.vuejs.org/guide/essentials/dynamic-matching.html#reacting-to-params-changes
    this.$watch("code", this.fetchData, { immediate: true });
  },
  methods: {
    async fetchData(code: string) {
      await this.fetchGroup(code);
      this.ready = true
    },
    // Group info.
    async fetchGroup(code: string) {
      return this.$store.dispatch("groups/load", {
        group: code,
        include: "currency,contacts,categories"
      });
    },
    // Categories info.
    buildCategoryItems(type: "offers" | "needs"): string[] {
      // Copy original array not to modify it when sorting.
      const items: string[] = this.group.categories
        .slice()
        .sort(
          (a, b) =>
            b.relationships[type].meta.count - a.relationships[type].meta.count
        )
        .slice(0, 4)
        .map(
          category =>
            `${category.relationships[type].meta.count} ${category.attributes.name}`
        );
      if (this.group.categories.length > 4) {
        items.push(this.$t("andMoreCategories").toString());
      }
      return items;
    },
    onTabChange(tab: string | number) {  
      this.router.push({hash: `#${tab}`})
    }
  }
});
</script>

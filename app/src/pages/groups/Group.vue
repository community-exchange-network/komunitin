<template>
  <div>
    <page-header
      :title="group ? group.attributes.name : ''"
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

        <div
          v-if="group"
          class="row q-col-gutter-md"
        >
          <!-- image -->
          <div class="col-4 q-px-md">
            <div class="q-mx-auto" style="max-width: 152px; line-height: 0;">
              <fit-text update>
                <avatar
                  size="inherit"
                  :text="group.attributes.name"
                  :img-src="group.attributes.image"
                />
              </fit-text>
            </div>
          </div>

          <!-- description -->
          <div class="col column">
            <div class="text-h6">
              {{ group.attributes.code }}
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="text-onsurface-m"
              :class="isDescriptionOpen ? '' : 'ellipsis-3-lines'"
              v-html="md2html(group.attributes.description)"
            />

            <q-btn
              flat
              no-caps
              style="margin-left:auto;"
              @click="toggleDescription"
              >
              more...
            </q-btn>
          </div>
        </div>
        <!-- sub-page navigation -->
        <nav
          v-if="group"
          class="row q-col-gutter-md q-py-md"
        >
          <router-link :to="`/groups/${code}/members`" 
            style="text-decoration: none; color: inherit; height: fit-content;"
            class="col-6"
            >
            <q-card 
              flat
              class="transition-all bg-active text-onsurface-m"
            >
              <q-card-section class="text-center">
                <q-icon name="people" size="sm"/>
                <div class="text-body2 text-weight-medium">
                  {{ $t('members') }}
                </div>
              </q-card-section>
            </q-card>
          </router-link>

          <router-link :to="`/groups/${code}/stats`" 
            style="text-decoration: none; color: inherit; height: fit-content;"
            class="col-6"
            >
            <q-card 
              flat
              class="transition-all bg-active text-onsurface-m"
            >
              <q-card-section class="text-center">
                <q-icon name="insert_chart" size="sm"/>
                <div class="text-body2 text-weight-medium">
                  {{ $t('statistics') }}
                </div>
              </q-card-section>
            </q-card>
          </router-link>
        </nav>
        <div
          v-if="group"
          class="row q-col-gutter-md"
        >
          <div class="col-12 col-sm-6 col-lg-8">
            <q-card
              square
              flat
            >
              <simple-map
                class="simple-map"
                :center="center"
                :marker="marker"
              />
              <q-card-section class="group-footer-card text-onsurface-m">
                <q-icon name="place" />
                {{ group.attributes.location.name }}
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-6 col-lg-4 relative-position">
            <social-network-list
              type="contact"
              :contacts="group.contacts"
            />
          </div>
          <floating-btn
            v-if="!isLoggedIn"
            :label="$t('signUp')"
            icon="add"
            color="primary"
            :to="`/groups/${group.attributes.code}/signup`"
          />
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";

import md2html from "../../plugins/Md2html";

import PageHeader from "../../layouts/PageHeader.vue";

import Avatar from '../../components/Avatar.vue';
import ContactButton from "../../components/ContactButton.vue";
import ShareButton from "../../components/ShareButton.vue";
import SimpleMap from "../../components/SimpleMap.vue";
import SocialNetworkList from "../../components/SocialNetworkList.vue";
import FloatingBtn from "../../components/FloatingBtn.vue";
import FitText from '../../components/FitText.vue';

import type { Group, Contact, Category, Currency } from "../../store/model";

/**
 * Page for Group details.
 */
export default defineComponent({
  name: "Group",
  components: {
    FitText,
    Avatar,
    SimpleMap,
    ShareButton,
    ContactButton,
    SocialNetworkList,
    PageHeader,
    FloatingBtn
  },
  props: {
    code: {
      type: String,
      required: true
    }
  },
  setup() {
    const ready = ref(false);
    const isDescriptionOpen = ref(false);
    return {
      link(link: string): string {
        return link.replace(/(https|http):\/\//, "");
      },
      md2html,
      ready,
      isDescriptionOpen
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
    }
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
    toggleDescription():void {
      this.isDescriptionOpen = !this.isDescriptionOpen
    }
  }
});
</script>

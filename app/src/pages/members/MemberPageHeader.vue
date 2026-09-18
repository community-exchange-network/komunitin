<template>
  <collapsible-header
    :collapsible-height="220"
    :fixed-height="72"
  >
    <div class="row q-py-lg text-onsurface-m collapsible-content">
      <div class="col-4 q-px-md">
        <div class="q-mx-auto" style="max-width: 152px; line-height: 0;">
          <fit-text update>
            <avatar
              class="member-avatar"
              size="inherit"
              :text="member.attributes.name"
              :img-src="member.attributes.image"
            />
          </fit-text>
        </div>
      </div>

      <div class="col column">
        <div class="text-overline text-uppercase text-onsurface-d">
          {{ memberTypeLabel }}
        </div>

        <div class="text-h5 text-serif text-bold text-onsurface">
          {{ member.attributes.name }}
        </div>

        <div v-if="member.account" class="text-body2 text-weight-medium text-onsurface-m">
          {{ member.account.attributes.code }}
        </div>

        <div v-if="member.account?.attributes.balance !== undefined" class="q-mt-md">
          <div class="text-overline text-uppercase text-onsurface-d">
            {{ $t("balance") }}
          </div>
          <div>
            <span
              class="text-h6 q-mr-md"
              :class="
                member.account.attributes.balance >= 0
                  ? 'positive-amount'
                  : 'negative-amount'
              "
            >
              {{
                FormatCurrency(
                  member.account.attributes.balance,
                  member.account.currency
                )
              }}
            </span>
            <account-limits
              :account="member.account"
              class="text-body2"
            />
          </div>
        </div>
      </div>
    </div>
    <template #fixed>
      <q-tabs
        :model-value="tab"
        active-color="primary"
        class="bg-light text-onsurface-m full-width"
        align="justify"
        no-caps
        @update:model-value="tabChange"
      >
        <q-tab
          name="profile"
          :label="$t('profile')"
        />
        <q-tab
          name="needs"
          :label="$t('Needs')"
        >
          <q-badge 
            v-if="nNeeds > 0"
            color="primary" 
            floating>{{nNeeds}}</q-badge>
        </q-tab>
        <q-tab
          name="offers"
          :label="$t('Offers')"
        >
          <q-badge
            v-if="nOffers > 0" 
            color="primary" 
            floating>{{nOffers}}
          </q-badge>
        </q-tab>
        <q-tab
          v-if="transactions"
          name="transactions"
          :label="$t('transactions')"
        />
      </q-tabs>
     
    </template>
  </collapsible-header>
</template>
<script lang="ts">
import { defineComponent } from "vue";

import CollapsibleHeader from "../../layouts/CollapsibleHeader.vue";

import AccountLimits from "./AccountLimits.vue";

import Avatar from "src/components/Avatar.vue";
import FitText from "src/components/FitText.vue";

import type { Member } from "../../store/model";
import FormatCurrency from "../../plugins/FormatCurrency"

export default defineComponent({
  name: "MemberPageHeader",
  components: {
    AccountLimits,
    CollapsibleHeader,
    Avatar,
    FitText
  },
  props: {
    member: {
      type: Object,
      required: true
    },
    tab: {
      type: String,
      required: true
    },
    /**
     * Whether to show the transactions tab.
     */
    transactions: {
      type: Boolean,
      required: false,
      default: true
    }
  },
  emits: ['tab-change'],
  setup() {
    return {
      FormatCurrency
    }
  },
  computed: {
    memberTypeLabel(): string {
      const labels: { [key: string]: string } = {
        personal: this.$t("personalAccount") as string,
        business: this.$t("businessAccount") as string,
        public: this.$t("publicAccount") as string
      };
      return labels[(this.member as Member).attributes.type];
    },
    nNeeds() : number | undefined {
      return this.member.relationships.needs?.meta.count
    },
    nOffers(): number | undefined {
      return this.member.relationships.offers?.meta.count
    }
  },
  methods: {
    tabChange(value: string) {
      // Emit the custom event "tabChange" so it can be handled by parent.
      this.$emit("tab-change", value);
    }
  }
});
</script>
<style lang="scss" scoped>
.member-avatar {
  outline: 3px solid white;
  box-shadow: $shadow-4;
}

.collapsible-content {
  height: 220px;
}
</style>

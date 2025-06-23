<template>
  <collapsible-header
    :collapsible-height="200"
    :fixed-height="72"
  >
    <div class="row q-py-lg text-onsurface-m bg-active collapsible-content">
      <div class="col-md-4 col-6 q-px-md">
        <img
          v-if="member.attributes.image"
          class="member-image q-mx-auto"
          :src="member.attributes.image"
        >
        <div
          v-else
          class="member-image q-mx-auto"
        >
          <fit-text update>
            <avatar
              :text="member.attributes.name"
              size="inherit"
            />
          </fit-text>
        </div>
      </div>
      <div class="col column">
        <div>
          <div class="text-overline text-uppercase text-onsurface-d">
            {{ memberTypeLabel }}
          </div>
          <div 
            v-if="member.account" 
            class="text-h6 text-onsurface"
          >
            {{ member.account.attributes.code }}
          </div>
        </div>
        <div v-if="member.account?.attributes.balance !== undefined">
          <div 
            class="text-overline text-uppercase text-onsurface-d q-mt-md">
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
        active-bg-color="active"
        active-color="primary"
        class="bg-surface text-onsurface-m full-width"
        align="justify"
        @update:model-value="tabChange"
      >
        <q-tab
          name="profile"
          icon="account_circle"
          :label="$t('profile')"
        />
        <q-tab
          name="needs"
          icon="loyalty"
          :label="$t('nNeeds', nNeeds ?? 0)"
        />
        <q-tab
          name="offers"
          icon="local_offer"
          :label="$t('nOffers', nOffers ?? 0)"
        />
        <q-tab
          v-if="transactions"
          name="transactions"
          icon="account_balance_wallet"
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

import { Member } from "../../store/model";
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
// Style image:
.member-image {
  display: block;
  width: 100%;
  max-height: 152px;
  max-width: 152px;
  border-radius: 76px;
  line-height: 0;
  object-fit: cover;
  aspect-ratio: 1/1;
}
.collapsible-content {
  height: 200px;
}
</style>

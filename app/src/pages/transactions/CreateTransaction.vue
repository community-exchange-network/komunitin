<template>
  <page-header 
    :title="title" 
    balance 
    :back="`/groups/${code}/members/${myMemberCode}/transactions`"
  />
  <q-page-container>
    <q-page>
      <q-tabs
        v-if="showTabs.length > 1"
        class="bg-active text-onsurface-m"
        active-class="text-primary"
        align="justify"
      >
        <q-route-tab
          v-if="showTabs.includes('simple')"
          :to="`/groups/${code}/members/${myMemberCode}/transactions/${direction}`"
          :label="$t('enterData')"
          icon="edit"
        />
        <q-route-tab
          v-if="showTabs.includes('qr')"
          :to="`/groups/${code}/members/${myMemberCode}/transactions/${direction}/qr`"
          :label="$t('qrCode')"
          icon="qr_code"
        />
        <q-route-tab
          v-if="showTabs.includes('nfc')"
          :to="`/groups/${code}/members/${myMemberCode}/transactions/${direction}/nfc`"
          :label="$t('nfcTag')"
          icon="nfc"
        />
        <q-route-tab
          v-if="showTabs.includes('multiple')"
          :to="`/groups/${code}/members/${myMemberCode}/transactions/${direction}/multiple`"
          :label="$t('multiple')"
          icon="list"
        />
      </q-tabs>
      <router-view />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { useMyAccountSettings } from 'src/composables/accountSettings';
import PageHeader from 'src/layouts/PageHeader.vue';
import type { Member } from 'src/store/model';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';

const props = defineProps<{
  /**
   * Group code
   */
  code: string,
  /**
   * Whether the payer is configurable. 
   * If false, the payer needs to be provided or defauls to the current member.
   */
  direction: "send" | "receive" | "transfer"
}>()

const title = computed(() => {
  if (props.direction === "send") {
    return t("sendPayment")
  } else if (props.direction === "receive") {
    return t("receivePayment")
  } else {
    return t("createTransaction")
  }
})

const { t } = useI18n()

const store = useStore()
const myMember = computed<Member>(() => store.getters.myMember)

const settings = useMyAccountSettings()

const showTabsSend = () => {
  const show = []
  if (settings.value?.allowPayments) {
    if (settings.value?.allowSimplePayments) {
      show.push("simple")
    }
    if (settings.value?.allowQrPayments) {
      show.push("qr")
    }
    if (settings.value?.allowMultiplePayments) {
      show.push("multiple")
    }
  }
  return show
}

const showTabsReceive = () => {
  const show = []
  if (settings.value?.allowPaymentRequests) {
    if (settings.value?.allowSimplePaymentRequests) {
      show.push("simple")
    }
    if (settings.value.allowTagPaymentRequests) {
      show.push("nfc")
    }
    if (settings.value?.allowMultiplePaymentRequests) {
      show.push("multiple")
    }
  }
  if (settings.value?.allowQrPaymentRequests) {
    show.push("qr")
  }
  return show
}

const showTabs = computed(() => {
  if (props.direction === "send") {
    return showTabsSend()
  } else {
    // receive & transfer are the same
    return showTabsReceive()
  }
})

const myMemberCode = computed<string>(() => myMember.value.attributes.code)

const router = useRouter()

if (showTabs.value.length === 1) {
  // Redirect to the only available tab
  const tab = showTabs.value[0]
  let path = `/groups/${props.code}/members/${myMemberCode.value}/transactions/${props.direction}`
  if (tab !== "simple") {
    path += `/${tab}`
  }
  router.push(path)
}

</script>
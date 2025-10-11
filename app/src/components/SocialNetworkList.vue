<template>
  <q-list>
    <q-item
      v-for="key of networks"
      :key="key"
      :ref="key"
      clickable
      @click="contact(key)"
    >
      <q-item-section avatar>
        <q-avatar size="lg">
          <img :src="getNetworkIcon(key)">
        </q-avatar>
      </q-item-section>
      <q-item-section v-if="type === 'contact'">
        <q-item-label>{{ contactName(key) }}</q-item-label>
        <q-item-label caption>
          {{ networkLabel(key) }}
        </q-item-label>
      </q-item-section>
      <q-item-section v-else>
        <q-item-label>{{ networkLabel(key) }}</q-item-label>
      </q-item-section>
    </q-item>
  </q-list>
</template>
<script setup lang="ts">

import type { Contact } from "../store/model"
import { getNetworkIcon, getContactUrl, getShareUrl, getShareNetworkKeys, getContactNetworkKeys, getNetwork } from "../utils/social-networks"
import { computed } from "vue"
import { useI18n } from "vue-i18n"

const props = withDefaults(defineProps<{
  type?: "contact" | "share",
  contacts?: Contact[],
  url?: string,
  title?: string,
  text?: string
}>(), {
  type: "share",
  contacts: () => [],
  url: window.location.href,
  title: "",
  text: ""
});

const contact = (network: string) => {
  const url = props.type == "contact"
    ? getContactUrl(network, contactName(network) ?? "")
    : getShareUrl(network, props.url, props.title, props.text);
  window.open(url, "_blank");
}

const contactName = (network: string): string => {
  if (props.type === "contact") {
    const contact = (props.contacts).find(c => c.attributes.type === network);
    return contact ? contact.attributes.name : "";
  }
  return "";
}

const { t } = useI18n();

const networkLabel = (key: string): string => {
  const network = getNetwork(key);
  if (network && network.label) {
    return network.translateLabel ? t(network.label) : network.label;
  }
  return "";
}

const networks = computed(() => {
  if (props.type === "contact") {
    return getContactNetworkKeys().filter(key => {
      return props.contacts?.some(c => c.attributes.type === key);
    })
  } else {
    return getShareNetworkKeys()
  }
})

</script>

<template>
  <q-input
    v-for="(contact, index) in contacts"
    :key="contact.type"
    :model-value="contact.value"
    type="text"
    :label="getNetworkLabel(contact.type)"
    outlined
    :disable="contact.type === 'email'"
    class="q-mb-md"
    @update:model-value="(name) => updateContact(index, name as string)"
  >
    <template #prepend>
      <q-avatar size="md">
        <img :src="getNetworkIcon(contact.type)">
      </q-avatar>
    </template>
    <template #append>
      <q-btn
        v-if="contact.type !== 'email'"
        flat
        round
        icon="delete"
        @click="deleteContact(contact)"
      />
    </template>
  </q-input>
  <div class="flex justify-end">
    <dialog-form-btn
      :label="$t('addContact')"
      :valid="!!(newContactType && newContactName)"
      :submit="addContact"
    >
      <template #default>
        <q-select 
          v-model="newContactType"
          :label="$t('type')"
          :options="newContactOptions"
          required
          outlined
          :rules="[v => !!v || $t('fieldRequired')]"
        >
          <template #option="{opt, itemProps}">
            <q-item v-bind="itemProps">
              <q-item-section avatar>
                <q-avatar size="md">
                  <img :src="getNetworkIcon(opt.value)">
                </q-avatar>
              </q-item-section>
              <q-item-section>{{ opt.label }}</q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-input
          v-model="newContactName"
          type="text"
          name="newContactName"
          :label="getNetworkIdLabel(newContactType?.value ?? '')"
          outlined
          required
          class="q-mt-md"
          :rules="[v => !!v || $t('fieldRequired')]"
        />
      </template>
      <template #actions>
        <q-btn
          color="primary"
          flat
          :label="$t('test')"
          @click="testNewContact"
        />
      </template>
    </dialog-form-btn>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue"
import { getNetworkIcon, getContactUrl, getNetwork, getContactNetworkKeys } from "../utils/social-networks"
import { useI18n } from "vue-i18n"
import type { Contact } from "../store/model"
import DialogFormBtn from "./DialogFormBtn.vue"

const props = defineProps<{
  modelValue: Contact[]
}>()

const emit = defineEmits<{
  (e: "update:modelValue", value: Contact[]): void
}>()

const contacts = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
})

const { t } = useI18n()

const getNetworkLabel = (key: string) => {
  const network = getNetwork(key)
  if (!network) {
    return key
  } else if (network.translateLabel) {
    return t(network.label)
  } else {
    return network.label
  }
}

const getNetworkIdLabel = (key: string) => {
  const network = getNetwork(key)
  if (!network) {
    return key
  } else if (network.idLabel) {
    return network.translateIdLabel ? t(network.idLabel) : network.idLabel
  } else {
    return network.translateLabel ? t(network.label) : network.label
  }
}

const newContactType = ref()
const newContactName = ref<string>()
const newContactOptions = computed(() => getContactNetworkKeys().map((key) => ({
  label: getNetworkLabel(key),
  value: key,
  disable: contacts.value.some(contact => contact.type === key)
})))

const testNewContact = () => {
  if (newContactType.value && newContactName.value) {
    const url = getContactUrl(newContactType.value.value, newContactName.value)
    window.open(url, '_blank')
  }
}

const addContact = () => {
  if (newContactType.value && newContactName.value) {
    contacts.value = [
      ...contacts.value,
      {
        type: newContactType.value.value,
        value: newContactName.value
      }
    ]
    newContactType.value = undefined
    newContactName.value = undefined
  }
}

const deleteContact = (contact: Contact) => {
  contacts.value = contacts.value.filter(c => c.type !== contact.type || c.value !== contact.value)
}

const updateContact = (index: number, name: string) => {
  // we update the root object so the reactive setter is triggered
  contacts.value = [
    ...contacts.value.slice(0, index),
    {
      ...contacts.value[index],
      value: name
    },
    ...contacts.value.slice(index + 1)
  ]
}

</script>

<template>
  <page-header
    :title="$t('editGroup')" 
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <div class="q-pb-lg">
        <div class="text-subtitle1">
          {{ $t('group') }}
        </div>
        <div class="text-onsurface-m">
          {{ $t('editGroupText') }}
        </div>
      </div>
      <edit-group-form 
        v-if="group"
        op="edit"
        :group="group"
        :contacts="group.attributes.contacts"
        :currency="group.currency"
        @update:group="saveGroup"
        @update:contacts="saveContacts"
        @update:currency="saveCurrency"
      />
      <save-changes
        ref="changes"
        class="q-mt-lg"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { useStore } from "vuex";
import EditGroupForm from "./EditGroupForm.vue"
import PageHeader from "src/layouts/PageHeader.vue";
import SaveChanges from "src/components/SaveChanges.vue";
import { computed, ref, watch } from "vue";
import type { Contact, Currency, Group } from "src/store/model";

const store = useStore()
const props = defineProps<{
  code: string
}>()

watch(() => props.code, async (code) => {
  await store.dispatch("groups/load", {
    group: code,
    include: "currency"
  })
}, { immediate: true })
const group = computed(() => store.getters["groups/current"])

const changes = ref<typeof SaveChanges>()

const saveGroup = (group: Group) => {
  changes.value?.save(async () => {
    return await store.dispatch("groups/update", {
      group: group.attributes.code,
      resource: {
        attributes: {
          ...group.attributes
        }
      }
    })
  })
}
const saveContacts = (contacts: Contact[]) => {
  changes.value?.save(async () => {
    return await store.dispatch("groups/update", {
      group: props.code,
      resource: {
        attributes: {
          contacts
        }
      }
    })
  })
}
const saveCurrency = (currency: Currency) => {
  changes.value?.save(async () => {
    return await store.dispatch("currencies/update", {
      group: props.code,
      resource: {
        attributes: {
          ...currency.attributes
        }
      }
    })
  })
}
</script>

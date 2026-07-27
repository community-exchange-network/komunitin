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
        v-if="group && currency"
        op="edit"
        :group="group"
        :contacts="group.attributes.contacts"
        :currency="currency"
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
type GroupWithCurrency = Group & { currency?: Currency }

const group = computed<GroupWithCurrency | undefined>(() => store.getters["groups/current"])
const currency = computed<Currency["attributes"] | undefined>(() => {
  // Currency is stored in the group attributes before the group is approved.
  return group.value?.attributes.status === "pending"
    ? group.value.attributes.meta?.request.currency
    : group.value?.currency?.attributes
})

const changes = ref<typeof SaveChanges>()

const saveGroup = (group: Group) => {
  const { name, description, access, image, address, location } = group.attributes
  changes.value?.save(async () => {
    return await store.dispatch("groups/update", {
      group: group.attributes.code,
      resource: {
        attributes: {
          name,
          description,
          access,
          image,
          address,
          location
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
const saveCurrency = (currency: Currency["attributes"]) => {
  changes.value?.save(async () => {
    if (group.value?.attributes.status === "pending") {
      return await store.dispatch("groups/update", {
        group: props.code,
        resource: {
          attributes: {
            meta: {
              ...group.value.attributes.meta,
              request: {
                ...group.value.attributes.meta?.request,
                currency
              }
            }
          }
        }
      })
    } else {
      return await store.dispatch("currencies/update", {
        group: props.code,
        resource: {
          attributes: currency
        }
      })
    }
  })
}
</script>

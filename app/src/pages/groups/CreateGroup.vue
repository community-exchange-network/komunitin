<template>
  <page-header
    :title="$t('createGroup')"
    back="/"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <template v-if="!done">
        <div class="q-pb-lg">
          <div class="text-subtitle1">
            {{ $t('newGroup') }}
          </div>
          <div class="text-onsurface-m">
            {{ $t('newGroupText') }}
          </div>
        </div>
        <edit-group-form 
          v-if="group"
          v-model:group="group"
          v-model:contacts="contacts"
          v-model:currency="currency"
          op="create"
        />
        <q-btn
          class="q-mt-lg q-mx-auto"
          :label="$t('requestNewGroup')"
          color="primary"
          unelevated
          :loading="loading"
          @click="submit"
        />
      </template>
      <template v-else>
        <div class="q-pb-lg">
          <div class="text-subtitle1">
            {{ $t('newGroup') }}
          </div>
          <div class="text-onsurface-m">
            {{ $t('newGroupRequestedText', {name: group.attributes.name}) }}
          </div>
          <div class="q-mt-lg">
            <q-btn
              class="q-mx-auto"
              :label="$t('back')"
              color="primary"
              flat
              @click="$router.push('/')"
            />
          </div>
        </div>
      </template>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { useStore } from "vuex";
import EditGroupForm from "src/pages/admin/EditGroupForm.vue"
import PageHeader from "src/layouts/PageHeader.vue";
import { ref } from "vue";
import type { Currency, Group } from "src/store/model";
import { v4 as uuid } from "uuid";
import type { PartialContact } from "src/components/MemberContactsField.vue";

const store = useStore()

const myUser = store.getters.myUser

const group = ref<Group>({
  attributes: {},
} as Group)

const done = ref(false)

const contacts = ref<PartialContact[]>([])
const currency = ref<Currency>({
  type: "currencies",
  id: uuid(), // Ephemeral id for augmented posting.
  attributes: {
    decimals: 2,
    rate: {
      n: 1,
      d:10
    },
    scale: 6
  },
} as Currency)
const loading = ref(false)
const submit = async () => {
  try {
    loading.value = true
    await store.dispatch("groups/create", {
      resource: {
        type: "groups",
        attributes: {
          ...group.value.attributes,
        },
        relationships: {
          admins: {
            data: [ { type: "users", id: myUser.id } ]
          },
          contacts: {
            data: contacts.value.map((c) => ({ type: "contacts", id: c.id }))
          },
          currency: {
            data: { type: "currencies", id: currency.value.id }
          }
        }
      },
      included: [
        ...contacts.value,
        currency.value
      ]
    })
    done.value = true
  } finally {
    loading.value = false
  }
}
</script>
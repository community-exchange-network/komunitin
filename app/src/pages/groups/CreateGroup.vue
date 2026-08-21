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
      <q-form
        v-if="!done"
        @submit="submit"
      >
        <div class="q-pb-lg">
          <div class="text-subtitle1">
            {{ $t('newGroup') }}
          </div>
          <div class="text-onsurface-m">
            {{ $t('newGroupText') }}
          </div>
        </div>
        <edit-group-form 
          ref="editGroupForm"
          v-if="group"
          v-model:group="group"
          v-model:contacts="contacts"
          v-model:currency="currency"
          :op="createdGroup ? 'edit' : 'create'"
        />
        <q-btn
          class="q-mt-lg q-mx-auto"
          :label="$t('requestNewGroup')"
          color="primary"
          unelevated
          :loading="loading"
          type="submit"
        />
      </q-form>
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
import { ref, shallowRef, useTemplateRef } from "vue";
import type { Contact, Currency, Group } from "src/store/model";

const store = useStore()

const group = ref<Group>({
  attributes: {},
} as Group)
const groupForm = useTemplateRef<InstanceType<typeof EditGroupForm>>("editGroupForm")
const createdGroup = shallowRef<Group>()

const done = ref(false)

const contacts = ref<Contact[]>([])
const currency = ref<Partial<Currency["attributes"]>>({
  decimals: 2,
  rate: {
    n: 1,
    d: 10
  },
  scale: 6
})
const loading = ref(false)
const submit = async () => {
  try {
    loading.value = true
    // We can't upload the image until the group is created, because we need the group code
    // to upload the image to the right resource path. So we first create the group, then upload
    // the image, then update the group with the image object. 
    if (!createdGroup.value) {
      await store.dispatch("groups/create", {
        resource: {
          type: "groups",
          attributes: {
            ...group.value.attributes,
            contacts: contacts.value,
            meta: {
              request: {
                currency: currency.value
              }
            }
          }
        }
      })
      createdGroup.value = store.getters["groups/current"]
    }

    const image = await groupForm.value.uploadImage()
    if (image !== undefined) {
      if (image !== null) {
        await store.dispatch("groups/update", {
          group: createdGroup.value.attributes.code,
          id: createdGroup.value.id,
          resource: {
            type: "groups",
            id: createdGroup.value.id,
            attributes: { image }
          }
        })
      }
      done.value = true
    }
  } finally {
    loading.value = false
  }
}
</script>

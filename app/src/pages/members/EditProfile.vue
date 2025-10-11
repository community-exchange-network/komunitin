<template>
  <page-header 
    :title="$t('editProfile')" 
    balance 
    :back="`/groups/${actualCode}/members/${actualMemberCode}`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <profile-form 
        v-if="member && user" 
        :member="member"
        :contacts="member.contacts"
        :user="user"
        :change-credentials="true"
        @update:member="saveMember"
        @update:contacts="saveContacts"
      />
      <save-changes
        ref="changes"
        class="q-mt-lg"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import ProfileForm from "./ProfileForm.vue"
import SaveChanges from "../../components/SaveChanges.vue"

import { useStore } from "vuex"
import { computed, ref } from "vue"
import type { DeepPartial } from "quasar"

import type { Contact, Group, Member } from "../../store/model"
import { useFullMemberByCode } from "src/composables/fullMember"

const props = defineProps<{
  code?: string,
  memberCode?: string
}>()

const store = useStore()

const { user, member } = useFullMemberByCode(() => props.code, () => props.memberCode)

const actualCode = computed(() => (member.value as (Member & {group: Group}))?.group.attributes.code)
const actualMemberCode = computed(() => member.value?.attributes.code)

const changes = ref<typeof SaveChanges>()

const saveMember = async (resource: DeepPartial<Member>) => {
  const fn = () => store.dispatch("members/update", {
    id: member.value?.id,
    group: actualCode.value,
    resource : {
      attributes: resource.attributes
    }
  })
  await changes.value?.save(fn)
}

const saveContacts = async (resources: DeepPartial<Contact>[]) => {
  if (!member.value) return
  const fn = () => store.dispatch("members/update", {
    id: member.value?.id,
    group: actualCode.value,
    resource: {
      relationships: {
        contacts: {
          data: resources.map(r => ({id: r.id, type: "contacts"}))
        }
      }
    },
    included: resources
  })
  await changes.value?.save(fn)
}

</script>
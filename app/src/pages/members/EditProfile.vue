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
        v-if="member && memberUser"
        :member="member"
        :email="email"
        :change-credentials="isSelf"
        @update:member="saveMember"
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

import { computed, ref } from "vue"
import type { DeepPartial } from "quasar"

import type { Member } from "../../store/model"
import { useEditableMember, useEditableMemberUser } from "src/composables/editableMember"

const props = defineProps<{
  code?: string,
  memberCode?: string
}>()

const { resource: member, update: updateMember, isSelf } = useEditableMember(
  () => props.code,
  () => props.memberCode
)
const { resource: memberUser } = useEditableMemberUser(member, isSelf)
const email = computed(() => memberUser.value?.user.attributes.email)

const actualCode = computed(() => member.value?.group.attributes.code)
const actualMemberCode = computed(() => member.value?.attributes.code)

const changes = ref<typeof SaveChanges>()

const saveMember = async (resource: DeepPartial<Member>) => {
  const fn = () => updateMember({
    attributes: resource.attributes
  })
  await changes.value?.save(fn)
}

</script>

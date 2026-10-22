<template>
  <page-header title="Migrations" back="/superadmin/migrations" />
  <q-page-container>
    <q-page class="q-pa-md">
      <div class="text-overline text-uppercase q-mb-lg">
        Start a migration
      </div>
      <p>Upload a community CSV ZIP bundle to import users, accounts, history and marketplace data.</p>
      <q-file v-model="bundle" label="Community bundle (.zip)" accept=".zip" outlined :disable="running" />
      <q-btn class="q-my-md" color="primary" label="Import community" :loading="running" :disable="!bundle" @click="submitMigration" />
      <q-banner v-if="error" class="bg-negative text-white">{{ error }}</q-banner>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../layouts/PageHeader.vue'
import { useMigrationUpload } from './migrations'

const router = useRouter()
const bundle = ref<File | null>(null)
const { upload, running, error } = useMigrationUpload()

const submitMigration = async () => {
  if (bundle.value) {
    const id = await upload(bundle.value)
    if (id) await router.push({ name: 'MigrationDetails', params: { id } })
  }
}
</script>

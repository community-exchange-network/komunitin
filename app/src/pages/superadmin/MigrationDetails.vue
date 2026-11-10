<template>
  <page-header title="Migration details" back="/superadmin/migrations" />
  <q-page-container>
    <q-page class="q-pa-md">
      <q-banner v-if="error" class="bg-negative text-white q-mb-md">
        {{ error }}
        <template #action><q-btn flat label="Refresh" @click="refresh" /></template>
      </q-banner>
      <q-spinner v-if="loading" class="full-width flex-center" />
      <div v-else-if="migration" class="q-gutter-md">
        <!-- Migration Details Card -->
        <q-card flat bordered>
          <q-card-section>
            <div class="text-overline text-uppercase q-mb-md">Migration details</div>
            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Migration</div>
              <div class="text-weight-medium">{{ migration.id }}</div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Community</div>
              <div class="text-weight-bold" style="font-family: monospace;">
                {{ migration.code ?? 'Not yet identified' }}
              </div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Current Step</div>
              <div class="text-weight-medium">{{ step }}</div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Status</div>
              <q-chip
                :color="getStatusColor(migration.status)" 
                text-color="white" 
                :label="getStatusLabel(migration.status)"
                size="md"
              />
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Created</div>
              <div>{{ formatDate(migration.created) }}</div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Last Updated</div>
              <div>{{ formatDate(migration.updated) }}</div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Migration Log Card -->
        <q-card flat bordered>
          <q-card-section>
            <div class="text-overline text-uppercase q-mb-md">Migration Log</div>
            <div v-if="!loading && log.length === 0" class="text-grey text-center q-pa-md">
              No log entries yet
            </div>
            <q-virtual-scroll
              ref="scroll"
              :items="log"
              style="max-height: 600px;"
            >
              <template #default="{ item }">
                <q-item :key="item.id" class="block">
                  <div class="row items-center q-gutter-sm">
                    <q-chip 
                      :color="getLogLevelColor(item.level)"
                      text-color="white"
                      size="sm"
                      :label="item.level.toUpperCase()"
                    />
                    <span class="text-caption text-grey">{{ formatDate(item.created) }}</span>
                    <span class="text-caption text-grey">{{ item.step }}</span>
                  </div>
                  <div class="q-mt-xs">{{ item.message }}</div>
                </q-item>
            </template>
            <template #after>
              <q-spinner 
                v-if="migration.status === 'running'"
                class="q-mx-auto"
              />
            </template>
          </q-virtual-scroll>
          </q-card-section>
        </q-card>
        <div class="row justify-center">
          <q-btn label="Import or resume from CSV bundle" color="primary" unelevated to="/superadmin/migrations/new" />
        </div>
        
      </div>

      <!-- Migration not found -->
      <div v-else-if="!error" class="text-center q-pa-xl">
        <q-icon name="error_outline" size="4em" color="grey" class="q-mb-md" />
        <div class="text-h6 text-grey">Migration not found</div>
        <div class="text-subtitle2 text-grey q-mb-lg">
          The migration with ID "{{ id }}" could not be found.
        </div>
        <q-btn 
          label="Back to Migrations" 
          color="primary"
          to="/superadmin/migrations"
        />
      </div>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import PageHeader from '../../layouts/PageHeader.vue'
import { getStatusColor, getStatusLabel, useMigration } from './migrations'
import { QVirtualScroll } from 'quasar'

const props = defineProps<{
  id: string
}>()

const { migration, log, loading, error, step, refresh } = useMigration(() => props.id)

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString()
}

const getLogLevelColor = (level: string) => {
  return {
    'info': 'blue',
    'warn': 'orange', 
    'error': 'negative'
  }[level] ?? 'grey'
}

const scroll = ref<QVirtualScroll>()

watch(() => log.value.length, (length) => {
  scroll.value?.refresh(length - 1)
}, { flush: 'post' })

</script>

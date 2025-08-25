<template>
  <page-header title="Migration details" back="/superadmin/migrations" />
  <q-page-container>
    <q-page class="q-pa-md">
      <q-spinner v-if="loading" class="full-width flex-center" />
      <div v-else-if="migration" class="q-gutter-md">
        <!-- Migration Details Card -->
        <q-card flat bordered>
          <q-card-section>
            <div class="text-overline text-uppercase q-mb-md">Migration details</div>
            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Name</div>
              <div class="text-weight-medium">{{ migration.name }}</div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Code</div>
              <div class="text-weight-bold" style="font-family: monospace;">
                {{ migration.code }}
              </div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-grey-6">Kind</div>
              <div>{{ migration.kind }}</div>
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
            <div v-if="log.length === 0" class="text-grey text-center q-pa-md">
              No log entries yet
            </div>
            <div v-else class="q-gutter-sm">
              <div 
                v-for="entry in log" 
                :key="`${entry.time}-${entry.message}`"
                class="q-pa-sm"
              >
                <div class="row items-center q-gutter-sm">
                  <q-chip 
                    :color="getLogLevelColor(entry.level)"
                    text-color="white"
                    size="sm"
                    :label="entry.level.toUpperCase()"
                  />
                  <span class="text-caption text-grey">{{ formatDate(entry.time) }}</span>
                  <span class="text-caption text-grey">{{ entry.step }}</span>
                </div>
                <div class="q-mt-xs">{{ entry.message }}</div>
              </div>
              <q-card-section>
                <q-spinner 
                  v-if="migration.status === 'started'" 
                />
              </q-card-section>
            </div>
          </q-card-section>
        </q-card>
        <div class="row justify-center">
          <q-btn
            :label="migration.status === 'new' ? 'Start Migration' : 'Resume Migration'"
            color="primary"
            unelevated
            class="col-12 col-md-4"
            @click="play"
          />
        </div>
        
      </div>

      <!-- Migration not found -->
      <div v-else class="text-center q-pa-xl">
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
import { onUnmounted } from 'vue';
import PageHeader from '../../layouts/PageHeader.vue';
import { getStatusColor, getStatusLabel, useMigration } from './migrations';

const props = defineProps<{
  id: string
}>()

const { migration, log, loading, play, cleanup } = useMigration(() => props.id)

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

// Cleanup SSE connection when component unmounts
onUnmounted(() => {
  cleanup()
})

</script>

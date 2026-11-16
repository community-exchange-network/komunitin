<template>
  <page-header
    :title="t('groupSettings')"
    :back="isIndex ? undefined : indexPath"
  />
  <q-page-container>
    <q-page class="q-px-md q-pt-md q-pb-xl">
      <div class="q-mx-auto row bg-surface rounded-borders shadow-2 scroll">
        <div class="col-12 col-md-3" v-if="isIndex || wide">
          <community-settings-nav
            :index-path="indexPath"
            :wide="wide"
            :is-index="isIndex"
          />
        </div>
        <q-separator v-if="wide" vertical />
        <div class="col" :class="wide ? 'q-pa-lg' : 'q-pa-md'">
          <div v-if="wide || !isIndex">
            <router-view
              v-if="loaded"
              :key="route.path"
              :settings-context="settingsContext"
            />
            <q-inner-loading :showing="!loaded" color="icon" />
          </div>
          <save-changes ref="changes" v-show="loaded && (wide || !isIndex)" class="q-pt-xl q-pb-md q-px-sm" />
        </div>
      </div>
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import PageHeader from '@/layouts/PageHeader.vue'
import CommunitySettingsNav from './CommunitySettingsNav.vue'
import SaveChanges from '@/components/SaveChanges.vue'
import { useCommunitySettingsContext } from '@/composables/useCommunitySettings'

const props = defineProps<{ code: string }>()
const route = useRoute()
const { t } = useI18n()
const q = useQuasar()
const wide = computed(() => q.screen.gt.sm)
const indexPath = computed(() => `/groups/${props.code}/admin/settings`)
const isIndex = computed(() => route.path === indexPath.value)

const changes = ref<InstanceType<typeof SaveChanges>>()
const settingsContext = useCommunitySettingsContext(() => props.code, action => changes.value!.save(action))
const { loaded } = settingsContext

</script>
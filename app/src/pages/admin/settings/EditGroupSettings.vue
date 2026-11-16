<template>
  <page-header
    :title="t('groupSettings')"
    :back="isIndex ? undefined : indexPath"
  />
  <q-page-container>
    <q-page class="q-pa-md q-pb-xl" :style-fn="pageStyle">
      <div class="row bg-surface rounded-borders shadow-2">
        <div class="col-12 col-md-3" v-if="isIndex || wide">
          <community-settings-nav
            class="settings-nav"
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

// QPage supplies the layout offset, including any banner below the toolbar.
const pageStyle = (offset: number, height: number) => ({
  minHeight: `${height - offset}px`,
  '--page-offset': `${offset}px`
})

const changes = ref<InstanceType<typeof SaveChanges>>()
const settingsContext = useCommunitySettingsContext(() => props.code, action => changes.value!.save(action))
const { loaded } = settingsContext

</script>

<style lang="scss" scoped>
@media (min-width: $breakpoint-md-min) {
  .settings-nav {
    position: sticky;
    top: calc(var(--page-offset) + #{$space-y-base});
  }
}
</style>

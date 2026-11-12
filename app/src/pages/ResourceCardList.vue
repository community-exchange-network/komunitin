<template>
  <div>
    <page-header
      search
      :title="title"
      :loading="refreshing"
      balance
      @search="query = $event"
    />
    <q-page-container>
      <q-page>
        <ResourceCards
          :code="props.code"
          :type="props.type"
          :include="props.include"
          :filter="props.filter"
          :sort="props.sort"
          :query="query"
          @refreshing="refreshing = $event"
        />
        <slot name="after" />
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import PageHeader from "../layouts/PageHeader.vue";
import ResourceCards from "./ResourceCards.vue"

const props = defineProps<{
  title: string
  code: string
  type: string | string[]
  include?: string
  filter?: Record<string, string | string[]>
  sort?: string
}>()

const query = ref("");
const refreshing = ref(false)

</script>

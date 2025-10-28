<template>
  <div>
    <page-header
      search
      :title="title"
      balance
      @search="load"
    />
    <q-page-container>
      <q-page>
        <ResourceCards
          ref="resourceCards"
          :code="props.code"
          :type="props.type"
          :include="props.include"
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
}>()

const resourceCards = ref<InstanceType<typeof ResourceCards>>()
const load = (query: string) => {
  resourceCards.value?.load(query)
}

</script>

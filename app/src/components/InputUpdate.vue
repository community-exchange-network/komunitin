<template>
  <div class="row items-start no-wrap q-gutter-x-sm">
    <div class="col">
      <slot 
        :model-value="value"
        :update-model-value="($event: string|number) => value = $event"
      >  
        <q-input
          v-model="value"
          v-bind="$attrs"
          standout
          class="input-standout-light"
        />
      </slot>
    </div>
    <q-btn
      class="col-shrink q-mt-sm"
      color="primary"
      :label="$t('update')"
      :loading="loading"
      flat
      @click="update"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  inheritAttrs: false,
})

</script>
<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string|number
  loading: boolean
}>()
const emit = defineEmits<{
  (e: "update:modelValue", value: string|number): void
}>()

const value = ref(props.modelValue)

watch(() => props.modelValue, (val) => value.value = val)
const update = () => emit("update:modelValue", value.value)


</script>
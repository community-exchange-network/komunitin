<template>
  <div>
    <q-uploader 
      ref="uploader"  
      multiple
      accept="image/*"
      color="white"
      text-color="onsurface-m"
      flat
      bordered
      class="full-width max-h"
      hide-upload-btn
      @added="addFiles"
    >
      <template #header="scope">
        <div class="row no-wrap items-center q-pa-sm q-gutter-xs">
          <q-spinner
            v-if="isWorking"
            class="q-uploader__spinner" 
          />
          <div class="col">
            <div class="q-uploader__title">
              {{ label }}
            </div>
            <div class="q-uploader__subtitle">
              <template v-if="isProcessing">
                {{ $t('optimizingImages') }}
              </template>
              <template v-else-if="isUploading">
                {{ $t('uploadingImages') }}
              </template>
            </div>
          </div>
          <q-btn
            v-if="scope.canAddFiles"
            type="a"
            icon="add"
            round
            dense
            flat
            @click="scope.pickFiles"
          >
            <q-uploader-add-trigger />
          </q-btn>
          <q-btn
            v-if="isUploading"
            icon="clear"
            round
            dense
            flat 
            @click="abortUploads"
          />
        </div>
      </template>
      <template #list="scope">
        <div class="q-gutter-sm">
          <image-field-item 
            v-for="file in imageFiles" 
            :key="file.__key" 
            :file="file"
            @remove:file="removeImage(file.__key)"
          />
          <image-field-item
            v-for="file in uploaderFiles"
            :key="file.__key"
            :file="file"
            @remove:file="scope.removeFile(file)"
          />
        </div>
      </template>
    </q-uploader>
    <div
      v-if="hint" 
      class="text-onsurface-m q-pt-sm text-caption"
      style="padding-left: 12px; line-height: 1;"
    >
      {{ hint }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import ImageFieldItem from './ImageFieldItem.vue'
import { imageFile, useImageUploader } from '../composables/uploader'

const props = defineProps<{
  modelValue: string[],
  label: string,
  hint?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

// Set files from modelValue to the QUploader component
const images = ref<string[]>(props.modelValue)

const {
  uploader,
  uploaderFiles,
  addFiles,
  abortUploads,
  isProcessing,
  isUploading,
  isWorking
} = useImageUploader((url: string) => {
  images.value = [...images.value, url]
})

const imageFiles = computed(() => props.modelValue.map((url: string) => imageFile(url)))

const removeImage = (url: string) => {
  images.value = images.value.filter((u: string) => u != url)
}

// Keep local state aligned when the parent replaces the image list after emits
// or other external updates, while avoiding duplicate update loops.
watch(() => props.modelValue, (value) => {
  if (
    value.length !== images.value.length
    || value.some((image, index) => image !== images.value[index])
  ) {
    images.value = value
  }
})

watch(images, (value) => {
  emit("update:modelValue", value)
})

</script>
<style lang="scss">
.q-uploader {
  max-height: none;
}
.q-uploader__file--img {
  aspect-ratio: 4/3;
  height: auto;
}
</style>

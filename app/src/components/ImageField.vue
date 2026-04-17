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
      auto-upload
      hide-upload-btn
      :field-name="fieldName"
      :url="url"
      :headers="headers"
      @uploaded="uploaded"
    >
      <template #header="scope">
        <div class="row no-wrap items-center q-pa-sm q-gutter-xs">
          <q-spinner
            v-if="scope.isUploading"
            class="q-uploader__spinner" 
          />
          <div class="col">
            <div class="q-uploader__title">
              {{ label }}
            </div>
            <div class="q-uploader__subtitle">
              {{ scope.uploadSizeLabel }} / {{ scope.uploadProgressLabel }}
            </div>
          </div>
          <q-btn
            v-if="scope.canAddFiles"
            type="a"
            icon="sym_r_add"
            round
            dense
            flat
            @click="scope.pickFiles"
          >
            <q-uploader-add-trigger />
          </q-btn>
          <q-btn
            v-if="scope.isUploading"
            icon="sym_r_clear"
            round
            dense
            flat 
            @click="scope.abort"
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
import { ref, watch, computed } from 'vue'
import ImageFieldItem from './ImageFieldItem.vue'
import { imageFile, useUploaderSettings } from '../composables/uploader'
import { QUploader } from 'quasar'

const props = defineProps<{
  modelValue: string[],
  label: string,
  hint?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

// Set files from modelValue to the QUploader component
const uploader = ref<QUploader>()
const uploaderFiles = computed(() => uploader.value?.files || [])

const images = ref<string[]>(props.modelValue)

const imageFiles = computed(() => props.modelValue.map((url: string) => imageFile(url)))

const uploaded = ({xhr}: {xhr: XMLHttpRequest}) => {
  const response = JSON.parse(xhr.responseText)
  const url = response.data.attributes.url
  images.value = [...images.value, url]
  uploader.value?.removeUploadedFiles()
}

const removeImage = (url: string) => {
  images.value = images.value.filter((u: string) => u != url)
}

watch(images, (value) => {
  emit("update:modelValue", value)
})

const { fieldName, url, headers } = useUploaderSettings()

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
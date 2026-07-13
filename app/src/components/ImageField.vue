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
      :field-name="fieldName"
      :url="url"
      :headers="headers"
      :form-fields="formFields"
      @added="handleAdded"
      @uploaded="uploaded"
      @failed="failed"
    >
      <template #header="scope">
        <div class="row no-wrap items-center q-pa-sm q-gutter-xs">
          <q-spinner
            v-if="scope.isUploading || isProcessing"
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
            v-if="scope.canAddFiles && !isProcessing"
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
            v-if="scope.isUploading"
            icon="clear"
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
import { computed, ref, useTemplateRef, watch } from 'vue'
import type { QUploader } from 'quasar'
import type { ImageObject } from 'src/store/model'
import ImageFieldItem from './ImageFieldItem.vue'
import { imageFile, notifyImageError, useImageUploaderProcessing, useUploaderSettings } from '../composables/uploader'

const props = defineProps<{
  modelValue: ImageObject[],
  label: string,
  hint?: string,
  code: string,
  resourceType: "offers" | "needs"
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ImageObject[]): void
}>()

// Set files from modelValue to the QUploader component
const uploader = useTemplateRef<QUploader>("uploader")
const uploaderFiles = computed(() => uploader.value?.files || [])
const { isProcessing, handleAdded } = useImageUploaderProcessing({ uploader })

const images = ref<ImageObject[]>(props.modelValue)

const imageFiles = computed(() => props.modelValue.map(image => imageFile(image.url)))

const uploaded = ({xhr}: {xhr: XMLHttpRequest}) => {
  const response = JSON.parse(xhr.responseText)
  const url = response.data.attributes.url
  images.value = [...images.value, { url }]
  uploader.value?.removeUploadedFiles()
}

const failed = ({files}: {files: File[]}) => {
  files.forEach(file => uploader.value?.removeFile(file))
  notifyImageError()
}

const removeImage = (url: string) => {
  images.value = images.value.filter(image => image.url !== url)
}

watch(images, (value) => {
  emit("update:modelValue", value)
})

const { fieldName, url, headers, formFields } = useUploaderSettings(props)

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

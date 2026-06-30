<template>
  <q-uploader
    ref="uploader"
    class="avatar-field-uploader q-mx-auto"
    accept="image/*"
    flat
    bordered
    hide-upload-btn
    :url="url"
    :headers="headers"
    :field-name="fieldName"
    @added="handleAdded"
    @uploaded="uploaded"
  >
    <template #header>
      <q-uploader-add-trigger />
    </template>
    <template #list>
      <div @click="pickFiles">
        <avatar 
          :img-src="src" 
          :text="text"
          size="250px"
          class="q-mx-auto avatar"
        />
        <div class="avatar-icon">
          <q-circular-progress
            v-if="isProcessing || file.__status == 'uploading'"
            :value="isProcessing ? 0 : file.__progress"
            :min="0"
            :max="1"
            :indeterminate="isProcessing || file.__progress === 0"
            color="white"
            size="50px"
          />
          <q-icon
            v-else
            :name="file.__status == 'failed' ? 'error' : 'add_a_photo'"
            size="50px"
            color="white" 
          />
        </div>
      </div>
    </template>
  </q-uploader>
</template>
<script setup lang="ts">
import { computed, useTemplateRef } from "vue"
import type { QUploader } from "quasar"
import { imageFile, useImageUploaderProcessing, useUploaderSettings } from "../composables/uploader"
import Avatar from "./Avatar.vue"

const props = defineProps<{
  modelValue: string | null,
  text: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const uploader = useTemplateRef<QUploader>("uploader")
const src = computed(() => uploader.value?.files[0]?.__img?.src || props.modelValue)
const file = computed(() => uploader.value?.files[0] || imageFile(props.modelValue ?? ""))

const { url, headers, fieldName } = useUploaderSettings()
const { isProcessing, handleAdded } = useImageUploaderProcessing({ uploader })

const pickFiles = (event: Event) => {
  if (!isProcessing.value) {
    uploader.value?.pickFiles(event)
  }
}

const uploaded = ({xhr}: {xhr: XMLHttpRequest}) => {
  const response = JSON.parse(xhr.responseText)
  const url = response.data.attributes.url
  emit("update:modelValue", url)
  uploader.value?.removeUploadedFiles()
}

</script>
<style lang="scss" scoped>
.avatar-field-uploader {
  width: fit-content;
  border-radius: 50%;
  cursor: pointer;
  &:hover {
    .avatar-icon {
      opacity: 1;
    }
  }
}
.avatar:hover {
  filter: brightness(0.8);
}
.avatar-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  margin-left: -25px;
  margin-top: -25px;
  opacity: 0.85;
}

</style>

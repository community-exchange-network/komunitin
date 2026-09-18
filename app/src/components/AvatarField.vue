<template>
  <q-uploader
    ref="uploader"
    class="avatar-field-uploader q-mx-auto"
    accept="image/*"
    flat
    bordered
    hide-upload-btn
    :filter="replaceQueuedFile"
    v-bind="uploaderProps"
    v-on="uploaderEvents"
  >
    <template #header>
      <q-uploader-add-trigger />
    </template>
    <template #list>
      <div @click="pickFiles">
        <avatar 
          :img-src="src ? { url: src } : null"
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
import type { ImageObject } from "src/store/model"
import { imageFile, useImageUploader } from "../composables/uploader"
import Avatar from "./Avatar.vue"

const props = withDefaults(defineProps<{
  modelValue: ImageObject | null,
  text: string,
  code: string,
  resourceType: "members" | "groups",
  deferred?: boolean
}>(), {
  deferred: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: ImageObject): void
}>()

const uploader = useTemplateRef<QUploader>("uploader")
const src = computed(() => uploader.value?.files[0]?.__img?.src || props.modelValue?.url)
const file = computed(() => uploader.value?.files[0] || imageFile(props.modelValue?.url ?? ""))
let uploadedImage: ImageObject | null = null

const {
  uploaderProps,
  uploaderEvents,
  isProcessing,
  upload: uploadFiles
} = useImageUploader({
  uploader,
  code: () => props.code,
  resourceType: props.resourceType,
  deferred: props.deferred,
  onUploaded: image => {
    uploadedImage = image
    emit("update:modelValue", image)
  }
})

const pickFiles = (event: Event) => {
  if (!isProcessing.value) {
    uploader.value?.pickFiles(event)
  }
}
// In deferred mode, only upload the last selected file.
const replaceQueuedFile = (files: File[]) => {
  uploader.value?.removeQueuedFiles()
  return files
}

/**
 * Upload the selected file. To be used in deferred mode by parent component.
 * (actually used by CreateGroup.vue).
 * 
 * Returns the uploaded image object if successful, null if no file was selected,
 * undefined if the upload failed.
 */
const upload = async () => (await uploadFiles()) ? uploadedImage : undefined
defineExpose({ upload })

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

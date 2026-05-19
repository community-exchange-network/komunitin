<template>
  <q-uploader
    ref="uploader"
    class="avatar-field-uploader q-mx-auto"
    accept="image/*"
    flat
    bordered
    hide-upload-btn
    @added="addFiles"
  >
    <template #header>
      <q-uploader-add-trigger />
    </template>
    <template #list>
      <div @click="uploader?.pickFiles">
        <avatar 
          :img-src="src" 
          :text="text"
          size="250px"
          class="q-mx-auto avatar"
        />
        <div class="avatar-icon">
          <q-circular-progress
            v-if="isWorking"
            :value="file.__progress ?? 0"
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
import { computed } from "vue"
import { imageFile, useImageUploader } from "../composables/uploader"
import Avatar from "./Avatar.vue"

const props = defineProps<{
  modelValue: string | null,
  text: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const {
  uploader,
  uploaderFiles,
  addFiles,
  isProcessing,
  isWorking
} = useImageUploader((url: string) => {
  emit("update:modelValue", url)
})

const src = computed(() => uploaderFiles.value[0]?.__img?.src || props.modelValue)
const file = computed(() => uploaderFiles.value[0] || imageFile(props.modelValue ?? ""))

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

<template>
  <q-list>
    <div 
      v-if="!(modelValue?.length)" 
      class="q-py-md text-onsurface"
    >
      {{ $t('noTags') }}
    </div>
    <q-item 
      v-for="tag in modelValue"
      :key="tag.name"
    >
      <q-item-section avatar>
        <q-icon 
          name="nfc" 
          color="icon-dark"
        />
      </q-item-section>
      <q-item-section>
        <q-item-label>{{ tag.name }}</q-item-label>
        <q-item-label 
          v-if="tag.updated"
          caption
        >
          {{ $formatDate(tag.updated) }}
        </q-item-label>
      </q-item-section>
      <q-item-section side>
        <div class="row justify-end">
          <q-btn
            flat
            dense
            round
            icon="edit"
            @click="editTag(tag)"
          />
          <delete-btn 
            @confirm="deleteTag(tag)"
          >
            {{ $t('deleteNFCTagConfirmation', {name: tag.name}) }}
          </delete-btn>
        </div>
      </q-item-section>
    </q-item>
  </q-list>
  <div class="row justify-end q-mt-md">
    <q-btn
      flat
      color="primary"
      :label="$t('addTag')"
      @click="addTag()"
    />
  </div>
  <q-dialog v-model="showDialog">
    <q-card>
      <q-card-section>
        <div class="flex justify-between">
          <div class="text-h6">
            {{ actionLabel }}
          </div>
          <q-btn
            flat
            round
            icon="close"
            style="margin-top: -8px; margin-right: -8px;"
            @click="showDialog = false"
          />
        </div>
      </q-card-section>
      <q-card-section class="q-gutter-y-md">
        <q-input
          v-model="tagName"
          :label="$t('name')"
          outlined
        />
        <nfc-tag-input 
          v-model="tagValue"
          :label="$t('nfcTag')"
          :hint="$t('nfcTagHint')"
          outlined
        />
      </q-card-section>
      <q-card-section align="right">
        <q-btn
          unelevated
          color="primary"
          :label="$t('save')"
          :disable="saveDisabled"
          @click="saveTag()"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from "vue"
import DeleteBtn from "./DeleteBtn.vue"
import NfcTagInput from "./NfcTagInput.vue"
import { useI18n } from "vue-i18n"
import type { AccountTag } from "src/store/model"

const props = defineProps<{
  modelValue?: AccountTag[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AccountTag[]|undefined): void
}>()

// Not using computed model property since we have more fine-grained control
// being the model an array.

const showDialog = ref(false)

const { t } = useI18n()
const action = ref<"add" | "edit">("add")
const actionLabel = computed(() => action.value === "add" ? t('addTag') : t('editTag'))
const editingTagIndex = ref<number>(-1)

const tagName = ref<string>()
const tagValue = ref<string>()

const deleteTag = (tag: AccountTag) => {
  emit('update:modelValue', props.modelValue?.filter(t => t !== tag))
}

const addTag = () => {
  action.value = "add"
  editingTagIndex.value = -1
  tagName.value = ""
  tagValue.value = ""
  showDialog.value = true
}

const editTag = (tag: AccountTag) => {
  action.value = "edit"
  editingTagIndex.value = (props.modelValue).indexOf(tag)
  tagName.value = tag.name
  tagValue.value = ""
  showDialog.value = true
}

const saveTag = () => {
  if (!(tagName.value && tagValue.value)) {
    return
  }
  const tags = [...(props.modelValue ?? [])]
  if (action.value === "edit") {
    tags[editingTagIndex.value].name = tagName.value
    if (tagValue.value) {
      tags[editingTagIndex.value].value = tagValue.value
    }
  } else if (action.value === "add") {
    tags.push({
      name: tagName.value,
      value: tagValue.value,
    })
  }
  emit('update:modelValue', tags)
  showDialog.value = false
}

const saveDisabled = computed(() => !tagName.value || (action.value === "add" && !tagValue.value))


</script>
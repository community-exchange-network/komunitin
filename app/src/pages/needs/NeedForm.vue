<template>
  <q-form @submit="onSubmit">
    <div class="q-gutter-y-lg">
      <div>
        <div class="text-subtitle1">
          {{ $t('enterNeedData') }}
        </div>
        <div class="text-onsurface-m">
          {{ $t('needFormHelpText') }}
        </div>
      </div>
      <image-field
        v-model="images"
        :label="$t('uploadImages')" 
        :hint="$t('uploadNeedImagesHint')"
      />
      <q-input 
        v-model="description"
        type="textarea"
        name="description"  
        :label="$t('description')" 
        :hint="$t('needDescriptionHint')" 
        outlined 
        autogrow 
        required
        input-style="min-height: 100px;"
        :rules="[() => !v$.description.$invalid || $t('needDescriptionRequired')]"
      >
        <template #append>
          <q-icon name="notes" />
        </template>
      </q-input>
      <select-category
        v-model="category" 
        :code="code"
        :label="$t('category')"
        :hint="$t('needCategoryHint')"
        required
      />
      <date-field
        v-model="expiration"
        :label="$t('expirationDate')"
        :hint="$t('needExpirationDateHint')"
      />
      <toggle-item 
        v-if="showState"
        v-model="state"
        :label="$t('published')"
        :hint="$t('needPublishedHint')"
        true-value="published"
        false-value="hidden"
      />
      <q-btn
        :label="submitLabel ?? $t('preview')"
        type="submit"
        color="primary"
        unelevated
        class="full-width"
        :disabled="v$.$invalid"
      />
    </div>
  </q-form>
</template>
<script setup lang="ts">
import { ref } from "vue"
import DateField from "../../components/DateField.vue"
import ImageField from "../../components/ImageField.vue"
import SelectCategory from "../../components/SelectCategory.vue"
import ToggleItem from "../../components/ToggleItem.vue"
import type { Category, Need, NeedState } from "src/store/model"
import useVuelidate from "@vuelidate/core"
import { minLength, required } from "@vuelidate/validators"
import type { DeepPartial } from "quasar"
import { useStore } from "vuex"

const props = defineProps<{
  code: string
  modelValue?: DeepPartial<Need> & {category: Category}
  showState?: boolean
  submitLabel?: string
}>()
const emit = defineEmits<{
  (e: "submit", value: DeepPartial<Need>): void
}>()

const images = ref<string[]>(props.modelValue?.attributes?.images || [])
const description = ref(props.modelValue?.attributes?.content || "")
const category = ref<Category|null>(props.modelValue?.category || null)

let date: Date
if (props.modelValue?.attributes?.expires) {
  date = new Date(props.modelValue?.attributes?.expires)
} else {
  // Set expiry date in one week by default
  date = new Date()
  date.setDate(date.getDate() + 7)
}
const expiration = ref(date)

const state = ref<NeedState>(props.modelValue?.attributes?.state || "published")

// Validation
const rules = {
  description: { required, minLength: minLength(10) },
  category: { required },
  expiration: { required }
}
const v$ = useVuelidate(rules, {images, description, category, expiration})
const store = useStore()

const onSubmit = async () => {
  const isFormCorrect = await v$.value.$validate()
  if (isFormCorrect) {
    emit("submit", {
      ...props.modelValue,
      type: "needs",
      attributes: {
        ...props.modelValue?.attributes,
        content: description.value,
        expires: expiration.value.toISOString(),
        images: images.value,
        state: state.value
      },
      relationships: {
        ...props.modelValue?.relationships,
         
        category: { data: { type: "categories", id: category.value.id } },
        member: { data: { type: "members", id: store.getters.myMember.id} }
      }
    })
  }
}

</script>
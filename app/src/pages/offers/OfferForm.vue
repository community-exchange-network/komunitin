<template>
  <q-form @submit="onSubmit" ref="form">
    <div class="q-gutter-y-lg">
      <div>
        <div class="text-subtitle1">
          {{ props.header ?? $t('enterOfferData') }}
        </div>
        <div class="text-onsurface-m">
          {{ $t('offerFormHelpText') }}
        </div>
      </div>
      <image-field
        v-model="images"
        :label="$t('uploadImages')" 
        :hint="$t('uploadOfferImagesHint')"
      />
      <select-category
        v-model="category" 
        :code="code"
        :label="$t('category')"
        :hint="$t('offerCategoryHint')"
        :rules="[(v) => !!v || $t('categoryRequired')]"
      />
      <q-input
        v-model="title"
        type="text"
        name="title"
        :label="$t('title')"
        :hint="$t('offerTitleHint')"
        outlined
        :rules="[(v) => !!v || $t('offerTitleRequired')]"
      >
        <template #append>
          <q-icon name="lightbulb" />
        </template>
      </q-input>
      <q-input 
        v-model="description"
        type="textarea"
        name="description"  
        :label="$t('description')" 
        :hint="$t('offerDescriptionHint')" 
        outlined 
        autogrow 
        input-style="min-height: 100px;"
        :rules="[(v) => (!!v && v.length >= 10) || $t('offerDescriptionRequired')]"
      >
        <template #append>
          <q-icon name="notes" />
        </template>
      </q-input>
      <q-input
        v-model="price"
        type="text"
        name="price"
        :label="$t('price')"
        :hint="$t('offerPriceHint')"
        outlined
        :rules="[(v) => !!v || $t('offerPriceRequired')]"
      >
        <template #append>
          <span class="text-h6 text-onsurface-m">{{ currency.attributes.symbol }}</span>
        </template>
      </q-input>
      <date-field
        v-model="expiration"
        :label="$t('expirationDate')"
        :hint="$t('offerExpirationDateHint')"
      />
      <toggle-item 
        v-if="showState"
        v-model="state"
        :label="$t('published')"
        :hint="$t('offerPublishedHint')"
        true-value="published"
        false-value="hidden"
      />
      <q-btn
        :label="submitLabel ?? $t('preview')"
        type="submit"
        color="primary"
        unelevated
        class="full-width"
        :loading="loading"
      />
    </div>
  </q-form>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import DateField from "../../components/DateField.vue"
import ImageField from "../../components/ImageField.vue"
import SelectCategory from "../../components/SelectCategory.vue"
import ToggleItem from "../../components/ToggleItem.vue"
import { Category, Offer, OfferState } from "src/store/model"
import { type DeepPartial, type QForm } from "quasar"
import { useStore } from "vuex"

const props = defineProps<{
  code: string
  modelValue?: DeepPartial<Offer> & {category: Category}
  showState?: boolean
  submitLabel?: string
  header?: string
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: "submit", value: DeepPartial<Offer>): void
}>()

const form = ref<InstanceType<typeof QForm>>()

const images = ref<string[]>([])
const title = ref("")
const description = ref("")
const category = ref<Category|null>(null)
const price = ref("")
const expiration = ref<Date>(new Date())

const state = ref<OfferState>(props.modelValue?.attributes?.state || "published")

watch([() => props.modelValue], async () => {
  images.value = props.modelValue?.attributes?.images || []
  title.value = props.modelValue?.attributes?.name || ""
  description.value = props.modelValue?.attributes?.content || ""
  category.value = props.modelValue?.category || null
  price.value = props.modelValue?.attributes?.price || ""
  
  if (props.modelValue?.attributes?.expires) {
    expiration.value = new Date(props.modelValue.attributes.expires)
  } else {
    // Set expiry date in one year by default
    const date = new Date()
    date.setFullYear(date.getFullYear() + 1)
    expiration.value = date
  }
  
  state.value = props.modelValue?.attributes?.state || "published"

  // For some unknown reason the resetValidation needs to be called
  // after changes by this watcher are applied.
  await nextTick()
  form.value?.resetValidation()

}, { immediate: true })

const store = useStore()

const currency = computed(() => store.getters.myCurrency)

const onSubmit = async () => {
  const isFormCorrect = await form.value?.validate()
  if (isFormCorrect) {
    emit("submit", {
      ...props.modelValue,
      type: "offers",
      attributes: {
        ...props.modelValue?.attributes,
        name: title.value,
        content: description.value,
        expires: expiration.value.toISOString(),
        images: images.value,
        price: price.value,
        state: state.value
      },
      relationships: {
        ...props.modelValue?.relationships,
         
        category: { data: { type: "categories", id: category.value!.id } },
        member: { data: { type: "members", id: store.getters.myMember.id} }
      }
    })
  }
}

</script>
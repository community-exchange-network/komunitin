<template>
  <div class="q-gutter-y-lg">
    <avatar-field
      v-model="image"
      :text="name"
    />
    <q-input
      v-model="name"
      type="text"
      :label="$t('groupName')"
      outlined
      required
      :rules = "[v => !!v || $t('fieldRequired')]"
    />
    <q-input
      v-model="code"
      type="text"
      :label="$t('groupCode')"
      :hint="$t('groupCodeHint')"
      mask="XXXX"
      outlined
      required
      :disable="props.op === 'edit'"
      :debounce="500"
      :rules="[async (code: string) => await checkFreeCode(code) || $t('codeTaken'), (code: string) => code.length === 4 || $t('invalidValue')]"
    />
    <q-input 
      v-model="description"
      type="textarea"
      :label="$t('description')"
      :hint="$t('descriptionHint')"
      outlined 
      autogrow 
      input-style="min-height: 100px;"
      :rules = "[v => !!v || $t('fieldRequired')]"
    />
    <div>
      <location-picker 
        v-model="location"
        :default-location="[0, 0]"
        :zoom="1"
      />
    </div>
    <q-input
      v-model="city"
      type="text"
      :label="$t('city')"
      outlined
      required
      :rules = "[v => !!v || $t('fieldRequired')]"
    />
    <q-input
      v-model="region"
      type="text"
      name="region"
      :label="$t('region')"
      outlined
      required
      :rules = "[v => !!v || $t('fieldRequired')]"
    />
    <country-chooser
      v-model="country"
      :label="$t('country')"
      outlined
      required
    />
    <member-contacts-field v-model="contacts" />
    <div>
      <div class="text-subtitle1">
        {{ $t('currency') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('editCurrencyText') }}
      </div>
    </div>
    <q-input
      v-model="currencyName"
      type="text"
      :label="$t('currencyName')"
      outlined
      required
      :rules = "[v => !!v || $t('fieldRequired')]"
    />
    <q-input
      v-model="currencyNamePlural"
      type="text"
      :label="$t('currencyNamePlural')"
      outlined
      required
      :rules = "[v => !!v || $t('fieldRequired')]"
    />
    <q-input
      v-model="currencySymbol"
      type="text"
      :label="$t('currencySymbol')"
      outlined
      required
      hide-bottom-space
      :rules="[(val: string) => val.length > 0 && val.length <= 3 || $t('invalidValue')]"
    />
    <q-input
      v-model.number="decimals"
      type="number"
      :label="$t('decimals')"
      outlined
      required
      :rules="[(val: number) => val >= 0 && val <= 6 || $t('invalidValue')]"
    />
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from "vue"
import AvatarField from "src/components/AvatarField.vue"
import LocationPicker from "src/components/LocationPicker.vue"
import CountryChooser from "src/components/CountryChooser.vue"
import type { PartialContact } from "src/components/MemberContactsField.vue";
import MemberContactsField from "src/components/MemberContactsField.vue"
import type { Currency, Group } from "src/store/model"
import { watchDebounced } from "@vueuse/shared"
import { useStore } from "vuex"

const props = defineProps<{
  op: "edit" | "create"
  group: Group
  contacts: PartialContact[]
  currency: Currency
}>()

const emit = defineEmits<{
  (e: "update:group", group: Group): void,
  (e: "update:contacts", contacts: PartialContact[]): void,
  (e: "update:currency", currency: Currency): void
}>()

const image = ref(props.group.attributes.image ?? "")
const name = ref(props.group.attributes.name ?? "")
const code = ref(props.group.attributes.code ?? "")
const description = ref(props.group.attributes.description ?? "")
const location = ref(props.group.attributes.location?.coordinates ?? null)

const city = ref(props.group.attributes.address?.addressLocality ?? "")
const region = ref(props.group.attributes.address?.addressRegion ?? "")
const country = ref(props.group.attributes.address?.addressCountry ?? "")

const contacts = ref(props.contacts)

const currencyName = ref(props.currency.attributes.name ?? "")
const currencyNamePlural = ref(props.currency.attributes.namePlural ?? "")
const currencySymbol = ref(props.currency.attributes.symbol ?? "")
const decimals = ref(props.currency.attributes.decimals ?? 2)

// Consider image and others differently since the image value is changed in the update endpoint.
watch(image, () => {
  emit('update:group', {
    ...props.group,
    attributes: {
      ...props.group.attributes,
      image: image.value
    }
  } as Group)
})
watchDebounced([name, code, description, location, city, region, country], () => {
  emit('update:group', {
    ...props.group,
    attributes: {
      ...props.group.attributes,
      name: name.value,
      code: code.value,
      description: description.value,
      location: {
        type: "Point",
        coordinates: location.value
      },
      address: {
        addressLocality: city.value,
        addressRegion: region.value,
        addressCountry: country.value
      }
    }
  } as Group)
})

watch([contacts], () => {
  emit('update:contacts', contacts.value)
})

watchDebounced([currencyName, currencyNamePlural, currencySymbol, decimals], () => {
  emit('update:currency', {
    ...props.currency,
    attributes: {
      ...props.currency.attributes,
      name: currencyName.value,
      namePlural: currencyNamePlural.value,
      symbol: currencySymbol.value,
      decimals: decimals.value
    }
  } as Currency)
})

const store = useStore()

const checkFreeCode = async (code: string)  => {
  await store.dispatch("groups/loadList", { 
    filter: { code }, 
    onlyResources: true 
  })
  const existing = store.getters["groups/find"]({code})
  return !existing
}
</script>
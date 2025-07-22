<template>
  <div class="q-gutter-y-lg">
    <div>
      <div class="text-subtitle1">
        {{ $t('enterProfileData') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('editProfileHelpText') }}
      </div>
    </div>
    <avatar-field
      v-model="image"
      :text="name"
    />
    <q-input
      v-model="name"
      type="text"
      name="name"
      :label="$t('name')"
      :hint="$t('nameHint')"
      outlined
      required
      :rules="[(v) => !!v || $t('nameRequired')]"
    >
      <template #append>
        <q-icon name="person" />
      </template>
    </q-input>
    <q-input 
      v-model="description"
      type="textarea"
      name="description"  
      :label="$t('bio')" 
      :hint="$t('bioHint')" 
      outlined 
      autogrow 
      input-style="min-height: 100px;"
    >
      <template #append>
        <q-icon name="notes" />
      </template>
    </q-input>
    <q-input
      v-model="email"
      type="text"
      name="email"
      :label="$t('email')"
      :hint="$t('emailHint')"
      outlined
      required
      disable
    >
      <template #append>
        <q-icon name="email" />
      </template>
    </q-input>
    <div 
      v-if="changeCredentials"
      class="row q-col-gutter-md"
    >
      <div class="col-12 col-sm-6">
        <change-email-btn 
          v-model="email"
          :user="user"
          :group="member.group"
          class="full-width"
        />
      </div>
      <div class="col-12 col-sm-6">
        <change-password-btn 
          :user="user"
          :group="member.group"
          class="full-width"
        />
      </div>
    </div>
  </div>
  <div class="q-pt-lg">
    <div class="text-overline text-uppercase text-onsurface-m text-bold q-my-sm">
      {{ $t('location') }}
    </div>
    <location-picker 
      v-model="location"
      :default-location="member.group.attributes.location?.coordinates"
    />
    <q-input
      v-model="address"
      type="text"
      name="address"
      :label="$t('address')"
      outlined
      class="q-my-md"
    />
    <q-input
      v-model="postalCode"
      type="text"
      name="postalCode"
      :label="$t('postalCode')"
      outlined
      required
      :rules="[(v) => !!v || $t('fieldRequired')]"
    />
    <q-input
      v-model="city"
      type="text"
      name="city"
      :label="$t('city')"
      outlined
      required
      :rules="[(v) => !!v || $t('fieldRequired')]"
    />
    <q-input
      v-model="region"
      type="text"
      name="region"
      :label="$t('region')"
      outlined
      required
      :rules="[(v) => !!v || $t('fieldRequired')]"
    />
    <country-chooser
      v-model="country"
      :label="$t('country')"
      outlined
      required
    />
  </div>
  <div>
    <div class="text-overline text-uppercase text-onsurface-m text-bold q-mt-lg q-mb-sm">
      {{ $t('contact') }}
    </div>
    <member-contacts-field v-model="contacts" />
  </div>
</template>
<script setup lang="ts">
import AvatarField from "../../components/AvatarField.vue"
import LocationPicker from "../../components/LocationPicker.vue"
import CountryChooser from "../../components/CountryChooser.vue"
import MemberContactsField, {PartialContact} from "../../components/MemberContactsField.vue"
import ChangePasswordBtn from "./ChangePasswordBtn.vue"
import ChangeEmailBtn from "./ChangeEmailBtn.vue"

import { computed, ref, watch } from "vue";
import { watchDebounced } from "@vueuse/shared"

import { Member, User, Group } from '../../store/model';

const props = defineProps<{
  member: Member & {group: Group}
  contacts: PartialContact[]
  user: User
  changeCredentials: boolean
}>()

const emit = defineEmits<{
  (e: 'update:member', value: Member): void
  (e: 'update:contacts', value: PartialContact[]): void
  (e: 'update:user', value: User): void
}>()

// Member attributes.
const m = computed(() => props.member.attributes)
const image = ref(m.value.image ?? null)
const name = ref(m.value.name ?? "")
const description = ref(m.value.description ?? "")
const location = ref(m.value.location?.coordinates ?? null)
const address = ref(m.value.address?.streetAddress ?? "")
const postalCode = ref(m.value.address?.postalCode ?? "")
const city = ref(m.value.address?.addressLocality ?? "")
const region = ref(m.value.address?.addressRegion ?? "")
const country = ref(m.value.address?.addressCountry ?? "")

// Member contacts
const contacts = ref(props.contacts)

// User attributes.
const email = ref(props.user.attributes.email)

watchDebounced([image, name, description, location, address, postalCode, city, region, country], () => {
  emit('update:member', {
    ...props.member,
    attributes: {
      ...props.member.attributes,
      image: image.value,
      name: name.value,
      description: description.value,
      location: {
        name: city.value,
        type: "Point",
        coordinates: location.value
      },
      address: {
        streetAddress: address.value,
        postalCode: postalCode.value,
        addressLocality: city.value,
        addressRegion: region.value,
        addressCountry: country.value
      }
    }
  })
}, {debounce: 1000})

watch([contacts], () => {
  emit('update:contacts', contacts.value)
})

// One of the contacts is the user email, but it is not automatically updated in 
// the UI when we change the user email. We manually patch that here purely on the
// UI side.
watch(email, (email, oldEmail) => {
  if (email !== oldEmail) {
    contacts.value = contacts.value.map(c => {
      if (c.attributes.type === "email" && c.attributes.name === oldEmail) {
        return {...c, attributes: {...c.attributes, name: email}}
      }
      return c
    })
  }
})

</script>
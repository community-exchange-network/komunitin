<template>
  <div class="column q-gutter-y-md">
    <!-- Profile -->
    <div class="bg-surface rounded-borders shadow-2">
      <div class="q-pa-md">
        <div class="text-subtitle1 text-serif text-bold text-onsurface">
          {{ $t('enterProfileData') }}
        </div>
        <div class="text-body2 text-onsurface-m">
          {{ $t('editProfileHelpText') }}
        </div>
      </div>
      <q-separator />
      <div class="q-pa-md q-gutter-y-md column">
        <avatar-field
          v-model="image"
          :text="name"
          :code="member.group.attributes.code"
          resource-type="members"
        />
        <q-input
          v-model="name"
          type="text"
          name="name"
          :label="$t('name')"
          :hint="$t('nameHint')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          required
          :rules="[(v) => !!v || $t('nameRequired')]"
        >
          <template #append>
            <q-icon
              name="person"
              color="muted"
            />
          </template>
        </q-input>
        <q-input
          v-model="description"
          type="textarea"
          name="description"
          :label="$t('bio')"
          :hint="$t('bioHint')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          autogrow
          input-style="min-height: 100px;"
        >
          <template #append>
            <q-icon
              name="notes"
              color="muted"
            />
          </template>
        </q-input>
        <template v-if="email !== undefined">
          <q-input
            :model-value="email"
            type="text"
            name="email"
            :label="$t('email')"
            :hint="$t('emailHint')"
            outlined
            bg-color="surface-container-h"
            class="commons-input"
            required
            disable
          >
            <template #append>
              <q-icon
                name="email"
                color="muted"
              />
            </template>
          </q-input>
          <div
            v-if="changeCredentials"
            class="row q-col-gutter-md q-pt-md"
          >
            <div class="col-12 col-sm-grow">
              <change-email-btn
                :model-value="email"
                class="full-width"
              />
            </div>
            <div class="col-12 col-sm-grow">
              <change-password-btn class="full-width" />
            </div>
          </div>
        </template>
      </div>
    </div>
    <!-- Location -->
    <div class="bg-surface rounded-borders shadow-2">
      <div class="q-pa-md text-subtitle1 text-serif text-bold text-onsurface">
        {{ $t('location') }}
      </div>
      <q-separator />
      <div class="q-pa-md q-gutter-y-md column">
        <location-picker
          v-model="location"
          :default-location="member.group.attributes.location?.coordinates"
          bottom-slots
        />
        <q-input
          v-model="address"
          type="text"
          name="address"
          :label="$t('address')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          bottom-slots
        />
        <q-input
          v-model="postalCode"
          type="text"
          name="postalCode"
          :label="$t('postalCode')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          required
          :rules="[(v) => !!v || $t('fieldRequired')]"
        />
        <q-input
          v-model="city"
          type="text"
          name="city"
          :label="$t('city')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          required
          :rules="[(v) => !!v || $t('fieldRequired')]"
        />
        <q-input
          v-model="region"
          type="text"
          name="region"
          :label="$t('region')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          required
          :rules="[(v) => !!v || $t('fieldRequired')]"
        />
        <country-chooser
          v-model="country"
          :label="$t('country')"
          outlined
          bg-color="surface-container-h"
          class="commons-input"
          dropdown-icon="expand_more"
          required
        />
      </div>
    </div>
    <!-- Contact -->
    <div class="bg-surface rounded-borders shadow-2">
      <div class="q-pa-md text-subtitle1 text-serif text-bold text-onsurface">
        {{ $t('contact') }}
      </div>
      <q-separator />
      <div class="q-pa-md">
        <member-contacts-field v-model="contacts" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import AvatarField from "../../components/AvatarField.vue"
import LocationPicker from "../../components/LocationPicker.vue"
import CountryChooser from "../../components/CountryChooser.vue"
import MemberContactsField from "../../components/MemberContactsField.vue"
import ChangeEmailBtn from "./ChangeEmailBtn.vue"
import ChangePasswordBtn from "./ChangePasswordBtn.vue"

import { computed, ref, watch } from "vue";
import { watchDebounced } from "@vueuse/shared"
import type { DeepPartial } from 'quasar'

import type { Member, Group } from '../../store/model';

const props = defineProps<{
  member: Member & {group: Group}
  email?: string
  changeCredentials: boolean
  debounce: number
}>()

const emit = defineEmits<{
  (e: 'update:member', value: DeepPartial<Member>): void
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
const contacts = ref(m.value.contacts)

// Member attributes.
watchDebounced([image, name, description, location, address, postalCode, city, region, country], () => {
  emit('update:member', {
    attributes: {
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
}, { debounce: props.debounce })

watch([contacts], () => {
  emit('update:member', {
    attributes: {
      contacts: contacts.value
    }
  })
})

</script>

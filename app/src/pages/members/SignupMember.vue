<template>
  <page-header
    :title="$t('signup')"
  />
  <q-page-container class="row justify-center">
    <q-page 
      id="page-signup"
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <div v-if="page=='profile'">
        <q-form 
          v-if="myMember && myMember.contacts && myUser"
          @submit="saveMember"
        >
          <profile-form 
            :change-credentials="false"
            :member="myMember"
            :contacts="myMember.contacts"
            :user="myUser"
            @update:member="updateMember"
            @update:contacts="updateContacts"
          />
          <q-btn
            class="full-width q-my-lg"
            color="primary"
            type="submit"
            :label="t('saveProfile')"
            unelevated
            :loading="loadingSaveMember"   
          />
        </q-form>
      </div>
      <div v-else-if="page=='offer'">
        <offer-form 
          :code="code"
          :show-state="false"
          :model-value="currentOffer"
          :submit-label="t('submit')"
          :loading="loadingSaveOffer"
          :header="offerFormHeader"
          @submit="saveOffer"
        />
      </div>
      <div v-else-if="page=='complete'">
        <div class="text-h6">
          {{ t('signupComplete') }}
        </div>
        <div>
          <div class="float-left q-mr-md">
            <q-icon 
              name="verified_user" 
              size="100px" 
              color="icon-dark"
            />
          </div>
          <div class="text-body1 text-onsurface-m q-my-md">
            {{ t('signupCompleteText', {
              group: group.attributes.name
            }) }}
          </div>
          <div class="text-body1 text-onsurface-m q-my-md">
            {{ t('signupCompleteText2') }}
          </div>
          <div>
            <q-btn
              class="full-width q-my-lg"
              color="primary"
              :label="t('goToMyAccount')"
              flat
              to="/"
            />
          </div>
        </div>
      </div>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import ProfileForm from "./ProfileForm.vue"
import OfferForm from "../offers/OfferForm.vue"
import { computed, ref } from "vue"
import { useStore } from "vuex"
import type { Contact, Member, Offer } from "src/store/model"
import type { DeepPartial } from "quasar"
import { scroll } from "quasar";
import { useI18n } from "vue-i18n"
const { getScrollTarget } = scroll

const props = defineProps<{
  code: string
}>()

const store = useStore()
const { t } = useI18n()
// Loaded member & user objects
const myMember = computed(() => store.getters.myMember)
const myUser = computed(() => store.getters.myUser)

// Fetch group
store.dispatch("groups/load", {
  id: props.code,
  include: "settings"
})
// Load member
type ExtendedMember = Member & { contacts: DeepPartial<Contact>[] }

const member = ref<ExtendedMember>(myMember.value)

const currentOffer = ref()
const offers = ref<DeepPartial<Offer>[]>([])

const initializeMember = async () => {
  await store.dispatch("members/load", {
    id: myMember.value.id,
    group: props.code,
    include: "contacts"
  })
  // Using spread operator not to copy the proxy object
  // but their values.
  member.value = {
    ...myMember.value
  }
  // Initialize contacts (not copied by the spread operator)
  member.value.contacts = myMember.value.contacts || []
}
const initializeOffers = async () => {
  await store.dispatch("offers/loadList", {
    group: props.code,
    filter: {
      "member": myMember.value.id
    },
    include: "category"
  })
  offers.value = store.getters["offers/currentList"]
}

initializeMember()
initializeOffers()

const group = computed(() => store.getters["groups/current"])
const settings = computed(() => group.value?.settings?.attributes)

const loadingSaveMember = ref(false)

const updateMember = (resource: DeepPartial<Member>) => {
  member.value.attributes = resource.attributes as Member["attributes"]
}
const updateContacts = (contacts: DeepPartial<Contact>[]) => {
  member.value.contacts = contacts
  member.value.relationships.contacts = {
    data: contacts.map(c => ({ type: "contacts", id: c.id }))
  }
}
const saveMember = async () => {
  loadingSaveMember.value = true
  try {
    await store.dispatch("members/update", {
      id: member.value.id,
      group: props.code,
      resource: {
        id: member.value.id,
        type: "members",
        attributes: member.value.attributes,
        relationships: member.value.relationships
      },
      included: member.value.contacts
    })
    await nextPage()
  } finally {
    loadingSaveMember.value = false
  }
}

const offerFormHeader = computed(() => {
  const minOffers = settings.value?.minOffers ?? 0
  return minOffers > 1 ? 
    t("signupOffer", {
      index: currentOfferIndex.value + 1,
      total: minOffers
    }) : t("enterOfferData")

})
const loadingSaveOffer = ref(false)
const saveOffer = async (resource: DeepPartial<Offer>) => {
  loadingSaveOffer.value = true
  try {
    if (!resource.id) {
      await store.dispatch("offers/create", {
        group: props.code,
        resource
      })
      offers.value.push(store.getters["offers/current"])
    } else {
      await store.dispatch("offers/update", {
        id: resource.id,
        group: props.code,
        resource
      })
      const index = offers.value.findIndex(o => o.id === resource.id)
      offers.value[index] = store.getters["offers/current"]
    }

    await nextPage()
  } finally {
    loadingSaveOffer.value = false
  }
}

const apply = async () => {
  await store.dispatch("members/update", {
    id: myMember.value.id,
    group: props.code,
    resource: {
      id: myMember.value.id,
      type: "members",
      attributes: {
        state: "pending"
      }
    }
  })
}

const currentOfferIndex = ref(-1)

const nextPage = async () => {
  const minOffers = settings.value?.minOffers ?? 0
  currentOfferIndex.value += 1
  if (currentOfferIndex.value < minOffers) {
    currentOffer.value = offers.value[currentOfferIndex.value]
    page.value = "offer"
  } else {
    await apply()
    page.value = "complete"
  }
  
  // Scroll to top
  const el = document.getElementById("page-signup") as Element
  getScrollTarget(el).scrollTo(0, 0)
}

const page = ref("profile")
</script>
<template>
  <page-header
    :title="$t('signup')"
  />
  <q-page-container class="row justify-center">
    <q-page 
      id="page-signup"
      padding 
      class="relative-position q-py-lg q-px-md col-12 col-sm-8 col-md-6 q-mb-xl"
    >
      <div
        v-if="initializationFailed"
        class="column items-center q-gutter-md q-py-xl text-onsurface-m"
      >
        <q-icon
          name="error"
          size="48px"
        />
        <div>{{ t('signupInitializationError') }}</div>
        <q-btn
          :label="t('retryNow')"
          icon="refresh"
          color="primary"
          flat
          @click="initializeSignup"
        />
      </div>
      <template v-else-if="!initializing">
        <div v-if="page=='profile'">
          <q-form
            v-if="member && myUser"
            @submit="saveMember"
          >
            <profile-form
              :change-credentials="false"
              :member="member"
              :contacts="member.attributes.contacts"
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
      </template>
      <q-inner-loading
        :showing="initializing"
        color="icon-dark"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import PageHeader from "../../layouts/PageHeader.vue"
import ProfileForm from "./ProfileForm.vue"
import OfferForm from "../offers/OfferForm.vue"
import { computed, ref, shallowRef, watch } from "vue"
import { useRouter } from "vue-router"
import { useStore } from "vuex"
import type { Contact, Group, GroupSettings, Member, Offer, User } from "src/store/model"
import type { DeepPartial } from "quasar"
import { scroll } from "quasar"
import { useI18n } from "vue-i18n"
const { getScrollTarget } = scroll

const props = defineProps<{
  code: string
}>()

const store = useStore()
const router = useRouter()
const { t } = useI18n()

const myMember = computed<Member & { group: Group } | undefined>(() => store.getters.myMember)
const myUser = computed<User | undefined>(() => store.getters.myUser)
const group = computed<Group & {settings?: GroupSettings }>(() => store.getters["groups/current"])
const settings = computed(() => group.value?.settings?.attributes)

const member = ref<Member & { group: Group }>()
const currentOffer = ref()
const offers = ref<DeepPartial<Offer>[]>([])
const page = shallowRef<"profile" | "offer" | "complete">("profile")
const currentOfferIndex = shallowRef(-1)
const initializing = shallowRef(true)
const initializationFailed = shallowRef(false)
const loadingSaveMember = shallowRef(false)
const loadingSaveOffer = shallowRef(false)

const loadOffers = async (memberId: string) => {
  await store.dispatch("offers/loadList", {
    group: props.code,
    filter: {
      "member": memberId
    },
    include: "category"
  })
  offers.value = store.getters["offers/currentList"] ?? []
}

const initializeSignup = async () => {
  const retrying = initializationFailed.value
  initializing.value = true
  initializationFailed.value = false
  try {
    if (retrying) {
      await store.dispatch("reloadUser")
    }
    await store.dispatch("groups/load", {
      group: props.code,
      include: "settings"
    })

    if (!myMember.value) {
      await store.dispatch("members/create", {
        group: props.code,
        resource: {
          type: "members",
          attributes: { name: myUser.value?.attributes.name }
        }
      })
      await store.dispatch("reloadUser")
    }

    const signupMember = myMember.value as Member & { group: Group }
    if (signupMember.attributes.status === "draft"
      && signupMember.group.attributes.code !== props.code
    ) {
      await router.replace(`/groups/${signupMember.group.attributes.code}/signup-member`)
    } else if (signupMember.attributes.status !== "draft") {
      await router.replace(
        `/groups/${signupMember.group.attributes.code}/members/${signupMember.attributes.code}`
      )
    } else {
      member.value = signupMember
      await loadOffers(signupMember.id)
    }
  } catch {
    initializationFailed.value = true
  } finally {
    initializing.value = false
  }
}

const updateMember = (resource: DeepPartial<Member>) => {
  member.value.attributes = resource.attributes
}

const updateContacts = (contacts: DeepPartial<Contact>[]) => {
  member.value.attributes.contacts = contacts
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
        attributes: member.value.attributes
      }
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
    id: member.value.id,
    group: props.code,
    resource: {
      id: member.value.id,
      type: "members",
      attributes: {
        status: "pending"
      }
    }
  })
}

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

watch(
  () => props.code,
  () => initializeSignup(),
  { immediate: true }
)
</script>

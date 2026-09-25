<template>
  <q-layout
    view="hhh lpr fff"
    class="home column justify-start items-center"
    :style="layoutStyle"
  >
    <q-header class="bg-transparent">
      <q-toolbar>
        <q-btn
          v-show="showBackButton"
          id="back"
          flat
          dense
          round
          color="onoutside"
          icon="arrow_back"
          :aria-label="$t('back')"
          @click="goBack"
        />
      </q-toolbar>
    </q-header>
    <q-page-container class="narrow">
      <div
        id="title"
        class="text-onoutside q-mt-md q-mb-xl"
      >
        <div>
          <img
            class="logo"
            src="~@/assets/logo.svg"
            alt="Komunitin"
          >
        </div>
        <p
          id="slogan"
          class="text-subtitle1 text-onoutside-m q-pb-md"
        >
          <fit-text>{{ $t('openSystemForExchangeCommunities') }}</fit-text>
        </p>
      </div>
      <router-view />
    </q-page-container>

    <q-footer class="bg-transparent q-py-md text-center text-onoutside-m">
      <div class="q-gutter-md">
        <select-lang />
        <q-btn
          flat
          type="a"
          :href="docsUrl"
          target="__blank"
          :label="$t('documentation')"
        />
        <q-btn
          flat
          type="a"
          href="https://github.com/komunitin/komunitin"
          target="__blank"
          :label="$t('contribute')"
        />
        <q-btn
          flat
          to="/signup-group"
          :label="$t('newGroup')"
        />
      </div>
      <div v-if="privacyUrl || termsUrl || cookiesUrl" class="legal-links row justify-center q-mt-md">
        <q-btn v-if="privacyUrl" flat no-caps class="text-caption" padding="xs sm" :href="privacyUrl" :label="$t('privacyPolicy')" />
        <q-btn v-if="termsUrl" flat no-caps class="text-caption" padding="xs sm" :href="termsUrl" :label="$t('terms')" />
        <q-btn v-if="cookiesUrl" flat no-caps class="text-caption" padding="xs sm" :href="cookiesUrl" :label="$t('cookies')" />
      </div>
    </q-footer>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FitText from '../components/FitText.vue';
import selectLang from '../components/SelectLang.vue';
import bgImage from '@/assets/home_background-700.jpg';
import { useRoute, useRouter } from 'vue-router';
import { config } from '../utils/config';

const layoutStyle = {
  backgroundImage: `url(${bgImage})`,
  // QLayout cannot measure the viewport during static generation.
  ...(import.meta.env.QUASAR_SERVER ? { minHeight: '100vh' } : {})
}

const docsUrl = config.DOCS_URL
const privacyUrl = config.PRIVACY_URL
const termsUrl = config.TERMS_URL
const cookiesUrl = config.COOKIES_URL

const route = useRoute();
const router = useRouter();

const showBackButton = computed(() => route.path !== '/');
const goBack = () => { router.back(); };
    
</script>
<style lang="scss" scoped>
// Set the background image for home page
.home {
  background: $outside center
    no-repeat fixed;
  background-size: cover;
}

#title {
  .logo {
    // Center the logo and exactly fit to the central div.
    width: 352px;
    margin-left: -12px;
  }
}
.narrow {
  width: 328px;
}
</style>

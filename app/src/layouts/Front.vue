<template>
  <q-layout
    view="hhh lpr fff"
    class="home column justify-start items-center"
    :style="`background-image: url(${bgImage});`"
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
            src="~assets/logo.svg"
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

    <q-footer class="bg-transparent q-py-md text-center text-onoutside-m q-gutter-md">
      <select-lang />
      <q-btn
        flat
        type="a"
        href="https://docs.komunitin.org"
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
        type="a"
        href="https://docs.komunitin.org/project/new-community"
        target="__blank"
        :label="$t('newGroup')"
      />
    </q-footer>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FitText from '../components/FitText.vue';
import selectLang from '../components/SelectLang.vue';
import bgImage from 'assets/home_background-700.jpg';
import { useRoute, useRouter } from 'vue-router';

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

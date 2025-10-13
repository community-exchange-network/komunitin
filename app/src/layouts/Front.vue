<template>
  <q-layout
    view="hhh lpr fff"
    class="home column justify-start items-center"
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
        href="https://docs.komunitin.org/project/new-currency"
        target="__blank"
        :label="$t('newCurrency')"
      />
    </q-footer>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import FitText from '../components/FitText.vue';
import selectLang from '../components/SelectLang.vue';

/**
 * Layout base con menú lateral.
 */
export default defineComponent({
  name: 'Front',
  components: {
    selectLang,
    FitText
  },
  data() {
    return {
      tab: 'languages',
      // Current language.
      locale: this.$i18n.locale
    };
  },
  computed: {
    showBackButton(): boolean {
      return (this.$route.path !== "/");
    }
  },
  methods: {
    goBack() {
      this.$router.back();
    }
  }
});
</script>
<style lang="scss" scoped>
// Set the background image for home page
.home {
  background: $outside url('assets/home_background-700.jpg') center
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

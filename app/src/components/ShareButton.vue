<template>
  <q-btn
    v-bind="$attrs"
    @click="share"
  >
    <slot />
    <q-dialog
      v-if="!navigatorShare"
      v-model="dialog"
    >
      <q-card>
        <q-card-section>
          <div class="text-h6">
            {{ t('share') }}
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <social-network-list
            type="share"
            :url="pageurl"
            :title="title"
            :text="text"
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-btn>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import SocialNetworkList from './SocialNetworkList.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  url?: string,
  title: string,
  text: string
}>()

const dialog = ref(false);
// Is this browser compatible with share API?
// Experimental API `share` is not (yet) included in Navigator interface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const navigatorShare = (typeof ((navigator as any)?.share) !== 'undefined');
const pageurl = computed(() => {
  return props.url || window.location.href;
});

const shorten = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

const share = () => {
  if (navigatorShare) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).share({
      title: props.title,
      text: shorten(props.text, 200),
      url: pageurl.value
    });
  }
  else {
    // display fallback dialog.
    dialog.value = true;
  }
}
</script>

<template>
  <div>
    <q-btn
      id="explore"
      unelevated
      color="primary"
      text-color="onprimary"
      :label="$t('findYourLocalGroup')"
      icon="sym_r_explore"
      :to="{ name: 'GroupList' }"
      class="full-width"
    />
    <p class="text-onoutside-m q-mt-md q-mb-xs">
      {{ $t('alreadyRegisteredToALocalGroup') }}
    </p>
    <q-btn
      id="login"
      outline
      color="transparent"
      text-color="onoutside"
      :label="$t('logIn')"
      :to="{ name: 'LoginMail' }"
      icon="sym_r_account_circle"
      class="full-width"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/**
 * Login select.
 *
 * @todo Login con google o facebook.
 */
export default defineComponent({
  name: 'Login'
});
</script>
<style lang="scss" scoped>
// Wider non-standard button.
#explore {
  height: 48px;
}

</style>

<script setup>
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useFormStore } from '~/store/form';

/* c8 ignore start */
const nameRules = ref([
  (v) =>
    (v && v.length <= 255) || this.$t('trans.formSettings.formTitlemaxChars'),
]);

/* c8 ignore stop */

const { form, lang } = storeToRefs(useFormStore());
</script>

<template>
  <BasePanel class="fill-height">
    <template #title
      ><span :lang="lang">Custom PostgreSQL View Name </span></template
    >
    <v-text-field
      v-model="form.custom_view_name"
      density="compact"
      solid
      variant="outlined"
      label="View name"
      data-test="text-name"
      :rules="nameRules"
      :lang="lang"
    />
  </BasePanel>
</template>

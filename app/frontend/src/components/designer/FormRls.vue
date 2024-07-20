<script>
import { mapState, mapWritableState } from 'pinia';
import FormRlsSettings from '~/components/designer/settings/FormRlsSettings.vue';
import { useFormStore } from '~/store/form';

export default {
  components: {
    FormRlsSettings,
  },
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    ...mapWritableState(useFormStore, ['form']),
    ...mapState(useFormStore, ['isFormPublished', 'isRTL']),
  },
};
</script>

<template>
  <v-container class="px-0" :class="{ 'dir-rtl': isRTL }">
    <v-row>
      <v-col cols="12" md="12">
        <FormRlsSettings />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { NotificationTypes } from '~/utils/constants';
import { useFormStore } from '~/store/form';
import { useNotificationStore } from '~/store/notification';

const notificationStore = useNotificationStore();

const selectedFields = ref([]);
const editable = ref(false);

const props = defineProps({
  formId: {
    type: String,
    required: true,
  },
  currentFormFields: {
    default: () => {},
    type: Object,
  },
  currentWhitelist: {
    default: () => {},
    type: Object,
  },
  customViewName: {
    default: '',
    type: String,
  },
});

function HaCustomLabels() {
  return {
    healthAuthority: 'Health Authority',
    communityName: 'PCN Community',
    pcnName: 'PCN Name',
    pcnClinicName: 'PCN Clinic Name',
    chcName: 'CHC Name',
    upccName: 'UPCC Name',
    fnpccName: 'FNPCC Name',
    nppccName: 'NPPCC Name',
  };
}

const isCustomViewData = computed(
  () =>
    props.currentFormFields &&
    props.currentFormFields.length === 0 &&
    props.customViewData &&
    props.customViewData.fields &&
    props.customViewData.fields.length > 0
);

const initRlsFields = computed(() => {
  let humanWords = [];
  if (isCustomViewData.value) {
    if (props.customViewName === 'ha_hierarchy') {
      humanWords = HaCustomLabels();
      return Object.keys(humanWords).map((key) => {
        return { title: humanWords[key], value: key };
      });
    } else {
      humanWords = transformStrings(props.customViewData?.fields);
      return props.customViewData?.fields?.map((f, i) => {
        return { title: humanWords[i], value: f };
      });
    }
  } else {
    humanWords = transformStrings(props.currentFormFields);
    return props.currentFormFields.map((f, i) => {
      return { title: humanWords[i], value: f };
    });
  }
});

function transformStrings(array) {
  return array.map((str) => {
    return transformString(str);
  });
}

function transformString(string) {
  let spaced = string.replace(/([a-z])([A-Z])/g, '$1 $2');
  spaced = spaced.replace(/_/g, ' ');
  spaced = spaced.replace(/\b\w/g, (char) => char.toUpperCase());
  return spaced;
}

async function updateWhitelist() {
  try {
    if (selectedFields.value.length === 0) {
      throw new Error('Whitelist cannot be empty');
    }
    await formStore.updateWhitelist(selectedFields.value);
    notificationStore.addNotification({
      type: NotificationTypes.SUCCESS,
      message: 'Whitelist updated successfully',
    });
  } catch (error) {
    notificationStore.addNotification({
      type: NotificationTypes.ERROR,
      message: 'Failed to update whitelist' + error,
    });
  }
}

const formStore = useFormStore();
const isRTL = computed(() => formStore.isRTL);
const lang = computed(() => formStore.lang);

onMounted(() => {
  selectedFields.value = props.currentWhitelist.map((item) => {
    return {
      title: transformString(item),
      value: item,
    };
  });
});
</script>

<template>
  <span :class="{ 'dir-rtl': isRTL }" :lang="lang">
    <v-select
      v-model="selectedFields"
      :disabled="!editable"
      chips
      label="Select"
      :items="initRlsFields"
      multiple
      variant="outlined"
    ></v-select>
    <v-btn v-if="!editable" icon="$pencil" @click="editable = true">
      Edit
    </v-btn>
    <v-btn v-if="editable" color="primary" @click="updateWhitelist()">
      Save
    </v-btn>
    <v-btn v-if="editable" color="error" @click="editable = false">
      Cancel
    </v-btn>
  </span>
</template>

<style scoped lang="scss">
@import '~vuetify/lib/styles/settings/_variables.scss';
</style>

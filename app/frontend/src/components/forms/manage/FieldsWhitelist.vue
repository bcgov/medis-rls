<script setup>
import { computed, onMounted, ref } from 'vue';
import { NotificationTypes } from '~/utils/constants';
import { useFormStore } from '~/store/form';
import { useNotificationStore } from '~/store/notification';

const notificationStore = useNotificationStore();

const selectedFields = ref([]);
const editable = ref(false);
const loading = ref(false);
const formStore = useFormStore();
const rlsPanel = ref(1);

const isRTL = computed(() => formStore.isRTL);
const lang = computed(() => formStore.lang);

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
        return { title: humanWords[key] + '(' + key + ')', value: key };
      });
    } else {
      humanWords = transformStrings(props.customViewData?.fields);
      return props.customViewData?.fields?.map((f, i) => {
        return { title: humanWords[i] + '(' + f + ')', value: f };
      });
    }
  } else {
    humanWords = transformStrings(props.currentFormFields);
    return props.currentFormFields.map((f, i) => {
      return { title: humanWords[i] + '(' + f + ')', value: f };
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
      throw new Error('Fields list cannot be empty');
    }
    formStore.setFieldsWhitelist(selectedFields.value);
    loading.value = true;
    const result = await formStore.updateForm();
    if (result) {
      notificationStore.addNotification({
        text: 'Fields list updated successfully',
        ...NotificationTypes.SUCCESS,
      });
    } else {
      throw new Error();
    }
    editable.value = false;
  } catch (error) {
    notificationStore.addNotification({
      text: 'Failed to update fields list' + error,
      ...NotificationTypes.ERROR,
    });
  }
  loading.value = false;
}

onMounted(() => {
  selectedFields.value = props.currentWhitelist.map((item) => {
    return {
      title: transformString(item) + '(' + item + ')',
      value: item,
    };
  });
});
</script>

<template>
  <span :class="{ 'dir-rtl': isRTL }" :lang="lang">
    <v-expansion-panels v-model="rlsPanel" class="nrmc-expand-collapse">
      <v-expansion-panel flat>
        <v-expansion-panel-title>
          <div class="header" :lang="lang">
            <strong>RLS fields selection</strong>
            <span :lang="lang">
              <v-btn
                v-if="!editable"
                size="x-small"
                variant="text"
                icon
                color="primary"
                style="font-size: 14px"
                @click.stop="
                  editable = true;
                  rlsPanel = 0;
                "
              >
                <v-icon icon="mdi:mdi-pencil"></v-icon>
              </v-btn>
            </span>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <v-col>
            <h4>
              Select fields to be available within RLS assignment dropdowns.
              This is only available for forms without Custom PostgreSQL View.
            </h4>
            <p>Default option enables all fields for RLS assignment.</p>
          </v-col>
          <v-row class="mt-4">
            <v-select
              v-model="selectedFields"
              :disabled="!editable || loading"
              chips
              label="Fields"
              :items="initRlsFields"
              multiple
              variant="outlined"
              auto
            ></v-select>
          </v-row>

          <v-btn
            v-if="editable"
            class="mr-2"
            color="primary"
            @click="updateWhitelist()"
          >
            Save
          </v-btn>
          <v-btn
            v-if="editable"
            color="error"
            @click="
              editable = false;
              selectedFields = props.currentWhitelist;
              rlsPanel = 1;
            "
          >
            Cancel
          </v-btn>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </span>
</template>

<style scoped lang="scss">
@import '~vuetify/lib/styles/settings/_variables.scss';
</style>

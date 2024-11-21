<script setup>
import { storeToRefs } from 'pinia';
import { ref, computed, onMounted, watch } from 'vue';
import BaseDialog from '~/components/base/BaseDialog.vue';
import { useFormStore } from '~/store/form';
import { NotificationTypes } from '~/utils/constants';
import { useNotificationStore } from '~/store/notification';
import { rlsService } from '~/services';

const props = defineProps({
  modelValue: {
    default: false,
    type: Boolean,
  },
  showCloseButton: {
    default: false,
    type: Boolean,
  },
  savingRls: {
    default: false,
    type: Boolean,
  },
  savingFormIds: {
    default: () => [],
    type: Array,
  },
  deletingRls: {
    default: false,
    type: Boolean,
  },
  width: {
    default: '800',
    type: String,
  },
  enableCustomButton: {
    default: false,
    type: Boolean,
  },
  currentFormFields: {
    default: () => {},
    type: Object,
  },
  currentFormId: {
    default: '',
    type: String,
  },
  rlsExist: {
    default: false,
    type: Boolean,
  },
  customViewName: {
    default: null,
    type: String,
  },
  forms: {
    default: () => [],
    type: Array,
  },
  itemsToRls: {
    default: () => [],
    type: Array,
  },
  customViewData: {
    default: () => ({}),
    type: Object,
  },
});

const emit = defineEmits([
  'update:modelValue',
  'close-dialog',
  'continue-dialog',
  'delete-dialog',
  'custom-dialog',
  'delete-rls',
  'save-form-id',
]);

const localValues = ref([]);
const localItemsToRls = ref([]);
const initItemsToRls = ref([]);
const showDeleteDialog = ref(false);
const savingFormId = ref([false]);
const showSetFormIdDialog = ref([false]);
const currentIndex = ref(0);
const nonCustomViewInitLoad = ref(false);

const currentFieldRules = ref([
  (v) => {
    return !!v || 'Please, select the current form field name';
  },
]);

const valueRules = ref([
  (v) => {
    return !!v || 'Please, select the value';
  },
]);

// const requiredRules = ref([
//   (v) => {
//     if (!v) {
//       actionButtonDisabled.value = true;
//       return 'This field is required';
//     }
//     actionButtonDisabled.value = false;
//     return true;
//   },
// ]);

onMounted(() => {
  initializeLocalItemsToRls();
});

const formStore = useFormStore();
const notificationStore = useNotificationStore();
const { isRTL, lang, submissionList } = storeToRefs(useFormStore());

const RTL = computed(() => (isRTL.value ? 'ml-5' : 'mr-5'));

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

const initializeLocalItemsToRls = async () => {
  if (
    Array.isArray(props.itemsToRls[0]?.rls) &&
    props.itemsToRls[0]?.rls.length > 0
  ) {
    if (isCustomViewData.value) {
      localItemsToRls.value = props.itemsToRls[0].rls.map((rls, index) => {
        const tempValues = props.customViewData?.data.map((v) => v[rls.field]);
        const uniqueValues = [...new Set(tempValues)].sort();
        localValues.value[index] = uniqueValues
          .filter(
            (lv) =>
              lv !== '' &&
              lv !== null &&
              (typeof lv === 'string' || lv instanceof String)
          )
          .map((lv) => ({ title: lv, value: lv }));
        return { ...rls }; // Ensure a new object is returned to avoid reference issues
      });
    } else {
      nonCustomViewInitLoad.value = true;
      const criteria = {
        formId: props.currentFormId,
        formFields: props.currentFormFields,
        noRls: true,
      };
      await formStore.fetchSubmissions(criteria);
    }
  } else {
    localItemsToRls.value = [
      {
        id: null,
        formId: props.currentFormId,
        remoteFormId: null,
        remoteFormName: null,
        field: null,
        value: null,
      },
    ];
  }
  initItemsToRls.value = JSON.parse(JSON.stringify(localItemsToRls.value));
};

const onFieldUpdate = async (index) => {
  const selectedField = localItemsToRls.value[index].field;
  currentIndex.value = index;
  if (selectedField) {
    localItemsToRls.value[index].value = null;
    localValues.value[index] = [];
    if (isCustomViewData.value) {
      const tempValues = props.customViewData?.data.map(
        (v) => v[selectedField]
      );
      const uniqueValues = [...new Set(tempValues)].sort();
      localValues.value[index] = uniqueValues
        .filter(
          (lv) =>
            lv !== '' &&
            lv !== null &&
            (typeof lv === 'string' || lv instanceof String)
        )
        .map((lv) => ({ title: lv, value: lv }));
    } else {
      const criteria = {
        formId: props.currentFormId,
        formFields: selectedField,
        noRls: true,
      };
      await formStore.fetchSubmissions(criteria);
      // Assuming fetchSubmissions updates localValues
    }
  }
};

watch(submissionList, async (newSubmissionList) => {
  if (newSubmissionList && newSubmissionList.length > 0) {
    if (nonCustomViewInitLoad.value) {
      localItemsToRls.value = props.itemsToRls[0].rls.map((rls, index) => {
        const tempValues = newSubmissionList.map((v) => v[rls.field]);
        const uniqueValues = [...new Set(tempValues)].sort();
        localValues.value[index] = uniqueValues
          .filter(
            (lv) =>
              lv !== '' &&
              lv !== null &&
              (typeof lv === 'string' || lv instanceof String)
          )
          .map((lv) => ({ title: lv, value: lv }));
        return { ...rls }; // Ensure a new object is returned to avoid reference issues
      });
      nonCustomViewInitLoad.value = false;
    } else {
      const selectedField = localItemsToRls.value[currentIndex.value].field;
      if (selectedField) {
        localItemsToRls.value[currentIndex.value].value = null;
        localValues.value[currentIndex.value] = [];
        const tempValues = newSubmissionList.map((v) => v[selectedField]);
        const uniqueValues = [...new Set(tempValues)].sort();
        localValues.value[currentIndex.value] = uniqueValues
          .filter(
            (lv) =>
              lv !== '' &&
              lv !== null &&
              (typeof lv === 'string' || lv instanceof String)
          )
          .map((lv) => ({ title: lv, value: lv }));
      }
    }
  }
});

function transformStrings(array) {
  return array.map((str) => {
    let spaced = str.replace(/([a-z])([A-Z])/g, '$1 $2');
    spaced = spaced.replace(/_/g, ' ');
    spaced = spaced.replace(/\b\w/g, (char) => char.toUpperCase());
    return spaced;
  });
}

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

function addNewItem() {
  localItemsToRls.value.push({
    id: null,
    formId: props.currentFormId,
    remoteFormId: null,
    remoteFormName: null,
    field: null,
    value: null,
  });
}

function closeDialog() {
  initItemsToRls.value.map((rls, index) => {
    localItemsToRls.value[index].field = rls.field;
    localItemsToRls.value[index].value = rls.value;
    return true;
  });
  emit('close-dialog');
}

function continueDialog() {
  emit('continue-dialog', {
    rlsItems: localItemsToRls.value,
    customViewName: props.customViewName,
    updating: props.rlsExist,
  });
}

function deleteRls(index) {
  localItemsToRls.value.splice(index, 1);
}

function deleteAllRls() {
  showDeleteDialog.value = true;
}

function confirmedDeleteRls() {
  emit('delete-rls');
  showDeleteDialog.value = false;
}

function setFormId(index) {
  showSetFormIdDialog.value[index] = true;
}

function cancelFormId(index) {
  localItemsToRls.value[index].remoteFormId =
    initItemsToRls.value[index]?.remoteFormId;
  localItemsToRls.value[index].remoteFormName =
    initItemsToRls.value[index]?.remoteFormName;
  showSetFormIdDialog.value[index] = false;
}

async function saveFormId(index, deleting = false) {
  savingFormId.value[index] = true;
  try {
    if (deleting) {
      localItemsToRls.value[index].remoteFormId = null;
      localItemsToRls.value[index].remoteFormName = null;
    }
    const payload = {
      rlsItems: localItemsToRls.value,
      customViewName: props.customViewName,
      updating: true,
    };
    const rlsUsers = props.itemsToRls.map((u) => {
      return { id: u.id };
    });
    const rlsPayload = Object.assign({ users: rlsUsers }, payload);
    await rlsService.setRlsForms(rlsPayload, { formId: props.currentFormId });
    notificationStore.addNotification({
      text: 'Form ID/Name has been successfully assigned',
      ...NotificationTypes.SUCCESS,
    });
  } catch (error) {
    notificationStore.addNotification({
      text: 'Something went wrong while saving Form ID/Name',
      ...NotificationTypes.ERROR,
    });
    localItemsToRls.value[index].remoteFormId =
      initItemsToRls.value[index]?.remoteFormId;
    localItemsToRls.value[index].remoteFormName =
      initItemsToRls.value[index]?.remoteFormName;
  }
  savingFormId.value[index] = false;
  showSetFormIdDialog.value[index] = false;
  initItemsToRls.value = JSON.parse(JSON.stringify(localItemsToRls.value));
}

watch(() => props.itemsToRls, initializeLocalItemsToRls, { deep: true });

defineExpose({ RTL });
</script>

<template>
  <v-dialog
    :max-width="width"
    persistent
    :model-value="modelValue"
    @click:outside="closeDialog"
    @keydown.esc="closeDialog"
  >
    <v-card>
      <div class="dialog-body" :class="{ 'dir-rtl': isRTL }">
        <div v-if="showCloseButton">
          <v-spacer />
          <v-icon
            color="primary"
            class="float-right m-3"
            icon="mdi-close"
            @click="closeDialog"
          ></v-icon>
        </div>
        <div>
          <v-card-title class primary-title>
            RLS for user {{ itemsToRls[0].fullName }}
          </v-card-title>
          <div v-for="(rls, index) in localItemsToRls" :key="index">
            <v-row v-if="rls.remoteFormId && rls.remoteFormName">
              <v-col cols="12" :style="{ padding: '10px 10px 0' }">
                <v-chip>{{ rls.remoteFormName }}</v-chip>
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="5">
                <v-card-subtitle>Select field name</v-card-subtitle>
                <v-select
                  v-model="rls.field"
                  :rules="currentFieldRules"
                  label="RLS Field Name"
                  :items="initRlsFields"
                  @update:modelValue="onFieldUpdate(index)"
                ></v-select>
              </v-col>
              <v-col cols="5">
                <v-card-subtitle>Select the value</v-card-subtitle>
                <v-select
                  v-model="rls.value"
                  :rules="valueRules"
                  label="Value"
                  :items="localValues[index]"
                ></v-select>
              </v-col>
              <v-col cols="2" class="v-card-actions justify-center">
                <v-tooltip location="bottom">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="24"
                      :disabled="(!rls.field && !rls.value) || !rls.id"
                      :loading="deletingRls"
                      color="primary"
                      @click="setFormId(index)"
                    >
                      <v-icon
                        size="16"
                        color="white"
                        icon="mdi:mdi-form-textbox"
                      ></v-icon>
                    </v-btn>
                  </template>
                  <span>Add Form ID and Name</span>
                </v-tooltip>
                <v-btn
                  v-if="rlsExist || (!rlsExist && index !== 0)"
                  icon
                  size="24"
                  :disabled="
                    deletingRls ||
                    (localItemsToRls && localItemsToRls.length === 1)
                  "
                  :loading="deletingRls"
                  color="red"
                  @click="deleteRls(index)"
                >
                  <v-icon
                    size="16"
                    color="white"
                    icon="mdi:mdi-trash-can"
                  ></v-icon>
                </v-btn>
              </v-col>
            </v-row>
            <v-dialog
              :max-width="600"
              persistent
              :model-value="showSetFormIdDialog[index]"
              :style="{ zIndex: 99999 }"
              @click:outside="false"
              @keydown.esc="false"
            >
              <v-card>
                <div class="dialog-body" :class="{ 'dir-rtl': isRTL }">
                  <div>
                    <v-card-title class primary-title>
                      Set CHEFS Form ID and Name pair for<br />{{ rls.field }} -
                      {{ rls.value }}
                    </v-card-title>
                    <v-row>
                      <v-col cols="6">
                        <v-text-field
                          v-model="rls.remoteFormId"
                          hint="For exp: 07f9be84-7c28-4ae5-a01a-0ef84b12fb7b"
                          persistent-hint
                          label="Form ID"
                        ></v-text-field>
                      </v-col>
                      <v-col cols="6">
                        <v-text-field
                          v-model="rls.remoteFormName"
                          label="Form Name"
                        ></v-text-field>
                      </v-col>
                    </v-row>
                  </div>
                </div>
                <v-card-actions class="justify-center">
                  <v-btn
                    class="mb-5 mr-5"
                    :class="RTL"
                    color="primary"
                    :loading="savingFormId[index]"
                    variant="flat"
                    @click="saveFormId(index)"
                  >
                    <slot name="button-text-continue">
                      <span :lang="lang">Save</span>
                    </slot>
                  </v-btn>
                  <v-btn
                    class="mb-5"
                    color="red"
                    :loading="savingFormId[index]"
                    variant="flat"
                    @click="saveFormId(index, true)"
                  >
                    Delete
                  </v-btn>
                  <v-btn
                    data-test="saveddelete-btn-cancel"
                    class="mb-5"
                    variant="outlined"
                    @click="cancelFormId(index)"
                  >
                    <slot name="button-text-delete">
                      <span :lang="lang">Cancel</span>
                    </slot>
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>
          </div>
        </div>
        <v-card-actions class="justify-left">
          <v-btn
            class="mb-5 mr-5"
            color="primary"
            variant="flat"
            @click="addNewItem"
          >
            <span>Add New Item</span>
          </v-btn>
        </v-card-actions>
      </div>
      <v-card-actions class="justify-center">
        <v-btn
          class="mb-5 mr-5"
          :class="RTL"
          :disabled="savingRls"
          :loading="savingRls"
          color="primary"
          variant="flat"
          @click="continueDialog"
        >
          <slot name="button-text-continue">
            <span :lang="lang">{{ $t('trans.baseDialog.continue') }}</span>
          </slot>
        </v-btn>
        <v-btn
          v-if="rlsExist"
          class="mb-5"
          :disabled="deletingRls"
          :loading="deletingRls"
          color="red"
          variant="flat"
          @click="deleteAllRls"
        >
          Delete All
        </v-btn>
        <v-btn
          data-test="saveddelete-btn-cancel"
          class="mb-5"
          variant="outlined"
          @click="closeDialog"
        >
          <slot name="button-text-delete">
            <span :lang="lang">{{ $t('trans.baseDialog.cancel') }}</span>
          </slot>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <BaseDialog
    v-model="showDeleteDialog"
    type="CONTINUE"
    @close-dialog="showDeleteDialog = false"
    @continue-dialog="confirmedDeleteRls"
  >
    <template #title><span :lang="lang">Confirm Deletion </span></template>
    <template #text
      ><span :lang="lang"
        >Are you sure you wish to delete all RLS for
        {{ itemsToRls[0].fullName }}</span
      ></template
    >
    <template #button-text-continue>
      <span :lang="lang">Delete</span>
    </template>
  </BaseDialog>
</template>

<style scoped>
.v-card-text {
  display: flex !important;
  padding: 1.5rem;
}
.dialog-icon {
  margin-right: 1rem;
  object-fit: contain;
  align-self: flex-start;
}
.dialog-text {
  flex: 1 1 auto;
  width: 90%;
}
.dialog-body {
  padding: 20px;
}
.justify-right {
  justify-content: right !important;
}
</style>

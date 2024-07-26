<script setup>
import { storeToRefs } from 'pinia';
import { ref, computed, onMounted } from 'vue';
import { useFormStore } from '~/store/form';

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
]);

const localValues = ref([]);

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

onMounted(() => {
  submissionList.value = [];
});

const formStore = useFormStore();
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
    humanWords = transformStrings(props.customViewData?.fields);
    return props.customViewData?.fields?.map((f, i) => {
      return { title: humanWords[i], value: f };
    });
  } else {
    humanWords = transformStrings(props.currentFormFields);
    return props.currentFormFields.map((f, i) => {
      return { title: humanWords[i], value: f };
    });
  }
});

const localItemsToRls = computed(() => {
  if (
    Array.isArray(props.itemsToRls[0]?.rls) &&
    props.itemsToRls[0]?.rls.length > 0
  ) {
    props.itemsToRls[0]?.rls.map((rls, index) => {
      if (isCustomViewData.value) {
        const tempValues = props.customViewData?.data.map((v) => v[rls.field]);
        const uniqueValues = [...new Set(tempValues)];
        uniqueValues.sort();
        if (!localValues.value[index]) {
          localValues.value[index] = [];
        }
        uniqueValues.map((lv) => {
          if (
            lv !== '' &&
            lv !== null &&
            (typeof lv === 'string' || lv instanceof String)
          ) {
            localValues.value[index].push({ title: lv, value: lv });
          }
        });
      }
      // else {
      //   const criteria = {
      //     formId: props.currentFormId,
      //     formFields: rls.field,
      //     noRls: true,
      //   };
      //   await formStore.fetchSubmissions(criteria);
      // }
    });
  }
  return props.itemsToRls[0]?.rls;
});

const onFieldUpdate = async (index) => {
  if (localItemsToRls.value[index].field) {
    localItemsToRls.value[index].value = null;
    localValues.value[index] = [];
    if (isCustomViewData.value) {
      const tempValues = props.customViewData?.data.map(
        (v) => v[localItemsToRls.value[index].field]
      );
      const uniqueValues = [...new Set(tempValues)];
      uniqueValues.sort();
      uniqueValues.map((lv) => {
        if (typeof lv === 'string' || lv instanceof String) {
          localValues.value[index].push({ title: lv, value: lv });
        }
      });
    } else {
      const criteria = {
        formId: props.currentFormId,
        formFields: localItemsToRls.value[index].field,
        noRls: true,
      };
      await formStore.fetchSubmissions(criteria);
    }
  }
};

function transformStrings(array) {
  return array.map((str) => {
    let spaced = str.replace(/([a-z])([A-Z])/g, '$1 $2');
    spaced = spaced.replace(/_/g, ' ');
    spaced = spaced.replace(/\b\w/g, (char) => char.toUpperCase());
    return spaced;
  });
}

function addNewItem() {
  localItemsToRls.value.push({
    id: null,
    formId: localItemsToRls.value[0]?.formId,
    remoteFormId: null,
    field: null,
    value: null,
  });
}

function closeDialog() {
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
  //emit('delete-rls', index);
  localItemsToRls.value.splice(index, 1);
}

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
          <v-row v-for="(rls, index) in localItemsToRls" :key="index">
            <v-col cols="5">
              <v-card-subtitle
                >Select current form field name for filtering</v-card-subtitle
              >
              <v-select
                v-model="rls.field"
                :rules="currentFieldRules"
                label="RLS Field Name"
                :items="initRlsFields"
                @update:modelValue="onFieldUpdate(index)"
              ></v-select>
            </v-col>
            <v-col cols="5">
              <v-card-subtitle>Select the value for mapping</v-card-subtitle>
              <v-select
                v-model="rls.value"
                :rules="valueRules"
                label="Value"
                :items="localValues[index]"
              ></v-select>
            </v-col>
            <v-col cols="2" class="v-card-actions justify-center">
              <v-btn
                v-if="rlsExist"
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

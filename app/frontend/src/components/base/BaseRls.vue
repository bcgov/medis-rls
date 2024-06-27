<script setup>
import { storeToRefs } from 'pinia';
import { ref, watch, computed, onMounted } from 'vue';
import { useFormStore } from '~/store/form';
import { flatten } from 'flat';

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
    default: '500',
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
  forms: {
    default: () => [],
    type: Array,
  },
  itemsToRls: {
    default: () => [],
    type: Array,
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

const currentField = ref(null);
const currentNestedField = ref(null);
const localNestedFields = ref([]);
const localNestedFlattenedObj = ref({});
const rlsValue = ref(null);
const editing = ref(false);
const isNestedObject = ref(false);
const nestedPath = ref(null);
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
  formFields.value = [];
  submissionList.value = [];
  resetValues();
});

const formStore = useFormStore();

const { isRTL, lang, formFields, submissionList } = storeToRefs(useFormStore());

const RTL = computed(() => (isRTL.value ? 'ml-5' : 'mr-5'));

watch(submissionList, async (newSubmissionList) => {
  if (newSubmissionList && newSubmissionList.length > 0) {
    localValues.value = [];
    localNestedFields.value = [];
    const values = newSubmissionList.map((s) => {
      return s[currentField.value];
    });
    // check if chosen field value is nested object or not
    if (
      values &&
      values.length > 0 &&
      (Array.isArray(values[0]) || typeof values[0] === 'object')
    ) {
      isNestedObject.value = true;
      const parsedValues = parseNested(values);
      // remove duplicated values
      const uniqueValues = [...new Set(parsedValues)];
      uniqueValues.sort();
      localNestedFields.value = uniqueValues.map((v) => {
        return { text: v, id: v };
      });
    } else {
      // get here if field value is String type
      isNestedObject.value = false;
      // remove duplicated values
      const uniqueValues = [...new Set(values)];
      uniqueValues.sort();
      uniqueValues.map((lv) => {
        if (typeof lv === 'string' || lv instanceof String) {
          localValues.value.push({ text: lv, id: lv });
        }
      });
    }
  }
});

watch(currentField, async (newValue) => {
  if (newValue) {
    currentNestedField.value = null;
    nestedPath.value = null;
    let criteria = {
      formId: props.currentFormId,
      formFields: currentField.value,
      noRls: true,
    };
    await formStore.fetchSubmissions(criteria);
  }
});

watch(currentNestedField, async (newNestedField) => {
  if (newNestedField) {
    rlsValue.value = null;
    localValues.value = [];
    const tempLocalValues = [];
    Object.keys(localNestedFlattenedObj.value).map((f) => {
      if (f.includes(currentNestedField.value)) {
        tempLocalValues.push(localNestedFlattenedObj.value[f]);
      }
    });
    const uniqueValues = [...new Set(tempLocalValues)];
    uniqueValues.sort();
    uniqueValues.map((lv) => {
      if (typeof lv === 'string' || lv instanceof String) {
        localValues.value.push({
          text: lv,
          id: lv,
        });
      }
    });
  }
});

watch(rlsValue, async (newValue) => {
  if (newValue && isNestedObject.value) {
    Object.keys(localNestedFlattenedObj.value).map((path) => {
      if (
        localNestedFlattenedObj.value[path] === newValue &&
        path.split(/\.\d*\./).pop() === currentNestedField.value
      ) {
        nestedPath.value = path
          .replace(/^\d*\./, `${currentField.value},`)
          .replaceAll('.', ',');
      }
    });
  }
});

function parseNested(obj) {
  const flattenedObj = flatten(obj);
  localNestedFlattenedObj.value = flattenedObj;
  const splitted = Object.keys(flattenedObj).map((f) =>
    f.split(/\.\d*\./).pop()
  );
  return splitted;
}

function closeDialog() {
  emit('close-dialog');
  resetValues();
}

function continueDialog() {
  emit('continue-dialog', {
    id: props.itemsToRls[0]?.rls?.id,
    field: isNestedObject.value ? currentNestedField.value : currentField.value,
    value: rlsValue.value,
    nestedPath: nestedPath.value,
    editing: editing.value,
  });
  resetValues();
}

function updateRls() {
  editing.value = true;
}

function deleteRls() {
  emit('delete-rls');
  resetValues();
}

function resetValues() {
  currentField.value = null;
  currentNestedField.value = null;
  rlsValue.value = null;
  editing.value = false;
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
        <div v-if="!rlsExist || editing">
          <v-card-title class primary-title>
            <slot name="title"></slot>
          </v-card-title>

          <v-card-subtitle
            >Select current form field name for filtering</v-card-subtitle
          >
          <v-autocomplete
            v-model="currentField"
            :rules="currentFieldRules"
            label="RLS Field Name"
            :items="currentFormFields"
            item-title="text"
            item-value="id"
          ></v-autocomplete>

          <div v-if="currentField && isNestedObject">
            <v-card-subtitle
              ><u>NOTE:</u> This field value is a nested object</v-card-subtitle
            >
            <v-card-subtitle>Choose a sub-field from bellow</v-card-subtitle>
            <v-autocomplete
              v-model="currentNestedField"
              :rules="currentFieldRules"
              label="Nested Field Name"
              :items="localNestedFields"
              item-title="text"
              item-value="id"
            ></v-autocomplete>
          </div>

          <div v-if="localValues && localValues.length > 0">
            <v-card-subtitle>Select the value for mapping</v-card-subtitle>
            <v-autocomplete
              v-model="rlsValue"
              :rules="valueRules"
              label="Value"
              :items="localValues"
              item-title="text"
              item-value="id"
            ></v-autocomplete>
          </div>
        </div>
        <div v-else>
          <v-card-title>
            RLS for user {{ itemsToRls[0].fullName }}
          </v-card-title>
          <v-list lines="two">
            <v-list-item title="Field" :subtitle="itemsToRls[0].rls.field" />
            <v-list-item title="Value" :subtitle="itemsToRls[0].rls.value" />
          </v-list>
        </div>
      </div>
      <v-card-actions class="justify-center">
        <v-btn
          v-if="!rlsExist || editing"
          class="mb-5 mr-5"
          :class="RTL"
          :disabled="savingRls || !currentField || !rlsValue"
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
          v-if="rlsExist && !editing"
          class="mb-5"
          variant="outlined"
          @click="updateRls"
        >
          Update
        </v-btn>
        <v-btn
          v-if="rlsExist && !editing"
          class="mb-5"
          :disabled="deletingRls"
          :loading="deletingRls"
          color="red"
          variant="flat"
          @click="deleteRls"
        >
          Delete
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
</style>

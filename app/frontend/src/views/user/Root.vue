<script setup>
import { storeToRefs } from 'pinia';
import { useFormStore } from '~/store/form';
import { useAuthStore } from '../../store/auth';

const { lang } = storeToRefs(useFormStore());
const { user } = storeToRefs(useAuthStore());
</script>

<template>
  <BaseSecure>
    <h1 class="text-center" :lang="lang">
      {{ $t('trans.user.root.user') }}: {{ user.username }}
    </h1>
    <p class="text-center">
      Your user profile has been successfully created within the RLS
      application.
    </p>
  </BaseSecure>
</template>

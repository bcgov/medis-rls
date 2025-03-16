<script setup>
import { useAuthStore } from '~/store/auth';
import { useFormStore } from '~/store/form';
import { storeToRefs } from 'pinia';

const authStore = useAuthStore();
const formStore = useFormStore();

const { authenticated } = storeToRefs(authStore);
const { isRTL, lang } = storeToRefs(formStore);
</script>

<template>
  <div class="about-layout help-highlight" :class="{ 'dir-rtl': isRTL }">
    <v-sheet class="pa-5 text-center">
      <v-row justify="center">
        <v-col lg="8">
          <h3 class="my-5 d-block" :locale="lang">
            Ministry Enterprise Data Importing Solution (MEDIS)
          </h3>
          <h3 class="my-5 d-block" :locale="lang">
            Row Level Security (RLS) Services
          </h3>
          <p :locale="lang">
            The RLS (Row Level Security) service provides the ability to
            restrict user data access based on their group/organization within
            CHEFS forms and an administrative UI for team managers to manage
            user permissions and access to submissions.
          </p>

          <v-btn
            :to="{ name: !authenticated ? 'Login' : 'UserForms' }"
            class="mb-5"
            color="primary"
            data-test="create-or-login-btn"
          >
            <span v-if="!authenticated" :locale="lang">
              Log in to get started
            </span>
            <span v-else :locale="lang">RLS Forms</span>
          </v-btn>
        </v-col>
      </v-row>
    </v-sheet>
  </div>
</template>

<style lang="scss" scoped>
.about-layout {
  margin: 0;
  .help-highlight {
    background-color: #f1f8ff;
  }

  .example-text {
    margin: 80px 0;
    padding: 0 5px;
  }
  .video-wrapper {
    max-width: 854px !important;
    max-height: 422px !important;
    height: 422px;
    margin: 0 auto;
  }
  .main-video {
    margin-top: 40px;
    margin-bottom: 20px;
  }
}
</style>

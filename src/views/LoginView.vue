<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const auth = useAuthStore();

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    error.value = msg || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <form @submit.prevent="onSubmit" class="login-form">
      <h1>Admin Panel</h1>
      <p class="subtitle">Sign in to continue</p>
      <div v-if="error" class="error">{{ error }}</div>
      <input
        v-model="email"
        type="email"
        placeholder="Email"
        required
        autocomplete="email"
      />
      <input
        v-model="password"
        type="password"
        placeholder="Password"
        required
        autocomplete="current-password"
      />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Signing in...' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
}

.login-form {
  width: 100%;
  max-width: 320px;
  padding: 2rem;
  background: #16213e;
  border-radius: 8px;
}

.login-form h1 {
  margin: 0 0 0.25rem;
  color: #eee;
  font-size: 1.5rem;
}

.subtitle {
  margin: 0 0 1.5rem;
  color: #888;
  font-size: 0.9rem;
}

.error {
  padding: 0.5rem;
  margin-bottom: 1rem;
  background: #5a2020;
  color: #ff8888;
  border-radius: 4px;
  font-size: 0.9rem;
}

.login-form input {
  width: 100%;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border: 1px solid #333;
  border-radius: 4px;
  background: #0f0f1a;
  color: #eee;
  box-sizing: border-box;
}

.login-form input:focus {
  outline: none;
  border-color: #4a90d9;
}

.login-form button {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 4px;
  background: #4a90d9;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
}

.login-form button:hover:not(:disabled) {
  background: #5a9ee9;
}

.login-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as apiLogin, getMe } from '@/api/auth';
import router from '@/router';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<{ id: string; email: string; role: string } | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );

  const isLoggedIn = computed(() => !!token.value);

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    token.value = res.access_token;
    user.value = res.user;
    localStorage.setItem('token', res.access_token);
    localStorage.setItem('user', JSON.stringify(res.user));
    await router.push('/');
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  }

  async function fetchUser() {
    if (!token.value) return;
    const u = await getMe();
    user.value = u;
    localStorage.setItem('user', JSON.stringify(u));
  }

  return { token, user, isLoggedIn, login, logout, fetchUser };
});

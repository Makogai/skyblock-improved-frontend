import api from './client';

export interface LoginResponse {
  access_token: string;
  user: { id: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function getMe() {
  const { data } = await api.get('/me');
  return data;
}

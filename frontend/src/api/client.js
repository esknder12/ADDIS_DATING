import axios from 'axios';
import { getInitData } from '../lib/telegram.js';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((request) => {
  const initData = getInitData();
  if (initData) request.headers.Authorization = `tma ${initData}`;
  return request;
});

export async function authenticateUser() {
  const response = await apiClient.post('/api/auth/telegram');
  return response.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get('/api/auth/me');
  return response.data;
}

export default apiClient;

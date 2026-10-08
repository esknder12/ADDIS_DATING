import apiClient from './client.js';

export async function fetchResults() {
  const response = await apiClient.get('/api/onboarding/results');
  return response.data;
}

export async function calculateScore() {
  const response = await apiClient.post('/api/onboarding/results/calculate-score');
  return response.data;
}

export async function saveEmail(email) {
  const response = await apiClient.post('/api/onboarding/results/email', { email });
  return response.data;
}

export async function saveName(name) {
  const response = await apiClient.post('/api/onboarding/results/name', { name });
  return response.data;
}

export async function generatePromo() {
  const response = await apiClient.post('/api/onboarding/results/promo');
  return response.data;
}

export async function completeResults() {
  const response = await apiClient.post('/api/onboarding/results/complete');
  return response.data;
}

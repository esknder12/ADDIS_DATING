import apiClient from './client.js';

export async function requestVerification() {
  const response = await apiClient.post('/api/verification/request');
  return response.data;
}

export async function fetchVerificationStatus() {
  const response = await apiClient.get('/api/verification/status');
  return response.data;
}

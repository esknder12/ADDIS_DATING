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

export async function getOnboardingState() {
  const response = await apiClient.get('/api/onboarding');
  return response.data;
}

export async function saveOnboardingAnswer(questionKey, answer, progress) {
  const response = await apiClient.put(
    `/api/onboarding/answers/${encodeURIComponent(questionKey)}`,
    { answer, ...progress },
  );
  return response.data;
}

export async function saveOnboardingProgress(progress) {
  const response = await apiClient.put('/api/onboarding/progress', progress);
  return response.data;
}

export async function completeOnboarding() {
  const response = await apiClient.post('/api/onboarding/complete');
  return response.data;
}

/* Phase 3 — conversion results */

export async function getMatchResults() {
  const response = await apiClient.get('/api/app/results');
  return response.data;
}

export async function saveConversion({ name, email }) {
  const response = await apiClient.post('/api/app/conversion', { name, email });
  return response.data;
}

export async function applyDiscount(promoCode) {
  const response = await apiClient.post('/api/app/discount', { promoCode });
  return response.data;
}

/* Phase 4 — discovery, likes, matches, chat, gifts, premium, verification */

export async function getDiscoverProfiles() {
  const response = await apiClient.get('/api/app/discover');
  return response.data;
}

export async function postSwipe(profileId, action) {
  const response = await apiClient.post('/api/app/swipes', { profileId, action });
  return response.data;
}

export async function rewindLastSwipe() {
  const response = await apiClient.delete('/api/app/swipes/last');
  return response.data;
}

export async function getLikes() {
  const response = await apiClient.get('/api/app/likes');
  return response.data;
}

export async function getMatches() {
  const response = await apiClient.get('/api/app/matches');
  return response.data;
}

export async function getMessages(matchId) {
  const response = await apiClient.get(`/api/app/matches/${encodeURIComponent(matchId)}/messages`);
  return response.data;
}

export async function postMessage(matchId, body) {
  const response = await apiClient.post(
    `/api/app/matches/${encodeURIComponent(matchId)}/messages`,
    { body },
  );
  return response.data;
}

export async function sendGift({ profileId, giftId, clientRef }) {
  const response = await apiClient.post('/api/app/gifts', { profileId, giftId, clientRef });
  return response.data;
}

export async function activatePremium({ planId, promoCode }) {
  const response = await apiClient.post('/api/app/premium/activate', { planId, promoCode });
  return response.data;
}

export async function requestVerification() {
  const response = await apiClient.post('/api/app/verification/request');
  return response.data;
}

export default apiClient;

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

/* Phase 5 discovery/swipes + Phase 4 likes, matches, chat, and account features */

export async function getDiscoverProfiles({ limit = 10, offset = 0 } = {}) {
  const response = await apiClient.get('/api/discovery', { params: { limit, offset } });
  return response.data;
}

export async function getAiPicks() {
  const response = await apiClient.get('/api/ai-picks');
  return response.data;
}

export async function activateBoost() {
  const response = await apiClient.post('/api/boost/activate');
  return response.data;
}

export async function getBoostStatus() {
  const response = await apiClient.get('/api/boost/status');
  return response.data;
}

export async function postSwipe(profileId, action) {
  const apiAction = action === 'super_like' ? 'superlike' : action;
  const response = await apiClient.post('/api/swipe', {
    swipedUserId: String(profileId),
    action: apiAction,
  });
  return {
    ...response.data,
    matched: Boolean(response.data.isMatch ?? response.data.matched),
  };
}

export async function rewindLastSwipe() {
  const response = await apiClient.post('/api/swipe/rewind');
  return response.data;
}

export async function getLikes() {
  const response = await apiClient.get('/api/app/likes');
  return response.data;
}

export async function getMatches() {
  const response = await apiClient.get('/api/matches');
  return response.data;
}

export async function getChats() {
  const response = await apiClient.get('/api/chats');
  return response.data;
}

export async function getMessages(matchId) {
  const response = await apiClient.get(`/api/matches/${encodeURIComponent(matchId)}/messages`);
  return response.data;
}

export async function postMessage(matchId, body) {
  const response = await apiClient.post(
    `/api/matches/${encodeURIComponent(matchId)}/messages`,
    { content: body },
  );
  return response.data;
}

export async function getOwnProfile() {
  const response = await apiClient.get('/api/profile');
  return response.data;
}

export async function updateOwnProfile(patch) {
  const response = await apiClient.put('/api/profile', patch);
  return response.data;
}

export async function uploadProfilePhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  const response = await apiClient.post('/api/profile/photos', formData);
  return response.data;
}

export async function deleteProfilePhoto(photoId) {
  const response = await apiClient.delete(`/api/profile/photos/${encodeURIComponent(photoId)}`);
  return response.data;
}

export async function reorderProfilePhotos(photoIds) {
  const response = await apiClient.put('/api/profile/photos/reorder', { photoIds });
  return response.data;
}

export async function getProfileScore() {
  const response = await apiClient.get('/api/profile/score');
  return response.data;
}

export async function requestProfileScore() {
  const response = await apiClient.post('/api/profile/score/request');
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

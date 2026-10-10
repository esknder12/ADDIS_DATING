import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateBoost as apiActivateBoost,
  activatePremium,
  applyDiscount as apiApplyDiscount,
  getAiPicks as apiGetAiPicks,
  getBoostStatus as apiGetBoostStatus,
  getChats as apiGetChats,
  getDiscoverProfiles,
  getLikes,
  getMessages,
  getOwnProfile as apiGetOwnProfile,
  getProfileScore as apiGetProfileScore,
  postMessage,
  updateOwnProfile as apiUpdateOwnProfile,
  uploadProfilePhoto as apiUploadProfilePhoto,
  deleteProfilePhoto as apiDeleteProfilePhoto,
  reorderProfilePhotos as apiReorderProfilePhotos,
  requestProfileScore as apiRequestProfileScore,
  postSwipe,
  requestVerification as apiRequestVerification,
  rewindLastSwipe,
  saveConversion as apiSaveConversion,
  sendGift as apiSendGift,
} from '../api/client.js';
import { createDemoStore, loadAppState, loadOnboardingAnswers } from '../lib/demoStore.js';

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export function useAppData(user, { active = true } = {}) {
  const isDemo = Boolean(user.isDemo);
  const demoRef = useRef(null);
  if (!demoRef.current && isDemo) demoRef.current = createDemoStore(user.telegramId);

  const [profile, setProfile] = useState(() => (isDemo
    ? (() => {
      const state = loadAppState(user.telegramId);
      const onboardingAnswers = loadOnboardingAnswers(user.telegramId);
      const onboardingPhotos = Array.isArray(onboardingAnswers.photos)
        ? onboardingAnswers.photos
        : [];
      const seededPhotos = onboardingPhotos
        .map((photo, index) => ({
          id: `onboarding-${index}`,
          url: typeof photo === 'string' ? photo : photo?.url,
          orderIndex: index,
          isPrimary: index === 0,
        }))
        .filter((photo) => Boolean(photo.url));
      return {
        name: state.name,
        email: state.email,
        results: state.results,
        promoCode: state.promoCode,
        discountPercent: state.discountPercent,
        isVip: state.isVip,
        verificationStatus: state.verificationStatus,
        conversionCompleted: state.conversionCompleted,
        age: state.age ?? null,
        bio: state.bio || (typeof onboardingAnswers.bio === 'string' ? onboardingAnswers.bio : '') || '',
        city: state.city || '',
        country: state.country || '',
        photos: state.photos?.length ? state.photos : seededPhotos,
        photoUrl: state.photoUrl || seededPhotos[0]?.url || null,
        profileScore: state.profileScore ?? null,
        profileScoreReady: Boolean(state.profileScoreReady),
        additionalInfo: state.additionalInfo || {},
        settings: state.settings || { notificationsEnabled: true },
      };
    })()
    : {
      name: user.name ?? null,
      email: user.email ?? null,
      results: user.results ?? null,
      promoCode: user.promoCode ?? null,
      discountPercent: user.discountPercent ?? null,
      isVip: Boolean(user.isVip),
      verificationStatus: user.verificationStatus ?? 'none',
      conversionCompleted: Boolean(user.conversionCompleted),
      age: user.age ?? null,
      bio: user.bio || '',
      city: user.city || '',
      country: user.country || '',
      photos: [],
      photoUrl: user.photoUrl || null,
      profileScore: null,
      profileScoreReady: false,
      additionalInfo: {},
    }));

  const [discover, setDiscover] = useState([]);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(false);
  const [loadingMoreDiscover, setLoadingMoreDiscover] = useState(false);
  const [likedYou, setLikedYou] = useState([]);
  const [matches, setMatches] = useState([]);
  const [boost, setBoost] = useState({ isActive: false, boost: null });
  const [boostBusy, setBoostBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const discoverRef = useRef([]);
  const hasMoreDiscoverRef = useRef(false);
  const loadingMoreDiscoverRef = useRef(false);
  const refreshingLikesRef = useRef(false);

  const setDiscoverProfiles = useCallback((profiles) => {
    discoverRef.current = profiles;
    setDiscover(profiles);
  }, []);

  const refreshDiscover = useCallback(async () => {
    const result = isDemo
      ? demoRef.current.listDiscover({ limit: 10, offset: 0 })
      : await getDiscoverProfiles({ limit: 10, offset: 0 });
    const profiles = Array.isArray(result) ? result : result.profiles;
    const hasMore = Array.isArray(result) ? false : Boolean(result.hasMore);
    setDiscoverProfiles(profiles || []);
    hasMoreDiscoverRef.current = hasMore;
    setHasMoreDiscover(hasMore);
    return profiles || [];
  }, [isDemo, setDiscoverProfiles]);

  const loadMoreDiscover = useCallback(async (offset = discoverRef.current.length) => {
    if (loadingMoreDiscoverRef.current || !hasMoreDiscoverRef.current) return [];
    loadingMoreDiscoverRef.current = true;
    setLoadingMoreDiscover(true);
    try {
      const result = isDemo
        ? demoRef.current.listDiscover({ limit: 10, offset })
        : await getDiscoverProfiles({ limit: 10, offset });
      const profiles = Array.isArray(result) ? result : result.profiles;
      const hasMore = Array.isArray(result) ? false : Boolean(result.hasMore);
      const currentIds = new Set(discoverRef.current.map((profile) => String(profile.id)));
      const additions = (profiles || []).filter((profile) => !currentIds.has(String(profile.id)));
      const combined = [...discoverRef.current, ...additions];
      setDiscoverProfiles(combined);
      hasMoreDiscoverRef.current = hasMore;
      setHasMoreDiscover(hasMore);
      return additions;
    } finally {
      loadingMoreDiscoverRef.current = false;
      setLoadingMoreDiscover(false);
    }
  }, [isDemo, setDiscoverProfiles]);

  const refreshLikes = useCallback(async () => {
    if (refreshingLikesRef.current) return null;
    refreshingLikesRef.current = true;
    try {
      const data = isDemo ? demoRef.current.listLikes() : await getLikes();
      setLikedYou(data.likedYou);
      setMatches((current) => {
        const previous = new Map(current.map((match) => [String(match.id), match]));
        return data.matches.map((match) => ({
          ...match,
          unreadCount: previous.get(String(match.id))?.unreadCount ?? match.unreadCount,
        }));
      });
      if (typeof data.isVip === 'boolean') {
        setProfile((current) => ({ ...current, isVip: data.isVip }));
      }
      return data;
    } finally {
      refreshingLikesRef.current = false;
    }
  }, [isDemo]);

  const refreshChats = useCallback(async () => {
    if (isDemo) return null;
    const data = await apiGetChats();
    const chats = data.chats || [];
    setMatches(chats);
    return chats;
  }, [isDemo]);

  const refreshOwnProfile = useCallback(async () => {
    if (isDemo) return null;
    const data = await apiGetOwnProfile();
    const ownProfile = data.profile;
    setProfile((current) => ({
      ...current,
      ...ownProfile,
      results: current.results || user.results || null,
      promoCode: current.promoCode,
      discountPercent: current.discountPercent,
      conversionCompleted: current.conversionCompleted,
    }));
    return ownProfile;
  }, [isDemo, user.results]);

  const loadAiPicks = useCallback(async () => (
    isDemo ? demoRef.current.listAiPicks() : apiGetAiPicks()
  ), [isDemo]);

  const refreshBoostStatus = useCallback(async () => {
    const data = isDemo
      ? demoRef.current.getBoostStatus()
      : await apiGetBoostStatus();
    setBoost(data);
    return data;
  }, [isDemo]);

  const activateProfileBoost = useCallback(async () => {
    if (boostBusy) return boost;
    setBoostBusy(true);
    try {
      const data = isDemo
        ? demoRef.current.activateBoost()
        : await apiActivateBoost();
      setBoost(data);
      return data;
    } finally {
      setBoostBusy(false);
    }
  }, [boost, boostBusy, isDemo]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoadError('');
        await Promise.all([refreshDiscover(), refreshLikes(), refreshBoostStatus()]);
        if (!cancelled) {
          setLoaded(true);
          if (!isDemo) {
            refreshChats().catch((error) => console.warn('Could not load chat previews:', error));
            refreshOwnProfile().catch((error) => console.warn('Could not load your profile settings:', error));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(errorMessage(error, 'We could not load Dategram. Please try again.'));
          setLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [active, isDemo, refreshBoostStatus, refreshChats, refreshDiscover, refreshLikes, refreshOwnProfile]);

  // The person who liked second sees the match response directly. Polling the
  // lightweight likes endpoint lets the first person see the same new match
  // modal without requiring a manual tab switch or page reload.
  useEffect(() => {
    if (!active || isDemo || !loaded || loadError) return undefined;
    const timer = window.setInterval(() => {
      refreshLikes().catch((error) => {
        console.warn('Could not refresh likes and matches:', error);
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [active, isDemo, loaded, loadError, refreshLikes]);

  const swipe = useCallback(async (profileId, action) => {
    const outcome = isDemo
      ? demoRef.current.saveSwipe(profileId, action)
      : await postSwipe(profileId, action);
    if (outcome?.error) return outcome;

    const remaining = discoverRef.current.filter(
      (member) => String(member.id) !== String(profileId),
    );
    setDiscoverProfiles(remaining);

    if (outcome.matched) {
      try { await refreshLikes(); } catch (error) {
        console.warn('Could not refresh matches after swipe:', error);
      }
    }

    // Fetch the next page before the user reaches the end of the current stack.
    // The API excludes every persisted swipe, so the remaining visible count is
    // also the correct page offset.
    if (remaining.length <= 3 && hasMoreDiscoverRef.current) {
      try { await loadMoreDiscover(remaining.length); } catch (error) {
        console.warn('Could not refill discovery profiles:', error);
      }
    }
    return outcome;
  }, [isDemo, loadMoreDiscover, refreshLikes, setDiscoverProfiles]);

  const rewind = useCallback(async () => {
    const outcome = isDemo
      ? demoRef.current.rewindLastSwipe()
      : await rewindLastSwipe();
    if (!outcome?.restored) return { restored: null };

    const restoredProfile = outcome.restoredProfile
      || (isDemo ? demoRef.current.listDiscover().profiles.find((profile) => String(profile.id) === String(outcome.restored)) : null);
    if (restoredProfile) {
      const remaining = discoverRef.current.filter(
        (profile) => String(profile.id) !== String(restoredProfile.id),
      );
      setDiscoverProfiles([restoredProfile, ...remaining]);
    }
    try { await refreshLikes(); } catch (error) {
      console.warn('Could not refresh matches after rewind:', error);
    }
    return { ...outcome, restoredProfile };
  }, [isDemo, refreshLikes, setDiscoverProfiles]);

  const sendChatMessage = useCallback(async (matchId, body, socket = null) => {
    if (isDemo) {
      const outcome = demoRef.current.addMessage(matchId, body);
      await refreshLikes();
      return outcome?.message ?? null;
    }
    if (socket?.connected) {
      return new Promise((resolve, reject) => {
        socket.timeout(10_000).emit('send_message', { matchId: String(matchId), content: body }, (timeoutError, response) => {
          if (timeoutError) {
            reject(new Error('Connection interrupted. Check the chat history before retrying.'));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || 'Message failed to send. Try again.'));
            return;
          }
          resolve(response.message);
        });
      });
    }
    const outcome = await postMessage(matchId, body);
    refreshChats().catch((error) => console.warn('Could not refresh chat list:', error));
    return outcome.message;
  }, [isDemo, refreshChats, refreshLikes]);

  const saveProfile = useCallback(async (patch) => {
    if (isDemo) {
      demoRef.current.updateProfile(patch);
      setProfile((current) => ({ ...current, ...patch }));
      return { ...profile, ...patch };
    }
    const data = await apiUpdateOwnProfile(patch);
    setProfile((current) => ({
      ...current,
      ...data.profile,
      results: current.results,
      promoCode: current.promoCode,
      discountPercent: current.discountPercent,
      conversionCompleted: current.conversionCompleted,
    }));
    return data.profile;
  }, [isDemo, profile]);

  const uploadPhoto = useCallback(async (file) => {
    if (isDemo) {
      if ((profile.photos || []).length >= 6) throw new Error('You can add up to six profile photos.');
      const photo = {
        id: `demo-${Date.now()}`,
        url: window.URL.createObjectURL(file),
        orderIndex: profile.photos?.length || 0,
        isPrimary: !profile.photos?.length,
      };
      setProfile((current) => ({
        ...current,
        photos: [...(current.photos || []), photo],
        photoUrl: current.photoUrl || photo.url,
      }));
      return photo;
    }
    const data = await apiUploadProfilePhoto(file);
    setProfile((current) => ({ ...current, ...data.profile, results: current.results }));
    return data.photo;
  }, [isDemo, profile.photos, profile.photoUrl]);

  const deletePhoto = useCallback(async (photoId) => {
    if (isDemo) {
      const photos = (profile.photos || []).filter((photo) => String(photo.id) !== String(photoId));
      const ordered = photos.map((photo, index) => ({ ...photo, orderIndex: index, isPrimary: index === 0 }));
      setProfile((current) => ({
        ...current,
        photos: ordered,
        photoUrl: ordered[0]?.url || null,
      }));
      return ordered;
    }
    const data = await apiDeleteProfilePhoto(photoId);
    setProfile((current) => ({ ...current, ...data.profile, results: current.results }));
    return data.profile.photos;
  }, [isDemo, profile.photos]);

  const reorderPhotos = useCallback(async (photoIds) => {
    if (isDemo) {
      const current = profile.photos || [];
      const byId = new Map(current.map((photo) => [String(photo.id), photo]));
      const ordered = photoIds.map((id) => byId.get(String(id))).filter(Boolean)
        .map((photo, index) => ({ ...photo, orderIndex: index, isPrimary: index === 0 }));
      setProfile((state) => ({ ...state, photos: ordered, photoUrl: ordered[0]?.url || null }));
      return ordered;
    }
    const data = await apiReorderProfilePhotos(photoIds);
    setProfile((current) => ({ ...current, ...data.profile, results: current.results }));
    return data.profile.photos;
  }, [isDemo, profile.photos]);

  const refreshProfileScore = useCallback(async () => {
    if (isDemo) {
      return { isReady: Boolean(profile.profileScoreReady), score: profile.profileScore ?? profile.results?.score ?? null };
    }
    const data = await apiGetProfileScore();
    setProfile((current) => ({
      ...current,
      profileScore: data.score,
      profileScoreReady: data.isReady,
    }));
    return data;
  }, [isDemo, profile.profileScore, profile.profileScoreReady, profile.results]);

  const requestProfileScore = useCallback(async () => {
    const data = isDemo
      ? { isReady: true, score: profile.results?.score ?? null }
      : await apiRequestProfileScore();
    if (isDemo) {
      demoRef.current.updateProfile({ profileScore: data.score, profileScoreReady: data.isReady });
    }
    setProfile((current) => ({
      ...current,
      profileScore: data.score,
      profileScoreReady: data.isReady,
    }));
    return data;
  }, [isDemo, profile.results]);

  const loadChatMessages = useCallback(async (matchId) => {
    if (isDemo) return demoRef.current.listMessages(matchId) ?? [];
    const outcome = await getMessages(matchId);
    return outcome.messages;
  }, [isDemo]);

  const sendGiftTo = useCallback(async ({ profileId, giftId, stars }) => {
    const clientRef = `${user.telegramId}:${profileId}:${giftId}:${Date.now()}`;
    if (isDemo) {
      return demoRef.current.sendGift({ profileId, giftId, clientRef, stars });
    }
    return apiSendGift({ profileId, giftId, clientRef });
  }, [isDemo, user.telegramId]);

  const becomeVip = useCallback(async ({ planId, promoCode }) => {
    if (isDemo) {
      const state = demoRef.current.activatePremium({ planId, promoCode, percent: 50 });
      setProfile((current) => ({
        ...current,
        isVip: true,
        promoCode: state.promoCode,
        discountPercent: state.discountPercent,
      }));
      return { activated: true };
    }
    const outcome = await activatePremium({ planId, promoCode });
    setProfile((current) => ({ ...current, isVip: true }));
    return outcome;
  }, [isDemo]);

  const requestVerificationBadge = useCallback(async () => {
    if (isDemo) {
      demoRef.current.requestVerification();
      setProfile((current) => ({
        ...current,
        verificationStatus: current.verificationStatus === 'none' ? 'pending' : current.verificationStatus,
      }));
      return { status: 'pending' };
    }
    const outcome = await apiRequestVerification();
    setProfile((current) => ({ ...current, verificationStatus: 'pending' }));
    return outcome;
  }, [isDemo]);

  const saveConversionLead = useCallback(async ({ name, email, results }) => {
    if (isDemo) {
      const store = createDemoStore(user.telegramId);
      store.saveConversion({ name, email, results });
    } else {
      await apiSaveConversion({ name, email });
    }
    setProfile((current) => ({
      ...current,
      name: name || current.name,
      email: email || current.email,
      results: results || current.results,
      conversionCompleted: true,
    }));
  }, [isDemo, user.telegramId]);

  const applyPromo = useCallback(async ({ promoCode, percent }) => {
    if (isDemo) {
      const store = createDemoStore(user.telegramId);
      store.applyDiscount({ promoCode, percent });
    } else {
      await apiApplyDiscount(promoCode);
    }
    setProfile((current) => ({ ...current, promoCode, discountPercent: percent }));
  }, [isDemo, user.telegramId]);

  const markConversionCompleted = useCallback(() => {
    setProfile((current) => ({ ...current, conversionCompleted: true }));
  }, []);

  return {
    profile,
    boost,
    boostBusy,
    loaded,
    loadError,
    discover,
    hasMoreDiscover,
    loadingMoreDiscover,
    likedYou,
    matches,
    refreshDiscover,
    loadMoreDiscover,
    loadAiPicks,
    refreshLikes,
    refreshChats,
    refreshOwnProfile,
    refreshProfileScore,
    refreshBoostStatus,
    activateProfileBoost,
    swipe,
    rewind,
    sendChatMessage,
    loadChatMessages,
    saveProfile,
    uploadPhoto,
    deletePhoto,
    reorderPhotos,
    requestProfileScore,
    sendGiftTo,
    becomeVip,
    requestVerificationBadge,
    saveConversionLead,
    applyPromo,
    markConversionCompleted,
  };
}

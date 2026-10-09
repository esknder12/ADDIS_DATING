import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activatePremium,
  applyDiscount as apiApplyDiscount,
  getDiscoverProfiles,
  getLikes,
  getMatches,
  getMessages,
  postMessage,
  postSwipe,
  requestVerification as apiRequestVerification,
  rewindLastSwipe,
  saveConversion as apiSaveConversion,
  sendGift as apiSendGift,
} from '../api/client.js';
import { createDemoStore, loadAppState } from '../lib/demoStore.js';

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export function useAppData(user) {
  const isDemo = Boolean(user.isDemo);
  const demoRef = useRef(null);
  if (!demoRef.current && isDemo) demoRef.current = createDemoStore(user.telegramId);

  const [profile, setProfile] = useState(() => (isDemo
    ? (() => {
      const state = loadAppState(user.telegramId);
      return {
        name: state.name,
        email: state.email,
        results: state.results,
        promoCode: state.promoCode,
        discountPercent: state.discountPercent,
        isVip: state.isVip,
        verificationStatus: state.verificationStatus,
        conversionCompleted: state.conversionCompleted,
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
    }));

  const [discover, setDiscover] = useState([]);
  const [likedYou, setLikedYou] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refreshDiscover = useCallback(async () => {
    const profiles = isDemo
      ? demoRef.current.listDiscover()
      : (await getDiscoverProfiles()).profiles;
    setDiscover(profiles);
    return profiles;
  }, [isDemo]);

  const refreshLikes = useCallback(async () => {
    const data = isDemo ? demoRef.current.listLikes() : await getLikes();
    setLikedYou(data.likedYou);
    setMatches(data.matches);
    return data;
  }, [isDemo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError('');
        await Promise.all([refreshDiscover(), refreshLikes()]);
        if (!cancelled) setLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setLoadError(errorMessage(error, 'We could not load Dategram. Please try again.'));
          setLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [refreshDiscover, refreshLikes]);

  const swipe = useCallback(async (profileId, action) => {
    const outcome = isDemo
      ? demoRef.current.saveSwipe(profileId, action)
      : await postSwipe(profileId, action);

    setDiscover((current) => current.filter((member) => member.id !== profileId));
    if (outcome.matched) await refreshLikes();
    return outcome;
  }, [isDemo, refreshLikes]);

  const rewind = useCallback(async () => {
    if (isDemo) {
      const outcome = demoRef.current.rewindLastSwipe();
      if (!outcome.restored) return { restored: null };
      await refreshDiscover();
      await refreshLikes();
      return outcome;
    }
    const outcome = await rewindLastSwipe();
    await refreshDiscover();
    await refreshLikes();
    return outcome;
  }, [isDemo, refreshDiscover, refreshLikes]);

  const sendChatMessage = useCallback(async (matchId, body) => {
    if (isDemo) {
      const outcome = demoRef.current.addMessage(matchId, body);
      await refreshLikes();
      return outcome?.message ?? null;
    }
    const outcome = await postMessage(matchId, body);
    return outcome.message;
  }, [isDemo, refreshLikes]);

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
    loaded,
    loadError,
    discover,
    likedYou,
    matches,
    refreshDiscover,
    refreshLikes,
    swipe,
    rewind,
    sendChatMessage,
    loadChatMessages,
    sendGiftTo,
    becomeVip,
    requestVerificationBadge,
    saveConversionLead,
    applyPromo,
    markConversionCompleted,
  };
}

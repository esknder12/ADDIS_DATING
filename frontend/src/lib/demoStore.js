import { getMember, memberCatalog, seededOrder } from '@dategram/shared/catalog';

export const ONBOARDING_STORAGE_PREFIX = 'dategram:onboarding:v2';
const APP_STORAGE_PREFIX = 'dategram:app:v1';

function appKey(telegramId) {
  return `${APP_STORAGE_PREFIX}:${telegramId}`;
}

function blankState() {
  return {
    conversionCompleted: false,
    name: null,
    email: null,
    results: null,
    promoCode: null,
    discountPercent: null,
    isVip: false,
    verificationStatus: 'none',
    swipes: [], // [{ profileId, action, at }]
    matches: [], // [{ id, profileId, at, messages: [{ id, sender, body, at }], gifted: [] }]
    giftRefs: [],
    lastReplyIndex: {},
  };
}

export function loadAppState(telegramId) {
  try {
    const raw = window.localStorage.getItem(appKey(telegramId));
    if (!raw) return blankState();
    return { ...blankState(), ...JSON.parse(raw) };
  } catch {
    window.localStorage.removeItem(appKey(telegramId));
    return blankState();
  }
}

export function saveAppState(telegramId, state) {
  window.localStorage.setItem(appKey(telegramId), JSON.stringify(state));
}

export function resetAppState(telegramId) {
  window.localStorage.removeItem(appKey(telegramId));
}

export function loadOnboardingAnswers(telegramId) {
  try {
    const raw = window.localStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}:${telegramId}`);
    return raw ? (JSON.parse(raw)?.answers ?? {}) : {};
  } catch {
    return {};
  }
}

/** Public-safe member shape, same as the API returns. */
function toPublic(member) {
  const { likesYouBack, replies, ...rest } = member;
  return rest;
}

function publicMatch(match) {
  const member = getMember(match.profileId);
  const last = match.messages[match.messages.length - 1] || null;
  return {
    id: match.id,
    profile: member ? toPublic(member) : { id: match.profileId, name: 'Unknown' },
    createdAt: match.at,
    lastMessage: last ? { body: last.body, createdAt: last.at, sender: last.sender } : null,
  };
}

/**
 * Demo (browser preview) data source. Mirrors the real API route-for-route so
 * the UI exercises identical logic against localStorage.
 */
export function createDemoStore(telegramId) {
  const read = () => loadAppState(telegramId);
  const write = (state) => saveAppState(telegramId, state);

  return {
    getState: read,

    saveConversion({ name, email, results }) {
      const state = read();
      Object.assign(state, {
        name: name || state.name,
        email: email || state.email,
        results: results || state.results,
        conversionCompleted: true,
      });
      write(state);
      return state;
    },

    applyDiscount({ promoCode, percent }) {
      const state = read();
      state.promoCode = promoCode;
      state.discountPercent = percent;
      write(state);
      return state;
    },

    listDiscover() {
      const state = read();
      const swiped = new Set(state.swipes.map((swipe) => swipe.profileId));
      return seededOrder(memberCatalog, `${telegramId}:discover`)
        .filter((member) => !swiped.has(member.id))
        .map(toPublic);
    },

    saveSwipe(profileId, action) {
      const state = read();
      const member = getMember(profileId);
      if (!member) return { error: 'UNKNOWN_PROFILE' };

      state.swipes = [...state.swipes.filter((swipe) => swipe.profileId !== profileId), {
        profileId,
        action,
        at: new Date().toISOString(),
      }];

      // Same mutual-like invariant as the server.
      let matched = false;
      if ((action === 'like' || action === 'super_like') && member.likesYouBack
          && !state.matches.some((match) => match.profileId === profileId)) {
        state.matches.push({
          id: `m-${profileId}`,
          profileId,
          at: new Date().toISOString(),
          messages: [],
          gifted: [],
        });
        matched = true;
      }

      write(state);
      return { matched, profile: toPublic(member) };
    },

    rewindLastSwipe() {
      const state = read();
      const last = state.swipes[state.swipes.length - 1];
      if (!last) return { restored: null };
      state.swipes = state.swipes.slice(0, -1);
      if (last.action !== 'pass') {
        state.matches = state.matches.filter((match) => match.profileId !== last.profileId);
      }
      write(state);
      return { restored: last.profileId };
    },

    listLikes() {
      const state = read();
      const swiped = new Set(state.swipes.map((swipe) => swipe.profileId));
      const matchedIds = new Set(state.matches.map((match) => match.profileId));
      return {
        likedYou: memberCatalog
          .filter((member) => member.likesYou && !swiped.has(member.id) && !matchedIds.has(member.id))
          .map(toPublic),
        matches: [...state.matches].sort((a, b) => b.at.localeCompare(a.at)).map(publicMatch),
      };
    },

    listMatches() {
      const state = read();
      return [...state.matches].sort((a, b) => b.at.localeCompare(a.at)).map(publicMatch);
    },

    listMessages(matchId) {
      const state = read();
      const match = state.matches.find((entry) => entry.id === matchId);
      if (!match) return null;
      return match.messages;
    },

    addMessage(matchId, body) {
      const state = read();
      const match = state.matches.find((entry) => entry.id === matchId);
      if (!match) return null;
      const message = {
        id: `msg-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        sender: 'user',
        body,
        at: new Date().toISOString(),
      };
      match.messages.push(message);

      // Simulated partner reply so the chat thread feels alive in preview.
      const member = getMember(match.profileId);
      if (member?.replies?.length) {
        const index = state.lastReplyIndex[matchId] ?? 0;
        if (index < member.replies.length) {
          const reply = {
            id: `msg-${Date.now()}-r`,
            sender: 'profile',
            body: member.replies[index],
            at: new Date(Date.now() + 1600).toISOString(),
          };
          state.lastReplyIndex[matchId] = index + 1;
          match.messages.push(reply);
          match.pendingReply = true;
        }
      }

      write(state);
      return { message, replyQueued: Boolean(match.pendingReply) };
    },

    sendGift({ profileId, giftId, clientRef, stars }) {
      const state = read();
      if (state.giftRefs.includes(clientRef)) {
        return { repeated: true };
      }
      state.giftRefs.push(clientRef);
      const match = state.matches.find((entry) => entry.profileId === profileId);
      if (match) match.gifted.push({ giftId, stars, at: new Date().toISOString() });
      write(state);
      return { sent: true };
    },

    activatePremium({ planId, promoCode, percent }) {
      const state = read();
      state.isVip = true;
      state.vipPlan = planId;
      if (promoCode) {
        state.promoCode = promoCode;
        state.discountPercent = percent;
      }
      write(state);
      return state;
    },

    requestVerification() {
      const state = read();
      if (state.verificationStatus === 'none') state.verificationStatus = 'pending';
      write(state);
      return state;
    },
  };
}

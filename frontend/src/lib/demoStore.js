import { getMember, memberCatalog, seededOrder } from '@dategram/shared/catalog';

export const ONBOARDING_STORAGE_PREFIX = 'dategram:onboarding:v2';
const APP_STORAGE_PREFIX = 'dategram:app:v1';

function appKey(telegramId) {
  return `${APP_STORAGE_PREFIX}:${telegramId}`;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function demoCompatibilityScore(seed) {
  let value = 0;
  for (const char of String(seed)) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return 76 + (value % 21);
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
    aiPickSessions: {}, // keyed by local calendar date
    boost: null,
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
  const { likesYou, likesYouBack, replies, ...rest } = member;
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

    updateProfile(patch) {
      const state = read();
      const allowed = ['name', 'bio', 'city', 'country', 'additionalInfo', 'settings', 'profileScore', 'profileScoreReady'];
      for (const field of allowed) {
        if (Object.hasOwn(patch, field)) state[field] = patch[field];
      }
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

    listDiscover({ limit = memberCatalog.length, offset = 0 } = {}) {
      const state = read();
      const swiped = new Set(state.swipes.map((swipe) => swipe.profileId));
      const available = seededOrder(memberCatalog, `${telegramId}:discover`)
        .filter((member) => !swiped.has(member.id))
        .map(toPublic);
      const safeOffset = Math.max(0, Number.isSafeInteger(offset) ? offset : 0);
      const safeLimit = Math.max(1, Number.isSafeInteger(limit) ? limit : memberCatalog.length);
      return {
        profiles: available.slice(safeOffset, safeOffset + safeLimit),
        hasMore: available.length > safeOffset + safeLimit,
      };
    },

    listAiPicks() {
      const state = read();
      const today = localDateKey();
      state.aiPickSessions ||= {};
      let session = state.aiPickSessions[today];
      let changed = false;

      const createItems = (limit, existingItems = []) => {
        const existingIds = new Set(existingItems.map((item) => item.profileId));
        const swipedIds = new Set(state.swipes.map((swipe) => swipe.profileId));
        const ordered = seededOrder(memberCatalog, `${telegramId}:${today}:ai-picks:${existingItems.length}`)
          .filter((member) => !existingIds.has(member.id) && !swipedIds.has(member.id));
        const preferred = ordered.filter((member) => member.verified && member.city === 'Addis Ababa');
        const preferredIds = new Set(preferred.map((member) => member.id));
        const candidates = [
          ...preferred,
          ...ordered.filter((member) => !preferredIds.has(member.id)),
        ].slice(0, Math.max(0, limit - existingItems.length));
        return [
          ...existingItems,
          ...candidates.map((member, index) => ({
            profileId: member.id,
            compatibilityScore: demoCompatibilityScore(`${telegramId}:${today}:${member.id}`),
            orderIndex: existingItems.length + index,
          })),
        ];
      };

      if (!session) {
        const picksLimit = state.isVip ? 15 : 5;
        session = { picksLimit, items: createItems(picksLimit), createdAt: new Date().toISOString() };
        state.aiPickSessions[today] = session;
        changed = true;
      } else if (state.isVip && session.picksLimit < 15) {
        session.items = createItems(15, session.items);
        session.picksLimit = 15;
        changed = true;
      }

      const swipedIds = new Set(state.swipes.map((swipe) => swipe.profileId));
      const picks = session.items
        .filter((item) => !swipedIds.has(item.profileId))
        .map((item) => {
          const member = getMember(item.profileId);
          return member ? {
            ...toPublic(member),
            compatibilityScore: item.compatibilityScore,
            orderIndex: item.orderIndex,
          } : null;
        })
        .filter(Boolean);
      const picksShown = session.items.filter((item) => swipedIds.has(item.profileId)).length;
      if (session.picksShown !== picksShown) {
        session.picksShown = picksShown;
        changed = true;
      }
      if (changed) write(state);

      return {
        picks,
        picksRemaining: picks.length,
        dailyLimit: session.picksLimit,
        picksShown,
        isVip: Boolean(state.isVip),
      };
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
      if (!last) return { restored: null, restoredProfile: null };
      state.swipes = state.swipes.slice(0, -1);
      if (last.action !== 'pass') {
        state.matches = state.matches.filter((match) => match.profileId !== last.profileId);
      }
      write(state);
      const member = getMember(last.profileId);
      return {
        restored: last.profileId,
        restoredProfile: member ? toPublic(member) : null,
      };
    },

    listLikes() {
      const state = read();
      const swiped = new Set(state.swipes.map((swipe) => swipe.profileId));
      const matchedIds = new Set(state.matches.map((match) => match.profileId));
      const isVip = Boolean(state.isVip);
      const likedProfiles = memberCatalog
        .filter((member) => member.likesYou && !swiped.has(member.id) && !matchedIds.has(member.id));
      return {
        likedYou: likedProfiles.map((member, index) => {
          if (isVip || index === 0) return { ...toPublic(member), isLocked: false };
          const swipeId = `demo-like-${index + 1}`;
          return {
            id: `locked-${swipeId}`,
            swipeId,
            isLocked: true,
            teaserText: 'Someone has fallen in love with you',
            blurredPhotoUrl: '/images/locked-admirer.svg',
          };
        }),
        matches: [...state.matches].sort((a, b) => b.at.localeCompare(a.at)).map(publicMatch),
        isVip,
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

    getBoostStatus() {
      const state = read();
      const expiresAt = state.boost?.expiresAt || null;
      const isActive = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
      return {
        isActive,
        boost: isActive ? state.boost : null,
      };
    },

    activateBoost() {
      const state = read();
      const current = state.boost;
      if (current?.expiresAt && new Date(current.expiresAt).getTime() > Date.now()) {
        return { isActive: true, alreadyActive: true, boost: current };
      }
      const startedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      state.boost = { id: 'demo-boost', startedAt, expiresAt };
      write(state);
      return { isActive: true, alreadyActive: false, boost: state.boost };
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

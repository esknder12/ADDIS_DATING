import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AiPicksTab from '../components/app/AiPicksTab.jsx';
import BottomNavBar from '../components/app/BottomNavBar.jsx';
import ChatTab from '../components/app/ChatTab.jsx';
import ChatThread from '../components/app/ChatThread.jsx';
import DiscoverTab from '../components/app/DiscoverTab.jsx';
import LikesTab from '../components/app/LikesTab.jsx';
import MatchOverlay from '../components/app/MatchOverlay.jsx';
import PaywallSheet from '../components/app/PaywallSheet.jsx';
import ProfileDetailSheet from '../components/app/ProfileDetailSheet.jsx';
import ProfileTab from '../components/app/ProfileTab.jsx';
import VerificationModal from '../components/app/VerificationModal.jsx';
import BrandMark from '../components/BrandMark.jsx';
import { useSocket } from '../context/SocketContext.jsx';

const MAIN_TABS = new Set(['discover', 'picks', 'likes', 'chat', 'profile']);

function requestedTab() {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return MAIN_TABS.has(requested) ? requested : 'discover';
}

export default function MainApp({ user, appData }) {
  const [tab, setTab] = useState(requestedTab);
  const [pendingMatchId] = useState(() => new URLSearchParams(window.location.search).get('matchId'));
  const [detailMember, setDetailMember] = useState(null);
  const [chatMatch, setChatMatch] = useState(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [paywall, setPaywall] = useState(null); // { context }
  const [matchProfile, setMatchProfile] = useState(null);
  const [swipedProfileIds, setSwipedProfileIds] = useState(() => new Set());
  const seenMatchIds = useRef(new Set());
  const hasInitialMatchSnapshot = useRef(false);
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || user.isDemo) return undefined;
    const refreshChats = () => {
      appData.refreshChats().catch((error) => console.warn('Could not refresh chats:', error));
    };
    socket.on('chat_list_updated', refreshChats);
    socket.on('messages_read', refreshChats);
    return () => {
      socket.off('chat_list_updated', refreshChats);
      socket.off('messages_read', refreshChats);
    };
  }, [socket, user.isDemo, appData.refreshChats]);

  useEffect(() => {
    if (!isConnected || user.isDemo) return;
    appData.refreshChats().catch((error) => console.warn('Could not sync chats after reconnect:', error));
    appData.refreshLikes().catch((error) => console.warn('Could not sync matches after reconnect:', error));
  }, [isConnected, user.isDemo, appData.refreshChats, appData.refreshLikes]);

  useEffect(() => {
    if (!appData.loaded) return;
    const unseenMatches = appData.matches.filter((match) => !seenMatchIds.current.has(match.id));
    for (const match of appData.matches) seenMatchIds.current.add(match.id);
    if (!hasInitialMatchSnapshot.current) {
      hasInitialMatchSnapshot.current = true;
      return;
    }
    if (unseenMatches[0] && matchProfile?.id !== unseenMatches[0].profile.id) {
      setMatchProfile(unseenMatches[0].profile);
    }
  }, [appData.loaded, appData.matches, matchProfile]);

  useEffect(() => {
    if (!appData.loaded || !pendingMatchId) return;
    const match = appData.matches.find((entry) => String(entry.id) === String(pendingMatchId));
    if (match) {
      setTab('chat');
      setChatMatch(match);
    }
  }, [appData.loaded, appData.matches, pendingMatchId]);

  const matchedProfileIds = useMemo(
    () => new Set(appData.matches.map((match) => match.profile.id)),
    [appData.matches],
  );

  const openChatForProfile = useCallback((profileId) => {
    const match = appData.matches.find((entry) => entry.profile.id === profileId)
      || appData.matches.find((entry) => entry.id === profileId);
    if (match) setChatMatch(match);
  }, [appData.matches]);

  const handleMatch = useCallback((profile) => {
    setMatchProfile(profile);
  }, []);

  const handleSwipe = useCallback(async (profileId, action) => {
    const outcome = await appData.swipe(profileId, action);
    if (!outcome?.error) {
      setSwipedProfileIds((current) => new Set([...current, String(profileId)]));
    }
    return outcome;
  }, [appData.swipe]);

  const handleRewind = useCallback(async () => {
    const outcome = await appData.rewind();
    if (outcome?.restored) {
      setSwipedProfileIds((current) => {
        const next = new Set(current);
        next.delete(String(outcome.restored));
        return next;
      });
    }
    return outcome;
  }, [appData.rewind]);

  const handleMatchMessage = useCallback((profile) => {
    setMatchProfile(null);
    setDetailMember(null);
    openChatForProfile(profile.id);
  }, [openChatForProfile]);

  const handleSaveProfile = useCallback(async (patch) => appData.saveProfile(patch), [appData.saveProfile]);

  if (!appData.loaded) {
    return (
      <main className="onboarding-state">
        <div className="mini-logo-pulse"><BrandMark size={72} /></div>
        <h1>Opening Dategram</h1>
        <p>Loading your matches...</p>
        <span className="state-loader" />
      </main>
    );
  }

  if (appData.loadError) {
    return (
      <main className="onboarding-state">
        <div className="onboarding-state__error">!</div>
        <h1>We couldn’t load Dategram</h1>
        <p>{appData.loadError}</p>
        <button type="button" className="onboarding-primary" onClick={() => window.location.reload()}>TRY AGAIN</button>
      </main>
    );
  }

  return (
    <div className="main-app">
      {tab === 'discover' && (
        <DiscoverTab
          discover={appData.discover}
          matches={appData.matches}
          onSwipe={handleSwipe}
          onRewind={handleRewind}
          onOpenProfile={setDetailMember}
          onMatch={handleMatch}
          onBoost={() => setPaywall({ context: 'boost' })}
          onDirectMessage={() => setPaywall({ context: 'direct-message' })}
          onOpenChat={openChatForProfile}
        />
      )}
      {tab === 'picks' && (
        <AiPicksTab
          loadPicks={appData.loadAiPicks}
          onSwipe={handleSwipe}
          onMatch={handleMatch}
          onOpenProfile={setDetailMember}
          swipedProfileIds={swipedProfileIds}
        />
      )}
      {tab === 'likes' && (
        <LikesTab
          likedYou={appData.likedYou}
          matches={appData.matches}
          isVip={appData.profile.isVip}
          boost={appData.boost}
          boostBusy={appData.boostBusy}
          onActivateBoost={appData.activateProfileBoost}
          onOpenProfile={setDetailMember}
          onOpenChat={setChatMatch}
          onShowPaywall={() => setPaywall({ context: 'likes' })}
        />
      )}
      {tab === 'chat' && <ChatTab matches={appData.matches} onOpenChat={setChatMatch} />}
      {tab === 'profile' && (
        <ProfileTab
          user={user}
          appData={appData}
          photoUrl={appData.profile.photoUrl || user.photoUrl}
          onShowVerification={() => setVerificationOpen(true)}
          onShowPaywall={(context) => setPaywall({ context })}
          onSaveProfile={handleSaveProfile}
        />
      )}

      <BottomNavBar
        activeTab={tab}
        likesBadge={appData.profile.isVip ? 0 : appData.likedYou.length}
        onChange={setTab}
      />

      {detailMember && (
        <ProfileDetailSheet
          member={detailMember}
          isMatched={matchedProfileIds.has(detailMember.id)}
          onClose={() => setDetailMember(null)}
          onSwipe={async (profileId, action) => {
            const outcome = await handleSwipe(profileId, action);
            if (outcome?.matched && outcome.profile) handleMatch(outcome.profile);
            await appData.refreshLikes();
          }}
          onSendGift={appData.sendGiftTo}
          onDirectMessage={() => setPaywall({ context: 'direct-message' })}
          onOpenChat={(profileId) => { setDetailMember(null); openChatForProfile(profileId); }}
        />
      )}

      {chatMatch && (
        <ChatThread
          match={chatMatch}
          userId={user.id}
          isDemo={Boolean(user.isDemo)}
          socket={socket}
          isConnected={isConnected}
          onSend={appData.sendChatMessage}
          onLoadMessages={appData.loadChatMessages}
          onBack={async () => {
            setChatMatch(null);
            await Promise.allSettled([appData.refreshLikes(), appData.refreshChats()]);
          }}
        />
      )}

      {paywall && (
        <PaywallSheet
          context={paywall.context}
          promo={appData.profile.promoCode ? { code: appData.profile.promoCode } : null}
          onActivate={appData.becomeVip}
          onClose={() => setPaywall(null)}
        />
      )}

      {verificationOpen && (
        <VerificationModal
          user={user}
          photoUrl={user.photoUrl}
          status={appData.profile.verificationStatus}
          isDemo={Boolean(user.isDemo)}
          onRequest={appData.requestVerificationBadge}
          onClose={() => setVerificationOpen(false)}
        />
      )}

      {matchProfile && (
        <MatchOverlay
          profile={matchProfile}
          userPhotoUrl={appData.profile.photoUrl || user.photoUrl}
          onSendMessage={handleMatchMessage}
          onKeepSwiping={() => setMatchProfile(null)}
        />
      )}
    </div>
  );
}

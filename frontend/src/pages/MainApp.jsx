import { useCallback, useMemo, useState } from 'react';
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

export default function MainApp({ user, appData }) {
  const [tab, setTab] = useState('discover');
  const [detailMember, setDetailMember] = useState(null);
  const [chatMatch, setChatMatch] = useState(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [paywall, setPaywall] = useState(null); // { context }
  const [matchProfile, setMatchProfile] = useState(null);

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

  const handleMatchMessage = useCallback((profile) => {
    setMatchProfile(null);
    setDetailMember(null);
    openChatForProfile(profile.id);
  }, [openChatForProfile]);

  const handleSaveProfile = useCallback(async ({ name }) => {
    if (!name) return;
    await appData.saveConversionLead({ name, email: appData.profile.email, results: appData.profile.results });
  }, [appData]);

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
          onSwipe={appData.swipe}
          onRewind={appData.rewind}
          onOpenProfile={setDetailMember}
          onMatch={handleMatch}
          onBoost={() => setPaywall({ context: 'boost' })}
          onDirectMessage={() => setPaywall({ context: 'direct-message' })}
          onOpenChat={openChatForProfile}
        />
      )}
      {tab === 'picks' && <AiPicksTab user={user} onOpenProfile={setDetailMember} />}
      {tab === 'likes' && (
        <LikesTab
          likedYou={appData.likedYou}
          matches={appData.matches}
          isVip={appData.profile.isVip}
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
          photoUrl={user.photoUrl}
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
            const outcome = await appData.swipe(profileId, action);
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
          isDemo={Boolean(user.isDemo)}
          onSend={appData.sendChatMessage}
          onLoadMessages={appData.loadChatMessages}
          onBack={async () => { setChatMatch(null); await appData.refreshLikes(); }}
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
          userPhotoUrl={user.photoUrl}
          onSendMessage={handleMatchMessage}
          onKeepSwiping={() => setMatchProfile(null)}
        />
      )}
    </div>
  );
}

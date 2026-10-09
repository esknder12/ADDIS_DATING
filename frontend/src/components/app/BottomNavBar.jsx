import { impact } from '../../lib/telegram.js';
import { CardsIcon, ChatIcon, HeartIcon, PersonIcon, SparklesIcon } from './icons.jsx';

const tabs = [
  { id: 'discover', label: 'Discover', icon: CardsIcon },
  { id: 'picks', label: 'AI Picks', icon: SparklesIcon },
  { id: 'likes', label: 'Likes', icon: HeartIcon },
  { id: 'chat', label: 'Chat', icon: ChatIcon },
  { id: 'profile', label: 'Profile', icon: PersonIcon },
];

export default function BottomNavBar({ activeTab, likesBadge = 0, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav__item${active ? ' bottom-nav__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => { impact('light'); onChange(tab.id); }}
          >
            <span className="bottom-nav__icon">
              <Icon active={active} />
              {tab.id === 'likes' && likesBadge > 0 && (
                <span className="bottom-nav__badge" aria-label={`${likesBadge} new`}>{likesBadge}</span>
              )}
            </span>
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

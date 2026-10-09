const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function CardsIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} className={active ? 'filled' : ''}>
      <rect x="7.5" y="3.5" width="11" height="14" rx="2.5" transform="rotate(6 13 10.5)" />
      <rect x="5" y="6.5" width="11" height="14" rx="2.5" transform="rotate(-3 10.5 13.5)" />
      {active && <path d="m10.5 12 1.7 1.8 3.1-3.4" strokeWidth="2.1" />}
    </svg>
  );
}

export function SparklesIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.9} strokeLinejoin="round">
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9 12 3.5Z" />
      <path d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z" transform="scale(0.85) translate(2.2 1.4)" />
    </svg>
  );
}

export function HeartIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" />
    </svg>
  );
}

export function ChatIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.6c0 4.2-4 7.6-9 7.6-1 0-2-.12-2.9-.36L4 20.4l1.3-3.8C4 15 3 13.4 3 11.6 3 7.4 7 4 12 4s9 3.4 9 7.6Z" />
      {active && <path d="M8.5 11.6h.01M12 11.6h.01M15.5 11.6h.01" strokeWidth="2.4" stroke="#000" />}
    </svg>
  );
}

export function PersonIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.9-4 4-6 7.5-6s6.6 2 7.5 6" />
    </svg>
  );
}

export function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps}>
      <path d="M4 10a8 8 0 1 1 1.7 6.7M4 10V4.5M4 10h5.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3.8l2.6 5.2 5.8.9-4.2 4.1 1 5.8L12 17l-5.2 2.8 1-5.8-4.2-4.1 5.8-.9L12 3.8Z" />
    </svg>
  );
}

export function PlainHeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.4 4.5 4.2 11.1c-1 .4-1 1 .2 1.4l4.1 1.3 1.6 4.9c.3 1 .9 1.2 1.6.3l2.3-2.9 4.3 3.2c.8.6 1.5.2 1.7-.8L23 5.9c.2-1.5-.7-2-2.6-1.4ZM8.9 13.4 17.5 7c.3-.2.6.1.4.3L10 14.6l-.3 3-1.8-4.2Z" />
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M13.2 2.5 4.8 13.5h5.4l-1.4 8 8.4-11h-5.4l1.4-8Z" />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps}>
      <path d="M4 7h9M17 7h3M4 17h5M13 17h7M8 12h0M13 7a2.2 2.2 0 1 0 4.4 0A2.2 2.2 0 0 0 13 7ZM8.8 17a2.2 2.2 0 1 0 4.4 0A2.2 2.2 0 0 0 8.8 17Z" />
    </svg>
  );
}

export function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps}>
      <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />
    </svg>
  );
}

export function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps}>
      <path d="M12 5v13M6.5 12.5 12 18l5.5-5.5" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function VerifiedBadge({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} className="verified-badge">
      <circle cx="12" cy="12" r="10" fill="#3B82F6" />
      <path d="m7.5 12.4 3 3 6-6.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BrandMark({ size = 84, compact = false }) {
  return (
    <div
      className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`}
      style={{ width: size, height: size }}
      aria-label="Dategram"
      role="img"
    >
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <defs>
          <linearGradient id="dategram-heart" x1="16" y1="15" x2="66" y2="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="0.52" stopColor="#FFF2F5" />
            <stop offset="1" stopColor="#FF2D55" />
          </linearGradient>
        </defs>
        <path
          d="M42 66.8c-2.1-4.8-7.8-8.4-13.2-12.2C21.5 49.5 15 43.7 15 34.9 15 25.7 21.7 19 30.6 19c5.3 0 9.4 2.5 11.4 6.3 2-3.8 6.1-6.3 11.4-6.3C62.3 19 69 25.7 69 34.9c0 8.8-6.5 14.6-13.8 19.7C49.8 58.4 44.1 62 42 66.8Z"
          fill="url(#dategram-heart)"
        />
        <path
          d="M42.2 66.2c.8-11.6 4.5-22.4 14.4-31.6"
          fill="none"
          stroke="#0A0A0B"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M45.5 52.2c5.6.2 10-1.4 13.4-5.2"
          fill="none"
          stroke="#0A0A0B"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

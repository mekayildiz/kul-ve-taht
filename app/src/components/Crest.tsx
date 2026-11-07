/**
 * Oyun armasi (inline SVG). Harici görsel/font yok (0 TL + CSP dostu):
 * tarayıcıda çizilir, veri indirmez. `kvt-crest` sınıfıyla boyutlanır.
 */
export function Crest({ className = "kvt-crest" }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Kül ve Taht arması"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="kvt-crest-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0c25c" />
          <stop offset="1" stopColor="#c9a227" />
        </linearGradient>
      </defs>
      <path d="M32 4 52 12v20c0 13-8.5 22.5-20 28C20.5 54.5 12 45 12 32V12L32 4Z" fill="#241f19" stroke="url(#kvt-crest-gold)" strokeWidth="2" />
      <path d="M32 14c3.4 4.2 5 7.6 5 10.6a5 5 0 1 1-10 0c0-3 1.6-6.4 5-10.6Z" fill="url(#kvt-crest-gold)" />
      <path d="M32 21c1.5 2 2.2 3.6 2.2 5a2.2 2.2 0 1 1-4.4 0c0-1.4.7-3 2.2-5Z" fill="#5a1f2b" />
      <path d="M18 38h28l-2.5 4h-23L18 38Z" fill="url(#kvt-crest-gold)" />
      <path d="M20 34.5l3-6 2.4 3 6.6-7.5 6.6 7.5 2.4-3 3 6H20Z" fill="url(#kvt-crest-gold)" />
      <circle cx="24" cy="29.5" r="1.2" fill="#5a1f2b" />
      <circle cx="32" cy="26.5" r="1.2" fill="#5a1f2b" />
      <circle cx="40" cy="29.5" r="1.2" fill="#5a1f2b" />
      <rect x="22" y="44" width="20" height="3" rx="1" fill="url(#kvt-crest-gold)" />
    </svg>
  );
}

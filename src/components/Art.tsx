import type { Scene } from "@/lib/types";

// Placeholder illustrations standing in for AI-generated images.
const LABELS: Record<Scene, string> = {
  day: "햇볕 아래 고양이와 비 오는 창가 책상",
  cat: "햇볕 아래 누운 갈색 고양이",
  rain: "비 내리는 창가",
  park: "공원의 나무",
  cafe: "따뜻한 커피 한 잔",
  night: "달 뜬 밤의 동네",
};

export default function Art({ scene, className }: { scene: Scene; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={className ? `art ${className}` : "art"}
      role="img"
      aria-label={LABELS[scene]}
    >
      {scene === "day" && (
        <>
          <rect width="50" height="100" fill="#F6E7C1" />
          <rect x="50" width="50" height="100" fill="#C9D3F2" />
          <circle cx="20" cy="20" r="9" fill="#F2B33D" />
          <g stroke="#6E7FD1" strokeWidth="1.2" strokeLinecap="round">
            <path d="M60 10l-3 7M72 14l-3 7M84 8l-3 7M66 28l-3 7M80 30l-3 7M92 22l-3 7" />
          </g>
          <rect y="70" width="50" height="30" fill="#E3C79B" />
          <rect x="50" y="70" width="50" height="30" fill="#B98E66" />
          <ellipse cx="28" cy="72" rx="15" ry="6" fill="#A0704A" />
          <circle cx="13" cy="67" r="5.5" fill="#A0704A" />
          <path d="M8.5 63l1.5-5.5 3 4M14 61.5l3-4 1 5.5" fill="#A0704A" />
          <path d="M42 72q7-2 5-9" stroke="#A0704A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <rect x="58" y="58" width="22" height="4" rx="1" fill="#FFFFFF" />
          <rect x="60" y="54" width="20" height="4" rx="1" fill="#F4F1EA" />
          <rect x="57" y="62" width="24" height="5" rx="1" fill="#FFFFFF" />
          <rect x="84" y="58" width="8" height="10" rx="1.5" fill="#F2B33D" transform="rotate(14 88 63)" />
        </>
      )}
      {scene === "cat" && (
        <>
          <rect width="100" height="100" fill="#F6E7C1" />
          <circle cx="78" cy="22" r="11" fill="#F2B33D" />
          <rect y="66" width="100" height="34" fill="#E3C79B" />
          <ellipse cx="50" cy="70" rx="22" ry="8" fill="#A0704A" />
          <circle cx="30" cy="64" r="7" fill="#A0704A" />
          <path d="M24 59l2-7 4 5M31 57l4-5 1 7" fill="#A0704A" />
          <path d="M71 70q11-2 9-12" stroke="#A0704A" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
      {scene === "rain" && (
        <>
          <rect width="100" height="100" fill="#DDE3F6" />
          <rect x="16" y="12" width="68" height="48" rx="2" fill="#A9B7E6" />
          <g stroke="#5D6FC7" strokeWidth="1.3" strokeLinecap="round">
            <path d="M26 18l-3 8M40 22l-3 8M56 16l-3 8M70 24l-3 8M32 38l-3 8M50 40l-3 8M66 42l-3 8" />
          </g>
          <path d="M50 12v48M16 36h68" stroke="#FFFFFF" strokeWidth="2" />
          <rect y="68" width="100" height="32" fill="#B98E66" />
          <rect x="26" y="60" width="26" height="8" rx="1" fill="#FFFFFF" />
          <rect x="60" y="61" width="9" height="7" rx="2" fill="#F0CFC6" />
        </>
      )}
      {scene === "park" && (
        <>
          <rect width="100" height="100" fill="#E4EFE0" />
          <rect y="70" width="100" height="30" fill="#B9D5AF" />
          <rect x="46" y="44" width="8" height="30" fill="#8C6A4A" />
          <circle cx="50" cy="36" r="18" fill="#8DBF86" />
          <circle cx="36" cy="44" r="11" fill="#7FB378" />
          <circle cx="64" cy="44" r="11" fill="#9CCB93" />
          <path d="M0 86q50-10 100 0" stroke="#F4F1EA" strokeWidth="4" fill="none" />
        </>
      )}
      {scene === "cafe" && (
        <>
          <rect width="100" height="100" fill="#F5DCD4" />
          <rect y="66" width="100" height="34" fill="#D9A897" />
          <ellipse cx="50" cy="70" rx="22" ry="4" fill="#FFFFFF" />
          <path d="M36 44h28v16a10 10 0 01-10 10h-8a10 10 0 01-10-10z" fill="#FFFFFF" />
          <path d="M64 48h4a6 6 0 010 12h-4" stroke="#FFFFFF" strokeWidth="3" fill="none" />
          <path d="M44 38q-3-5 0-10M52 38q-3-5 0-10M60 38q-3-5 0-10" stroke="#C47F6B" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}
      {scene === "night" && (
        <>
          <rect width="100" height="100" fill="#2E3557" />
          <circle cx="74" cy="24" r="10" fill="#F3E3A8" />
          <circle cx="78" cy="21" r="9" fill="#2E3557" />
          <g fill="#F3E3A8">
            <circle cx="20" cy="16" r="1" />
            <circle cx="40" cy="28" r="0.8" />
            <circle cx="56" cy="12" r="1" />
          </g>
          <rect x="8" y="54" width="24" height="46" fill="#454E7A" />
          <rect x="36" y="44" width="28" height="56" fill="#3B4370" />
          <rect x="68" y="60" width="26" height="40" fill="#454E7A" />
          <g fill="#F2B33D">
            <rect x="14" y="62" width="5" height="5" />
            <rect x="42" y="52" width="5" height="5" />
            <rect x="52" y="66" width="5" height="5" />
            <rect x="74" y="68" width="5" height="5" />
          </g>
        </>
      )}
    </svg>
  );
}

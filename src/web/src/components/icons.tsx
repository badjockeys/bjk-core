// Icons from the approved wireframes. Decorative (aria-hidden): the button or link around each one carries its name.
import type { SVGProps } from "react";

type IconProps = { size?: number; color?: string } & Omit<SVGProps<SVGSVGElement>, "color">;

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

const MUTED = "#5F5F66";
const INK = "#111111";

export function LogoMark({
  size = 32,
  ring = INK,
  dot = true,
}: {
  size?: number;
  ring?: string;
  dot?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        d="M10 34 V18 Q10 10 18 10 H34 M66 10 H82 Q90 10 90 18 V34 M90 66 V82 Q90 90 82 90 H66 M34 90 H18 Q10 90 10 82 V66"
        fill="none"
        stroke={ring}
        strokeWidth={dot ? 12 : 10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot ? <circle cx="50" cy="50" r="19" fill="#00B5E5" /> : null}
    </svg>
  );
}

export function HomeIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...p}>
      <path
        d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3V10.5z"
        fill={filled ? INK : "none"}
        stroke={INK}
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ProfileIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" fill={filled ? INK : "none"} stroke={INK} strokeWidth="1.8" />
      <path
        d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"
        fill={filled ? INK : "none"}
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function AccountIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  const w = filled ? 2.4 : 1.8;
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke={INK} strokeWidth={w} />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
        stroke={INK}
        strokeWidth={w}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Reels: a phone-shaped frame with a play triangle (wireframes 27–29). Bolder when it's the current page. */
export function ReelsIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  const w = filled ? 2.4 : 1.8;
  return (
    <Svg {...p}>
      <rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="none" stroke={INK} strokeWidth={w} />
      <path d="M10 9v6l5-3z" fill={INK} />
    </Svg>
  );
}

/** The incident map: a folded map (wireframe 28). Bolder when it's the current page. */
/** Communities: two people, the front one bolder when it's the current section. */
export function CommunitiesIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  const w = filled ? 2.4 : 1.8;
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.2" fill="none" stroke={INK} strokeWidth={w} />
      <path
        d="M3 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6"
        fill="none"
        stroke={INK}
        strokeWidth={w}
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9" r="2.6" fill="none" stroke={INK} strokeWidth={w - 0.4} />
      <path
        d="M16.8 14.2c2.4.3 3.9 2 4.2 4.8"
        fill="none"
        stroke={INK}
        strokeWidth={w - 0.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function MapIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  const w = filled ? 2.4 : 1.8;
  return (
    <Svg {...p}>
      <path
        d="M9 4L3 6.2v14L9 18l6 2.2 6-2.2V4l-6 2.2L9 4z"
        fill="none"
        stroke={INK}
        strokeWidth={w}
        strokeLinejoin="round"
      />
      <path d="M9 4v14M15 6.2v14" stroke={INK} strokeWidth={w - 0.2} />
    </Svg>
  );
}

export function MoreIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <circle cx="5" cy="12" r="1.8" fill={MUTED} />
      <circle cx="12" cy="12" r="1.8" fill={MUTED} />
      <circle cx="19" cy="12" r="1.8" fill={MUTED} />
    </Svg>
  );
}

export function PinIcon({ color = MUTED, ...p }: IconProps) {
  return (
    <Svg size={14} {...p}>
      <path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="10" r="2.5" fill={color} />
    </Svg>
  );
}

export function TagIcon(p: IconProps) {
  return (
    <Svg size={14} {...p}>
      <path d="M3 12V4h8l10 10-8 8L3 12z" fill="none" stroke={MUTED} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.5" fill={MUTED} />
    </Svg>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg size={16} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke={MUTED} strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke={MUTED} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function PhotoIcon({
  color = "#8A8A90",
  strokeWidth = 1.6,
  ...p
}: IconProps & { strokeWidth?: number }) {
  return (
    <Svg size={28} {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="9" cy="10" r="1.6" fill={color} />
      <path
        d="M4 18l5-5 3 3 3-3 5 5"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CommentIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path d="M4 5h16v11H9l-5 4V5z" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinejoin="round" />
    </Svg>
  );
}

export function ThumbIcon({ on, ...p }: IconProps & { on?: boolean }) {
  const c = on ? "#00B5E5" : MUTED;
  return (
    <Svg size={18} {...p}>
      <path
        d="M7 10v11H3V10h4zm2 11h8.5a2 2 0 002-1.6l1.4-7A2 2 0 0019 10h-5l.8-4.2a1.8 1.8 0 00-3.4-1L9 10v11z"
        fill={on ? c : "none"}
        stroke={c}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ShareIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"
        fill="none"
        stroke={MUTED}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <Svg size={24} {...p}>
      <path d="M8 5v14l11-7z" fill={INK} />
    </Svg>
  );
}

export function BackIcon(p: IconProps) {
  return (
    <Svg size={22} {...p}>
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ArrowBackIcon(p: IconProps) {
  return (
    <Svg size={22} {...p}>
      <path
        d="M20 12H5M11 5l-7 7 7 7"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloseIcon({ color = INK, ...p }: IconProps) {
  return (
    <Svg size={20} {...p}>
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ color = INK, ...p }: IconProps) {
  return (
    <Svg size={24} {...p}>
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

export function TickIcon({ color = INK, ...p }: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ClockIcon({ color = INK, ...p }: IconProps) {
  return (
    <Svg size={20} {...p}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2" />
      <path d="M12 7v5l3 2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function VideoIcon({ color = INK, ...p }: IconProps) {
  return (
    <Svg size={24} {...p}>
      <rect x="3" y="6" width="13" height="12" rx="3" fill="none" stroke={color} strokeWidth="2" />
      <path d="M16 10l5-3v10l-5-3" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}

export function SpinnerIcon(p: IconProps) {
  return (
    <Svg size={36} {...p}>
      <path d="M12 3a9 9 0 109 9" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>
    </Svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M9 5l7 7-7 7"
        fill="none"
        stroke={MUTED}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ExternalIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"
        fill="none"
        stroke={MUTED}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DownloadIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M12 4v11M7 10l5 5 5-5M5 20h14"
        fill="none"
        stroke={MUTED}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MapPinSolid({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill={INK} />
      <circle cx="12" cy="10" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}

export function BellIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...p}>
      <path
        d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16z"
        fill={filled ? INK : "none"}
        stroke={INK}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 20.5a2 2 0 004 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function BookmarkIcon({ on, ...p }: IconProps & { on?: boolean }) {
  const c = on ? "#00B5E5" : MUTED;
  return (
    <Svg size={18} {...p}>
      <path
        d="M6 3h12v18l-6-4.5L6 21V3z"
        fill={on ? c : "none"}
        stroke={c}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function EyeIcon(p: IconProps) {
  return (
    <Svg size={18} {...p}>
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
        fill="none"
        stroke={MUTED}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke={MUTED} strokeWidth="1.8" />
    </Svg>
  );
}

export function BadgeIcon(p: IconProps) {
  return (
    <Svg size={16} {...p}>
      <path
        d="M12 2l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 15.4l-5.2 2.7 1-5.8L3.5 8.2l5.9-.9L12 2z"
        fill="#00B5E5"
        stroke="#00B5E5"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Ask Bad Jockeys (the AI chat): a speech bubble with a spark. */
export function AskIcon({ filled, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...p}>
      <path
        d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 014 13.5v-8z"
        fill={filled ? INK : "none"}
        stroke={INK}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"
        fill={filled ? "#FFFFFF" : "#00B5E5"}
      />
    </Svg>
  );
}

export function SendIcon({ color = "#FFFFFF", ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path
        d="M4 12l16-8-6 16-2.5-6.5L4 12z"
        fill={color}
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

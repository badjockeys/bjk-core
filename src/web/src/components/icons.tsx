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

export function ClockIcon(p: IconProps) {
  return (
    <Svg size={20} {...p}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={INK} strokeWidth="2" />
      <path d="M12 7v5l3 2" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
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

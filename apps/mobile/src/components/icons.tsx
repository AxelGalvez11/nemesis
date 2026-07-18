import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

// The phone's line-icon set — hand-drawn to match the desktop app's icon language
// (thin strokes, round caps, monochrome; color comes from the caller, usually a
// theme text tone). One component per glyph so the tab bar and drawer can render
// real icons instead of the old text symbols (◆ ▤ ▦ ▣).

export interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function HomeIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.8 10.9 12 4l8.2 6.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6 9.8V19a1.4 1.4 0 0 0 1.4 1.4h9.2A1.4 1.4 0 0 0 18 19V9.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M9.8 20.2v-4.6a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v4.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function LibraryIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.7 3.6H19a.6.6 0 0 1 .6.6v15.6a.6.6 0 0 1-.6.6H6.7A2.35 2.35 0 0 1 4.4 18V5.9a2.35 2.35 0 0 1 2.3-2.3Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M4.4 18a2.35 2.35 0 0 1 2.3-2.3h12.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.6" y1="7.4" x2="15.4" y2="7.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function StudyIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6.8" y="3.8" width="13.4" height="10.4" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M17.2 17.2v.9a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8V9.6a1.8 1.8 0 0 1 1.8-1.8h.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="10.2" y1="8" x2="17" y2="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="10.2" y1="10.8" x2="14.6" y2="10.8" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function GraphIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="7.5" x2="6.4" y2="15.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="7.5" x2="17.6" y2="15.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="7.6" y1="17.6" x2="16.4" y2="17.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="12" cy="5.2" r="2.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="5.2" cy="17.6" r="2.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="18.8" cy="17.6" r="2.5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function CalendarIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="5.4" width="16" height="15" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="4" y1="9.9" x2="20" y2="9.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="3.4" x2="8.2" y2="6.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15.8" y1="3.4" x2="15.8" y2="6.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="8.6" cy="13.6" r="1.15" fill={color} stroke="none" />
    </Svg>
  );
}

export function SessionsIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8.2 7.6h10a1.7 1.7 0 0 1 1.7 1.7v6.6a1.7 1.7 0 0 1-1.7 1.7h-4.9l-3 2.8a.5.5 0 0 1-.84-.37V17.6h-1.26a1.7 1.7 0 0 1-1.7-1.7V9.3a1.7 1.7 0 0 1 1.7-1.7Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M4.1 13.4V5.9a1.7 1.7 0 0 1 1.7-1.7h9.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function ChatIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5.8 4.4h12.4a1.8 1.8 0 0 1 1.8 1.8v8a1.8 1.8 0 0 1-1.8 1.8h-7.9l-3.6 3.4a.5.5 0 0 1-.85-.36V16a1.8 1.8 0 0 1-1.85-1.8v-8a1.8 1.8 0 0 1 1.8-1.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Line x1="8.4" y1="8.6" x2="15.6" y2="8.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.4" y1="11.6" x2="13.2" y2="11.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function PlusIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="5.5" x2="12" y2="18.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="5.5" y1="12" x2="18.5" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function MailIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M4.2 7 12 12.4 19.8 7" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function SparkleIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M18.5 14c.2 1.6.6 2 2.2 2.2-1.6.2-2 .6-2.2 2.2-.2-1.6-.6-2-2.2-2.2 1.6-.2 2-.6 2.2-2.2Z" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function ThemeIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M12 4a8 8 0 0 0 0 16Z" fill={color} stroke="none" />
    </Svg>
  );
}

export function FileIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.5 3.4h7L18.6 8.5V19a1.6 1.6 0 0 1-1.6 1.6H6.5A1.6 1.6 0 0 1 4.9 19V5A1.6 1.6 0 0 1 6.5 3.4Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M13.2 3.6v4.6a.6.6 0 0 0 .6.6h4.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="13" x2="14.8" y2="13" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="16" x2="13" y2="16" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function LifeRingIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="12" cy="12" r="3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.2 6.2 9.6 9.6M14.4 14.4l3.4 3.4M17.8 6.2 14.4 9.6M9.6 14.4l-3.4 3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function TrashIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.6 6.4h14.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M9.2 6.4V5a1.4 1.4 0 0 1 1.4-1.4h2.8A1.4 1.4 0 0 1 14.8 5v1.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.4 6.4 7.2 19a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.8-12.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function LogoutIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 4.4H6.6A1.6 1.6 0 0 0 5 6v12a1.6 1.6 0 0 0 1.6 1.6H14" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M17.5 8.5 21 12l-3.5 3.5M20.4 12H10" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function SearchIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15.4" y1="15.4" x2="20" y2="20" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function SettingsIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
    </Svg>
  );
}

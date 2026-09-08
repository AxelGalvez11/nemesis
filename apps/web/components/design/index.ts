// The design system's public surface.
//
// Canonical source: /design/COMPONENTS.md. Feature code imports from here and nowhere else:
// a direct `lucide-react` import or a raw `<button>` is how the 24 font sizes, 26 radii and
// 210 spacing values in /design/ANTI_PATTERNS.md got there in the first place.

export { Text, Heading, TEXT_VARIANTS, TEXT_TONES, type TextVariant, type TextTone } from "./text";
export { Icon, ICON_SIZES, ICON_TONES, ICON_FOR_CONTROL, type IconSize, type IconTone } from "./icon";
export { Button, IconButton, BUTTON_VARIANTS, BUTTON_SIZES, ICON_BUTTON_SIZES, type ButtonVariant, type ButtonSize } from "./button";
export { Surface, Stack, Row, Container, Card, Divider, SPACE, RADII, ELEVATIONS, type Space, type Radius, type Elevation } from "./layout";
export { Input, Textarea, Checkbox, Toggle, SegmentedControl } from "./controls";

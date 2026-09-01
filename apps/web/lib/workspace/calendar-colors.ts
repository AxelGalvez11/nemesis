// Google Calendar's twenty-four CALENDAR colours — a different palette from the
// eleven EVENT colours in event-colors.ts, and Google keeps them apart too.
//
// 🔴 TWO PALETTES IS NOT A MISTAKE TO TIDY UP. In Google, a calendar's colour is
// the default every event on it takes, and an event colour overrides it for one
// event. They are answers to different questions — "what is this calendar" and
// "what is this one thing" — and they have different, deliberately larger and
// smaller, palettes. Collapsing them would mean a synced calendar's colour could
// not be represented, which is the gap this stage exists to close.
//
// The ids and hexes are Google's own, read off `colors.get`'s `calendar` map.

export interface CalendarColor {
  /** Google's own id, "1".."24". A string, because that is what the API sends. */
  id: string;
  name: string;
  hex: string;
}

export const CALENDAR_COLORS: readonly CalendarColor[] = [
  { hex: "#ac725e", id: "1", name: "Cocoa" },
  { hex: "#d06b64", id: "2", name: "Flamingo" },
  { hex: "#f83a22", id: "3", name: "Tomato" },
  { hex: "#fa573c", id: "4", name: "Tangerine" },
  { hex: "#ff7537", id: "5", name: "Pumpkin" },
  { hex: "#ffad46", id: "6", name: "Mango" },
  { hex: "#42d692", id: "7", name: "Eucalyptus" },
  { hex: "#16a765", id: "8", name: "Basil" },
  { hex: "#7bd148", id: "9", name: "Pistachio" },
  { hex: "#b3dc6c", id: "10", name: "Avocado" },
  { hex: "#fbe983", id: "11", name: "Citron" },
  { hex: "#fad165", id: "12", name: "Banana" },
  { hex: "#92e1c0", id: "13", name: "Sage" },
  { hex: "#9fe1e7", id: "14", name: "Peacock" },
  { hex: "#9fc6e7", id: "15", name: "Cobalt" },
  { hex: "#4986e7", id: "16", name: "Blueberry" },
  { hex: "#9a9cff", id: "17", name: "Lavender" },
  { hex: "#b99aff", id: "18", name: "Wisteria" },
  { hex: "#c2c2c2", id: "19", name: "Graphite" },
  { hex: "#cabdbf", id: "20", name: "Birch" },
  { hex: "#cca6ac", id: "21", name: "Beetroot" },
  { hex: "#f691b2", id: "22", name: "Cherry Blossom" },
  { hex: "#cd74e6", id: "23", name: "Grape" },
  { hex: "#a47ae2", id: "24", name: "Amethyst" },
];

const BY_ID = new Map(CALENDAR_COLORS.map((color) => [color.id, color]));

export function calendarColorOf(colorId: string | undefined): CalendarColor | null {
  if (!colorId) return null;
  return BY_ID.get(colorId) ?? null;
}

/**
 * Readable text on a calendar colour.
 *
 * 🔴 COMPUTED, NOT LISTED, BECAUSE THIS PALETTE IS MOSTLY PASTEL. Citron
 * (#fbe983) and Avocado (#b3dc6c) are far too light for white text, and half a
 * dozen others are borderline. Relative luminance per WCAG, with the usual 0.55
 * cut — above it, dark ink; below it, white.
 */
export function inkOn(hex: string): string {
  const value = hex.replace("#", "");
  const channel = (from: number): number => {
    const srgb = parseInt(value.slice(from, from + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

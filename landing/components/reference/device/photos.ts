/**
 * The keyed device photographs: where each file lives, its pixel size, and the screen quad the
 * keying script found (top-left, top-right, bottom-right, bottom-left, bled outward 1.2% of the
 * diagonal so content always tucks under the bezel). Generated from the keying run; do not hand-edit
 * a quad, re-key the photo. Recipe: research/design-references/PHOTO_RECIPE.md.
 */
import type { Quad } from "./DeviceShot";

export interface DevicePhoto {
  src: string;
  size: [number, number];
  quad: Quad;
}

export const DEVICE_PHOTOS: Record<"deskLaptop" | "laptopCards" | "tabletCards" | "phoneNotebook" | "sharedDesk", DevicePhoto> = {
  deskLaptop: { src: "/photos/desk-laptop.webp", size: [2400, 1349], quad: [[576.1, 305.3], [1835.9, 305.3], [1854, 1122.5], [564, 1128.6]] },
  laptopCards: { src: "/photos/laptop-cards.webp", size: [2400, 1340], quad: [[760, 296.2], [1693.9, 290.1], [1700, 873.8], [754, 873.8]] },
  tabletCards: { src: "/photos/tablet-cards.webp", size: [1800, 2234], quad: [[356.9, 324.3], [1389.1, 324.3], [1389.1, 1067.7], [356.9, 1067.7]] },
  phoneNotebook: { src: "/photos/phone-notebook.webp", size: [1800, 2234], quad: [[832.7, 809.9], [1181, 946.4], [691.4, 1584.1], [336.8, 1405.2]] },
  sharedDesk: { src: "/photos/shared-desk.webp", size: [2400, 1610], quad: [[1856.9, 191.3], [2405.8, 319.6], [2403.6, 1002.3], [1733.1, 788.7]] },
};

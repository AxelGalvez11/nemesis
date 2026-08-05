// UTIF ships without TypeScript declarations. Only the surface lib/reader/
// tiff-image.ts uses is declared here.
//
// 🔴 `width` and `height` are OPTIONAL on purpose: UTIF fills them in during
// `decodeImage`, not during `decode`. Before that the size exists only in the
// raw tag arrays (`t256` = ImageWidth, `t257` = ImageLength). Declaring them
// as required would have hidden the bug where every valid TIFF read as
// zero-sized and was refused.
declare module "utif" {
  export interface UtifImage {
    width?: number;
    height?: number;
    /** ImageWidth tag. */
    t256?: ArrayLike<number>;
    /** ImageLength tag. */
    t257?: ArrayLike<number>;
    /** Raw sample data, populated by decodeImage. */
    data?: Uint8Array;
    [tag: string]: unknown;
  }

  /** Parse the image-file directories. Does NOT decode any pixels. */
  export function decode(buffer: ArrayBuffer | Uint8Array): UtifImage[];
  /** Decode one directory's pixels into `image.data`, in place. */
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, image: UtifImage, images?: UtifImage[]): void;
  /** Convert a decoded directory to straight 8-bit RGBA. */
  export function toRGBA8(image: UtifImage): Uint8Array;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
  };
  export default UTIF;
}

/**
 * A real capture of the running product.
 *
 * Light and dark are separate files chosen by `<picture>` media, so the visitor
 * downloads one rather than both. That is also why this is a plain <img> and not
 * next/image: next/image has no way to express "pick the source by colour scheme".
 *
 * 🔴 `media` FOLLOWS THE OPERATING SYSTEM. This is the reason the token layer ships
 * no theme toggle — a control that could disagree with the OS would serve the light
 * capture onto the black page. If a toggle is ever added, these have to become two
 * <img>s swapped by CSS FIRST.
 *
 * Captured from the app's own /dev-preview harness at each device's real viewport
 * (1440x900 and 390x844) and rendered at 2x, so the UI text stays crisp. RE-CAPTURE
 * WHEN THE SURFACE CHANGES — a stale product shot is worse than none, which is how
 * the previous set ended up showing three surfaces that no longer exist.
 */
interface ShotProps {
  name: string;
  alt: string;
  /** Intrinsic pixel size of the file, so the browser reserves the right box. */
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}

export function Shot({ name, alt, width, height, className, priority }: ShotProps) {
  return (
    <picture className={className ? `shot ${className}` : "shot"}>
      <source
        srcSet={`/nemesis/shots/${name}-dark.webp`}
        media="(prefers-color-scheme: dark)"
      />
      <img
        src={`/nemesis/shots/${name}-light.webp`}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}

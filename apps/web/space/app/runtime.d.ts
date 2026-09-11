// Types for the parts of runtime.js the React host uses. The Space frontend itself is plain JavaScript.
export function routeFromPath(pathname: string): string | null;
export function isSpacePath(pathname: string): boolean;
export const space: {
  routeChanged(force?: boolean): void;
};
export function pathFor(route: string): string;
export function setBasePath(base: string): void;

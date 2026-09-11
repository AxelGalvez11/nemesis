// Types for the parts of runtime.js the React host uses. The Space frontend itself is plain JavaScript.
export function routeFromPath(pathname: string): string | null;
export function isSpacePath(pathname: string): boolean;
export const space: {
  lastRoute: string | null;
  routeChanged(force?: boolean): void;
};
export function pathFor(route: string): string;
export function setBasePath(base: string): void;

/** The route the Space frontend last settled on: a page id, 'home', a named route, or '@app' for the React app. */
export function route(): string;

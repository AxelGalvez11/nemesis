// A tiny memory of the last few errors the browser saw, so a support report can carry them
// without the learner having to open the console. Installed once per page load.

const LIMIT = 3;
const ring: string[] = [];
let installed = false;

function remember(text: string): void {
  const line = text.trim().slice(0, 600);
  if (!line) return;
  ring.push(`${new Date().toISOString()} ${line}`);
  while (ring.length > LIMIT) ring.shift();
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function installLastErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      remember(args.map(describe).join(" "));
    } catch {
      /* never break console.error */
    }
    original(...args);
  };

  window.addEventListener("error", (event) => {
    remember(event.message || describe(event.error));
  });
  window.addEventListener("unhandledrejection", (event) => {
    remember(`unhandledrejection: ${describe(event.reason)}`);
  });
}

/** Newest last. Empty when nothing has gone wrong. */
export function lastErrors(): string[] {
  return ring.slice();
}

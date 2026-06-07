import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0,
  });
}

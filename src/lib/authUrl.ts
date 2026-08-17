// Auth.js derives its own public origin from the incoming request. Behind a
// platform proxy that forwards the container's internal address instead of
// the public host — Railway sends `Host: localhost:8080` — that origin
// resolves to a dead URL, and every post-sign-in redirect sends the browser
// to https://localhost:8080. The login itself succeeds; the user just lands
// nowhere, which looks like a broken app.
//
// So pin the origin explicitly whenever the environment can tell us what it
// is. Imported for its side effect by auth.ts and auth.config.ts, both of
// which run before NextAuth reads its configuration.
//
// Precedence: an operator-set AUTH_URL wins; then APP_URL (already used for
// PDF export); then the platform's own public-domain variable.
if (!process.env.AUTH_URL) {
  const fromApp = process.env.APP_URL?.trim();
  const fromPlatform = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const derived =
    fromApp && /^https?:\/\//.test(fromApp)
      ? fromApp
      : fromPlatform
        ? `https://${fromPlatform}`
        : undefined;
  if (derived) process.env.AUTH_URL = derived.replace(/\/+$/, "");
}

export {};

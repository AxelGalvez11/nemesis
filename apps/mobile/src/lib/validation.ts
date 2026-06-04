// Route-param validation shared by the id-keyed screens (/drug/[id], /source/[id]).
// A non-uuid path renders not-found without a wasted authenticated round-trip; the
// RPC's uuid-typed arg + the REVOKE-anon grant are the real barriers behind it.
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

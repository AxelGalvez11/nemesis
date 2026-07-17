// AES-256-GCM decryption for synced library docs (wire format v1 — see
// docs/design/nemesis-phone-sync-format-v1.md in the repo root). Uses @noble/ciphers,
// pure JS, because Hermes ships neither WebCrypto nor Buffer. Deliberately NOT
// Deno-tested: noble's bare npm imports don't resolve under the CI's `deno test`
// sweep, so byte-level interop with the Mac publisher is proven by a test in
// nemesis-desktop-public that encrypts with node:crypto and decrypts with this same
// noble primitive and format constants.
import { gcm } from "@noble/ciphers/aes";
import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils";
import { parseDocJson, type LibraryDoc } from "./library-sync";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** standard base64 (with or without padding) → bytes, null on malformed input. */
export function bytesFromBase64(s: string): Uint8Array | null {
  const trimmed = s.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(trimmed) || trimmed.length % 4 === 1) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of trimmed) {
    buffer = (buffer << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Decrypt one library_documents payload. The row's path_hash is the GCM
 * additional-authenticated-data, so a payload copied onto a different row fails
 * authentication. Returns null on ANY failure (wrong key, tamper, bad shape) —
 * callers surface "can't decrypt, re-pair with your Mac", never a crash. */
export function decryptDoc(key: Uint8Array, pathHash: string, payloadB64: string): LibraryDoc | null {
  const raw = bytesFromBase64(payloadB64);
  if (!raw || raw.length < NONCE_BYTES + TAG_BYTES + 1) return null;
  try {
    const nonce = raw.slice(0, NONCE_BYTES);
    const sealed = raw.slice(NONCE_BYTES);
    const plaintext = gcm(key, nonce, utf8ToBytes(pathHash)).decrypt(sealed);
    return parseDocJson(bytesToUtf8(plaintext));
  } catch {
    return null;
  }
}

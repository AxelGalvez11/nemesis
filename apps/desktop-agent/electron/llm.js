// Minimal DeepSeek client for the desktop agent. Provider-agnostic via env-ish overrides, but defaults
// to DeepSeek. Uses the DURABLE model call — deepseek-v4-flash with thinking disabled — so this app
// does NOT break when the deepseek-chat / deepseek-reasoner aliases retire on 2026-07-24 (same fix as
// the server engine's resolveDeepSeekModel shim). No SDK, no build step: just fetch.

const DEFAULT_BASE_URL = "https://api.deepseek.com";

/**
 * Resolve our internal model name to the durable DeepSeek model + thinking mode at the wire.
 * Mirrors the server engine so behavior matches and survives the alias retirement.
 */
function resolveModel(model, baseUrl) {
  if (!baseUrl.includes("deepseek")) return { model };
  const m = String(model || "").toLowerCase();
  if (m === "deepseek-chat" || m === "" || m.includes("v4-flash")) {
    return { model: "deepseek-v4-flash", thinking: { type: "disabled" } };
  }
  if (m === "deepseek-reasoner") return { model: "deepseek-v4-flash", thinking: { type: "enabled" } };
  return { model };
}

/**
 * Ask the model for a single JSON object and return it parsed. Uses response_format json_object so the
 * reply is machine-readable. Retries once on a transient failure or unparseable body. Never throws a raw
 * network error to the caller — wraps it in a clear message.
 * @param {{ apiKey: string, system: string, user: string, baseUrl?: string, model?: string, maxTokens?: number }} opts
 * @returns {Promise<any>} parsed JSON object
 */
async function generateJson(opts) {
  const baseUrl = opts.baseUrl || DEFAULT_BASE_URL;
  const resolved = resolveModel(opts.model || "deepseek-v4-flash", baseUrl);
  const body = {
    model: resolved.model,
    max_tokens: opts.maxTokens || 4096,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (resolved.thinking) body.thinking = resolved.thinking;

  let lastErr = "no attempts";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = `network error: ${e && e.message ? e.message : String(e)}`;
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastErr = `API ${res.status}: ${text.slice(0, 300)}`;
      // 401/400 won't fix themselves on retry — surface immediately.
      if (res.status === 401 || res.status === 400) break;
      continue;
    }
    const data = await res.json().catch(() => null);
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";
    const parsed = tryParseJson(content);
    if (parsed) return parsed;
    lastErr = `model returned unparseable JSON (len=${(content || "").length})`;
  }
  throw new Error(`generation failed: ${lastErr}`);
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    // recover an object embedded in prose/fences
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

/** Cheap credential check without spending real generation tokens. */
async function checkKey(apiKey, baseUrl) {
  const url = `${baseUrl || DEFAULT_BASE_URL}/user/balance`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) return { ok: true };
    return { ok: false, reason: `key check failed (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, reason: `key check failed: ${e && e.message ? e.message : String(e)}` };
  }
}

module.exports = { generateJson, checkKey, resolveModel, DEFAULT_BASE_URL };

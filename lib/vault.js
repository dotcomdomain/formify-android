// Customer profiles are encrypted with AES-GCM before they reach the database.
// The key lives in the PROFILE_KEY secret, never in code or the database.

let keyPromise;
function key(env) {
  if (!env.PROFILE_KEY) throw new Error("PROFILE_KEY secret is not set");
  keyPromise ??= crypto.subtle.importKey("raw", Uint8Array.from(atob(env.PROFILE_KEY), (c) => c.charCodeAt(0)), "AES-GCM", false, ["encrypt", "decrypt"]);
  return keyPromise;
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));

export async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), new TextEncoder().encode(JSON.stringify(obj))));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function open(env, sealed) {
  if (!sealed) return {};
  const [iv, ct] = sealed.split(".").map((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(env), ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

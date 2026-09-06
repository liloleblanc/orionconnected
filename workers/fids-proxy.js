var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/fids-proxy.js — v219
// Single canonical worker. Implements: ADB proxy, AI city/hotel backgrounds,
// destination info, airport-config + airline-override + media-config/library.
//
// REQUIRED env / secrets (set via `wrangler secret put`):
//   ADB_KEY                — RapidAPI key for aerodatabox.p.rapidapi.com
//   NINJAS_KEY             — api-ninjas.com X-Api-Key (airline logos)
//   ACCOR_KEY              — secure.accor.com apikey (public bookings lookup)
//   JWT_SECRET             — HMAC secret for signing FIDS JWTs
//   SEED_ADMIN_PASSWORD    — initial admin password used by seedAdmin()
//                            (if absent, a random UUID is used — log in via
//                             KV-set hash or re-seed by deleting the user)
//   ADB_WEBHOOK_SECRET     — optional, for ADB webhook signature checks
//   TIO_KEY                — Tomorrow.io API key (weather)
//   VECTEEZY_TOKEN         — optional, Vecteezy API bearer token (stock search/import)
//   VECTEEZY_ACCOUNT_ID    — optional, Vecteezy account id (V2 URL path segment)
//
// REQUIRED bindings (CORRECTED 2026-08-15 — see docs/OPERATIONS-BRIEF.md):
//   FIDS_USERS         KV — users, airport config, airline overrides, media
//   FIDS_LIVE_FLIGHTS  KV — webhook flight cache (36h TTL)
//   CITY_BG_CACHE      KV — AI backgrounds + destination info
//   FIDS_ASSETS        R2 — logos and uploaded media
//   AI                    — Workers AI
//
// The previous version of this comment listed FIDS_AIRPORT_CONFIG and
// FIDS_MEDIA, NEITHER OF WHICH EXISTS — the code never references them, and
// everything goes into FIDS_USERS. It also omitted FIDS_LIVE_FLIGHTS, which IS
// used. Deploying from that list bound two phantom namespaces and missed a real
// one, which is part of why this worker had no committed deploy config for so
// long. The authoritative config is now workers/wrangler.fids-proxy.jsonc.
//
// TIO_KEY is also listed below but no longer used — weather comes from
// open-meteo, which needs no key.

// ── PASSWORDS ─────────────────────────────────────────────────────────────
// v23169. What was here was a bare SHA-256 of the password: no salt, no
// iterations. SHA-256 is built to be FAST, which is precisely wrong for a
// password — it is brute-forceable at enormous rates on commodity hardware —
// and with no salt, two accounts sharing a password share a hash, so cracking
// one reveals every other. That was tolerable with four internal accounts. It
// is not tolerable once airline and airport staff have logins, which is the
// direction this system is going.
//
// Now PBKDF2-SHA256 with a random 16-byte salt per user. Iterations are stored
// ALONGSIDE the hash rather than hardcoded at the comparison site, so the count
// can be raised later without invalidating existing passwords.
//
// NOBODY IS LOCKED OUT. Legacy records are still verified with the old scheme,
// and a successful legacy login transparently re-hashes and saves in the new
// format — so accounts migrate as people sign in, with no forced reset and no
// admin intervention. hashPassword() is kept solely to verify those legacy
// records and must never be used to CREATE one again.
const PBKDF2_ITERATIONS = 210000;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}
__name(hashPassword, "hashPassword");

function randomSaltB64() {
  const s = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...s));
}
__name(randomSaltB64, "randomSaltB64");

async function pbkdf2Hash(password, saltB64, iterations) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
__name(pbkdf2Hash, "pbkdf2Hash");

// Build the stored credential for a NEW or CHANGED password.
async function makePasswordRecord(password) {
  const salt = randomSaltB64();
  return {
    alg: "pbkdf2-sha256",
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS)
  };
}
__name(makePasswordRecord, "makePasswordRecord");

// Length-independent, value-independent comparison. A plain !== leaks how many
// leading characters matched via timing; irrelevant for most attackers but free
// to avoid.
function safeEqual(a, b) {
  const x = String(a || ""), y = String(b || "");
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}
__name(safeEqual, "safeEqual");

// Returns "ok" (modern hash matched), "upgrade" (legacy hash matched — caller
// should re-save in the new format), or "no".
async function verifyPassword(user, password) {
  if (user && user.password && user.password.alg === "pbkdf2-sha256") {
    const h = await pbkdf2Hash(password, user.password.salt, user.password.iterations);
    return safeEqual(h, user.password.hash) ? "ok" : "no";
  }
  if (user && user.passwordHash) {
    return safeEqual(await hashPassword(password), user.passwordHash) ? "upgrade" : "no";
  }
  return "no";
}
__name(verifyPassword, "verifyPassword");
async function createJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1e3);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 86400
    // 24 hours
  };
  const encode = /* @__PURE__ */ __name((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "encode");
  const headerB64 = encode(header);
  const payloadB64 = encode(fullPayload);
  const message = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${message}.${sigB64}`;
}
__name(createJwt, "createJwt");
async function verifyJwt(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const message = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigStr = parts[2].replace(/-/g, "+").replace(/_/g, "/");
    const sigPadded = sigStr + "=".repeat((4 - sigStr.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(message));
    if (!valid) return null;
    const payloadStr = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadPadded = payloadStr + "=".repeat((4 - payloadStr.length % 4) % 4);
    const payload = JSON.parse(atob(payloadPadded));
    if (payload.exp && Date.now() / 1e3 > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
__name(verifyJwt, "verifyJwt");
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin)
    }
  });
}
__name(jsonResponse, "jsonResponse");
async function getUser(env, username) {
  const data = await env.FIDS_USERS.get(`user:${username}`);
  return data ? JSON.parse(data) : null;
}
__name(getUser, "getUser");
async function saveUser(env, username, userData) {
  await env.FIDS_USERS.put(`user:${username}`, JSON.stringify(userData));
}
__name(saveUser, "saveUser");
async function deleteUserKV(env, username) {
  await env.FIDS_USERS.delete(`user:${username}`);
}
__name(deleteUserKV, "deleteUserKV");
async function listAllUsers(env) {
  const list = await env.FIDS_USERS.list({ prefix: "user:" });
  const users = [];
  for (const key of list.keys) {
    const data = await env.FIDS_USERS.get(key.name);
    if (data) {
      const user = JSON.parse(data);
      users.push({
        username: key.name.replace("user:", ""),
        role: user.role,
        displayName: user.displayName,
        createdAt: user.createdAt
      });
    }
  }
  return users;
}
__name(listAllUsers, "listAllUsers");
async function seedAdmin(env) {
  const existing = await getUser(env, "admin");
  if (!existing) {
    await saveUser(env, "admin", {
      password: await makePasswordRecord(env.SEED_ADMIN_PASSWORD || crypto.randomUUID()),
      role: "admin",
      displayName: "Administrator",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log("[FIDS] Seeded default admin user");
  }
}
__name(seedAdmin, "seedAdmin");
async function handleLogin(request, env, origin) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return jsonResponse({ error: "Username and password required" }, 400, origin);
  }
  const user = await getUser(env, username.toLowerCase());
  if (!user) {
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }
  const verdict = await verifyPassword(user, password);
  if (verdict === "no") {
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
  }
  // v23169 — a correct password stored under the old unsalted SHA-256 scheme is
  // re-hashed with PBKDF2 and saved here. Accounts migrate as people sign in;
  // nobody is reset, and the legacy field is removed so it cannot be used again.
  if (verdict === "upgrade") {
    try {
      user.password = await makePasswordRecord(password);
      delete user.passwordHash;
      await saveUser(env, username.toLowerCase(), user);
    } catch (e) { /* login still succeeds — the upgrade retries next sign-in */ }
  }
  const token = await createJwt({
    sub: username.toLowerCase(),
    role: user.role,
    name: user.displayName
  }, env.JWT_SECRET);
  return jsonResponse({
    token,
    user: {
      username: username.toLowerCase(),
      role: user.role,
      displayName: user.displayName
    }
  }, 200, origin);
}
__name(handleLogin, "handleLogin");
async function handleListUsers(request, env, payload, origin) {
  if (payload.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403, origin);
  }
  const users = await listAllUsers(env);
  return jsonResponse({ users }, 200, origin);
}
__name(handleListUsers, "handleListUsers");
async function handleCreateUser(request, env, payload, origin) {
  if (payload.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403, origin);
  }
  const { username, password, role, displayName } = await request.json();
  if (!username || !password || !role) {
    return jsonResponse({ error: "username, password, and role required" }, 400, origin);
  }
  const validRoles = ["admin", "operator", "viewer"];
  if (!validRoles.includes(role)) {
    return jsonResponse({ error: `Invalid role. Must be: ${validRoles.join(", ")}` }, 400, origin);
  }
  const existing = await getUser(env, username.toLowerCase());
  if (existing) {
    return jsonResponse({ error: "User already exists" }, 409, origin);
  }
  await saveUser(env, username.toLowerCase(), {
    password: await makePasswordRecord(password),
    role,
    displayName: displayName || username,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return jsonResponse({
    success: true,
    user: { username: username.toLowerCase(), role, displayName: displayName || username }
  }, 201, origin);
}
__name(handleCreateUser, "handleCreateUser");
async function handleUpdateUser(request, env, payload, origin, username) {
  if (payload.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403, origin);
  }
  const user = await getUser(env, username);
  if (!user) {
    return jsonResponse({ error: "User not found" }, 404, origin);
  }
  const updates = await request.json();
  if (updates.password) {
    user.password = await makePasswordRecord(updates.password);
    delete user.passwordHash;   // v23169 — never leave the weak hash behind
  }
  if (updates.role) {
    const validRoles = ["admin", "operator", "viewer"];
    if (!validRoles.includes(updates.role)) {
      return jsonResponse({ error: "Invalid role" }, 400, origin);
    }
    user.role = updates.role;
  }
  if (updates.displayName) {
    user.displayName = updates.displayName;
  }
  await saveUser(env, username, user);
  return jsonResponse({ success: true }, 200, origin);
}
__name(handleUpdateUser, "handleUpdateUser");
async function handleDeleteUser(request, env, payload, origin, username) {
  if (payload.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403, origin);
  }
  if (username === payload.sub) {
    return jsonResponse({ error: "Cannot delete yourself" }, 400, origin);
  }
  await deleteUserKV(env, username);
  return jsonResponse({ success: true }, 200, origin);
}
__name(handleDeleteUser, "handleDeleteUser");
async function handleApiProxy(request, env, url, origin) {
  const adbPath = url.pathname.replace("/api/adb/", "");
  const adbUrl = `https://aerodatabox.p.rapidapi.com/${adbPath}${url.search}`;
  try {
    const response = await fetch(adbUrl, {
      headers: {
        "X-RapidAPI-Key": env.ADB_KEY,
        "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
      }
    });
    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, max-age=60",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse({ error: "API proxy failed", details: e.message }, 502, origin);
  }
}
__name(handleApiProxy, "handleApiProxy");

// ════════════════════════════════════════════════════════════════════
// NEW IN v10.0: Airport configuration + airline override handlers
// ════════════════════════════════════════════════════════════════════
const R2_PUBLIC_BASE = "https://pub-e392224bda1a4096843ed05df504ca91.r2.dev";

function isAdmin(payload) { return payload && payload.role === "admin"; }
__name(isAdmin, "isAdmin");
// ── OPS GUARD ─────────────────────────────────────────────────────────────
// Destructive maintenance routes live OUTSIDE the `/api/` auth gate, because
// that gate is a path-prefix opt-in rather than default-deny. Four of them were
// reachable with no credentials at all: the cache wipe, the credit refill, the
// webhook delete and the cached-flight delete. Two neighbours in the same block
// (/webhook/flight and /subscriptions/create-yqm) already gate on
// ADB_WEBHOOK_SECRET, so this reuses that established pattern rather than
// inventing a second scheme.
// NOTE: this is a stopgap for the specific destructive routes. The structural
// fix is to make the router default-deny with an explicit public allowlist, so
// that a route added outside /api/ is not public by construction.
function requireOpsSecret(url, env, origin) {
  const expected = (env.ADB_WEBHOOK_SECRET || "").trim();
  if (!expected) return jsonResponse({ error: "Ops secret not configured" }, 500, origin);
  const provided = (url.searchParams.get("secret") || "").trim();
  if (provided !== expected) return jsonResponse({ error: "Unauthorized" }, 401, origin);
  return null;
}
__name(isAdmin, "isAdmin");

function normIata(code) { return (code || "").toUpperCase().trim().slice(0, 4); }
__name(normIata, "normIata");

function extFromContentType(ct) {
  if (!ct) return "png";
  ct = ct.toLowerCase();
  // Video types — for the new media library uploads
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  // Image types
  if (ct.includes("svg")) return "svg";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "png";
}
__name(extFromContentType, "extFromContentType");

async function handleListAirports(env, origin) {
  const list = await env.FIDS_USERS.list({ prefix: "airport:" });
  const airports = [];
  for (const k of list.keys) {
    const data = await env.FIDS_USERS.get(k.name);
    if (data) {
      try {
        const cfg = JSON.parse(data);
        airports.push({
          code: k.name.replace("airport:", ""),
          displayName: cfg.displayName || "",
          longName: cfg.longName || "",
          hasLogo: !!(cfg.logo && cfg.logo.url),
          updatedAt: cfg.updatedAt || null
        });
      } catch (e) {}
    }
  }
  return jsonResponse({ airports }, 200, origin);
}
__name(handleListAirports, "handleListAirports");

async function handleGetAirport(env, origin, code) {
  const data = await env.FIDS_USERS.get(`airport:${normIata(code)}`);
  if (!data) return jsonResponse({ error: "Not configured" }, 404, origin);
  try { return jsonResponse(JSON.parse(data), 200, origin); }
  catch (e) { return jsonResponse({ error: "Corrupt config" }, 500, origin); }
}
__name(handleGetAirport, "handleGetAirport");

async function handlePutAirport(request, env, payload, origin, code) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const body = await request.json();
  const norm = normIata(code);
  const existing = await env.FIDS_USERS.get(`airport:${norm}`);
  let cfg = existing ? JSON.parse(existing) : {};
  // v23174 additions — the rest of the customise surface. This list matches
  // the worker deployed by hand on 2026-08-18 (read back from the dashboard);
  // dropping any of these silently loses operator customizations on save.
  const fields = [
    "displayName", "longName", "logo", "theme", "hideAirlinePrefix", "hideWeather", "airlineStyle",
    "customColors",   // the resolved palette (NOT a preset id)
    "presetName",     // what the operator called it, for the console
    "font",
    "customFonts",
    "langs",
    "logoPosition",
    "logoSize",
    "displayMode",    // auto | light | dark
    "gateBlocks",     // order + on/off of the gate screen blocks
    "tickerMessage"
  ];
  for (const f of fields) { if (body[f] !== undefined) cfg[f] = body[f]; }
  cfg.updatedAt = Date.now();
  cfg.updatedBy = payload.sub;
  await env.FIDS_USERS.put(`airport:${norm}`, JSON.stringify(cfg));
  return jsonResponse({ success: true, config: cfg }, 200, origin);
}
__name(handlePutAirport, "handlePutAirport");

async function handleDeleteAirport(env, payload, origin, code) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const norm = normIata(code);
  try {
    const existing = await env.FIDS_USERS.get(`airport:${norm}`);
    if (existing) {
      const cfg = JSON.parse(existing);
      if (cfg.logo && cfg.logo.r2Key) {
        try { await env.FIDS_ASSETS.delete(cfg.logo.r2Key); } catch (e) {}
      }
    }
  } catch (e) {}
  await env.FIDS_USERS.delete(`airport:${norm}`);
  return jsonResponse({ success: true }, 200, origin);
}
__name(handleDeleteAirport, "handleDeleteAirport");

// ── Media config: airline videos, ads, photos. Single global doc keyed by
// "media-config". Schema: { airlines: {AC: {videos:[], adImages:[]}, ...},
// global: {...}, updatedAt, updatedBy }. Public read (no auth), admin write.
async function handleGetMediaConfig(env, origin) {
  const data = await env.FIDS_USERS.get("media-config");
  if (!data) {
    // No config yet — return empty skeleton instead of 404 so callers can
    // safely merge defaults without special-casing missing data.
    return jsonResponse({ airlines: {}, global: {}, updatedAt: null }, 200, origin);
  }
  try { return jsonResponse(JSON.parse(data), 200, origin); }
  catch (e) { return jsonResponse({ error: "Corrupt media config" }, 500, origin); }
}
__name(handleGetMediaConfig, "handleGetMediaConfig");

async function handlePutMediaConfig(request, env, payload, origin) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const body = await request.json();
  // Validate top-level shape — must have airlines or global object
  if (typeof body !== "object" || body === null) {
    return jsonResponse({ error: "Body must be an object" }, 400, origin);
  }
  const cfg = {
    airlines: body.airlines && typeof body.airlines === "object" ? body.airlines : {},
    global: body.global && typeof body.global === "object" ? body.global : {},
    updatedAt: Date.now(),
    updatedBy: payload.sub || "admin"
  };
  await env.FIDS_USERS.put("media-config", JSON.stringify(cfg));
  return jsonResponse({ success: true, config: cfg }, 200, origin);
}
__name(handlePutMediaConfig, "handlePutMediaConfig");

// ── Media LIBRARY: a flat list of all uploaded files + YouTube refs.
// Single doc keyed by "media-library", admin writes only. Items have
// shape { id, type, source, ytType?, ytId?, r2Key?, url?, mimeType?,
// sizeBytes?, label, uploadedAt, uploadedBy }. The id is a uuid the
// admin assigns library items to airlines via the assignments doc.
async function handleGetMediaLibrary(env, origin) {
  const data = await env.FIDS_USERS.get("media-library");
  if (!data) return jsonResponse({ items: [], updatedAt: null }, 200, origin);
  try { return jsonResponse(JSON.parse(data), 200, origin); }
  catch (e) { return jsonResponse({ error: "Corrupt library" }, 500, origin); }
}
__name(handleGetMediaLibrary, "handleGetMediaLibrary");

// Admin-only — append a YouTube reference (no upload, just metadata).
// Body: { ytType: 'video'|'playlist', ytId: '...', label: '...' }
async function handleAddYouTubeLibraryItem(request, env, payload, origin) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const body = await request.json();
  if (!body || (body.ytType !== "video" && body.ytType !== "playlist") || !body.ytId) {
    return jsonResponse({ error: "ytType ('video'|'playlist') and ytId required" }, 400, origin);
  }
  const existing = await env.FIDS_USERS.get("media-library");
  const lib = existing ? JSON.parse(existing) : { items: [] };
  if (!Array.isArray(lib.items)) lib.items = [];
  const item = {
    id: crypto.randomUUID(),
    type: "video",
    category: "ads",
    source: "youtube",
    ytType: body.ytType,
    ytId: String(body.ytId).trim(),
    label: String(body.label || "").trim(),
    uploadedAt: Date.now(),
    uploadedBy: payload.sub || "admin"
  };
  lib.items.push(item);
  lib.updatedAt = Date.now();
  await env.FIDS_USERS.put("media-library", JSON.stringify(lib));
  return jsonResponse({ success: true, item, library: lib }, 200, origin);
}
__name(handleAddYouTubeLibraryItem, "handleAddYouTubeLibraryItem");

// Admin-only — update a library item's editable fields (label, playback
// settings). Body keys: { label?, playback?: { loop, duration } }.
// Source/type/id can't be changed; delete + re-add for that.
async function handlePatchLibraryItem(request, env, payload, origin, itemId) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const body = await request.json();
  const existing = await env.FIDS_USERS.get("media-library");
  if (!existing) return jsonResponse({ error: "Library is empty" }, 404, origin);
  let lib;
  try { lib = JSON.parse(existing); } catch (e) { return jsonResponse({ error: "Corrupt library" }, 500, origin); }
  if (!Array.isArray(lib.items)) lib.items = [];
  const idx = lib.items.findIndex(x => x.id === itemId);
  if (idx < 0) return jsonResponse({ error: "Item not found" }, 404, origin);
  const item = lib.items[idx];
  // Update only known fields; ignore everything else
  if (typeof body.label === "string") item.label = body.label.trim();
  // v218.99.14 — allow category changes via PATCH
  if (typeof body.category === "string") {
    const ALLOWED = ["ads", "airport-logo", "airline-logo", "background"];
    if (ALLOWED.includes(body.category)) item.category = body.category;
  }
  if (body.playback && typeof body.playback === "object") {
    if (!item.playback) item.playback = {};
    if (typeof body.playback.loop === "boolean") item.playback.loop = body.playback.loop;
    if (typeof body.playback.duration === "string" || typeof body.playback.duration === "number") {
      item.playback.duration = body.playback.duration;
    }
  }
  item.updatedAt = Date.now();
  lib.updatedAt = Date.now();
  await env.FIDS_USERS.put("media-library", JSON.stringify(lib));
  return jsonResponse({ success: true, item, library: lib }, 200, origin);
}
__name(handlePatchLibraryItem, "handlePatchLibraryItem");

// Admin-only — upload a binary file (video or image) to R2 and add to
// library. Body is the raw file bytes; query params hold metadata:
//   ?label=... — display label
//   ?type=video|image — what kind (used for filtering in the UI)
async function handleUploadLibraryItem(request, env, payload, origin, url) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const ct = request.headers.get("Content-Type") || "";
  const fileExt = extFromContentType(ct);
  const isVideo = /mp4|webm|mov|quicktime/i.test(ct);
  const type = isVideo ? "video" : "image";
  const id = crypto.randomUUID();
  const r2Key = `media-library/${id}.${fileExt}`;
  const label = url.searchParams.get("label") || "";
  // v218.99.14 — categories let the same library serve different
  // surfaces (ads/slides, airport-logo, airline-logo, background).
  const ALLOWED_CATEGORIES = ["ads", "airport-logo", "airline-logo", "background"];
  const rawCategory = url.searchParams.get("category") || "ads";
  const category = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : "ads";
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return jsonResponse({ error: "Empty body" }, 400, origin);
    const maxBytes = isVideo ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
    if (body.byteLength > maxBytes) {
      return jsonResponse({ error: `File too large (max ${maxBytes / 1024 / 1024}MB)` }, 413, origin);
    }
    await env.FIDS_ASSETS.put(r2Key, body, { httpMetadata: { contentType: ct } });
    const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}`;
    const item = {
      id,
      type,
      category,
      source: "upload",
      r2Key,
      url: publicUrl,
      mimeType: ct,
      sizeBytes: body.byteLength,
      label,
      uploadedAt: Date.now(),
      uploadedBy: payload.sub || "admin"
    };
    const existing = await env.FIDS_USERS.get("media-library");
    const lib = existing ? JSON.parse(existing) : { items: [] };
    if (!Array.isArray(lib.items)) lib.items = [];
    lib.items.push(item);
    lib.updatedAt = Date.now();
    await env.FIDS_USERS.put("media-library", JSON.stringify(lib));
    return jsonResponse({ success: true, item, library: lib }, 200, origin);
  } catch (e) {
    return jsonResponse({ error: "Upload failed", details: e.message }, 500, origin);
  }
}
__name(handleUploadLibraryItem, "handleUploadLibraryItem");

// Admin-only — delete an item from the library. Removes the R2 object
// (if any) and removes the item from any assignments referencing it.
async function handleDeleteLibraryItem(env, payload, origin, itemId) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const existing = await env.FIDS_USERS.get("media-library");
  if (!existing) return jsonResponse({ error: "Library is empty" }, 404, origin);
  let lib;
  try { lib = JSON.parse(existing); } catch (e) { return jsonResponse({ error: "Corrupt library" }, 500, origin); }
  if (!Array.isArray(lib.items)) lib.items = [];
  const idx = lib.items.findIndex(x => x.id === itemId);
  if (idx < 0) return jsonResponse({ error: "Item not found" }, 404, origin);
  const item = lib.items[idx];
  // Remove R2 object if it was an upload
  if (item.r2Key) {
    try { await env.FIDS_ASSETS.delete(item.r2Key); } catch (e) {}
  }
  lib.items.splice(idx, 1);
  lib.updatedAt = Date.now();
  await env.FIDS_USERS.put("media-library", JSON.stringify(lib));
  // Also strip references from assignments
  const assignRaw = await env.FIDS_USERS.get("media-assignments");
  if (assignRaw) {
    try {
      const assign = JSON.parse(assignRaw);
      if (assign.airlines) {
        for (const code of Object.keys(assign.airlines)) {
          const ent = assign.airlines[code];
          ["videos", "images"].forEach(slot => {
            if (ent[slot] && Array.isArray(ent[slot].itemIds)) {
              ent[slot].itemIds = ent[slot].itemIds.filter(x => x !== itemId);
              if (ent[slot].primaryId === itemId) ent[slot].primaryId = ent[slot].itemIds[0] || null;
            }
          });
        }
      }
      assign.updatedAt = Date.now();
      await env.FIDS_USERS.put("media-assignments", JSON.stringify(assign));
    } catch (e) {}
  }
  return jsonResponse({ success: true, library: lib }, 200, origin);
}
__name(handleDeleteLibraryItem, "handleDeleteLibraryItem");

// ── Media ASSIGNMENTS: maps each airline to library item ids + a
// rotation mode. Public read so gate displays can resolve which items
// to play; admin write only.
async function handleGetMediaAssignments(env, origin) {
  const data = await env.FIDS_USERS.get("media-assignments");
  if (!data) return jsonResponse({ airlines: {}, updatedAt: null }, 200, origin);
  try { return jsonResponse(JSON.parse(data), 200, origin); }
  catch (e) { return jsonResponse({ error: "Corrupt assignments" }, 500, origin); }
}
__name(handleGetMediaAssignments, "handleGetMediaAssignments");

async function handlePutMediaAssignments(request, env, payload, origin) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const body = await request.json();
  if (typeof body !== "object" || body === null) {
    return jsonResponse({ error: "Body must be an object" }, 400, origin);
  }
  const cfg = {
    airlines: body.airlines && typeof body.airlines === "object" ? body.airlines : {},
    updatedAt: Date.now(),
    updatedBy: payload.sub || "admin"
  };
  await env.FIDS_USERS.put("media-assignments", JSON.stringify(cfg));
  return jsonResponse({ success: true, config: cfg }, 200, origin);
}
__name(handlePutMediaAssignments, "handlePutMediaAssignments");

// ── VECTEEZY stock media (https://api.vecteezy.com/api-docs/api/v2/swagger.json)
// Search-and-import for royalty-free stock straight into the media library:
//   GET  /api/vecteezy/search — proxy of Vecteezy's resources search
//   POST /api/vecteezy/import — resolve a download URL, copy the file into
//                               R2 and append a "media-library" item
// Both admin-only; credentials stay server-side. Vecteezy's docs say
// thumbnail/preview URLs must not be stored — search results are therefore
// never cached, and import copies the actual file into R2 rather than
// referencing their CDN.
//
// SINGLE UPSTREAM: the official V2 API only (api.vecteezy.com/v2/{account_id}).
// A RapidAPI fallback route existed briefly on 2026-08-18 but Vecteezy does
// not support it (their gateway only fronts the retired V1, and the account
// is V2-only), so it was removed the same day. The VECTEEZY_RAPIDAPI_KEY
// secret, if still present on the worker, is ignored.
//
// KNOWN BLOCKER, live-tested repeatedly on 2026-08-18: Vecteezy's Cloudflare
// WAF rejects Worker subrequests to api.vecteezy.com outright (403, "error
// code: 1106" — the banned-client family) BEFORE auth, regardless of headers
// (api-client UA, full browser header set, and bare-bearer all block
// identically; cf-ray ids were captured for their support). Until Vecteezy
// adds a firewall exception, every call below returns that 403.
const VECTEEZY_CONTENT_TYPES = ["photo", "png", "psd", "svg", "vector", "video"];

function vecteezyRoutes(env) {
  const token = (env.VECTEEZY_TOKEN || "").trim();
  const accountId = (env.VECTEEZY_ACCOUNT_ID || "").trim();
  if (!token || !accountId) return [];
  return [{ name: "direct", token, base: `https://api.vecteezy.com/v2/${accountId}` }];
}
__name(vecteezyRoutes, "vecteezyRoutes");

// Fetch pathAndQuery (e.g. "/resources?term=…") against the configured route.
// Returns { r, cfg } on success, { errStatus, errBody, cfg } otherwise.
// (Kept route-shaped so a second upstream can be re-added without touching
// the handlers.)
async function vecteezyFetch(env, pathAndQuery) {
  const routes = vecteezyRoutes(env);
  if (!routes.length) return { unconfigured: true };
  let last = null;
  for (const cfg of routes) {
    try {
      const r = await fetch(`${cfg.base}${pathAndQuery}`, { headers: vecteezyHeaders(cfg) });
      if (r.ok) return { r, cfg };
      const body = (await r.text().catch(() => "")).slice(0, 500);
      last = { errStatus: r.status, errBody: body, cfg };
    } catch (e) {
      last = { errStatus: 0, errBody: String(e && e.message).slice(0, 200), cfg };
    }
  }
  return last || { unconfigured: true };
}
__name(vecteezyFetch, "vecteezyFetch");

function vecteezyHeaders(cfg) {
  return {
    "Authorization": `Bearer ${cfg.token}`,
    "Accept": "application/json",
    "User-Agent": "OrionConnected-FIDS/1.0 (Cloudflare Worker; +https://fids.orionconnected.com)"
  };
}
__name(vecteezyHeaders, "vecteezyHeaders");


async function handleVecteezySearch(env, payload, origin, url) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  if (!vecteezyRoutes(env).length) {
    return jsonResponse({
      error: "Vecteezy not configured",
      hint: "set the VECTEEZY_TOKEN and VECTEEZY_ACCOUNT_ID worker secrets"
    }, 503, origin);
  }
  const term = (url.searchParams.get("term") || "").trim();
  if (!term) return jsonResponse({ error: "term parameter required" }, 400, origin);
  const contentType = url.searchParams.get("content_type") || "video";
  if (!VECTEEZY_CONTENT_TYPES.includes(contentType)) {
    return jsonResponse({ error: `content_type must be one of: ${VECTEEZY_CONTENT_TYPES.join(", ")}` }, 400, origin);
  }
  const q = new URLSearchParams();
  q.set("term", term);
  q.set("content_type", contentType);
  // Optional filters, passed through as-is. page * per_page is capped at
  // 10,000 by Vecteezy; bad values come back as their 4xx, not ours.
  for (const p of ["page", "per_page", "sort_by", "license_type", "orientation", "color", "duration", "ai_generated", "family_friendly"]) {
    const v = url.searchParams.get(p);
    if (v !== null && v !== "") q.set(p, v);
  }
  try {
    const res = await vecteezyFetch(env, `/resources?${q.toString()}`);
    if (!res.r) {
      return jsonResponse({
        error: "Vecteezy search failed",
        status: res.errStatus,
        route: res.cfg ? res.cfg.name : null,
        detail: (res.errBody || "").slice(0, 300)
      }, 502, origin);
    }
    const j = await res.r.json();
    // Slim each resource to what the menu UI renders. Preview/thumbnail
    // URLs are short-lived — used immediately, never persisted.
    const resources = (Array.isArray(j.resources) ? j.resources : []).map((res) => ({
      id: res.id,
      contentType: res.content_type,
      title: res.title || "",
      thumbnailUrl: res.thumbnail_url || "",
      thumbnail2xUrl: res.thumbnail_2x_url || "",
      previewUrl: res.preview_url || "",
      dimensions: res.dimensions || null
    }));
    return jsonResponse({
      page: j.page,
      lastPage: j.last_page,
      perPage: j.per_page,
      totalResources: j.total_resources,
      resources
    }, 200, origin);
  } catch (e) {
    return jsonResponse({ error: "Vecteezy search failed", details: e.message }, 502, origin);
  }
}
__name(handleVecteezySearch, "handleVecteezySearch");

// Body: { id, label?, category?, contentTypeHint? }. The download endpoint
// either returns a ready URL or a download_status_url to poll while Vecteezy
// prepares the file — both paths are handled here so the menu makes exactly
// one call and gets back a normal library item.
async function handleVecteezyImport(request, env, payload, origin) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  if (!vecteezyRoutes(env).length) {
    return jsonResponse({
      error: "Vecteezy not configured",
      hint: "set the VECTEEZY_TOKEN and VECTEEZY_ACCOUNT_ID worker secrets"
    }, 503, origin);
  }
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  const resId = body && /^\d+$/.test(String(body.id || "")) ? String(body.id) : "";
  if (!resId) return jsonResponse({ error: "Numeric Vecteezy resource id required" }, 400, origin);
  const label = String((body && body.label) || "").trim();
  const ALLOWED_CATEGORIES = ["ads", "airport-logo", "airline-logo", "background"];
  const category = ALLOWED_CATEGORIES.includes(body && body.category) ? body.category : "ads";
  const hintVideo = (body && body.contentTypeHint) === "video";
  try {
    const dl = await vecteezyFetch(env, `/resources/${resId}/download`);
    if (!dl.r) {
      return jsonResponse({
        error: "Vecteezy download request failed",
        status: dl.errStatus,
        route: dl.cfg ? dl.cfg.name : null,
        detail: (dl.errBody || "").slice(0, 300)
      }, 502, origin);
    }
    // Stick to the route that answered for the rest of this import.
    const cfg = dl.cfg;
    const auth = vecteezyHeaders(cfg);
    const info = await dl.r.json();
    let fileUrl = info.url || "";
    let requiresAttribution = !!info.requires_attribution;
    let attributionUrl = info.required_attribution_url || null;
    if (!fileUrl && info.download_status_url) {
      // The API returns an absolute status URL on api.vecteezy.com, which the
      // WAF blocks from Workers — poll the same endpoint through cfg.base
      // instead, preserving any query string the returned URL carried.
      let statusUrl = `${cfg.base}/resources/${resId}/download_status`;
      try {
        const q = new URL(info.download_status_url).search;
        if (q) statusUrl += q;
      } catch (e) {}
      for (let i = 0; i < 10 && !fileUrl; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const st = await fetch(statusUrl, { headers: auth });
        if (!st.ok) break;
        const sj = await st.json().catch(() => null);
        if (sj && sj.url) {
          fileUrl = sj.url;
          if (typeof sj.requires_attribution === "boolean") requiresAttribution = sj.requires_attribution;
          if (sj.required_attribution_url) attributionUrl = sj.required_attribution_url;
        }
      }
    }
    if (!fileUrl) return jsonResponse({ error: "Vecteezy did not return a download URL (still preparing — try again)" }, 502, origin);
    const fileRes = await fetch(fileUrl, {
      headers: {
        "Accept": "*/*",
        "User-Agent": "OrionConnected-FIDS/1.0 (Cloudflare Worker; +https://fids.orionconnected.com)"
      }
    });
    if (!fileRes.ok) return jsonResponse({ error: "Vecteezy file fetch failed", status: fileRes.status }, 502, origin);
    let ct = fileRes.headers.get("Content-Type") || "";
    // Download URLs are often served as octet-stream; recover the real type
    // from the URL extension (or the client's hint) before extFromContentType
    // falls back to "png" and mislabels a video.
    if (!ct || /octet-stream/i.test(ct)) {
      const extM = new URL(fileUrl).pathname.match(/\.([A-Za-z0-9]{2,5})$/);
      const urlExt = extM ? extM[1].toLowerCase() : "";
      const extToMime = {
        mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        webp: "image/webp", gif: "image/gif", svg: "image/svg+xml"
      };
      ct = extToMime[urlExt] || (hintVideo ? "video/mp4" : "image/jpeg");
    }
    const bytes = await fileRes.arrayBuffer();
    if (bytes.byteLength === 0) return jsonResponse({ error: "Empty file from Vecteezy" }, 502, origin);
    const isVideo = /mp4|webm|mov|quicktime/i.test(ct);
    const maxBytes = isVideo ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
    if (bytes.byteLength > maxBytes) {
      return jsonResponse({ error: `File too large (max ${maxBytes / 1024 / 1024}MB)` }, 413, origin);
    }
    const fileExt = extFromContentType(ct);
    const id = crypto.randomUUID();
    const r2Key = `media-library/${id}.${fileExt}`;
    await env.FIDS_ASSETS.put(r2Key, bytes, { httpMetadata: { contentType: ct } });
    const item = {
      id,
      type: isVideo ? "video" : "image",
      category,
      source: "vecteezy",
      vecteezyId: Number(resId),
      r2Key,
      url: `${R2_PUBLIC_BASE}/${r2Key}`,
      mimeType: ct,
      sizeBytes: bytes.byteLength,
      label,
      // Free-tier content must be credited; keep what the API reported so
      // the menu can surface the attribution link next to the item.
      attribution: { required: requiresAttribution, url: attributionUrl },
      uploadedAt: Date.now(),
      uploadedBy: payload.sub || "admin"
    };
    const existing = await env.FIDS_USERS.get("media-library");
    const lib = existing ? JSON.parse(existing) : { items: [] };
    if (!Array.isArray(lib.items)) lib.items = [];
    lib.items.push(item);
    lib.updatedAt = Date.now();
    await env.FIDS_USERS.put("media-library", JSON.stringify(lib));
    return jsonResponse({ success: true, item, library: lib }, 200, origin);
  } catch (e) {
    return jsonResponse({ error: "Vecteezy import failed", details: e.message }, 502, origin);
  }
}
__name(handleVecteezyImport, "handleVecteezyImport");

async function handleUploadAirportLogo(request, env, payload, origin, code) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const norm = normIata(code);
  const ct = request.headers.get("Content-Type") || "";
  const fileExt = extFromContentType(ct);
  const r2Key = `airports/${norm.toLowerCase()}/logo.${fileExt}`;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return jsonResponse({ error: "Empty body" }, 400, origin);
    if (body.byteLength > 5 * 1024 * 1024) return jsonResponse({ error: "Logo too large (max 5MB)" }, 413, origin);
    await env.FIDS_ASSETS.put(r2Key, body, { httpMetadata: { contentType: ct || `image/${fileExt}` } });
    const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}?v=${Date.now()}`;
    const existing = await env.FIDS_USERS.get(`airport:${norm}`);
    let cfg = existing ? JSON.parse(existing) : {};
    cfg.logo = {
      url: publicUrl,
      r2Key: r2Key,
      position: (cfg.logo && cfg.logo.position) || "left",
      maxHeight: (cfg.logo && cfg.logo.maxHeight) || 64,
      uploadedAt: Date.now()
    };
    cfg.updatedAt = Date.now();
    cfg.updatedBy = payload.sub;
    await env.FIDS_USERS.put(`airport:${norm}`, JSON.stringify(cfg));
    return jsonResponse({ success: true, logo: cfg.logo, config: cfg }, 200, origin);
  } catch (e) {
    return jsonResponse({ error: "Logo upload failed", details: e.message }, 500, origin);
  }
}
__name(handleUploadAirportLogo, "handleUploadAirportLogo");

async function handleListAirlineOverrides(env, origin, airport) {
  const data = await env.FIDS_USERS.get(`overrides:${normIata(airport)}`);
  if (!data) return jsonResponse({ overrides: {} }, 200, origin);
  try { return jsonResponse({ overrides: JSON.parse(data) }, 200, origin); }
  catch (e) { return jsonResponse({ overrides: {} }, 200, origin); }
}
__name(handleListAirlineOverrides, "handleListAirlineOverrides");

async function handlePutAirlineOverride(request, env, payload, origin, airport, airline) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const ap = normIata(airport);
  const al = normIata(airline);
  const body = await request.json();
  const existing = await env.FIDS_USERS.get(`overrides:${ap}`);
  let overrides = existing ? JSON.parse(existing) : {};
  overrides[al] = {
    url: body.url || null,
    r2Key: body.r2Key || null,
    library_id: body.library_id || null,
    updatedAt: Date.now(),
    updatedBy: payload.sub
  };
  await env.FIDS_USERS.put(`overrides:${ap}`, JSON.stringify(overrides));
  return jsonResponse({ success: true, override: overrides[al] }, 200, origin);
}
__name(handlePutAirlineOverride, "handlePutAirlineOverride");

async function handleUploadAirlineLogo(request, env, payload, origin, airport, airline) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const ap = normIata(airport);
  const al = normIata(airline);
  const ct = request.headers.get("Content-Type") || "";
  const fileExt = extFromContentType(ct);
  const r2Key = `airline-overrides/${ap.toLowerCase()}/${al.toLowerCase()}.${fileExt}`;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return jsonResponse({ error: "Empty body" }, 400, origin);
    if (body.byteLength > 5 * 1024 * 1024) return jsonResponse({ error: "Logo too large (max 5MB)" }, 413, origin);
    await env.FIDS_ASSETS.put(r2Key, body, { httpMetadata: { contentType: ct || `image/${fileExt}` } });
    const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}?v=${Date.now()}`;
    const existing = await env.FIDS_USERS.get(`overrides:${ap}`);
    let overrides = existing ? JSON.parse(existing) : {};
    overrides[al] = {
      url: publicUrl,
      r2Key: r2Key,
      updatedAt: Date.now(),
      updatedBy: payload.sub
    };
    await env.FIDS_USERS.put(`overrides:${ap}`, JSON.stringify(overrides));
    return jsonResponse({ success: true, override: overrides[al] }, 200, origin);
  } catch (e) {
    return jsonResponse({ error: "Logo upload failed", details: e.message }, 500, origin);
  }
}
__name(handleUploadAirlineLogo, "handleUploadAirlineLogo");

async function handleDeleteAirlineOverride(env, payload, origin, airport, airline) {
  if (!isAdmin(payload)) return jsonResponse({ error: "Admin access required" }, 403, origin);
  const ap = normIata(airport);
  const al = normIata(airline);
  const existing = await env.FIDS_USERS.get(`overrides:${ap}`);
  if (existing) {
    const overrides = JSON.parse(existing);
    if (overrides[al] && overrides[al].r2Key) {
      try { await env.FIDS_ASSETS.delete(overrides[al].r2Key); } catch (e) {}
    }
    delete overrides[al];
    await env.FIDS_USERS.put(`overrides:${ap}`, JSON.stringify(overrides));
  }
  return jsonResponse({ success: true }, 200, origin);
}
__name(handleDeleteAirlineOverride, "handleDeleteAirlineOverride");
// ════════════════════════════════════════════════════════════════════
// MCO (Orlando International) — native vendor FIDS feed normalizer
// ════════════════════════════════════════════════════════════════════
// MCO isn't an AeroDataBox airport for us — instead the airport publishes
// its own flights feed (the same JSON that powers flymco.com/flights/).
// That feed carries the real gate / terminal / baggage-belt data ADB
// doesn't give us, so we fetch it here and RE-SHAPE each vendor flight
// into the exact AeroDataBox-native object the boards already parse
// (see adbFetchWindow / the normalizer in fids-core.js). Result: the
// boards read MCO with ZERO frontend rendering changes — the frontend
// just needs to point its flight fetch for MCO at /flights/mco.
//
// The live feed is the Greater Orlando Aviation Authority (GOAA) flights
// API — the XHR behind flymco.com/flights/. It returns
// { "data": { "flights": [ ... ] } } and takes a scheduledTimestamp
// RANGE ("from..to" in unix seconds), so we build the window per request
// rather than hardcode a date. The request needs three headers:
//   Api-Key      — GOAA API key. NOT hardcoded — read from a worker secret
//                  (env.MCO_FEED_KEY). Set it via the Cloudflare dashboard
//                  or `wrangler secret put MCO_FEED_KEY`.
//   Api-Version  — pinned to the version the site sends.
//   Origin/Referer — the API allows the flymco.com origin.
const MCO_FEED_BASE = "https://api.goaa.aero/flights";
const MCO_FEED_API_VERSION = "150";
const MCO_FEED_HEADERS = (env) => ({
  "Accept": "application/json, text/plain, */*",
  "Api-Key": env.MCO_FEED_KEY || "",
  "Api-Version": MCO_FEED_API_VERSION,
  "Origin": "https://flymco.com",
  "Referer": "https://flymco.com/"
});

// Build the windowed feed URL. The API filters by scheduledTimestamp range;
// we look back a few hours and ahead ~30h to cover the board's lookahead
// plus overnight flights.
function mcoFeedUrl() {
  const nowSec = Math.floor(Date.now() / 1e3);
  const from = nowSec - 6 * 3600;
  const to = nowSec + 30 * 3600;
  return `${MCO_FEED_BASE}?scheduledTimestamp=${from}..${to}`;
}
__name(mcoFeedUrl, "mcoFeedUrl");

// Build an AeroDataBox-style { local, utc } time object from a unix
// timestamp (seconds). `.local` is rendered in MCO's tz (US Eastern);
// the boards prefer `.local` and fall back to `.utc`. Returns null for
// missing/zero timestamps so downstream `?.` chains stay clean.
function mcoTimeObj(tsSeconds) {
  if (!tsSeconds || typeof tsSeconds !== "number") return null;
  const d = new Date(tsSeconds * 1000);
  if (isNaN(d.getTime())) return null;
  // UTC string in the "YYYY-MM-DD HH:MM:SS+00:00" form ADB emits (the
  // frontend's adbTs() does str.replace(' ','T') then new Date()).
  const iso = d.toISOString();                        // 2026-07-16T14:30:00.000Z
  const utc = iso.slice(0, 19).replace("T", " ") + "+00:00";
  let local = utc;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZoneName: "shortOffset"
    }).formatToParts(d);
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    let hh = g("hour"); if (hh === "24") hh = "00";
    // shortOffset gives e.g. "GMT-4" → normalize to "-04:00"
    const tzName = g("timeZoneName");
    let off = "+00:00";
    const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) off = `${m[1]}${m[2].padStart(2, "0")}:${(m[3] || "00")}`;
    local = `${g("year")}-${g("month")}-${g("day")} ${hh}:${g("minute")}:${g("second")}${off}`;
  } catch (e) { /* fall back to utc string */ }
  return { local, utc };
}
__name(mcoTimeObj, "mcoTimeObj");

// Map MCO's two-letter originalStatus (plus the isDelayed flag) onto the
// lowercase British status strings the rest of the codebase keys on
// (see _STATUS_ENUM in fids-core.js — 'cancelled' not 'Canceled', etc.).
function mcoStatus(f) {
  const os = String(f.originalStatus || "").toUpperCase();
  switch (os) {
    case "AR": return "arrived";     // Landed
    case "DP": return "departed";    // Departed
    case "CX": return "cancelled";   // Canceled
    case "DL": return "delayed";     // Delayed
    case "ON": return "scheduled";   // On time
  }
  if (f.isDelayed) return "delayed";
  // Fall back to the wordy status field if originalStatus is unfamiliar.
  const s = String(f.status || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("land") || s.includes("arriv")) return "arrived";
  if (s.includes("depart")) return "departed";
  if (s.includes("delay")) return "delayed";
  return "scheduled";
}
__name(mcoStatus, "mcoStatus");

// Turn one MCO vendor flight row into an AeroDataBox-native flight object.
// `homeIsArrival` mirrors the feed's `arrival` bool: when true the flight
// LANDS at MCO (home gate/terminal/belt live under `arrival`, the origin
// under `departure.airport`); when false it DEPARTS MCO (home data under
// `departure`, the destination under `arrival.airport`). This matches how
// the frontend normalizer reads terminal/gate/belt per direction.
function mcoToAdbFlight(f) {
  const homeIsArrival = !!f.arrival;
  // Prefer the operating airline + operating flight number for the board's
  // primary number (the ADB scrape is fetched withCodeshared=false, so the
  // board expects the operator's number and treats the row as the operator).
  const opIata = (f.iataOperatingAirline || "").toUpperCase().trim();
  const opIcao = (f.icaoOperatingAirline || "").toUpperCase().trim();
  const opNum = (f.operatingAirlineFlightNumber || "").toString().trim();
  const csIata = (f.iataCodeShareAirline || "").toUpperCase().trim();
  const csNum = (f.codeShareFlightNumber || "").toString().trim();
  // Display number: "WN2183" style. Prefer the pre-joined iata field the
  // feed supplies, else stitch iata + number ourselves.
  const number =
    (f.iataOperatingAirlineFlightNumber || "").toString().trim() ||
    (opIata && opNum ? `${opIata}${opNum}` : "") ||
    (f.icaoOperatingAirlineFlightNumber || "").toString().trim() ||
    (csIata && csNum ? `${csIata}${csNum}` : "");

  const sched = mcoTimeObj(f.scheduledTimestamp);
  // bestKnownTimestamp is the estimated/actual time — surface it as
  // revisedTime only when it actually differs from scheduled (so an
  // on-time flight doesn't render a redundant "revised" time).
  const best = f.bestKnownTimestamp && f.bestKnownTimestamp !== f.scheduledTimestamp
    ? mcoTimeObj(f.bestKnownTimestamp) : null;

  const belt = Array.isArray(f.baggageBelt) && f.baggageBelt.length
    ? f.baggageBelt.join(", ") : null;

  const airlineObj = {
    iata: opIata || null,
    icao: opIcao || null,
    name: null                    // frontend resolves the display name itself
  };
  const homeAirport = { iata: (f.baseAirport || "MCO").toUpperCase(), icao: null, name: null };
  // The "other" airport — origin for an arrival, destination for a departure.
  const otherCode = homeIsArrival
    ? (f.departureAirport || "").toUpperCase()
    : (f.arrivalAirport || "").toUpperCase();
  const otherAirport = { iata: otherCode || null, icao: null, name: null };

  const homeSide = {
    airport: homeAirport,
    terminal: f.terminal || null,
    gate: f.gate || null,
    ...(homeIsArrival && belt ? { baggageBelt: belt } : {}),
    scheduledTime: sched,
    ...(best ? { revisedTime: best } : {}),
    airline: airlineObj,
    quality: ["Live"]
  };
  const otherSide = {
    airport: otherAirport,
    scheduledTime: sched,
    airline: airlineObj,
    quality: ["Live"]
  };

  return {
    number,
    callSign: null,
    status: mcoStatus(f),
    codeshareStatus: "IsOperator",
    isCargo: false,
    // Home side carries the gate/terminal/belt; other side just the airport.
    departure: homeIsArrival ? otherSide : homeSide,
    arrival: homeIsArrival ? homeSide : otherSide,
    // Preserve the multi-leg hint so distinct legs of the same number stay
    // distinct when we de-dupe (via stops share a number but differ here).
    _mcoVia: f.viaAirport || null,
    _mcoViaSeq: (typeof f.viaSequencePosition === "number") ? f.viaSequencePosition : null
  };
}
__name(mcoToAdbFlight, "mcoToAdbFlight");

// ════════════════════════════════════════════════════════════════════
// YHZ AUTHORITY FEED (2026-09-04 — the night the AeroDataBox sub ended)
// ════════════════════════════════════════════════════════════════════
// Halifax Stanfield server-renders its complete departures/arrivals
// tables straight into the page HTML — no API, no cookies, no special
// headers (verified with a bare fetch: 89 rows, gates, expected+actual
// times, statuses, and the airline IATA sitting in data-code="WS").
// Served AT THE ADB WINDOW URL the boards already call
// (/proxy/flights/airports/iata/YHZ/<from>/<to> and the bare form),
// converted to ADB-native shape — the drop-in trick the MCO converter
// established — so kiosks running year-old cached JS pick this up with
// no client change and no FIDS_BUILD_TAG dance. On ANY failure (site
// down, redesign, zero rows) the hook returns null and the caller falls
// through to the real ADB passthrough: this path can never leave a
// board worse off than the status quo.
const YHZ_PAGES = {
  dep: "https://halifaxstanfield.ca/flights/departures/",
  arr: "https://halifaxstanfield.ca/flights/arrivals/"
};
// Destination cells carry a city NAME; the big ones append "(YYZ)" and
// the parenthesised code always wins. This map covers the rest of the
// YHZ route map so airline/route features keyed on IATA keep working;
// an unknown city still renders fine by name.
const YHZ_CITY_IATA = {
  "TORONTO": "YYZ", "MONTREAL": "YUL", "OTTAWA": "YOW", "CALGARY": "YYC",
  "EDMONTON": "YEG", "VANCOUVER": "YVR", "WINNIPEG": "YWG", "MONCTON": "YQM",
  "ST. JOHN'S": "YYT", "SYDNEY": "YQY", "DEER LAKE": "YDF", "GANDER": "YQX",
  "GOOSE BAY": "YYR", "CHARLOTTETOWN": "YYG", "FREDERICTON": "YFC",
  "SAINT JOHN": "YSJ", "HAMILTON": "YHM", "KITCHENER-WATERLOO": "YKF",
  "TORONTO/CITY CENTRE": "YTZ", "QUEBEC": "YQB", "QUEBEC CITY": "YQB",
  "BOSTON": "BOS", "NEWARK": "EWR", "PHILADELPHIA": "PHL", "CHICAGO": "ORD",
  "ORLANDO": "MCO", "FORT LAUDERDALE": "FLL", "TAMPA": "TPA",
  "DUBLIN": "DUB", "PARIS": "CDG", "AMSTERDAM": "AMS", "LISBON": "LIS",
  "MADRID BARAJAS APT": "MAD", "FRANKFURT": "FRA", "MUNICH": "MUC",
  "ZURICH": "ZRH", "GLASGOW": "GLA", "MANCHESTER": "MAN", "REYKJAVIK": "KEF",
  "CANCUN": "CUN", "PUNTA CANA": "PUJ", "MONTEGO BAY": "MBJ",
  "VARADERO": "VRA", "CAYO COCO": "CCC", "HOLGUIN": "HOG", "SANTA CLARA": "SNU",
  // Western Canada — the YEG/YQB boards speak in city names too.
  "YELLOWKNIFE": "YZF", "FORT MCMURRAY": "YMM", "GRANDE PRAIRIE": "YQU",
  "KELOWNA": "YLW", "VICTORIA": "YYJ", "SASKATOON": "YXE", "REGINA": "YQR",
  "ABBOTSFORD": "YXX", "PRINCE GEORGE": "YXS", "LETHBRIDGE": "YQL",
  "MEDICINE HAT": "YXH", "COMOX": "YQQ", "NANAIMO": "YCD", "KAMLOOPS": "YKA",
  "TORONTO PEARSON": "YYZ", "DENVER": "DEN", "HOUSTON": "IAH", "MINNEAPOLIS": "MSP",
  "SAN FRANCISCO": "SFO", "LOS ANGELES": "LAX", "LAS VEGAS": "LAS", "PHOENIX": "PHX",
  "SEATTLE": "SEA", "PALM SPRINGS": "PSP", "SALT LAKE CITY": "SLC", "ATLANTA": "ATL",
  "WASHINGTON": "IAD", "DETROIT": "DTW", "CHARLOTTE": "CLT"
};
function yhzCellText(s) {
  // &amp; is decoded LAST (see ausXmlField): first would double-unescape.
  return String(s || "").replace(/<[^>]+>/g, " ")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'").replace(/’/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
__name(yhzCellText, "yhzCellText");
// Halifax's tables print HH:MM with no date and no offset. The offset is
// probed per calendar day (at ~noon, so a 02:00 DST flip never lands on
// the probe itself); rows then walk forward from "today in Halifax", and
// a backwards jump of more than six hours means the table crossed
// midnight into tomorrow.
function yhzOffsetFor(y, mo, d) {
  try {
    const probe = new Date(Date.UTC(y, mo - 1, d, 15, 0, 0));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", timeZoneName: "shortOffset" }).formatToParts(probe);
    const tz = ((parts.find((p) => p.type === "timeZoneName") || {}).value || "");
    const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) return `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}`;
  } catch (e) {}
  return "-03:00";
}
__name(yhzOffsetFor, "yhzOffsetFor");
function yhzTimeObj(y, mo, d, hh, mm) {
  const p2 = (n) => String(n).padStart(2, "0");
  const norm = new Date(Date.UTC(y, mo - 1, d, 12));   // lets d be 0 or 32
  y = norm.getUTCFullYear(); mo = norm.getUTCMonth() + 1; d = norm.getUTCDate();
  const off = yhzOffsetFor(y, mo, d);
  const ts = Date.parse(`${y}-${p2(mo)}-${p2(d)}T${p2(hh)}:${p2(mm)}:00${off}`);
  const iso = new Date(ts).toISOString();
  return {
    local: `${y}-${p2(mo)}-${p2(d)} ${p2(hh)}:${p2(mm)}:00${off}`,
    utc: iso.slice(0, 19).replace("T", " ") + "+00:00",
    ts
  };
}
__name(yhzTimeObj, "yhzTimeObj");
function yhzStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("delay")) return "delayed";
  return "scheduled";   // ON TIME / EARLY / anything novel
}
__name(yhzStatus, "yhzStatus");
// Parse one rendered board page into ADB-native flight objects. Exported
// for the node test suite; `nowMs` is injected so tests are deterministic.
// Each flight carries `_yhzTs` (home-side scheduled epoch ms) for the
// window filter — the same private-field convention as `_mcoVia`.
function yhzParseBoard(html, wantDep, nowMs) {
  const out = [];
  const rows = String(html || "").match(/<tr[^>]*class="table-row[^"]*"[\s\S]*?<\/tr>/g) || [];
  // "Today" in Halifax, not in UTC — at 23:30 ADT those differ by a day.
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
  let y = g("year"), mo = g("month"), d = g("day");
  let prevMin = null;
  for (const row of rows) {
    if (row.indexOf("<th") !== -1) continue;   // column-header row
    const cells = {};
    for (const m of row.matchAll(/<td[^>]*headers="([a-z-]+)"[\s\S]*?<\/td>/g)) cells[m[1]] = m[0];
    const codeM = row.match(/data-code="([A-Z0-9]{2,3})"/);
    const num = yhzCellText(cells["flight-number"]).replace(/\s+/g, "");
    const expM = yhzCellText(cells["expected-time"]).match(/^(\d{1,2}):(\d{2})$/);
    if (!codeM || !num || !expM) continue;
    const eh = Number(expM[1]), em = Number(expM[2]);
    const min = eh * 60 + em;
    if (prevMin !== null && min < prevMin - 360) {   // table crossed midnight
      const next = new Date(Date.UTC(y, mo - 1, d, 12) + 864e5);
      y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
    }
    prevMin = min;
    const sched = yhzTimeObj(y, mo, d, eh, em);
    // Actual mirrors Expected until something really changes; only a
    // differing value is a revision. An actual that lands >12h from the
    // scheduled time is the same clock reading on the other side of
    // midnight (23:55 → 00:20).
    let revised = null;
    const actM = yhzCellText(cells["actual-time"]).match(/^(\d{1,2}):(\d{2})$/);
    if (actM && (Number(actM[1]) !== eh || Number(actM[2]) !== em)) {
      let r = yhzTimeObj(y, mo, d, Number(actM[1]), Number(actM[2]));
      if (r.ts - sched.ts > 432e5) r = yhzTimeObj(y, mo, d - 1, Number(actM[1]), Number(actM[2]));
      else if (sched.ts - r.ts > 432e5) r = yhzTimeObj(y, mo, d + 1, Number(actM[1]), Number(actM[2]));
      revised = r;
    }
    const locRaw = yhzCellText(cells["flight-from"]);
    const paren = locRaw.match(/\(([A-Z]{3})\)\s*$/);
    const cityName = locRaw.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
    const otherIata = paren ? paren[1] : (YHZ_CITY_IATA[cityName.toUpperCase()] || null);
    const gate = yhzCellText(cells["gate"]).replace(/^Gate:\s*/i, "").trim() || null;
    const status = yhzStatus(yhzCellText(cells["flight-status"]));
    const airlineObj = { iata: codeM[1], icao: null, name: null };
    const schedTime = { local: sched.local, utc: sched.utc };
    const homeSide = {
      airport: { iata: "YHZ", icao: "CYHZ", name: "Halifax" },
      gate,
      scheduledTime: schedTime,
      ...(revised ? { revisedTime: { local: revised.local, utc: revised.utc } } : {}),
      airline: airlineObj,
      quality: ["Live"]
    };
    const otherSide = {
      airport: { iata: otherIata, icao: null, name: cityName || null },
      scheduledTime: schedTime,
      airline: airlineObj,
      quality: ["Live"]
    };
    out.push({
      number: `${codeM[1]}${num}`,
      callSign: null,
      status,
      codeshareStatus: "IsOperator",
      isCargo: false,
      departure: wantDep ? homeSide : otherSide,
      arrival: wantDep ? otherSide : homeSide,
      _yhzTs: sched.ts
    });
  }
  return out;
}
__name(yhzParseBoard, "yhzParseBoard");
// The board asks in Halifax-local "YYYY-MM-DDTHH:MM" (fmt12) — epoch it
// with that day's offset so the window filter compares like with like.
function yhzWindowTs(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${yhzOffsetFor(Number(m[1]), Number(m[2]), Number(m[3]))}`);
}
__name(yhzWindowTs, "yhzWindowTs");
async function yhzFetchPage(kind) {
  const cacheKey = new Request(`https://yhz-authority/${kind}`);
  const cache = caches.default;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.headers.get("X-Yhz-Neg") ? null : await hit.text();
  } catch (e) {}
  let html = null;
  try {
    const r = await fetch(YHZ_PAGES[kind], { headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OrionConnected-FIDS/1.0; +https://fids.orionconnected.com)",
      "Accept": "text/html"
    } });
    if (r.ok) html = await r.text();
  } catch (e) {}
  const good = html && html.indexOf('class="table-row') !== -1;
  // 75 s positive / 30 s negative: screens polling together cost Halifax
  // at most one page fetch a minute, and an outage is re-probed quickly.
  try {
    await cache.put(cacheKey, good
      ? new Response(html, { headers: { "Cache-Control": "public, max-age=75" } })
      : new Response("", { headers: { "Cache-Control": "public, max-age=30", "X-Yhz-Neg": "1" } }));
  } catch (e) {}
  return good ? html : null;
}
__name(yhzFetchPage, "yhzFetchPage");
// The hook both ADB passthroughs try first. Returns a Response to serve,
// or null to fall through to AeroDataBox untouched. The boards fetch two
// 12-hour windows per direction and merge, so filtering to [from, to) is
// what keeps a flight from appearing twice.
async function maybeServeYhzAuthority(adbPath, url, origin) {
  try {
    const m = String(adbPath || "").match(/^flights\/airports\/iata\/yhz\/([^/]+)\/([^/?]+)$/i);
    if (!m) return null;
    const fromTs = yhzWindowTs(decodeURIComponent(m[1]));
    const toTs = yhzWindowTs(decodeURIComponent(m[2]));
    if (isNaN(fromTs) || isNaN(toTs)) return null;
    const dir = String(url.searchParams.get("direction") || "Both");
    const sides = [];
    if (!/^arr/i.test(dir)) sides.push("dep");
    if (!/^dep/i.test(dir)) sides.push("arr");
    const body = {};
    for (const kind of sides) {
      const html = await yhzFetchPage(kind);
      if (!html) return null;
      const flights = yhzParseBoard(html, kind === "dep", Date.now());
      if (!flights.length) return null;   // parse broke → let ADB answer
      body[kind === "dep" ? "departures" : "arrivals"] =
        flights.filter((f) => f._yhzTs >= fromTs && f._yhzTs < toTs);
    }
    return new Response(JSON.stringify(body), { headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      "X-Feed-Source": "yhz-authority",
      ...corsHeaders(origin)
    } });
  } catch (e) { return null; }
}
__name(maybeServeYhzAuthority, "maybeServeYhzAuthority");

// ════════════════════════════════════════════════════════════════════
// YQM: THE WEBHOOK CACHE BECOMES THE BOARD'S BASE LIST (2026-09-05)
// ════════════════════════════════════════════════════════════════════
// Tonight cyqm.ca raised "WP Remote Firewall" and 403s every external
// caller — the airport firewalled its own display system's feed — and
// the AeroDataBox fallback died with the cancelled subscription. Both
// legs gone at once; the real Moncton screens sat on the splash while
// the boards looped on 429 retries.
//
// The webhook cache is the one YQM source still alive: pushes spend
// PREPAID webhook credits, not the dead API key (newest record 02:18Z
// tonight, checked live), and each record's `flight` is a verbatim
// ADB flight object. So the ADB window URL is answered straight from
// KV, normalized exactly the way the client overlay normalizes
// (feed-router.js ~1419 — including the lowercase-'cancelled' lesson),
// operator rows only (the scrape asks withCodeshared=false), filtered
// to the requested [from, to) window.
//
// EMPTY IS AN ANSWER. Once the cache holds ANY Moncton data, a window
// with nothing in it returns 200 {departures:[]} rather than falling
// through — falling through means the dead-key 429 retry loop that hung
// the boards tonight. Only a wholly empty cache falls through. When the
// airport unblocks cyqm.ca, the client's primary path resumes and this
// becomes the quiet safety net it should have been all along.
const YQM_STATUS_ENUM = {
  0: "scheduled", 1: "scheduled", 2: "active", 3: "scheduled",
  4: "boarding", 5: "gateclosed", 6: "departed", 7: "delayed",
  8: "active", 9: "arrived", 10: "cancelled", 11: "diverted", 12: "cancelled"
};
const YQM_CS_ENUM = { 0: "Unknown", 1: "IsOperator", 2: "IsCodeshared" };
const YQM_QUALITY_ENUM = { 0: "Basic", 1: "Live", 2: "LiveBasicAircraft", 3: "LiveFull", 4: "LiveSchedule" };
function yqmNormFlight(f) {
  if (!f || typeof f !== "object") return null;
  if (typeof f.status === "number") f.status = YQM_STATUS_ENUM[f.status] || String(f.status);
  if (typeof f.codeshareStatus === "number") f.codeshareStatus = YQM_CS_ENUM[f.codeshareStatus] || String(f.codeshareStatus);
  const normQ = (q) => Array.isArray(q) ? q.map((x) => typeof x === "number" ? (YQM_QUALITY_ENUM[x] || String(x)) : x) : q;
  if (f.departure && Array.isArray(f.departure.quality)) f.departure.quality = normQ(f.departure.quality);
  if (f.arrival && Array.isArray(f.arrival.quality)) f.arrival.quality = normQ(f.arrival.quality);
  return f;
}
__name(yqmNormFlight, "yqmNormFlight");
// Webhook time strings read "2026-09-04 08:30Z" / "2026-09-04 05:30-03:00"
// — ADB's space-separated form; one T makes them parseable.
function yqmSchedTs(f, dir) {
  const side = dir === "dep" ? f && f.departure : f && f.arrival;
  const t = side && side.scheduledTime && (side.scheduledTime.utc || side.scheduledTime.local);
  return t ? Date.parse(String(t).replace(" ", "T")) : NaN;
}
__name(yqmSchedTs, "yqmSchedTs");
// Assemble one direction's normalized list from KV, memoized 30 s in the
// colo cache so N screens polling together cost one KV sweep, not N.
async function yqmCacheList(env, dir) {
  const cacheKey = new Request(`https://yqm-authority/${dir}`);
  const cache = caches.default;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return await hit.json();
  } catch (e) {}
  const list = await env.FIDS_LIVE_FLIGHTS.list({ prefix: `CYQM:${dir}:` });
  const vals = await Promise.all(list.keys.map((k) => env.FIDS_LIVE_FLIGHTS.get(k.name)));
  const flights = [];
  for (const val of vals) {
    if (!val) continue;
    let rec; try { rec = JSON.parse(val); } catch (e) { continue; }
    const f = yqmNormFlight(rec && rec.flight);
    if (!f) continue;
    if (f.isCargo === true) continue;
    if (f.codeshareStatus === "IsCodeshared") continue;
    if (isNaN(yqmSchedTs(f, dir))) continue;
    flights.push(f);
  }
  try {
    await cache.put(cacheKey, new Response(JSON.stringify(flights), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" }
    }));
  } catch (e) {}
  return flights;
}
__name(yqmCacheList, "yqmCacheList");
async function maybeServeYqmCache(adbPath, url, env, origin) {
  try {
    const m = String(adbPath || "").match(/^flights\/airports\/iata\/yqm\/([^/]+)\/([^/?]+)$/i);
    if (!m || !env.FIDS_LIVE_FLIGHTS) return null;
    // Moncton shares the Atlantic offset with Halifax year-round, so the
    // same window parser applies.
    const fromTs = yhzWindowTs(decodeURIComponent(m[1]));
    const toTs = yhzWindowTs(decodeURIComponent(m[2]));
    if (isNaN(fromTs) || isNaN(toTs)) return null;
    const dirQ = String(url.searchParams.get("direction") || "Both");
    const dirs = [];
    if (!/^arr/i.test(dirQ)) dirs.push("dep");
    if (!/^dep/i.test(dirQ)) dirs.push("arr");
    const body = {};
    let cachedTotal = 0;
    for (const dir of dirs) {
      const all = await yqmCacheList(env, dir);
      cachedTotal += all.length;
      body[dir === "dep" ? "departures" : "arrivals"] =
        all.filter((f) => { const ts = yqmSchedTs(f, dir); return ts >= fromTs && ts < toTs; });
    }
    if (!cachedTotal) return null;   // wholly empty cache → let ADB try
    return new Response(JSON.stringify(body), { headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      "X-Feed-Source": "yqm-webhook-cache",
      ...corsHeaders(origin)
    } });
  } catch (e) { return null; }
}
__name(maybeServeYqmCache, "maybeServeYqmCache");
// ════════════════════════════════════════════════════════════════════
// GENERIC AUTHORITY-FEED MACHINERY (2026-09-05 overnight batch)
// ════════════════════════════════════════════════════════════════════
// With the AeroDataBox subscription gone, every airport we can moves to
// its own authority's data, served AT THE ADB WINDOW URL — the YHZ/YQM
// trick, generalized. Each handler fetches + parses one source, builds
// ADB-native flights via authorityFlight(), and the registry dispatcher
// window-filters per request. A handler that returns null (source down,
// zero rows — for a scraped page zero usually means a redesign) falls
// through to the ADB passthrough untouched.
function tzOffsetFor(tz, y, mo, d) {
  try {
    const probe = new Date(Date.UTC(y, mo - 1, d, 15, 0, 0));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(probe);
    const name = ((parts.find((p) => p.type === "timeZoneName") || {}).value || "");
    const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) return `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}`;
  } catch (e) {}
  return "+00:00";
}
__name(tzOffsetFor, "tzOffsetFor");
function localTimeObjIn(tz, y, mo, d, hh, mm) {
  const p2 = (n) => String(n).padStart(2, "0");
  const norm = new Date(Date.UTC(y, mo - 1, d, 12));
  y = norm.getUTCFullYear(); mo = norm.getUTCMonth() + 1; d = norm.getUTCDate();
  const off = tzOffsetFor(tz, y, mo, d);
  const ts = Date.parse(`${y}-${p2(mo)}-${p2(d)}T${p2(hh)}:${p2(mm)}:00${off}`);
  const iso = new Date(ts).toISOString();
  return {
    local: `${y}-${p2(mo)}-${p2(d)} ${p2(hh)}:${p2(mm)}:00${off}`,
    utc: iso.slice(0, 19).replace("T", " ") + "+00:00",
    ts
  };
}
__name(localTimeObjIn, "localTimeObjIn");
// fmt12 sends window bounds in the AIRPORT'S local clock; parse them in
// that airport's zone (Newfoundland's half-hour offset included).
function windowTsIn(tz, s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${tzOffsetFor(tz, Number(m[1]), Number(m[2]), Number(m[3]))}`);
}
__name(windowTsIn, "windowTsIn");
// A month-day with no year: the year that lands nearest to now wins,
// which handles a board read across New Year without a special case.
function nearestYear(mo, d, nowMs) {
  const yNow = new Date(nowMs).getUTCFullYear();
  let best = yNow, bestGap = Infinity;
  for (const y of [yNow - 1, yNow, yNow + 1]) {
    const gap = Math.abs(Date.UTC(y, mo - 1, d, 12) - nowMs);
    if (gap < bestGap) { bestGap = gap; best = y; }
  }
  return best;
}
__name(nearestYear, "nearestYear");
const AUTH_MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
// Small airports print the carrier's NAME, not its code; the boards key
// everything (logos, colours) on the IATA prefix of the flight number.
const AIRLINE_NAME_IATA = {
  "AIR CANADA": "AC", "AIR CANADA EXPRESS": "AC", "AIR CANADA ROUGE": "RV",
  "PORTER": "PD", "PORTER AIRLINES": "PD", "WESTJET": "WS", "WESTJET ENCORE": "WS",
  "PAL AIRLINES": "PB", "PROVINCIAL AIRLINES": "PB", "FLAIR": "F8", "FLAIR AIRLINES": "F8",
  "WEST JET": "WS",   // Fredericton's site writes it as two words (Nick spotted WS795 losing its identity)
  "PASCAN": "P6", "PASCAN AVIATION": "P6", "AIR TRANSAT": "TS", "SUNWING": "WG",
  "AIR SAINT-PIERRE": "PJ", "UNITED": "UA", "UNITED AIRLINES": "UA",
  "DELTA": "DL", "DELTA AIR LINES": "DL", "AMERICAN AIRLINES": "AA", "AMERICAN": "AA"
};
const AIRLINE_NAME_IATA_SQUASHED = (() => {
  const m = {};
  for (const k of Object.keys(AIRLINE_NAME_IATA)) m[k.replace(/\s+/g, "")] = AIRLINE_NAME_IATA[k];
  return m;
})();
// The reverse map, for feeds that print only a flight code — the boards
// can then show a proper carrier name (Nick: Pascan on YSJ rendered
// nameless; P6 really is Pascan, the YSJ–YHU operator, not Porter).
const AIRLINE_IATA_NAME = {
  AC: "Air Canada", PD: "Porter Airlines", WS: "WestJet", PB: "PAL Airlines",
  P6: "Pascan Aviation", F8: "Flair Airlines", TS: "Air Transat", WG: "Sunwing",
  RV: "Air Canada Rouge", PJ: "Air Saint-Pierre", DL: "Delta Air Lines",
  UA: "United Airlines", AA: "American Airlines"
};
function authorityFlight(o) {
  const schedTime = { local: o.sched.local, utc: o.sched.utc };
  const airlineObj = { iata: o.airlineIata || null, icao: null, name: o.airlineName || null };
  const homeSide = {
    airport: { iata: o.homeIata, icao: o.homeIcao || null, name: o.homeName || null },
    ...(o.gate ? { gate: o.gate } : {}),
    scheduledTime: schedTime,
    ...(o.revised ? { revisedTime: { local: o.revised.local, utc: o.revised.utc } } : {}),
    airline: airlineObj,
    quality: ["Live"]
  };
  const otherSide = {
    airport: { iata: o.otherIata || null, icao: null, name: o.otherName || null },
    scheduledTime: schedTime,
    airline: airlineObj,
    quality: ["Live"]
  };
  return {
    number: o.number,
    callSign: o.callSign || null,
    status: o.status,
    codeshareStatus: "IsOperator",
    isCargo: false,
    ...(o.aircraftModel ? { aircraft: { model: o.aircraftModel } } : {}),
    departure: o.dir === "dep" ? homeSide : otherSide,
    arrival: o.dir === "dep" ? otherSide : homeSide,
    _authTs: o.sched.ts
  };
}
__name(authorityFlight, "authorityFlight");
// One cached page/payload fetch per source per TTL, however many screens
// are polling. Negative results are cached briefly so an outage is
// re-probed, not hammered.
async function fetchAuthorityText(cachePath, srcUrl, marker, ttlS, fetchOpts) {
  const cacheKey = new Request(`https://authority-feeds/${cachePath}`);
  const cache = caches.default;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.headers.get("X-Auth-Neg") ? null : await hit.text();
  } catch (e) {}
  let text = null;
  try {
    const opts = fetchOpts || {};
    const r = await fetch(srcUrl, { ...opts, headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OrionConnected-FIDS/1.0; +https://fids.orionconnected.com)",
      "Accept": "text/html,application/json",
      ...(opts.headers || {})
    } });
    if (r.ok) text = await r.text();
  } catch (e) {}
  const good = text && (!marker || text.indexOf(marker) !== -1);
  try {
    await cache.put(cacheKey, good
      ? new Response(text, { headers: { "Cache-Control": `public, max-age=${ttlS}` } })
      : new Response("", { headers: { "Cache-Control": "public, max-age=30", "X-Auth-Neg": "1" } }));
  } catch (e) {}
  return good ? text : null;
}
__name(fetchAuthorityText, "fetchAuthorityText");
// Epoch-ms feeds (YQB's Algolia, and most of the US batch) — render the
// airport's wall-clock local string from a timestamp.
function localTimeObjFromTs(tz, ts) {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
  let hh = g("hour"); if (hh === "24") hh = "00";
  const off = tzOffsetFor(tz, Number(g("year")), Number(g("month")), Number(g("day")));
  return {
    local: `${g("year")}-${g("month")}-${g("day")} ${hh}:${g("minute")}:00${off}`,
    utc: d.toISOString().slice(0, 19).replace("T", " ") + "+00:00",
    ts
  };
}
__name(localTimeObjFromTs, "localTimeObjFromTs");
// "2026-09-03 10:10:00 PM" (YOW's format) → time object in a zone.
function parse12hLocal(tz, s) {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
  if (!m) return null;
  let hh = Number(m[4]) % 12;
  if (/pm/i.test(m[6])) hh += 12;
  return localTimeObjIn(tz, Number(m[1]), Number(m[2]), Number(m[3]), hh, Number(m[5]));
}
__name(parse12hLocal, "parse12hLocal");
function authorityCellsText(row) {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => yhzCellText(m[1]));
}
__name(authorityCellsText, "authorityCellsText");

// ── YYT St. John's — stjohnsairport.com dep/arrtable.php fragments ───
// The richest of the Atlantic feeds: airline IATA in the logo filename,
// the ICAO callsign in the FlightAware link, the city's IATA in a title
// attribute, a per-row date, and a revised-time column. Newfoundland
// runs on the half-hour (America/St_Johns).
function yytParseTable(html, dir, nowMs) {
  const out = [];
  const rows = String(html || "").match(/<tr class="group[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const code = (row.match(/ALimg\/([A-Z0-9]{2,3})\.png/) || [])[1] || null;
    const alName = (row.match(/<td class="airline">[\s\S]*?title="([^"]+)"/) || [])[1] || null;
    const num = (row.match(/class="flight-num">[\s\S]*?>\s*([A-Z0-9]{3,8})\s*<\/a>/) || [])[1];
    const callSign = (row.match(/flightaware\.com\/live\/flight\/([A-Z0-9]+)/) || [])[1] || null;
    const dm = row.match(/class="date">\s*(\d{1,2})\s+([A-Za-z]{3})/);
    const tm = row.match(/class="time">\s*(\d{1,2}):(\d{2})/);
    const rv = row.match(/class="revised">\s*(\d{1,2}):(\d{2})/);
    const cm = row.match(/class="city"><span(?:\s+title="([A-Z]{3})")?[^>]*>([^<]+)/);
    const st = (row.match(/class="[^"]*status"[^>]*>\s*([^<]+?)\s*</) || [])[1] || "";
    if (!num || !dm || !tm) continue;
    const mo = AUTH_MONTHS[dm[2].toUpperCase()];
    if (!mo) continue;
    const y = nearestYear(mo, Number(dm[1]), nowMs);
    const sched = localTimeObjIn("America/St_Johns", y, mo, Number(dm[1]), Number(tm[1]), Number(tm[2]));
    let revised = null;
    if (rv && (rv[1] !== tm[1] || rv[2] !== tm[2])) {
      let r = localTimeObjIn("America/St_Johns", y, mo, Number(dm[1]), Number(rv[1]), Number(rv[2]));
      if (r.ts - sched.ts > 432e5) r = localTimeObjIn("America/St_Johns", y, mo, Number(dm[1]) - 1, Number(rv[1]), Number(rv[2]));
      else if (sched.ts - r.ts > 432e5) r = localTimeObjIn("America/St_Johns", y, mo, Number(dm[1]) + 1, Number(rv[1]), Number(rv[2]));
      revised = r;
    }
    out.push(authorityFlight({
      dir, number: num, callSign, status: yhzStatus(st),
      homeIata: "YYT", homeIcao: "CYYT", homeName: "St. John's",
      otherIata: (cm && cm[1]) || null, otherName: cm ? cm[2].trim() : null,
      airlineIata: code, airlineName: alName, sched, revised
    }));
  }
  return out;
}
__name(yytParseTable, "yytParseTable");

// ── YSJ Saint John — ysjsaintjohn.ca/flights/ (one page, two tables) ─
// Table class carries the direction; rows carry M/D dates outright.
// City sometimes arrives as "YHU-Montréal" — code first, name after.
function ysjParsePage(html, dir, nowMs) {
  const out = [];
  const want = dir === "dep" ? "departures" : "arrivals";
  const tm = String(html || "").match(new RegExp('<table class="flight-table ' + want + '"[\\s\\S]*?<\\/table>'));
  if (!tm) return out;
  const rows = tm[0].match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf("<th") !== -1) continue;
    const cells = authorityCellsText(row);
    if (cells.length < 5) continue;
    const num = cells[0].replace(/\s+/g, "");
    const nm = num.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d{1,4})$/);
    const sm = cells[2].match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (!nm || !sm) continue;
    const y = nearestYear(Number(sm[1]), Number(sm[2]), nowMs);
    const sched = localTimeObjIn("America/Halifax", y, Number(sm[1]), Number(sm[2]), Number(sm[3]), Number(sm[4]));
    let revised = null;
    const am = cells[3].match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (am && cells[3] !== cells[2]) {
      const ry = nearestYear(Number(am[1]), Number(am[2]), nowMs);
      revised = localTimeObjIn("America/Halifax", ry, Number(am[1]), Number(am[2]), Number(am[3]), Number(am[4]));
    }
    const city = cells[1];
    const pref = city.match(/^([A-Z]{3})\s*-\s*(.+)$/);
    const cityName = pref ? pref[2].trim() : city;
    const status = (row.match(/class="status-en">\s*([^<]+?)\s*</) || [, ""])[1];
    out.push(authorityFlight({
      dir, number: num, status: yhzStatus(status),
      homeIata: "YSJ", homeIcao: "CYSJ", homeName: "Saint John",
      otherIata: pref ? pref[1] : (YHZ_CITY_IATA[cityName.toUpperCase()] || null),
      otherName: cityName,
      airlineIata: nm[1], airlineName: AIRLINE_IATA_NAME[nm[1]] || null,
      sched, revised
    }));
  }
  return out;
}
__name(ysjParsePage, "ysjParsePage");

// ── YFC Fredericton — yfcfredericton.ca SSR pages ────────────────────
// Every data row wears class="arrivals" on BOTH pages (their CSS, not a
// direction signal — the URL is the direction). Times are HH:MM with no
// date, so the same midnight walk as Halifax applies; the carrier is a
// display name mapped back to its IATA prefix.
function yfcParseBoard(html, dir, nowMs) {
  const rows = String(html || "").match(/<tr class="arrivals"[\s\S]*?<\/tr>/g) || [];
  const parsed = [];
  for (const row of rows) {
    const cells = authorityCellsText(row);
    if (cells.length < 6) continue;
    const sm = cells[3].match(/^(\d{1,2}):(\d{2})$/);
    const num = cells[1].replace(/\D+/g, "");
    if (!num || !sm) continue;
    parsed.push({ cells, num, eh: Number(sm[1]), em: Number(sm[2]) });
  }
  if (!parsed.length) return [];
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
  // Two passes over the dateless times. Pass one: the usual midnight
  // walk from "today". But late at night this page lists ONLY tomorrow's
  // flights (today's are done and gone), and the walk would then date the
  // whole board into the past — a live departures board can never be
  // entirely behind us, so if it comes out that way, redo the walk from
  // tomorrow (baseOffset 1).
  const build = (baseOffset) => {
    const base = new Date(Date.UTC(g("year"), g("month") - 1, g("day"), 12) + baseOffset * 864e5);
    let y = base.getUTCFullYear(), mo = base.getUTCMonth() + 1, d = base.getUTCDate();
    let prevMin = null;
    const out = [];
    for (const p of parsed) {
      const min = p.eh * 60 + p.em;
      if (prevMin !== null && min < prevMin - 360) {
        const next = new Date(Date.UTC(y, mo - 1, d, 12) + 864e5);
        y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
      }
      prevMin = min;
      const sched = localTimeObjIn("America/Halifax", y, mo, d, p.eh, p.em);
      let revised = null;
      const am = p.cells[4].match(/^(\d{1,2}):(\d{2})$/);
      if (am && (Number(am[1]) !== p.eh || Number(am[2]) !== p.em)) {
        let r = localTimeObjIn("America/Halifax", y, mo, d, Number(am[1]), Number(am[2]));
        if (r.ts - sched.ts > 432e5) r = localTimeObjIn("America/Halifax", y, mo, d - 1, Number(am[1]), Number(am[2]));
        else if (sched.ts - r.ts > 432e5) r = localTimeObjIn("America/Halifax", y, mo, d + 1, Number(am[1]), Number(am[2]));
        revised = r;
      }
      const carrier = p.cells[0], city = p.cells[2];
      // Direct lookup, then space-squashed — "West Jet"/"WestJet",
      // "Pal Airlines"/"PAL Airlines" and whatever spacing comes next.
      const _cu = carrier.toUpperCase().trim();
      const code = AIRLINE_NAME_IATA[_cu]
        || AIRLINE_NAME_IATA_SQUASHED[_cu.replace(/\s+/g, "")] || null;
      out.push(authorityFlight({
        dir, number: code ? code + p.num : p.num, status: yhzStatus(p.cells[5]),
        homeIata: "YFC", homeIcao: "CYFC", homeName: "Fredericton",
        otherIata: YHZ_CITY_IATA[city.toUpperCase()] || null, otherName: city,
        airlineIata: code, airlineName: carrier, sched, revised
      }));
    }
    return out;
  };
  let out = build(0);
  if (out.length && Math.max(...out.map((f) => f._authTs)) < nowMs - 2 * 3600e3) out = build(1);
  return out;
}
__name(yfcParseBoard, "yfcParseBoard");

// ── YOW Ottawa — yow.ca/api/flights/get ──────────────────────────────
// Craft CMS JSON: three days of both directions keyed by date, full 12h
// timestamps WITH dates, city IATA outright, gates, carousel strings,
// bilingual labels. The easiest feed in the whole roster.
function yowParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const days = (dir === "dep" ? j.departures : j.arrivals) || {};
  for (const date of Object.keys(days)) {
    for (const f of (Array.isArray(days[date]) ? days[date] : [])) {
      if (!f || f.DisplayFlight === false) continue;
      const sched = parse12hLocal("America/Toronto", f.SchedTime);
      if (!sched || !f.MasterFlight) continue;
      let revised = null;
      const est = parse12hLocal("America/Toronto", f.EstTime);
      if (est && est.ts !== sched.ts) revised = est;
      const belt = (typeof f.ActualCarousels === "string" && f.ActualCarousels.trim()) ? f.ActualCarousels.trim() : null;
      const fl = authorityFlight({
        dir, number: String(f.MasterFlight).trim(), status: yhzStatus(f.Status),
        homeIata: "YOW", homeIcao: "CYOW", homeName: "Ottawa",
        gate: (f.ActualGate || "").toString().trim() || null,
        otherIata: (f.IATA || "").toString().trim().toUpperCase() || null,
        otherName: (f.ActualCities || "").toString().trim() || null,
        airlineIata: (f.CarrierCode || "").toString().trim().toUpperCase() || null,
        airlineName: f.AirlineName || null, sched, revised
      });
      if (dir === "arr" && belt) fl.arrival.baggageBelt = belt;
      out.push(fl);
    }
  }
  return out;
}
__name(yowParseFeed, "yowParseFeed");

// ── YQB Québec — the site's own Algolia index ────────────────────────
// Typed hits with epoch-ms times and, wonderfully, the AIRCRAFT NAME —
// the first feed of the night to answer "what aircraft" outright. The
// search key is the public one embedded in their own page; if it ever
// rotates, the handler goes quiet and falls through.
function yqbParseHits(jsonText, dir) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const hits = Array.isArray(j.hits) ? j.hits : [];
  for (const h of hits) {
    const isDep = String(h["@type"] || "").indexOf("Departure") !== -1;
    if ((dir === "dep") !== isDep) continue;
    const schedTs = isDep ? h.std : h.sta;
    if (typeof schedTs !== "number" || !h.flightCode) continue;
    const sched = localTimeObjFromTs("America/Toronto", schedTs);
    const estTs = isDep ? (h.atd || h.etd) : (h.ata || h.eta);
    const revised = (typeof estTs === "number" && estTs !== schedTs) ? localTimeObjFromTs("America/Toronto", estTs) : null;
    const city = isDep ? h.destinationAirportCityName : h.originAirportCityName;
    const fl = authorityFlight({
      dir, number: String(h.flightCode).trim(),
      status: yhzStatus(String(isDep ? h.departureStatus : h.arrivalStatus || "").replace(/_/g, " ")),
      homeIata: "YQB", homeIcao: "CYQB", homeName: "Québec",
      gate: (h.gate || "").toString().trim() || null,
      otherIata: YHZ_CITY_IATA[String(city || "").toUpperCase()] || null,
      otherName: city || null,
      airlineIata: (h.airlineIataCode || "").toString().trim().toUpperCase() || null,
      airlineName: h.airline || null,
      aircraftModel: h.aircraftName || null,
      sched, revised
    });
    if (dir === "arr" && h.carouselName) fl.arrival.baggageBelt = String(h.carouselName);
    out.push(fl);
  }
  return out;
}
__name(yqbParseHits, "yqbParseHits");

// ── YEG Edmonton — flyyeg.com SSR pages ──────────────────────────────
// Inline ft-row span chains: "20:15, Sep 04" scheduled (a date — thank
// you), the operator as the first flight-number list item, and a status
// like "Delayed 20:45" that smuggles the revised time inside the words.
function yegParseBoard(html, dir, nowMs) {
  const out = [];
  const chunks = String(html || "").split(/class="[^"]*ft-row/).slice(1);
  for (const chunk of chunks) {
    const sm = chunk.match(/table-heading">Scheduled<\/span>\s*(\d{1,2}):(\d{2}),\s*([A-Za-z]{3})\s+(\d{1,2})/);
    const fm = chunk.match(/<li><span><strong>\s*([A-Z0-9]{2}\s?\d{1,4})\s*<\/strong><\/span>(?:<span[^>]*>([^<]*)<)?/);
    if (!sm || !fm) continue;
    const mo = AUTH_MONTHS[sm[3].toUpperCase()];
    if (!mo) continue;
    const y = nearestYear(mo, Number(sm[4]), nowMs);
    const sched = localTimeObjIn("America/Edmonton", y, mo, Number(sm[4]), Number(sm[1]), Number(sm[2]));
    const stM = chunk.match(/flight-status[^>]*>\s*([A-Za-z ]+?)(?:\s+(\d{1,2}):(\d{2}))?\s*</);
    let revised = null;
    if (stM && stM[2]) {
      let r = localTimeObjIn("America/Edmonton", y, mo, Number(sm[4]), Number(stM[2]), Number(stM[3]));
      if (r.ts - sched.ts > 432e5) r = localTimeObjIn("America/Edmonton", y, mo, Number(sm[4]) - 1, Number(stM[2]), Number(stM[3]));
      else if (sched.ts - r.ts > 432e5) r = localTimeObjIn("America/Edmonton", y, mo, Number(sm[4]) + 1, Number(stM[2]), Number(stM[3]));
      revised = r;
    }
    const city = (chunk.match(/ft-arr-dep[\s\S]*?<strong[^>]*>([^<]+)</) || [, ""])[1].trim();
    const gv = (chunk.match(/ft-baggage-gate[\s\S]*?table-heading">([^<]*)<\/span>\s*([^<]*?)\s*</) || []);
    const isGate = /gate/i.test(gv[1] || "");
    const val = (gv[2] || "").trim() || null;
    const number = fm[1].replace(/\s+/g, " ").trim();
    const fl = authorityFlight({
      dir, number, status: yhzStatus(stM ? stM[1] : ""),
      homeIata: "YEG", homeIcao: "CYEG", homeName: "Edmonton",
      gate: isGate ? val : null,
      otherIata: YHZ_CITY_IATA[city.toUpperCase()] || null, otherName: city || null,
      airlineIata: (number.match(/^([A-Z0-9]{2})/) || [])[1] || null,
      airlineName: (fm[2] || "").trim() || null,
      sched, revised
    });
    if (dir === "arr" && !isGate && val) fl.arrival.baggageBelt = val;
    out.push(fl);
  }
  return out;
}
__name(yegParseBoard, "yegParseBoard");

// ── LHR Heathrow — the pihub feed behind heathrow.com ────────────────
// Full local day, both directions, ~2.4k records each. The entire lock
// is one spoofed Origin header. Times come dated in UTC (sans Z) and
// local; the status rides in aircraftMovementStatus with the revised
// time inside the message ("Expected 04:37", "Landed 04:33, bags
// delivered on belt 02" — the belt included). Operator rows only:
// codeShareStatus NORMAL_FLIGHT.
function lhrParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const arr = Array.isArray(j) ? j : [];
  for (const rec of arr) {
    const fs = rec && rec.flightService;
    if (!fs || String(fs.codeShareStatus || "") !== "NORMAL_FLIGHT") continue;
    const wantAD = dir === "dep" ? "D" : "A";
    if (String(fs.arrivalOrDeparture || "") !== wantAD) continue;
    const pocs = (((fs.aircraftMovement || {}).route || {}).portsOfCall) || [];
    const home = pocs.find((p) => ((p.airportFacility || {}).iataIdentifier) === "LHR");
    const others = pocs.filter((p) => p !== home && p.airportFacility);
    const other = dir === "dep" ? others[others.length - 1] : others[0];
    const schedRaw = (((home || {}).operatingTimes || {}).scheduled || {}).utc;
    if (!home || !other || !schedRaw || !fs.iataFlightIdentifier) continue;
    const schedTs = Date.parse(String(schedRaw).endsWith("Z") ? schedRaw : schedRaw + "Z");
    if (isNaN(schedTs)) continue;
    const sched = localTimeObjFromTs("Europe/London", schedTs);
    const stat = ((fs.aircraftMovement || {}).aircraftMovementStatus || [])[0] || {};
    const msg = String(stat.message || "");
    let status = stat.statusCode === "CX" ? "cancelled"
      : (stat.statusCode === "LD" || stat.statusCode === "LB") ? "arrived"
      : yhzStatus(msg);
    // "Expected 04:37" / "Departed 07:44" — the trailing clock is the
    // revision when it differs from schedule (LHR local wall clock).
    let revised = null;
    const tmM = msg.match(/(\d{1,2}):(\d{2})/);
    if (tmM) {
      const sd = new Date(schedTs);
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(sd);
      const gv = (t) => Number((p.find((x) => x.type === t) || {}).value);
      let r = localTimeObjIn("Europe/London", gv("year"), gv("month"), gv("day"), Number(tmM[1]), Number(tmM[2]));
      if (r.ts - schedTs > 432e5) r = localTimeObjIn("Europe/London", gv("year"), gv("month"), gv("day") - 1, Number(tmM[1]), Number(tmM[2]));
      else if (schedTs - r.ts > 432e5) r = localTimeObjIn("Europe/London", gv("year"), gv("month"), gv("day") + 1, Number(tmM[1]), Number(tmM[2]));
      if (r.ts !== schedTs) revised = r;
    }
    const homeFac = home.airportFacility || {};
    const term = ((homeFac.terminalFacility || {}).code || "").toString() || null;
    const gateFac = (homeFac.terminalFacility || {}).gateFacility || {};
    const gate = (gateFac.code || gateFac.gateNumber || gateFac.name || "").toString() || null;
    const al = fs.airlineParty || {};
    const acT = fs.aircraftTransport || {};
    // "Airbus A330-200 Passenger" → the boards want the airframe, not the cabin.
    const acModel = (acT.description || (acT.aircraftType || {}).name || acT.icaoTypeCode || "")
      .toString().replace(/\s+(Passenger|Freighter)$/i, "") || null;
    const beltM = msg.match(/belt\s+(\w+)/i);
    const fl = authorityFlight({
      dir, number: String(fs.iataFlightIdentifier).trim(),
      callSign: (fs.icaoFlightIdentifier || "").toString().trim() || null,
      status,
      homeIata: "LHR", homeIcao: "EGLL", homeName: "London",
      gate,
      otherIata: (other.airportFacility.iataIdentifier || "").toString() || null,
      otherName: ((other.airportFacility.airportCityLocation || {}).name || other.airportFacility.name || "").toString() || null,
      airlineIata: (al.iataIdentifier || "").toString() || null,
      airlineName: al.name || null,
      aircraftModel: acModel,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    if (term) homeSide.terminal = term;
    if (dir === "arr" && beltM) fl.arrival.baggageBelt = beltM[1].replace(/^0+(?=\d)/, "");
    out.push(fl);
  }
  return out;
}
__name(lhrParseFeed, "lhrParseFeed");

// ── DUB Dublin — api.dublinairport.com, zero auth, 10 rows a page ────
// Rows carry everything a board wants (far-end IATA outright, ISO-Z
// times, belts, terminals, gates on departures); the only work is
// walking the cursor pagination politely and converting Z-times to
// Dublin wall clock.
function dubParseRows(rows, dir) {
  const out = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.flightIdentity || !r.scheduledDateTime) continue;
    const schedTs = Date.parse(r.scheduledDateTime);
    if (isNaN(schedTs)) continue;
    const sched = localTimeObjFromTs("Europe/Dublin", schedTs);
    let revised = null;
    if (r.estimatedDateTime) {
      const et = Date.parse(r.estimatedDateTime);
      if (!isNaN(et) && et !== schedTs) revised = localTimeObjFromTs("Europe/Dublin", et);
    }
    let status = yhzStatus(String(r.statusMessage || ""));
    if (status === "scheduled" && r.isDelayed === true) status = "delayed";
    const fl = authorityFlight({
      dir, number: String(r.flightIdentity).trim(),
      status,
      homeIata: "DUB", homeIcao: "EIDW", homeName: "Dublin",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: (r.airportCode || "").toString().trim().toUpperCase() || null,
      otherName: (dir === "dep" ? r.destinationAirportName : r.originAirportName) || null,
      airlineIata: (r.carrierCode || "").toString().trim().toUpperCase() || null,
      airlineName: r.carrierName || null,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    if (r.terminalName) homeSide.terminal = String(r.terminalName).replace(/^T/i, "");
    if (dir === "arr" && r.baggageBelt) fl.arrival.baggageBelt = String(r.baggageBelt);
    out.push(fl);
  }
  return out;
}
__name(dubParseRows, "dubParseRows");
async function dubFetchAll(dir) {
  const cacheKey = new Request(`https://authority-feeds/dub/${dir}`);
  const cache = caches.default;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.headers.get("X-Auth-Neg") ? null : JSON.parse(await hit.text());
  } catch (e) {}
  const kind = dir === "dep" ? "departures" : "arrivals";
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const gv = (t) => (dp.find((p) => p.type === t) || {}).value;
  const today = `${gv("year")}-${gv("month")}-${gv("day")}`;
  const rows = [];
  try {
    // Today: walk up to 14 pages. Tomorrow: the first 6 cover the
    // board's overnight lookahead. 10 rows a page, tiny responses.
    for (const [date, maxPages] of [[today, 14], [new Date(Date.parse(today + "T12:00:00Z") + 864e5).toISOString().slice(0, 10), 6]]) {
      let after = "", afterId = "";
      for (let p = 0; p < maxPages; p++) {
        const q = after ? `&after=${encodeURIComponent(after)}&after-id=${encodeURIComponent(afterId)}` : "";
        const r = await fetch(`https://api.dublinairport.com/dap/flight-listing/${kind}?date=${date}${q}`, {
          headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; OrionConnected-FIDS/1.0)" }
        });
        if (!r.ok) break;
        const j = await r.json().catch(() => null);
        const page = (j && Array.isArray(j.content)) ? j.content : [];
        if (!page.length) break;
        rows.push(...page);
        // The cursor lives in the response's OWN pagination object —
        // latestTimestamp/latestId are their opaque values, NOT the last
        // row's fields (verified live 2026-09-05: row-derived cursors
        // return an empty page and the walk starved at 20 flights).
        const pg = (j && j.pagination) || {};
        after = pg.latestTimestamp || ""; afterId = pg.latestId || "";
        if (!pg.hasNext || !after || !afterId) break;
      }
    }
  } catch (e) {}
  const good = rows.length > 0;
  try {
    await cache.put(cacheKey, good
      ? new Response(JSON.stringify(rows), { headers: { "Cache-Control": "public, max-age=120", "Content-Type": "application/json" } })
      : new Response("", { headers: { "Cache-Control": "public, max-age=30", "X-Auth-Neg": "1" } }));
  } catch (e) {}
  return good ? rows : null;
}
__name(dubFetchAll, "dubFetchAll");

// ── US batch (2026-09-05, deep in the night shift) ───────────────────
// BOS Massport — JSON with UTC timestamps, gates, terminals, baggage
// claims, and (bless them) AcType + AcReg: aircraft answered outright.
function bosParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  for (const r of (Array.isArray(j.Flights) ? j.Flights : [])) {
    if (!r || r.IsCodeShare === true || r.IsOperator === false) continue;
    const code = (r.AirlineCode || "").toString().trim().toUpperCase()
      || ((r.AirlineLogo || "").match(/\/([A-Z0-9]{2,3})\.svg/i) || [])[1] || "";
    const num = (r.FlightNumber || "").toString().trim();
    const su = (r.ScheduledTimeUtc || "").toString();
    if (!code || !num || !su) continue;
    const ts = Date.parse(su.endsWith("Z") ? su : su + "Z");
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("America/New_York", ts);
    // ActualTime is a local "H:MM PM" clock; only a differing value is a
    // revision, hung on the scheduled calendar day (±12 h wrap rule).
    let revised = null;
    const am = (r.ActualTime || "").toString().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (am) {
      let hh = Number(am[1]) % 12; if (/pm/i.test(am[3])) hh += 12;
      const sd = sched.local.slice(0, 10).split("-").map(Number);
      let rv = localTimeObjIn("America/New_York", sd[0], sd[1], sd[2], hh, Number(am[2]));
      if (rv.ts - ts > 432e5) rv = localTimeObjIn("America/New_York", sd[0], sd[1], sd[2] - 1, hh, Number(am[2]));
      else if (ts - rv.ts > 432e5) rv = localTimeObjIn("America/New_York", sd[0], sd[1], sd[2] + 1, hh, Number(am[2]));
      if (rv.ts !== ts) revised = rv;
    }
    let status = yhzStatus(r.Remarks || "");
    if (status === "scheduled" && String(r.Delayed) === "True") status = "delayed";
    const isDep = dir === "dep";
    const fl = authorityFlight({
      dir, number: `${code}${num}`, status,
      homeIata: "BOS", homeIcao: "KBOS", homeName: "Boston",
      gate: (r.Gate || "").toString().trim() || null,
      otherIata: ((isDep ? r.DestinationAirportCode : r.OriginAirportCode) || "").toString().toUpperCase() || null,
      otherName: (isDep ? (r.DestinationCity || r.DestinationAirportName) : (r.OriginCity || r.OriginAirportName)) || null,
      airlineIata: code, airlineName: r.AirlineName || null,
      aircraftModel: (r.AcType || "").toString().trim() || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    if (r.Terminal) homeSide.terminal = String(r.Terminal);
    if (!isDep && (r.Baggage || r.BaggageClaims)) fl.arrival.baggageBelt = String(r.Baggage || r.BaggageClaims);
    if (r.AcReg) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = String(r.AcReg); }
    out.push(fl);
  }
  return out;
}
__name(bosParseFeed, "bosParseFeed");

// LAS Harry Reid — the same vendor family as MCO's feed: epoch-second
// timestamps, operator flight numbers with the code baked in, terminal,
// gate, belts. The Api-Key is the public one embedded in their site
// bundle (the YQB-Algolia precedent); if it rotates the handler goes
// quiet and falls through.
function lasParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  for (const r of (((j.data || {}).flights) || [])) {
    if (!r) continue;
    const isArr = r.arrival === true;
    if ((dir === "arr") !== isArr) continue;
    const num = (r.operatingAirlineFlightNumber || "").toString().trim();
    if (!num || typeof r.scheduledTimestamp !== "number") continue;
    const sched = localTimeObjFromTs("America/Los_Angeles", r.scheduledTimestamp * 1000);
    const bt = r.bestKnownTimestamp;
    const revised = (typeof bt === "number" && bt !== r.scheduledTimestamp)
      ? localTimeObjFromTs("America/Los_Angeles", bt * 1000) : null;
    const belt = Array.isArray(r.baggageBelt) && r.baggageBelt.length ? r.baggageBelt.join(", ") : null;
    const fl = authorityFlight({
      dir, number: num, status: yhzStatus(r.status || r.originalStatus || ""),
      homeIata: "LAS", homeIcao: "KLAS", homeName: "Las Vegas",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: ((isArr ? r.departureAirport : r.arrivalAirport) || "").toString().toUpperCase() || null,
      otherName: null,
      airlineIata: (r.iataOperatingAirline || "").toString().toUpperCase() || null,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    if (r.terminal) homeSide.terminal = String(r.terminal).replace(/^T/i, "");
    if (dir === "arr" && belt) fl.arrival.baggageBelt = belt;
    out.push(fl);
  }
  return out;
}
__name(lasParseFeed, "lasParseFeed");

// DEN — the Fruition widget host behind flydenver.com (the site itself
// is Cloudflare-walled; this vendor host is open — and named like a QA
// box, so treat every silence as "the host moved" and fall through).
function denParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  for (const r of (Array.isArray(j) ? j : [])) {
    if (!r || !r.flightNumber) continue;
    const sm = String(r.scheduledTime || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!sm) continue;
    const sched = localTimeObjIn("America/Denver", Number(sm[1]), Number(sm[2]), Number(sm[3]), Number(sm[4]), Number(sm[5]));
    out.push(authorityFlight({
      dir, number: String(r.flightNumber).trim(),
      status: yhzStatus(r.status || r.statusRaw || ""),
      homeIata: "DEN", homeIcao: "KDEN", homeName: "Denver",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: (r.airportCode || "").toString().toUpperCase() || null,
      otherName: r.airportCity || null,
      airlineIata: (r.airlineCode || "").toString().toUpperCase() || null,
      airlineName: r.airline || null,
      sched, revised: null
    }));
  }
  return out;
}
__name(denParseFeed, "denParseFeed");

// ORD/MDW — Chicago's WCF warehouse service, times as /Date(ms-0500)/.
function ordWcfTs(s) {
  const m = String(s || "").match(/\/Date\((\d+)(?:[+-]\d{4})?\)\//);
  return m ? Number(m[1]) : NaN;
}
__name(ordWcfTs, "ordWcfTs");
function ordParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const isDep = dir === "dep";
  for (const r of (Array.isArray(j) ? j : [])) {
    if (!r || !r.AirlineCodeFlightNumber) continue;
    const schedTs = ordWcfTs(isDep ? r.DepartureDateTimeScheduled : r.ArrivalDateTimeScheduled);
    if (isNaN(schedTs)) continue;
    const sched = localTimeObjFromTs("America/Chicago", schedTs);
    const estTs = ordWcfTs(isDep
      ? (r.DepartureDateTimeActualGate || r.DepartureDateTimeEstimatedGate)
      : (r.ArrivalDateTimeActualGate || r.ArrivalDateTimeEstimatedGate));
    const revised = (!isNaN(estTs) && estTs !== schedTs) ? localTimeObjFromTs("America/Chicago", estTs) : null;
    let status = yhzStatus(r.Status || "");
    if (status === "scheduled") status = yhzStatus(r.Remarks || "");
    const fl = authorityFlight({
      dir, number: String(r.AirlineCodeFlightNumber).trim(), status,
      homeIata: "ORD", homeIcao: "KORD", homeName: "Chicago",
      gate: ((isDep ? r.DepartureGate : r.ArrivalGate) || "").toString().trim() || null,
      otherIata: ((isDep ? r.AirportDestinationCode : r.AirportOriginCode) || "").toString().toUpperCase() || null,
      otherName: (isDep ? r.AirportDestinationCity : r.AirportOriginCity) || null,
      airlineIata: (r.AirlineCode || "").toString().toUpperCase() || null,
      airlineName: r.AirlineName || null,
      aircraftModel: (r.Equipment || "").toString().trim() || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const term = (isDep ? r.DepartureTerminal : r.ArrivalTerminal);
    if (term) homeSide.terminal = String(term);
    if (!isDep && r.BaggageClaim) fl.arrival.baggageBelt = String(r.BaggageClaim);
    out.push(fl);
  }
  return out;
}
__name(ordParseFeed, "ordParseFeed");

// PHL — one SSR page, two DataTables; every time cell carries the epoch
// in data-order, the airline code in data-iata-code, and the flight
// number in its own div. The gate letter doubles as the terminal.
function phlParsePage(html, dir, nowMs) {
  const out = [];
  const want = dir === "dep" ? "flight_feed_departures_table" : "flight_feed_arrivals_table";
  const tm = String(html || "").split(want)[1];
  if (!tm) return out;
  const table = tm.split("</table>")[0] || "";
  const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf("<th") !== -1) continue;
    const ep = (row.match(/data-order="(\d{9,11})"/) || [])[1];
    const code = (row.match(/data-iata-code="([A-Z0-9]{2,3})"/) || [])[1];
    const numM = row.match(/flight-number[^>]*>\s*([A-Z0-9]{2,3})\s*(\d{1,4})/);
    if (!ep || !code || !numM) continue;
    const sched = localTimeObjFromTs("America/New_York", Number(ep) * 1000);
    const city = ((row.match(/airport-name[^>]*>([^<]+)</) || [])[1] || "").trim();
    const cells = authorityCellsText(row);
    // Status is the cell that reads like one; the gate is a short token
    // in one of the trailing cells (its letter is the terminal).
    let status = "scheduled", gate = null;
    for (const c of cells.slice(2)) {
      const s = yhzStatus(c);
      if (s !== "scheduled" || /on\s?time|scheduled/i.test(c)) { if (s !== "scheduled") status = s; continue; }
      if (/^[A-F]\d{0,2}$/i.test(c.trim())) gate = c.trim().toUpperCase();
    }
    const fl = authorityFlight({
      dir, number: `${numM[1]} ${numM[2]}`, status,
      homeIata: "PHL", homeIcao: "KPHL", homeName: "Philadelphia",
      gate,
      otherIata: YHZ_CITY_IATA[city.toUpperCase()] || null, otherName: city || null,
      airlineIata: code, sched, revised: null
    });
    if (gate) (dir === "dep" ? fl.departure : fl.arrival).terminal = gate[0];
    out.push(fl);
  }
  return out;
}
__name(phlParsePage, "phlParsePage");

// ── West batch (2026-09-05 daytime shift) ────────────────────────────
// YYC Calgary — DNN service whose body is JSON-encoded JSON (parse it
// twice), 2,700+ rows, UTC+local pairs, gates, concourses, claim units.
function yycParseFeed(rawText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(rawText); if (typeof j === "string") j = JSON.parse(j); } catch (e) { return out; }
  const wantLeg = dir === "dep" ? "D" : "A";
  for (const r of (Array.isArray(j) ? j : [])) {
    if (!r || r.Leg !== wantLeg) continue;
    if (r.Nature && r.Nature !== "J" && r.Nature !== "C") continue;   // their own app's filter
    const code = (r.AirlineIATACode || r.AirlineCode || "").toString().toUpperCase();
    const su = (r.ScheduledTimeUTC || "").toString().replace(" ", "T");
    if (!code || !r.FlightNumber || !su) continue;
    const ts = Date.parse(su);
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("America/Edmonton", ts);
    const eu = ((r.ActualTimeUTC || r.EstimatedTimeUTC || "") + "").replace(" ", "T");
    const ets = eu ? Date.parse(eu) : NaN;
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("America/Edmonton", ets) : null;
    const fl = authorityFlight({
      dir, number: `${code}${String(r.FlightNumber).trim()}`,
      status: yhzStatus(r.ShortPrimaryStatusTextEnglish || r.LongPrimaryStatusTextEnglish || ""),
      homeIata: "YYC", homeIcao: "CYYC", homeName: "Calgary",
      gate: (r.PrimaryGate || "").toString().trim() || null,
      otherIata: (r.AirportCode || "").toString().toUpperCase() || null,
      otherName: r.AirportName || null,
      airlineIata: code, airlineName: r.AirlineName || null,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    if (r.Concourse) homeSide.terminal = String(r.Concourse);
    if (dir === "arr" && r.ClaimUnit) fl.arrival.baggageBelt = String(r.ClaimUnit);
    out.push(fl);
  }
  return out;
}
__name(yycParseFeed, "yycParseFeed");

// SFO — flysfo.com's own on-site API (the old dev portal's successor,
// zero auth): callsigns, gates, terminals, carousels, first/last bag,
// ISO times with offsets. The 11 MB payload is the only catch — cache
// hard and filter per direction.
function sfoParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const want = dir === "dep" ? "Departure" : "Arrival";
  for (const r of (Array.isArray(j.data) ? j.data : [])) {
    if (!r || r.flight_kind !== want) continue;
    const al = r.airline || {};
    const code = (al.iata_code || "").toString().toUpperCase();
    const su = r.scheduled_in_off_block_time || r.scheduled_aod_time;
    if (!code || !r.flight_number || !su) continue;
    const ts = Date.parse(su);
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("America/Los_Angeles", ts);
    const eu = r.actual_in_off_block_time || r.actual_aod_time || r.estimated_in_off_block_time || r.estimated_aod_time;
    const ets = eu ? Date.parse(eu) : NaN;
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("America/Los_Angeles", ets) : null;
    const ap = r.airport || {};
    const acT = r.aircraft_transport_type;
    const fl = authorityFlight({
      dir, number: `${code}${String(r.flight_number).trim()}`,
      callSign: (r.callsign || "").toString().trim() || null,
      status: yhzStatus(r.remark || ""),
      homeIata: "SFO", homeIcao: "KSFO", homeName: "San Francisco",
      gate: ((r.gate || {}).gate_number || "").toString().trim() || null,
      otherIata: (ap.iata_code || "").toString().toUpperCase() || null,
      otherName: ap.airport_city || ap.airport_name || null,
      airlineIata: code, airlineName: al.airline_display_name || al.airline_name || null,
      aircraftModel: (typeof acT === "string" && acT.trim()) ? acT.trim() : null,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    const term = ((r.terminal || {}).terminal_code || "").toString();
    if (term) homeSide.terminal = term.replace(/^T/i, "");
    const car = ((r.baggage_carousel || {}).carousel_name || "").toString();
    if (dir === "arr" && car) fl.arrival.baggageBelt = car.replace(/^CL-/i, "");
    out.push(fl);
  }
  return out;
}
__name(sfoParseFeed, "sfoParseFeed");

// SEA — Sea-Tac's Drupal flight-status page, server-rendered rows with a
// per-row DATE column (mm-dd-yyyy) and 12-hour clocks. The page serves a
// window of rows around now, which is exactly a board's appetite.
function seaParsePage(html, dir, nowMs) {
  const out = [];
  const rows = String(html || "").match(/<tr[^>]*class="(?:ItemStyleClass|AltItemStyleClass)"[\s\S]*?<\/tr>/g)
    || String(html || "").match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf("<th") !== -1) continue;
    const cells = authorityCellsText(row);
    if (cells.length < 6) continue;
    const cityRaw = cells[0];
    const nm = cells[2].replace(/\s+/g, "").match(/^([A-Z0-9]{2})(\d{1,4})$/);
    const dm = cells[3].match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    const tm = cells[4].match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!nm || !dm || !tm) continue;
    let hh = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hh += 12;
    const sched = localTimeObjIn("America/Los_Angeles", Number(dm[3]), Number(dm[1]), Number(dm[2]), hh, Number(tm[2]));
    const paren = cityRaw.match(/\(([A-Z]{3})\)/);
    const fl = authorityFlight({
      dir, number: `${nm[1]}${nm[2]}`,
      status: yhzStatus(cells[5]),
      homeIata: "SEA", homeIcao: "KSEA", homeName: "Seattle",
      gate: (cells[6] || "").trim() || null,
      otherIata: paren ? paren[1] : null,
      otherName: cityRaw.replace(/\s*\([A-Z]{3}\)\s*/, "").trim() || null,
      airlineIata: nm[1], airlineName: cells[1] || null,
      sched, revised: null
    });
    if (dir === "arr" && cells[7] && /^\d{1,2}$/.test(cells[7].trim())) fl.arrival.baggageBelt = cells[7].trim();
    out.push(fl);
  }
  return out;
}
__name(seaParsePage, "seaParsePage");

// YVR — the Sitecore OData endpoint behind yvr.ca. Cloudflare 403s every
// curl we tried, but the Worker's egress is a different animal: this
// handler is the experiment. Schema reconstructed from an archived
// capture, so every read is defensive; if the wall holds, the handler
// stays silent forever and costs nothing.
function yvrParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.value) ? j.value : []);
  const want = dir === "dep" ? "D" : "A";
  for (const r of rows) {
    if (!r || String(r.FlightType || "").toUpperCase() !== want) continue;
    const numRaw = (r.FlightNumber || "").toString().replace(/\s+/g, "");
    const nm = numRaw.match(/^([A-Z0-9]{2})(\d{1,4})$/);
    // Their timestamps carry no offset ("2026-09-05T16:25:00") — naive
    // ISO parses as UTC in Workers and as system-local in node, so parse
    // the components and pin them to Vancouver's wall clock explicitly.
    const yvrTime = (s) => {
      const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!m) return null;
      if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(String(s))) { const t = Date.parse(s); return isNaN(t) ? null : localTimeObjFromTs("America/Vancouver", t); }
      return localTimeObjIn("America/Vancouver", Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
    };
    const sched = yvrTime(r.FlightScheduledTime);
    if (!nm || !sched) continue;
    const est = yvrTime(r.FlightEstimatedTime);
    const revised = (est && est.ts !== sched.ts) ? est : null;
    const ts = sched.ts;
    const fl = authorityFlight({
      dir, number: numRaw,
      status: yhzStatus(r.FlightStatus || r.FlightRemarks || ""),
      homeIata: "YVR", homeIcao: "CYVR", homeName: "Vancouver",
      gate: (r.FlightGate || "").toString().trim() || null,
      otherIata: (r.FlightAirportCode || "").toString().toUpperCase() || null,
      otherName: r.FlightCity || null,
      airlineIata: nm[1], airlineName: r.FlightAirlineName || null,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    if (r.FlightRange) homeSide.terminal = String(r.FlightRange);
    if (dir === "arr" && r.FlightCarousel) fl.arrival.baggageBelt = String(r.FlightCarousel);
    out.push(fl);
  }
  return out;
}
__name(yvrParseFeed, "yvrParseFeed");

// ── Canada wave 2 (2026-09-05) ───────────────────────────────────────
// YLW Kelowna — the richest small-airport feed: a wide-open Azure blob
// (the site itself Cloudflare-403s) with true UTC ISO times, gate,
// baggage, AND tail number. AirlineCode is IATA, FlightNumber bare,
// ArrivalOrDeparture says the direction outright.
function ylwParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  for (const r of rows) {
    if (!r) continue;
    const isDep = /^dep/i.test(String(r.ArrivalOrDeparture || ""));
    if ((dir === "dep") !== isDep) continue;
    const code = (r.AirlineCode || "").toString().toUpperCase();
    const su = r.ScheduleTime || "";
    if (!code || !r.FlightNumber || !su) continue;
    const ts = Date.parse(su);
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("America/Vancouver", ts);
    const ets = r.EstimatedTime ? Date.parse(r.EstimatedTime) : NaN;
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("America/Vancouver", ets) : null;
    const fl = authorityFlight({
      dir, number: `${code}${String(r.FlightNumber).trim()}`,
      status: yhzStatus(r.Status || r.StatusRaw || ""),
      homeIata: "YLW", homeIcao: "CYLW", homeName: "Kelowna",
      gate: (r.Gate || "").toString().trim() || null,
      otherIata: (r.ViaAirportCode || "").toString().toUpperCase() || null,
      otherName: r.ViaAirportCity || null,
      airlineIata: code, airlineName: AIRLINE_IATA_NAME[code] || null,
      sched, revised
    });
    if (dir === "arr" && r.Baggage) fl.arrival.baggageBelt = String(r.Baggage).replace(/^0+(?=\d)/, "");
    if (r.TailNumber) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = String(r.TailNumber); }
    out.push(fl);
  }
  return out;
}
__name(ylwParseFeed, "ylwParseFeed");

// YXX Abbotsford — Drupal REST: carrier NAME, an ICAO-ish display code
// (FLE507) plus the bare number, a local "scheddate" and a revised
// "time". No gate. Pacific.
function yxxParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : Object.values(j).find(Array.isArray) || []);
  for (const r of rows) {
    if (!r || !r.number) continue;
    const sm = String(r.scheddate || "").match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!sm) continue;
    const sched = localTimeObjIn("America/Vancouver", Number(sm[1]), Number(sm[2]), Number(sm[3]), Number(sm[4]), Number(sm[5]));
    // Derive IATA from the carrier name; the "display" code is ICAO-ish.
    const code = AIRLINE_NAME_IATA[String(r.carrier || "").toUpperCase().trim()]
      || AIRLINE_NAME_IATA_SQUASHED[String(r.carrier || "").toUpperCase().replace(/\s+/g, "").replace(/AIR$/, "")]
      || null;
    const num = String(r.number).replace(/^[A-Z]/, "").replace(/\D/g, "") || String(r.number).replace(/\D/g, "");
    let revised = null;
    const tm = String(r.time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (tm && String(r.time) !== String(r.schedtime)) {
      let hh = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hh += 12;
      revised = localTimeObjIn("America/Vancouver", Number(sm[1]), Number(sm[2]), Number(sm[3]), hh, Number(tm[2]));
    }
    out.push(authorityFlight({
      dir, number: code ? `${code}${num}` : String(r.display || r.number).trim(),
      status: yhzStatus(r.status || ""),
      homeIata: "YXX", homeIcao: "CYXX", homeName: "Abbotsford",
      otherIata: YHZ_CITY_IATA[String(r.origin || r.destination || "").toUpperCase()] || null,
      otherName: r.origin || r.destination || null,
      airlineIata: code, airlineName: r.carrier || null,
      sched, revised
    }));
  }
  return out;
}
__name(yxxParseFeed, "yxxParseFeed");

// YQR Regina — a clean data-th table, one per direction; airline from
// the icon class (icon-ws-blue → WS), date "Sep-04" (no year). Regina
// keeps CST all year (no DST), so a fixed offset is correct.
function yqrParsePage(html, dir, nowMs) {
  const out = [];
  const rows = String(html || "").match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf('data-th="Flight"') === -1) continue;
    const numM = row.match(/data-th="Flight"[^>]*>(?:<span[^>]*class="([^"]*)"[^>]*><\/span>)?\s*([A-Z0-9]{2,3}\d{1,4})/);
    const cityM = row.match(/data-th="(?:Origin|Destination)"[^>]*>([^<]+)/);
    const dm = row.match(/data-th="Date"[^>]*>([A-Za-z]{3})-(\d{1,2})/);
    const sm = row.match(/data-th="Scheduled"[^>]*>\s*(\d{1,2}):(\d{2})/);
    const rvM = row.match(/data-th="Revised"[^>]*>(?:<span[^>]*>)?\s*(\d{1,2}):(\d{2})/);
    const stM = row.match(/data-th="Status"[^>]*>(?:<span[^>]*>)?\s*([^<]+)/);
    if (!numM || !dm || !sm) continue;
    const mo = AUTH_MONTHS[dm[1].toUpperCase()];
    if (!mo) continue;
    const y = nearestYear(mo, Number(dm[2]), nowMs);
    const sched = localTimeObjIn("America/Regina", y, mo, Number(dm[2]), Number(sm[1]), Number(sm[2]));
    let revised = null;
    if (rvM && (rvM[1] !== sm[1] || rvM[2] !== sm[2])) {
      let r = localTimeObjIn("America/Regina", y, mo, Number(dm[2]), Number(rvM[1]), Number(rvM[2]));
      if (r.ts - sched.ts > 432e5) r = localTimeObjIn("America/Regina", y, mo, Number(dm[2]) - 1, Number(rvM[1]), Number(rvM[2]));
      else if (sched.ts - r.ts > 432e5) r = localTimeObjIn("America/Regina", y, mo, Number(dm[2]) + 1, Number(rvM[1]), Number(rvM[2]));
      revised = r;
    }
    // "icon-ws-blue" / "icon-ac-blue" → WS / AC.
    const iconCode = ((numM[1] || "").match(/icon-([a-z0-9]{2})[-\b]/) || [])[1];
    const code = (iconCode ? iconCode.toUpperCase() : (numM[2].match(/^([A-Z0-9]{2})/) || [])[1]) || null;
    const city = (cityM ? cityM[1] : "").trim();
    out.push(authorityFlight({
      dir, number: numM[2].trim(),
      status: yhzStatus(stM ? stM[1] : ""),
      homeIata: "YQR", homeIcao: "CYQR", homeName: "Regina",
      otherIata: YHZ_CITY_IATA[city.toUpperCase()] || null, otherName: city || null,
      airlineIata: code, airlineName: code ? (AIRLINE_IATA_NAME[code] || null) : null,
      sched, revised
    }));
  }
  return out;
}
__name(yqrParsePage, "yqrParsePage");

// YHM Hamilton — one page, #arrivals and #departures panes, each a set
// of `.flight` divs carrying data-datetime (scheduled local), data-city
// and data-airline (name). Status is the div's own class + a revised
// "HH:MM / Mon DD" in the status cell. Eastern.
function yhmParseBoard(html, dir, nowMs) {
  const out = [];
  const paneId = dir === "dep" ? "departures" : "arrivals";
  const paneSplit = String(html || "").split(new RegExp(`id=["']${paneId}["']`));
  if (paneSplit.length < 2) return out;
  // Everything from this pane's id to the start of the OTHER pane.
  const other = dir === "dep" ? "arrivals" : "departures";
  const pane = paneSplit[1].split(new RegExp(`id=["']${other}["']`))[0];
  const blocks = pane.match(/<div class=['"]flight[\s\S]*?data-airline=['"][^'"]*['"]/g) || [];
  // Re-split into whole flight blocks by the opening marker.
  const chunks = pane.split(/<div class=['"]flight\b/).slice(1);
  for (const chunk of chunks) {
    const dm = chunk.match(/data-datetime=['"](\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    const city = (chunk.match(/data-city=['"]([^'"]*)/) || [, ""])[1];
    const airline = (chunk.match(/data-airline=['"]([^'"]*)/) || [, ""])[1];
    const numM = chunk.match(/class=['"]flight-number['"][^>]*>[\s\S]*?(\d{1,4})\s*<\/span>/);
    if (!dm || !numM) continue;
    const sched = localTimeObjIn("America/Toronto", Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(dm[4]), Number(dm[5]));
    const statusText = (chunk.match(/^\s*([A-Za-z ]+?)['"]/) || [, ""])[1].trim()
      || (chunk.match(/text-(?:danger|success|warning|muted)['"][^>]*><strong>([^<]+)/) || [, ""])[1];
    let revised = null;
    const rvM = chunk.match(/<strong>[^<]*<\/strong><span[^>]*>\s*(\d{1,2}):(\d{2})\s*\/\s*([A-Za-z]{3})\s+(\d{1,2})/);
    if (rvM) {
      const mo = AUTH_MONTHS[rvM[3].toUpperCase()];
      if (mo) revised = localTimeObjIn("America/Toronto", nearestYear(mo, Number(rvM[4]), nowMs), mo, Number(rvM[4]), Number(rvM[1]), Number(rvM[2]));
    }
    const code = AIRLINE_NAME_IATA[airline.toUpperCase()] || AIRLINE_NAME_IATA_SQUASHED[airline.toUpperCase().replace(/\s+/g, "")] || null;
    out.push(authorityFlight({
      dir, number: code ? `${code}${numM[1]}` : numM[1],
      status: yhzStatus(statusText),
      homeIata: "YHM", homeIcao: "CYHM", homeName: "Hamilton",
      otherIata: YHZ_CITY_IATA[city.toUpperCase()] || null, otherName: city || null,
      airlineIata: code, airlineName: airline || null,
      sched, revised
    }));
  }
  return out;
}
__name(yhmParseBoard, "yhmParseBoard");

// ── US wave 2 (2026-09-05) ───────────────────────────────────────────
// Small shared helper: parse an offset-less local ISO string as a wall
// clock in the given zone (naive Date.parse would read it as UTC in the
// Worker). Returns a time object or null.
function localIsoObj(tz, s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(String(s))) { const t = Date.parse(s); return isNaN(t) ? null : localTimeObjFromTs(tz, t); }
  return localTimeObjIn(tz, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}
__name(localIsoObj, "localIsoObj");
// A revised time more than 12 h off schedule is the same wall clock on
// the other side of midnight — nudge it a day toward schedule.
function settleRevised(revised, sched, tz) {
  if (!revised || !sched) return revised;
  if (revised.ts - sched.ts > 432e5 || sched.ts - revised.ts > 432e5) {
    const d = new Date(revised.ts + (revised.ts > sched.ts ? -864e5 : 864e5));
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
    return localTimeObjIn(tz, g("year"), g("month"), g("day"), g("hour") === 24 ? 0 : g("hour"), g("minute"));
  }
  return revised;
}
__name(settleRevised, "settleRevised");

// PDX Portland — Port of Portland's in-house ASP.NET feed, one GET for
// both directions and a multi-day window. Cities[] carries the IATA
// code; gates are space-padded; StatusCode is a two-letter enum.
const PDX_STATUS = { ON: "scheduled", DP: "departed", AR: "arrived", CX: "cancelled", DL: "delayed", DV: "diverted" };
function pdxParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  for (const r of (Array.isArray(j.Flights) ? j.Flights : [])) {
    if (!r) continue;
    const isDep = String(r.ScheduleType || "").toUpperCase() === "D";
    if ((dir === "dep") !== isDep) continue;
    const code = (r.CarrierCode || "").toString().toUpperCase();
    if (!code || r.FlightNo == null) continue;
    const sched = localIsoObj("America/Los_Angeles", r.ScheduledTime);
    if (!sched) continue;
    const est = localIsoObj("America/Los_Angeles", r.ActualTime || r.EstimatedTime);
    const revised = (est && est.ts !== sched.ts) ? est : null;
    const city = (Array.isArray(r.Cities) && r.Cities.length) ? r.Cities[r.Cities.length - 1] : {};
    const fl = authorityFlight({
      dir, number: `${code}${r.FlightNo}`,
      status: PDX_STATUS[String(r.StatusCode || "").toUpperCase()] || yhzStatus(r.StatusCode || ""),
      homeIata: "PDX", homeIcao: "KPDX", homeName: "Portland",
      gate: (r.Gate || "").toString().trim() || null,
      otherIata: (city.Code || "").toString().toUpperCase() || null,
      otherName: city.Name || null,
      airlineIata: code, airlineName: r.CarrierName || null,
      sched, revised
    });
    if (dir === "arr" && r.BagCarousel) fl.arrival.baggageBelt = String(r.BagCarousel).trim();
    out.push(fl);
  }
  return out;
}
__name(pdxParseFeed, "pdxParseFeed");

// DTW Detroit — Wayne County's proxy. ScheduledDateTime is a dummy
// (0001-01-01) so EstimatedDateTime is the operative time; there's no
// separate revision to show. Gate letter is the concourse.
function dtwParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.Flights) ? j.Flights : []);
  const isDep = dir === "dep";
  for (const r of rows) {
    if (!r) continue;
    const wantType = isDep ? "Departure" : "Arrival";
    if (r.FlightType && r.FlightType !== wantType) continue;
    const num = (r.CombinedFlightNumber || ((r.AirLineCode || "") + (r.FlightNumber || ""))).toString().trim();
    const sched = localIsoObj("America/Detroit", r.EstimatedDateTime);
    if (!num || !sched) continue;
    out.push(authorityFlight({
      dir, number: num,
      status: yhzStatus(r.PublicStatus || ""),
      homeIata: "DTW", homeIcao: "KDTW", homeName: "Detroit",
      gate: (r.Gate || "").toString().trim() || null,
      otherIata: ((isDep ? r.ArrivalAirportCode : r.DepartureAirportCode) || "").toString().toUpperCase() || null,
      otherName: (isDep ? r.ArrivalCity : r.DepartureCity) || null,
      airlineIata: (r.AirLineCode || "").toString().toUpperCase() || null,
      airlineName: r.AirLine || r.AirLineFullNameName || null,
      sched, revised: null
    }));
  }
  return out;
}
__name(dtwParseFeed, "dtwParseFeed");

// SAN San Diego — Fruition JSON (public embedded x-api-key). Separate
// FLIGHT_DATE + SCHEDULED_TIME; BAGGAGE_CLAIM encodes the terminal
// ("T2-1" → terminal 2, claim 1); AIRCRAFT_REGISTRATION when present.
function sanParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  const isDep = dir === "dep";
  for (const r of rows) {
    if (!r) continue;
    if (r.DIRECTION && (String(r.DIRECTION).toUpperCase() === "D") !== isDep) continue;
    const code = (r.AIRLINE_CODE || "").toString().toUpperCase();
    const dm = String(r.FLIGHT_DATE || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const tm = String(r.SCHEDULED_TIME || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!code || !r.FLIGHT_NUMBER || !dm || !tm) continue;
    const sched = localTimeObjIn("America/Los_Angeles", Number(dm[3]), Number(dm[1]), Number(dm[2]), Number(tm[1]), Number(tm[2]));
    let revised = null;
    const am = String(r.ACTUAL_TIME || "").match(/^(\d{1,2}):(\d{2})$/);
    if (am && (am[1] !== tm[1] || am[2] !== tm[2])) {
      revised = settleRevised(localTimeObjIn("America/Los_Angeles", Number(dm[3]), Number(dm[1]), Number(dm[2]), Number(am[1]), Number(am[2])), sched, "America/Los_Angeles");
    }
    const claim = String(r.BAGGAGE_CLAIM || "");
    const claimM = claim.match(/^T?(\d)-(\w+)$/);
    const fl = authorityFlight({
      dir, number: `${code}${String(r.FLIGHT_NUMBER).trim()}`,
      status: yhzStatus(r.FLIGHT_STATUS || r.REMARKS || ""),
      homeIata: "SAN", homeIcao: "KSAN", homeName: "San Diego",
      gate: (r.GATE || "").toString().trim() || null,
      otherIata: (r.AIRPORT_CODE || "").toString().toUpperCase() || null,
      otherName: r.AIRPORT_CITY || null,
      airlineIata: code, airlineName: r.AIRLINE_NAME || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    if (claimM) { homeSide.terminal = claimM[1]; if (!isDep) fl.arrival.baggageBelt = claimM[2]; }
    if (r.AIRCRAFT_REGISTRATION) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = String(r.AIRCRAFT_REGISTRATION); }
    out.push(fl);
  }
  return out;
}
__name(sanParseFeed, "sanParseFeed");

// MSY New Orleans — a small WP-plugin JSON array, both directions.
// scheduled_time and actual_time are local strings; the actual often
// carries the wrong calendar day across midnight (settleRevised fixes).
function msyParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  const isDep = dir === "dep";
  for (const r of rows) {
    if (!r) continue;
    if (r.type1 && (String(r.type1).toUpperCase() === "D") !== isDep) continue;
    const code = (r.airline || "").toString().toUpperCase();
    const sched = localIsoObj("America/Chicago", r.scheduled_time);
    if (!code || !r.flight_number || !sched) continue;
    let revised = localIsoObj("America/Chicago", r.actual_time);
    revised = (revised && revised.ts !== sched.ts) ? settleRevised(revised, sched, "America/Chicago") : null;
    const fl = authorityFlight({
      dir, number: `${code}${String(r.flight_number).trim()}`,
      status: yhzStatus(r.remarks || r.status || ""),
      homeIata: "MSY", homeIcao: "KMSY", homeName: "New Orleans",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: YHZ_CITY_IATA[String(r.city || "").toUpperCase().replace(/[`']/g, "")] || null,
      otherName: r.city || null,
      airlineIata: code, airlineName: (r.airline_name && r.airline_name !== code) ? r.airline_name : (AIRLINE_IATA_NAME[code] || null),
      sched, revised
    });
    if (dir === "arr" && r.bags) fl.arrival.baggageBelt = String(r.bags);
    out.push(fl);
  }
  return out;
}
__name(msyParseFeed, "msyParseFeed");

// ── Iceland / UK / Washington batch (2026-09-05) ─────────────────────
// KEF Keflavík — the dream feed: open JSON, CORS *, aircraft reg AND
// type, gate/belt/stand/desk, UTC-Z times, IATA both ends. Direction is
// which end equals KEF. Iceland stays on UTC all year.
function kefParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  for (const r of rows) {
    if (!r || !r.flt) continue;
    const isDep = String(r.origin_iata || "").toUpperCase() === "KEF";
    const isArr = String(r.destination_iata || "").toUpperCase() === "KEF";
    if (dir === "dep" ? !isDep : !isArr) continue;
    const su = r.sched_time || "";
    if (!su) continue;
    const ts = Date.parse(su);
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("Atlantic/Reykjavik", ts);
    const eu = r.expected_time || r.block_time;
    const ets = eu ? Date.parse(eu) : NaN;
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("Atlantic/Reykjavik", ets) : null;
    let status = r.cancelled ? "cancelled" : yhzStatus(r.status || "");
    const otherIata = (isDep ? r.destination_iata : r.origin_iata) || "";
    const fl = authorityFlight({
      dir, number: String(r.flt).replace(/\s+/g, "").toUpperCase(),
      status,
      homeIata: "KEF", homeIcao: "BIKF", homeName: "Keflavík",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: otherIata.toString().toUpperCase() || null,
      otherName: (isDep ? r.destination : r.origin) || null,
      airlineIata: (r.flight_prefix || "").toString().toUpperCase() || null,
      airlineName: r.airline_name || null,
      aircraftModel: (r.aircraft_type || "").toString().trim() || null,
      sched, revised
    });
    const homeSide = dir === "dep" ? fl.departure : fl.arrival;
    if (r.stand) homeSide.terminal = String(r.stand);
    if (dir === "arr" && r.belt) fl.arrival.baggageBelt = String(r.belt);
    if (r.aircraft_reg) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = String(r.aircraft_reg); }
    out.push(fl);
  }
  return out;
}
__name(kefParseFeed, "kefParseFeed");

// EDI Edinburgh — open JSON with offset-bearing ISO times, aircraft
// type, belt, arrival hall, callsign. One endpoint per direction.
function ediParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  for (const r of rows) {
    if (!r || !r.flightNo) continue;
    if (r.direction && (String(r.direction).toUpperCase() === "D") !== (dir === "dep")) continue;
    const ts = r.scheduledDateTime ? Date.parse(r.scheduledDateTime) : NaN;
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("Europe/London", ts);
    const eu = r.estimatedDateTime || r.actualDateTime;
    const ets = eu ? Date.parse(eu) : NaN;
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("Europe/London", ets) : null;
    const ap = r.airport || {};
    const al = r.airline || {};
    const acRaw = (r.aircraftType || "").toString().replace(/\s+WINGLETS?$/i, "").trim();
    const fl = authorityFlight({
      dir, number: String(r.flightNo).replace(/\s+/g, "").toUpperCase(),
      callSign: (r.callsign || "").toString().trim() || null,
      status: yhzStatus(r.status || ""),
      homeIata: "EDI", homeIcao: "EGPH", homeName: "Edinburgh",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: ((ap.codes || {}).iata || "").toString().toUpperCase() || null,
      otherName: ap.name || null,
      airlineIata: ((al.codes || {}).iata || "").toString().toUpperCase() || null,
      airlineName: al.name || null,
      aircraftModel: acRaw || null,
      sched, revised
    });
    if (dir === "arr" && r.baggageBelt != null) fl.arrival.baggageBelt = String(r.baggageBelt);
    out.push(fl);
  }
  return out;
}
__name(ediParseFeed, "ediParseFeed");

// DCA/IAD — the shared MWAA Drupal feed. One JSON with arrivals[] and
// departures[] arrays; local ET strings with no offset; mwaaTime is the
// revision. Parameterized by home code since Reagan and Dulles are byte
// -identical in shape.
// MWAA's Akamai edge tends to challenge datacenter egress on the
// OrionConnected UA; a mainstream browser UA gets the JSON through.
const MWAA_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MWAA_STATUS = { INGATE: "arrived", ARRIVED: "arrived", INAIR: "active", ENROUTE: "active", SCHEDULED: "scheduled", DEPARTED: "departed", OUTGATE: "departed", CANCELLED: "cancelled", CANCELED: "cancelled", DELAYED: "delayed", DIVERTED: "diverted", BOARDING: "boarding" };
function mwaaStatus(s) {
  const k = String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
  return MWAA_STATUS[k] || yhzStatus(s);
}
__name(mwaaStatus, "mwaaStatus");
function mwaaParseFeed(jsonText, dir, home, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = dir === "dep" ? (j.departures || []) : (j.arrivals || []);
  const homeIcao = home === "DCA" ? "KDCA" : "KIAD";
  const homeName = home === "DCA" ? "Washington" : "Dulles";
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.flightnumber) continue;
    const code = (r.IATA || "").toString().toUpperCase();
    const sched = localIsoObj("America/New_York", r.publishedTime);
    if (!code || !sched) continue;
    const rev = localIsoObj("America/New_York", r.mwaaTime || r.actualtime);
    const revised = (rev && rev.ts !== sched.ts) ? settleRevised(rev, sched, "America/New_York") : null;
    const isDep = dir === "dep";
    const otherCode = isDep ? (r.arr_airport_code || "") : (r.dep_airport_code || "");
    const fl = authorityFlight({
      dir, number: `${code}${String(r.flightnumber).trim()}`,
      status: mwaaStatus(r.mod_status || r.status || ""),
      homeIata: home, homeIcao, homeName,
      gate: (r.mod_gate || r.gate || "").toString().trim() || null,
      otherIata: (otherCode && otherCode.toUpperCase() !== home) ? otherCode.toUpperCase() : (YHZ_CITY_IATA[String(r.city || "").toUpperCase()] || null),
      otherName: r.city || null,
      airlineIata: code, airlineName: r.airline || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    if (isDep && r.dep_terminal) homeSide.terminal = String(r.dep_terminal);
    if (!isDep && r.arr_terminal) homeSide.terminal = String(r.arr_terminal);
    if (!isDep && (r.claim || r.baggage)) fl.arrival.baggageBelt = String(r.claim || r.baggage);
    out.push(fl);
  }
  return out;
}
__name(mwaaParseFeed, "mwaaParseFeed");

// ── Charlotte / Kansas City / Manchester batch (2026-09-05) ──────────
// CLT — the LAS/MCO vendor again: epoch-second timestamps, operator
// flight numbers, IATA airport codes, gate, baggageBelt[]. Public
// embedded Api-Key, Api-Version 101.
function cltParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = ((j.data || {}).flights) || j.flights || [];
  const isDep = dir === "dep";
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r) continue;
    if (r.arrival === true && isDep) continue;
    if (r.arrival === false && !isDep) continue;
    if (r.iataCodeShareAirline && r.iataCodeShareAirline !== r.iataOperatingAirline) continue;   // operator rows
    const num = (r.operatingAirlineFlightNumber || "").toString().trim();
    if (!num || typeof r.scheduledTimestamp !== "number") continue;
    const sched = localTimeObjFromTs("America/New_York", r.scheduledTimestamp * 1000);
    const bt = r.bestKnownTimestamp;
    const revised = (typeof bt === "number" && bt !== r.scheduledTimestamp) ? localTimeObjFromTs("America/New_York", bt * 1000) : null;
    const belt = Array.isArray(r.baggageBelt) && r.baggageBelt.length ? r.baggageBelt.join(", ") : null;
    let status = yhzStatus(r.status || r.originalStatus || "");
    if (status === "scheduled" && r.isDelayed === true) status = "delayed";
    const fl = authorityFlight({
      dir, number: num.toUpperCase(),
      status,
      homeIata: "CLT", homeIcao: "KCLT", homeName: "Charlotte",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: ((isDep ? r.arrivalAirport : r.departureAirport) || "").toString().toUpperCase() || null,
      otherName: null,
      airlineIata: (r.iataOperatingAirline || "").toString().toUpperCase() || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    if (r.terminal) homeSide.terminal = String(r.terminal);
    if (!isDep && belt) fl.arrival.baggageBelt = belt;
    out.push(fl);
  }
  return out;
}
__name(cltParseFeed, "cltParseFeed");

// MCI Kansas City — Azure Function JSON. adi A/D, IATA airlineCode and
// cityCode, offset-less local ISO times, gate, claim, status enum.
const MCI_STATUS = { CX: "cancelled", AR: "arrived", DP: "departed", DL: "delayed", ON: "scheduled", BO: "boarding" };
function mciParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  const isDep = dir === "dep";
  for (const r of rows) {
    if (!r) continue;
    if (r.adi && (String(r.adi).toUpperCase() === "D") !== isDep) continue;
    const code = (r.airlineCode || "").toString().toUpperCase();
    const sched = localIsoObj("America/Chicago", r.scheduleTime);
    if (!code || r.number == null || !sched) continue;
    const est = localIsoObj("America/Chicago", r.actualTime || r.changeTime);
    const revised = (est && est.ts !== sched.ts) ? settleRevised(est, sched, "America/Chicago") : null;
    const fl = authorityFlight({
      dir, number: `${code}${String(r.number).trim()}`,
      status: MCI_STATUS[String(r.statusCode || "").toUpperCase()] || yhzStatus(r.statusLabel || ""),
      homeIata: "MCI", homeIcao: "KMCI", homeName: "Kansas City",
      gate: (r.gate || "").toString().trim() || null,
      otherIata: (r.cityCode || "").toString().toUpperCase() || null,
      otherName: r.cityName || null,
      airlineIata: code, airlineName: (r.airline && r.airline !== code) ? r.airline : (AIRLINE_IATA_NAME[code] || null),
      sched, revised
    });
    if (!isDep && r.claim) fl.arrival.baggageBelt = String(r.claim);
    out.push(fl);
  }
  return out;
}
__name(mciParseFeed, "mciParseFeed");

// MAN Manchester — a GraphQL endpoint (no key). flightNumber and
// airline.code are ICAO-form (EZY2064 / EZY), so a small ICAO→IATA map
// recovers the code the boards key on; unknown carriers keep the ICAO
// number, still legible.
const MAN_ICAO_IATA = {
  EZY: "U2", RYR: "FR", TOM: "BY", BAW: "BA", VIR: "VS", EXS: "LS", DLH: "LH",
  KLM: "KL", AFR: "AF", UAE: "EK", QTR: "QR", THY: "TK", SWR: "LX", TAP: "TP",
  IBE: "IB", AEE: "A3", EIN: "EI", WUK: "W9", ETD: "EY", SIA: "SQ", ATC: "OR"
};
function manParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = (j.data && (dir === "dep" ? j.data.searchDepartures : j.data.searchArrivals)) || [];
  const isDep = dir === "dep";
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.flightNumber) continue;
    const su = isDep ? r.scheduledDepartureDateTime : r.scheduledArrivalDateTime;
    if (!su) continue;
    const ts = Date.parse(su);
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("Europe/London", ts);
    const eu = isDep ? (r.actualDepartureDateTime || r.estimatedDepartureDateTime) : (r.actualArrivalDateTime || r.estimatedArrivalDateTime);
    const ets = eu ? Date.parse(eu) : NaN;
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("Europe/London", ets) : null;
    const icaoNum = String(r.flightNumber).replace(/\s+/g, "").toUpperCase();
    const pre = (icaoNum.match(/^([A-Z]{2,3})\d/) || [])[1] || "";
    const iata = MAN_ICAO_IATA[pre] || null;
    const num = iata ? `${iata}${icaoNum.slice(pre.length)}` : icaoNum;
    const ap = (isDep ? r.arrivalAirport : r.departureAirport) || {};
    const al = r.airline || {};
    const gate = isDep ? ((r.departureGate || {}).number) : ((r.arrivalGate || {}).number);
    const term = isDep ? ((r.departureTerminal || {}).number) : ((r.arrivalTerminal || {}).number || r.arrivalTerminal);
    const fl = authorityFlight({
      dir, number: num,
      callSign: icaoNum,
      status: yhzStatus(r.status || ""),
      homeIata: "MAN", homeIcao: "EGCC", homeName: "Manchester",
      gate: (gate || "").toString().trim() || null,
      otherIata: (ap.code || "").toString().toUpperCase() || null,
      otherName: ap.cityName || ap.name || null,
      airlineIata: iata || (al.code || "").toString().toUpperCase() || null,
      airlineName: al.name || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    if (term) homeSide.terminal = String(term);
    if (!isDep && r.arrivalBaggageClaim && r.arrivalBaggageClaim.number) fl.arrival.baggageBelt = String(r.arrivalBaggageClaim.number);
    out.push(fl);
  }
  return out;
}
__name(manParseFeed, "manParseFeed");
async function manFetch(dir) {
  const cacheKey = new Request(`https://authority-feeds/man/${dir}`);
  const cache = caches.default;
  try { const hit = await cache.match(cacheKey); if (hit) return hit.headers.get("X-Auth-Neg") ? null : await hit.text(); } catch (e) {}
  const now = new Date();
  const startDate = new Date(now.getTime() - 6 * 3600e3).toISOString();
  const endDate = new Date(now.getTime() + 30 * 3600e3).toISOString();
  const op = dir === "dep" ? "searchDepartures" : "searchArrivals";
  const dtField = dir === "dep" ? "scheduledDepartureDateTime estimatedDepartureDateTime actualDepartureDateTime" : "scheduledArrivalDateTime estimatedArrivalDateTime actualArrivalDateTime";
  const apField = dir === "dep" ? "arrivalAirport" : "departureAirport";
  // Gate is an object { name number }; terminal is a leaf String — a
  // sub-selection on it fails the whole query (verified live: "Sub
  // selection not allowed on leaf type String of field arrivalTerminal").
  const gateField = dir === "dep" ? "departureGate { name number } departureTerminal" : "arrivalGate { name number } arrivalTerminal arrivalBaggageClaim { number }";
  const matchFields = dir === "dep" ? '["arrivalAirport.cityName","flightNumber"]' : '["departureAirport.cityName","flightNumber"]';
  const query = `query S($airportCode: String!, $range: DateRange!) { ${op}( tenant: $airportCode query: { match: "" fields: ${matchFields} range: $range } size: 400 from: 0 ) { ${dtField} status flightNumber ${apField} { name cityName code } airline { name code } ${gateField} } }`;
  let text = null;
  try {
    const r = await fetch("https://d3ebfrkw2baepa.cloudfront.net", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { airportCode: "MAN", range: { startDate, endDate } } })
    });
    if (r.ok) text = await r.text();
  } catch (e) {}
  const good = text && text.indexOf("flightNumber") !== -1;
  try {
    await cache.put(cacheKey, good
      ? new Response(text, { headers: { "Cache-Control": "public, max-age=90" } })
      : new Response("", { headers: { "Cache-Control": "public, max-age=30", "X-Auth-Neg": "1" } }));
  } catch (e) {}
  return good ? text : null;
}
__name(manFetch, "manFetch");

// ── AUS Austin-Bergstrom — AirIT WebFIDS on content.abia.org:8080 ────
// flyaustin.com's "View Arrivals & Departures" is a 2014 AirIT WebFIDS
// frameset on plain http://. Its own 60-s refresh call
// (webfids?action=updateArrivals|updateDepartures) returns an XML list:
// offset-less local <stt>/<ett>/<att>, <CXR>+<TRN>, the far end's IATA in
// <CTY>, gate, terminal, claim carousel in <bags>, aircraft <TYP> and
// tail <REG>. No cookie, token or referer needed (verified). Rolling
// window: arrivals ~3 h back / ~12 h ahead, departures ~14 h back / ~12 h
// ahead. Quirks: multi-stop Southwest routes are emitted once PER route
// city (identical stt; <cities><so> lists the route) — collapsed here to
// one flight; the status clock ("Arrived 6:25P", "Now 11:37P") is the
// gate time the board shows, while <att> is a different (runway) clock,
// so the status clock wins for revisedTime with <ett> as the fallback.
function ausXmlField(chunk, tag) {
  const m = String(chunk || "").match(new RegExp("<" + tag + ">([^<]*)</" + tag + ">"));
  if (!m) return "";
  // &amp; is decoded LAST: decoding it first turns a literal "&amp;lt;" in
  // the feed into a real "<" (CodeQL js/double-escaping).
  return m[1].replace(/&#160;|&nbsp;/g, " ")
    .replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
__name(ausXmlField, "ausXmlField");
function ausParseFeed(xmlText, dir, nowMs) {
  const out = [];
  const seen = new Map();   // "DL3612|stt" → index into out, for multi-city collapse
  const isDep = dir === "dep";
  const chunks = String(xmlText || "").match(/<flight>[\s\S]*?<\/flight>/g) || [];
  for (const c of chunks) {
    const g = (t) => ausXmlField(c, t);
    const d = g("DIR").toUpperCase() || (/^dep/i.test(g("direction")) ? "D" : "A");
    if ((d === "D") !== isDep) continue;
    const code = g("CXR").toUpperCase();
    const trn = g("TRN").replace(/^0+(?=\d)/, "");
    const stt = g("stt");
    let sched = localIsoObj("America/Chicago", stt);
    if (!sched) { const ms = Number(g("timeInMillis")); if (ms > 0) sched = localTimeObjFromTs("America/Chicago", ms); }
    if (!code || !trn || !sched) continue;
    const number = `${code}${trn}`;
    const key = `${number}|${sched.ts}`;
    const stops = [...c.matchAll(/<so>([^<]*)<\/so>/g)].map((m) => ausXmlField(m[0], "so"));
    const city = g("city");
    // Multi-stop route: the immediate far end is the last stop before AUS
    // on an arrival and the first stop after it on a departure. Keep the
    // duplicate row whose city is that stop; drop the rest.
    if (seen.has(key)) {
      const want = stops.length > 1 ? (isDep ? stops[0] : stops[stops.length - 1]) : null;
      if (want && city === want) {
        const prev = out[seen.get(key)];
        const side = isDep ? prev.arrival : prev.departure;
        side.airport.iata = g("CTY").toUpperCase() || side.airport.iata;
        side.airport.name = city || side.airport.name;
      }
      continue;
    }
    const statusTxt = g("status");
    let revised = null;
    const sm = statusTxt.match(/(\d{1,2}):(\d{2})\s*([AP])/i);
    if (sm) {
      let hh = Number(sm[1]) % 12; if (/p/i.test(sm[3])) hh += 12;
      const dm = sched.local.match(/^(\d{4})-(\d{2})-(\d{2})/);
      revised = settleRevised(localTimeObjIn("America/Chicago", Number(dm[1]), Number(dm[2]), Number(dm[3]), hh, Number(sm[2])), sched, "America/Chicago");
    }
    if (!revised) { const est = localIsoObj("America/Chicago", g("ett")); if (est) revised = est; }
    if (revised && revised.ts === sched.ts) revised = null;
    const fl = authorityFlight({
      dir, number,
      status: yhzStatus(statusTxt),   // "Now H:MM" → scheduled + revisedTime, like YVR/DUB
      homeIata: "AUS", homeIcao: "KAUS", homeName: "Austin",
      gate: g("gate") || null,
      otherIata: g("CTY").toUpperCase() || null,
      otherName: city || null,
      airlineIata: code, airlineName: g("airlineName") || null,
      aircraftModel: g("TYP") || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const term = g("terminal");
    if (term) homeSide.terminal = term;
    const bags = g("bags");
    if (!isDep && bags) fl.arrival.baggageBelt = bags;
    const reg = g("REG");
    if (reg) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = reg; }
    seen.set(key, out.length);
    out.push(fl);
  }
  return out;
}
__name(ausParseFeed, "ausParseFeed");

// MSP — the airport's own Drupal view, server-rendered, 100 rows a page,
// covering roughly one hour back through the end of tomorrow (verified
// live 2026-09-05 21:10 CDT: dep/arr each spanned 4–5 pages). Five plain
// cells per row: "Sep 05 — 8:10 p.m." (month-day, no year, em dash,
// "a.m."/"p.m."), "Denver (DEN)", the carrier name glued to the flight
// number ("SouthwestWN 1577"), a status word, and "T2H12" — terminal
// digit + gate, or a bare "T1"/"T2" when no gate is posted yet. No
// revised time and no belt anywhere on the page.
const MSP_STATUS = {
  "ON TIME": "scheduled", "GATE CHANGE": "scheduled", "BOARDING": "boarding",
  "DEPARTED": "departed", "LANDED": "arrived", "ARRIVED AT GATE": "arrived",
  "ARRIVED": "arrived", "DELAYED": "delayed", "CANCELLED": "cancelled", "CANCELED": "cancelled"
};
function mspStatus(txt) {
  const k = String(txt || "").toUpperCase().replace(/\s+/g, " ").trim();
  return MSP_STATUS[k] || yhzStatus(txt);
}
__name(mspStatus, "mspStatus");
// Data rows only (the header row is <th>); the handler uses the count
// to tell a full 100-row page from the last, short one.
function mspPageRowCount(html) {
  return (String(html || "").match(/<td[^>]*headers="view-scheduled-time-table-column"/g) || []).length;
}
__name(mspPageRowCount, "mspPageRowCount");
function mspParsePage(html, dir, nowMs) {
  const out = [];
  const rows = String(html || "").match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf("<th") !== -1 || row.indexOf("view-scheduled-time-table-column") === -1) continue;
    const cells = authorityCellsText(row);
    if (cells.length < 4) continue;
    // "Sep 05 — 8:10 p.m." — the year is whichever lands nearest now.
    const tm = cells[0].match(/^([A-Za-z]{3})\s+(\d{1,2})\s*[—–-]+\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]\.?/);
    // "SouthwestWN 1577" / "Air CanadaAC 8623" / "KLMKL 6035": the code
    // is the two chars immediately before "<space><digits>" at the end.
    const nm = cells[2].match(/^(.*?)\s*([A-Z0-9]{2})\s+(\d{1,4})$/);
    if (!tm || !nm) continue;
    const mo = AUTH_MONTHS[tm[1].toUpperCase()];
    if (!mo) continue;
    let hh = Number(tm[3]) % 12; if (/p/i.test(tm[5])) hh += 12;
    const d = Number(tm[2]);
    const sched = localTimeObjIn("America/Chicago", nearestYear(mo, d, nowMs), mo, d, hh, Number(tm[4]));
    const paren = cells[1].match(/\(([A-Z]{3})\)/);
    const city = cells[1].replace(/\s*\([A-Z]{3}\)\s*/, "").trim();
    // "T2H12" → terminal 2, gate H12; "T1" → terminal 1, no gate yet.
    const gm = (cells[4] || "").replace(/\s+/g, "").toUpperCase().match(/^T(\d)([A-Z]\d{1,2}[A-Z]?)?$/);
    const statusTxt = (row.match(/flight-search-results__status--([^"]*?)\s+views-field/) || [])[1] || cells[3];
    const fl = authorityFlight({
      dir, number: `${nm[2]}${nm[3]}`,
      status: mspStatus(statusTxt),
      homeIata: "MSP", homeIcao: "KMSP", homeName: "Minneapolis",
      gate: gm && gm[2] ? gm[2] : null,
      otherIata: paren ? paren[1] : null,
      otherName: city || null,
      airlineIata: nm[2], airlineName: nm[1].trim() || null,
      sched, revised: null
    });
    if (gm) (dir === "dep" ? fl.departure : fl.arrival).terminal = gm[1];
    out.push(fl);
  }
  return out;
}
__name(mspParsePage, "mspParsePage");

// ── 1. Top-level helpers ─────────────────────────────────────────────
// The board is server-rendered HTML with unquoted attributes and NO
// closing </td>/</tr> tags: `<tr><td>8:34 PM <td>Anchorage <td>DL2713
// <td style=text-transform:uppercase>Scheduled <td>A47 <tr>…`. Rows are
// dateless but every day's table sits under `<div class=table-title>
// Sat, Sep 05</div>`, so the calendar day comes from that header (year
// via nearestYear). `type=simple` only shows now-onward, so the handler
// uses `type=advanced` with an explicit local day range; a day fits in
// one `results_per_page=500` page (SLC runs ~300 each way) and
// "Showing Page 1 of N" is followed if it ever doesn't. The city column
// is a free-text name (no code) whose spellings don't match the site's
// own <select> labels, hence the static map below (+ YHZ_CITY_IATA as a
// fallback). No revised time, belt, or aircraft anywhere on the page.
const SLC_CITY_IATA = {
  "ALBUQUERQUE": "ABQ", "AMSTERDAM": "AMS", "ANCHORAGE": "ANC", "ASPEN": "ASE", "ASPEN, COLORAD": "ASE",
  "ATLANTA": "ATL", "AUSTIN": "AUS", "BAKERSFIELD CA": "BFL", "BAKERSFIELD, CA": "BFL", "BALTIMORE": "BWI",
  "BELLINGHAM, WA": "BLI", "BILLINGS": "BIL", "BOISE": "BOI", "BOSTON": "BOS", "BOZEMAN": "BZN",
  "BURBANK": "BUR", "BUTTE": "BTM", "CABO SAN LUCAS": "SJD", "LOS CABOS": "SJD", "CALGARY": "YYC",
  "CANCUN, MEXICO": "CUN", "CANCUN, MX": "CUN", "CANCUN": "CUN", "CASPER": "CPR", "CEDAR CITY": "CDC",
  "CHARLOTTE": "CLT", "CHATTANOOGA": "CHA", "CHICAGO-MIDWAY": "MDW", "CHICAGO MIDWAY": "MDW",
  "CHICAGO-O`HARE": "ORD", "CHICAGO-O'HARE": "ORD", "CHICAGO O'HARE": "ORD", "CINCINNATI": "CVG",
  "CLEVELAND": "CLE", "COLORADO SPRINGS": "COS", "CO SPRINGS": "COS", "CODY": "COD", "COLUMBUS": "CMH",
  "COLUMBUS, OH": "CMH", "DALLAS-LOVE FIELD": "DAL", "DALLAS/LOVEFLD": "DAL", "DALLAS/FT. WORTH": "DFW",
  "DALLAS-FTWORTH": "DFW", "DENVER": "DEN", "DETROIT": "DTW", "DURANGO, CO": "DRO", "EDMONTON, AB": "YEG",
  "EDMONTON": "YEG", "EL PASO": "ELP", "ELKO": "EKO", "EUGENE, OR": "EUG", "FARGO": "FAR",
  "FORT LAUDERDALE": "FLL", "FT LAUDERDALE": "FLL", "FORT MYERS": "RSW", "FRANKFURT, DE": "FRA",
  "FRANKFURT": "FRA", "FRESNO, CA": "FAT", "FRESNO": "FAT", "GRAND JUNCTION": "GJT", "GRAND RAPIDS": "GRR",
  "GREAT FALLS": "GTF", "GUADALAJARA": "GDL", "GUATEMALA CITY": "GUA", "HARTFORD": "BDL", "HELENA": "HLN",
  "HONOLULU": "HNL", "HOUSTON-BUSH": "IAH", "HOUSTON": "IAH", "HOUSTON-HOBBY": "HOU", "HOUSTON HOBBY": "HOU",
  "IDAHO FALLS": "IDA", "INDIANAPOLIS": "IND", "JACKSON HOLE": "JAC", "KAHULUI-MAUI": "OGG",
  "KAHULUI, MAUI": "OGG", "KALISPELL": "FCA", "KANSAS CITY": "MCI", "LA GUARDIA": "LGA",
  "NEW YORK-LAGUARDIA": "LGA", "LAS VEGAS": "LAS", "LEWISTON, ID": "LWS", "LITTLE ROCK": "LIT",
  "LONDON-HEATHROW, UK": "LHR", "LONDON HTHRW": "LHR", "LONDON-HEATHROW": "LHR", "LONG BEACH": "LGB",
  "LOS ANGELES": "LAX", "MALPENSA, ITA": "MXP", "MILAN-MALPENSA": "MXP", "MANCHESTER, NH": "MHT",
  "MEDFORD, OR": "MFR", "MEMPHIS": "MEM", "MEXICO CITY": "MEX", "MIAMI": "MIA", "MILWAUKEE": "MKE",
  "MINNEAPOLIS/ST. PAUL": "MSP", "MINNEAPOLIS": "MSP", "MISSOULA": "MSO", "MONTROSE": "MTJ",
  "NW ARKANSAS REGIONAL": "XNA", "NASHVILLE": "BNA", "NEW ORLEANS": "MSY", "NEW YORK-JFK": "JFK",
  "NEW YORK JFK": "JFK", "NEWARK": "EWR", "OAKLAND": "OAK", "OKLAHOMA CITY": "OKC", "OMAHA": "OMA",
  "ONTARIO": "ONT", "ORANGE COUNTY": "SNA", "ORLANDO": "MCO", "PALM SPRINGS": "PSP", "PARIS, FRANCE": "CDG",
  "PARIS": "CDG", "PASCO": "PSC", "PHILADELPHIA": "PHL", "PHOENIX": "PHX", "PITTSBURGH": "PIT",
  "POCATELLO": "PIH", "PORTLAND, OR": "PDX", "PORTLAND": "PDX", "PUERTO VALLARTA": "PVR",
  "PUERTO VALLART": "PVR", "RALEIGH/DURHAM": "RDU", "RALEIGH-D'HAM": "RDU", "RAPID CITY": "RAP",
  "REDMOND, OR": "RDM", "RENO, NV": "RNO", "RENO": "RNO", "SACRAMENTO": "SMF", "SALEM, OREGON": "SLE",
  "SALT LAKE CITY": "SLC", "SAN ANTONIO": "SAT", "SAN DIEGO": "SAN", "SAN FRANCISCO": "SFO",
  "SAN JOSE, CA": "SJC", "SAN JOSE": "SJC", "SAN LUIS OBIS": "SBP", "SAN LUIS OBISPO": "SBP",
  "SANTA BARBARA": "SBA", "SEATTLE/TACOMA": "SEA", "SEATTLE": "SEA", "SEOUL-INCHEON": "ICN", "SPOKANE": "GEG",
  "ST. GEORGE": "SGU", "ST GEORGE": "SGU", "ST. LOUIS": "STL", "ST LOUIS": "STL", "STEAMBOAT SPRI": "HDN",
  "STEAMBOAT SPRINGS": "HDN", "SUN VALLEY, ID": "SUN", "SUN VALLEY": "SUN", "TAMPA, FL": "TPA", "TAMPA": "TPA",
  "TORONTO, ON": "YYZ", "TORONTO": "YYZ", "TUCSON, AZ": "TUS", "TUCSON": "TUS", "TULSA, OK": "TUL", "TULSA": "TUL",
  "TWIN FALLS": "TWF", "VANCOUVER, BC": "YVR", "VANCOUVER": "YVR", "WASHINGTON-DULLES": "IAD",
  "WASH DULLES": "IAD", "WASHINGTON-REAGAN": "DCA", "WASH NATIONAL": "DCA", "WEST YELLOWSTONE, MT": "WYS",
  "WEST YELLOWSTONE": "WYS", "YAKIMA, WASH": "YKM", "YAKIMA": "YKM", "YUMA, AZ": "YUM", "YUMA": "YUM"
};
// Carriers the board's own airline <select> lists (plus SY/WS seen in
// rows) — the page prints only the code, so the name comes from here.
const SLC_AIRLINE_NAME = {
  AM: "Aeromexico", AC: "Air Canada", AS: "Alaska Airlines", AA: "American Airlines", OS: "Austrian",
  CZ: "China Southern", DL: "Delta Air Lines", OO: "Delta Connection", EW: "Eurowings", F9: "Frontier",
  B6: "JetBlue", KL: "KLM", LH: "Lufthansa", SK: "SAS", WN: "Southwest", NK: "Spirit Airlines",
  UA: "United Airlines", SY: "Sun Country", WS: "WestJet"
};
// Status vocabulary seen live: Scheduled / On Time / Departed / Arrived /
// In Flight / InGate. "InGate" on a DEPARTURE row is the inbound aircraft
// (AM793, a 09:30 departure, still read InGate at 20:00), so it only
// means "arrived" on the arrivals side.
const SLC_STATUS = {
  SCHEDULED: "scheduled", ONTIME: "scheduled", DEPARTED: "departed", OUTGATE: "departed",
  ARRIVED: "arrived", LANDED: "arrived", INFLIGHT: "active", ENROUTE: "active", INAIR: "active",
  DELAYED: "delayed", CANCELLED: "cancelled", CANCELED: "cancelled", DIVERTED: "diverted",
  BOARDING: "boarding", GATECLOSED: "gateclosed"
};
function slcStatus(txt, dir) {
  const k = String(txt || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (k === "INGATE") return dir === "arr" ? "arrived" : "scheduled";
  return SLC_STATUS[k] || yhzStatus(txt);
}
__name(slcStatus, "slcStatus");
// Pure parser (exported for tests): one board page → ADB-native flights.
function slcParsePage(html, dir, nowMs) {
  const out = [];
  const sections = String(html || "").split(/<div class="?table-title"?>/).slice(1);
  for (const sec of sections) {
    const dm = sec.match(/^\s*[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2})/);
    if (!dm) continue;
    const mo = AUTH_MONTHS[dm[1].toUpperCase()];
    if (!mo) continue;
    const day = Number(dm[2]);
    const y = nearestYear(mo, day, nowMs);
    const table = (sec.split("</table>")[0] || "").split(/<tbody[^>]*>/)[1] || "";
    for (const row of table.split(/<tr[^>]*>/).slice(1)) {
      const cells = row.split(/<td[^>]*>/).slice(1).map((c) => yhzCellText(c));
      if (cells.length < 4) continue;
      const tm = cells[0].match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      const nm = cells[2].replace(/\s+/g, "").match(/^([A-Z0-9]{2})(\d{1,4})$/);
      if (!tm || !nm) continue;
      let hh = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hh += 12;
      const sched = localTimeObjIn("America/Denver", y, mo, day, hh, Number(tm[2]));
      const city = cells[1].trim();
      const code = nm[1];
      const gate = (cells[4] || "").trim();
      const fl = authorityFlight({
        dir, number: `${code}${nm[2].replace(/^0+(?=\d)/, "")}`,
        status: slcStatus(cells[3], dir),
        homeIata: "SLC", homeIcao: "KSLC", homeName: "Salt Lake City",
        gate: gate && !/^TBD$/i.test(gate) ? gate.toUpperCase() : null,
        otherIata: SLC_CITY_IATA[city.toUpperCase()] || YHZ_CITY_IATA[city.toUpperCase()] || null,
        otherName: city || null,
        airlineIata: code, airlineName: SLC_AIRLINE_NAME[code] || null,
        sched, revised: null
      });
      out.push(fl);
    }
  }
  return out;
}
__name(slcParsePage, "slcParsePage");
// One local calendar day of the board, following "Page 1 of N" when a
// day overflows 500 rows (it hasn't; 3 pages is the safety cap).
async function slcFetchDay(dir, dayIso, nextIso) {
  const leg = dir === "dep" ? "D" : "A";
  const q = (p) => `https://slcairport.com/airlines-flights/arrivals-departures?type=advanced&query_leg=${leg}&sortby=departure&sortdir=asc&page=${p}&results_per_page=500&query_date1=${encodeURIComponent(dayIso + " 00:00:00")}&query_date2=${encodeURIComponent(nextIso + " 00:00:00")}`;
  const parts = [];
  for (let p = 0; p < 3; p++) {
    const t = await fetchAuthorityText(`slc/${dir}/${dayIso}/${p}`, q(p), "flight-data", 90);
    if (!t) break;
    parts.push(t);
    const pm = t.match(/Showing Page (\d+) of (\d+)/);
    if (!pm || Number(pm[1]) >= Number(pm[2])) break;
  }
  return parts;
}
__name(slcFetchDay, "slcFetchDay");

// ── RDU Raleigh–Durham — OAG flightview FIDS behind rdu.com ──────────
// rdu.com/airline-information/flight-status/ is an iframe onto
// tracker.flightview.com's hosted FIDS (accCustId=RaleighDurham,
// fidsId=20001, fidsInit=arrivals|departures). A vendor page rather than
// the authority's own — licensing-fragile — but it is what the airport
// publishes, it is server-rendered, and it answers a plain GET with no
// cookie, referer or token. Every row carries an ffDtNm(...) onclick
// with the airline code, BOTH airport IATAs and the departure date, and
// the Sched/Updated cells hide a full local date-time in an HTML comment
// (<!--dtDateTime(2026-09-05,15:26:00,TwelveHour)-->) — so no dateless
// rows, no city→IATA map, and revised times that cross midnight carry
// their own calendar day. Window is roughly −6 h / +18 h around now (the
// ffArrdate/ffArrhr sort-form parameters return "No flights found").
// The list has no gate, terminal or belt — those exist only in the
// per-flight detail POST (ffState=3), one round trip per flight.
// Status arrives as a CSS class (flightStatus-InGate …) with a friendly
// text; diverted legs are listed next to the recovery leg of the same
// flight, and the class vocabulary is the same one MWAA uses.
const RDU_STATUS = { INGATE: "arrived", LANDED: "arrived", INAIR: "active", OUTGATE: "departed", DEPARTED: "departed", SCHEDULED: "scheduled", DELAYED: "delayed", CANCELLED: "cancelled", CANCELED: "cancelled", DIVERTED: "diverted", BOARDING: "boarding" };
function rduCellTime(chunk, cls) {
  const m = chunk.match(new RegExp(`class="${cls}[^"]*"[^>]*><!--dtDateTime\\((\\d{4})-(\\d{2})-(\\d{2}),(\\d{2}):(\\d{2}):\\d{2}`));
  if (!m) return null;
  return localTimeObjIn("America/New_York", Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}
__name(rduCellTime, "rduCellTime");
function rduCellText(chunk, cls) {
  const m = chunk.match(new RegExp(`<td[^>]*class="${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`));
  return yhzCellText((m ? m[1] : "").replace(/&#160;/g, " "));
}
__name(rduCellText, "rduCellText");
function rduParsePage(html, dir, nowMs) {
  const out = [];
  const want = dir === "dep" ? "ffFidsDepartures" : "ffFidsArrivals";
  const data = String(html || "").split('id="fvData"')[1];
  if (!data) return out;
  const byKey = new Map();
  for (const chunk of data.split(/<tr class="(?:odd|even)">/).slice(1)) {
    const oc = chunk.match(/ffDtNm\('(ffFids[A-Za-z]+)','([^']*)','([A-Z0-9]{2})','([A-Z0-9]{3})','([A-Z0-9]{3})','\d{8}','\d{4}'\)/);
    if (!oc || oc[1] !== want) continue;                 // wrong pane / not a flight row
    const num = oc[2].replace(/\D/g, "");
    const sched = rduCellTime(chunk, "c5");
    const home = dir === "dep" ? oc[4] : oc[5];
    if (!num || !sched || home !== "RDU") continue;
    const upd = rduCellTime(chunk, "c6");
    const revised = (upd && upd.ts !== sched.ts) ? upd : null;
    const cls = ((chunk.match(/flightStatus-([A-Za-z]+)/) || [])[1] || "").toUpperCase();
    const secondary = ((chunk.match(/ffFlightStatusSecondary[^>]*>\s*<span class="([a-z]+)"/) || [])[1] || "");
    const status = secondary === "diversion" ? "diverted" : (RDU_STATUS[cls] || yhzStatus(rduCellText(chunk, "c4")));
    const city = rduCellText(chunk, "c3");
    const airlineName = yhzCellText((chunk.match(/class="ffAlLbl"[^>]*>([^<]*)</) || [])[1] || "");
    const fl = authorityFlight({
      dir, number: `${oc[3]}${num}`, status,
      homeIata: "RDU", homeIcao: "KRDU", homeName: "Raleigh-Durham",
      otherIata: dir === "dep" ? oc[5] : oc[4], otherName: city || null,
      airlineIata: oc[3], airlineName: airlineName || null,
      sched, revised
    });
    // One row per flight+schedule: a diverted leg gives way to the
    // recovery leg that actually reached RDU (DL1550 was listed twice on
    // 2026-09-05 — a "Diversion" row with no time, then "Recovery").
    const key = `${fl.number}@${sched.ts}`;
    const prev = byKey.get(key);
    if (prev === undefined) { byKey.set(key, out.length); out.push(fl); }
    else if (out[prev].status === "diverted" && status !== "diverted") out[prev] = fl;
  }
  return out;
}
__name(rduParsePage, "rduParsePage");

// ── YXE Saskatoon — yxe.ca WordPress board, server-rendered ──────────
// /departures/ and /arrival/ (singular!) each carry three panes —
// #today, #yesterday, #tomorrow — of positional <li> rows with seven
// <p> cells: carrier name (with an icon whose filename IS the IATA
// code: AC.png, WS.png, PD.png, 4T.png), flight number, city,
// scheduled and estimated as bare 12-hour clocks, gate, status. No
// dates on the rows: the pane supplies the calendar day, anchored to
// "today in Saskatoon". Departures print Rise Air's whole milk-run
// ("Prince Albert, Wollaston Lake, Prince Albert"); the first stop is
// the next leg. Saskatchewan never observes DST (America/Regina).
const YXE_CITY_IATA = {
  "PRINCE ALBERT": "YPA", "LA RONGE": "YVC", "STONY RAPIDS": "YSF",
  "FOND-DU-LAC": "ZFD", "FOND DU LAC": "ZFD", "URANIUM CITY": "YBE",
  "WOLLASTON LAKE": "ZWL", "POINTS N. LANDING": "YNL", "POINTS NORTH LANDING": "YNL",
  "MEADOW LAKE": "YLJ", "BUFFALO NARROWS": "YVT", "HALIFAX": "YHZ",
  "PUERTO VALLARTA": "PVR", "MAZATLAN": "MZT", "LOS CABOS": "SJD", "PHOENIX-MESA": "AZA"
};
// Rise Air (ex-Transwest/West Wind) isn't in the shared name map; the
// icon filename normally settles it, this is the fallback.
const YXE_AIRLINE_IATA = { "RISE AIR": "4T" };
const YXE_PANE_DAY = { yesterday: -1, today: 0, tomorrow: 1 };
function yxeStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("gate closed")) return "gateclosed";
  if (s.includes("final call") || s.includes("boarding")) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("delay")) return "delayed";
  return "scheduled";   // On Time / Early / anything novel
}
__name(yxeStatus, "yxeStatus");
// "05:05 AM" / "4:25 PM" on a given Saskatoon calendar day → time object.
function yxeTimeObj(y, mo, d, s) {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})\s*([AP])\.?M/i);
  if (!m) return null;
  let hh = Number(m[1]) % 12;
  if (/p/i.test(m[3])) hh += 12;
  return localTimeObjIn("America/Regina", y, mo, d, hh, Number(m[2]));
}
__name(yxeTimeObj, "yxeTimeObj");
function yxeParsePage(html, dir, nowMs) {
  const out = [];
  const tz = "America/Regina";
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
  const y = g("year"), mo = g("month"), d = g("day");
  const parts = String(html || "").split(/<div class="arrivals-infor-wrapper[^"]*"\s+id="([a-z]+)">/);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const dayOff = YXE_PANE_DAY[parts[i]];
    if (dayOff === undefined) continue;
    const pane = parts[i + 1].split("</ul>")[0];
    for (const rowM of pane.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)) {
      if (/table-heading/.test(rowM[1])) continue;
      const cells = [...rowM[2].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => yhzCellText(m[1]));
      if (cells.length < 7) continue;
      const [airline, numRaw, cityRaw, schedRaw, estRaw, gateRaw, statusRaw] = cells;
      const number = numRaw.replace(/\s+/g, "");
      if (!/^[A-Z0-9]{2}\d{1,4}$/.test(number)) continue;
      const sched = yxeTimeObj(y, mo, d + dayOff, schedRaw);
      if (!sched) continue;
      // Estimated mirrors Scheduled until something changes; a differing
      // value is the revision. An estimate on the far side of midnight
      // (sched 23:50, est 00:10) is settled toward schedule.
      let revised = yxeTimeObj(y, mo, d + dayOff, estRaw);
      if (revised && revised.ts === sched.ts) revised = null;
      revised = settleRevised(revised, sched, tz);
      const icon = (rowM[2].match(/airline-icons\/([A-Za-z0-9]{2,3})\.png/) || [])[1];
      const al = airline.toUpperCase();
      const code = (icon ? icon.toUpperCase() : null)
        || YXE_AIRLINE_IATA[al] || AIRLINE_NAME_IATA[al] || AIRLINE_NAME_IATA_SQUASHED[al.replace(/\s+/g, "")]
        || (number.match(/^([A-Z0-9]{2})/) || [])[1] || null;
      const city = cityRaw.split(",")[0].trim();
      const cityKey = city.toUpperCase();
      out.push(authorityFlight({
        dir, number, status: yxeStatus(statusRaw),
        homeIata: "YXE", homeIcao: "CYXE", homeName: "Saskatoon",
        gate: gateRaw || null,
        otherIata: YXE_CITY_IATA[cityKey] || YHZ_CITY_IATA[cityKey] || null,
        otherName: city || null,
        airlineIata: code, airlineName: airline || null,
        sched, revised
      }));
    }
  }
  return out;
}
__name(yxeParsePage, "yxeParsePage");

// ── YDF Deer Lake — deerlakeairport.com SSR page ─────────────────────
// WordPress (WP Engine, CF-cached ~10 min) renders two tables server-side:
// <table class="fdArrivalsTable"> and <table class="fdDeparturesTable">,
// six cells each — Carrier (icon + display name), Flight # (digits only),
// From/To (city name), Scheduled, Expected, Status. Dates ride along:
// arrivals print "MM/DD HH:MM" (no year), departures "YYYY/MM/DD HH:MM".
// A duplicate mobile <ul class="fdArrivalsList"> follows each table with
// "From: " / "Scheduled: " prefixes — the parser scopes to the <table>
// so those never double-count. Newfoundland runs on the half-hour
// (America/St_Johns: -02:30 NDT / -03:30 NST) — offsets come from the
// tz helper per calendar day, never hand-rolled.
const YDF_CITY_IATA = {
  "ST. JOHNS": "YYT", "ST JOHNS": "YYT", "ST JOHN'S": "YYT",   // site drops the apostrophe
  "HALIFAX": "YHZ"
};
// Carrier icon filename → IATA, a fallback when the display name changes.
const YDF_ICON_IATA = { "icon-pal": "PB", "icon-ac": "AC", "icon-wj": "WS", "icon_porter": "PD" };
function parseYdfTime(s, nowMs) {
  const m = String(s || "").trim().match(/^(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const y = m[1] ? Number(m[1]) : nearestYear(mo, d, nowMs);
  return localTimeObjIn("America/St_Johns", y, mo, d, Number(m[4]), Number(m[5]));
}
__name(parseYdfTime, "parseYdfTime");
function parseYdfPage(html, dir, nowMs) {
  const out = [];
  const want = dir === "dep" ? "fdDeparturesTable" : "fdArrivalsTable";
  const tm = String(html || "").match(new RegExp('<table class="' + want + '"[\\s\\S]*?<\\/table>'));
  if (!tm) return out;
  const rows = tm[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf("<th") !== -1) continue;
    const cells = authorityCellsText(row);
    if (cells.length < 6) continue;
    const num = cells[1].replace(/\D+/g, "");
    const sched = parseYdfTime(cells[3], nowMs);
    if (!num || !sched) continue;
    const carrier = cells[0].trim();
    const _cu = carrier.toUpperCase();
    const icon = (row.match(/\/(icon[-_][a-z]+)\.png/i) || [])[1] || "";
    const code = AIRLINE_NAME_IATA[_cu]
      || AIRLINE_NAME_IATA_SQUASHED[_cu.replace(/\s+/g, "")]
      || YDF_ICON_IATA[icon.toLowerCase()] || null;
    let revised = parseYdfTime(cells[4], nowMs);
    if (revised && revised.ts === sched.ts) revised = null;
    if (revised) revised = settleRevised(revised, sched, "America/St_Johns");
    const city = cells[2].trim();
    const cityU = city.toUpperCase();
    out.push(authorityFlight({
      dir, number: code ? code + num : num, status: yhzStatus(cells[5]),
      homeIata: "YDF", homeIcao: "CYDF", homeName: "Deer Lake",
      otherIata: YDF_CITY_IATA[cityU] || YHZ_CITY_IATA[cityU] || null, otherName: city || null,
      airlineIata: code, airlineName: (code && AIRLINE_IATA_NAME[code]) || carrier || null,
      sched, revised
    }));
  }
  return out;
}
__name(parseYdfPage, "parseYdfPage");

// ── YQT Thunder Bay — flyqt.ca "ifids" WordPress plugin ──────────────
// tbairport.on.ca is dead (its TLS cert expired 2026-07-06 and it 302s to
// flyqt.ca). The new site renders the board server-side: one page per
// direction, each with a #today and a #tomorrow tab holding a
// <table class="fids-detailed-table"> of <tr class="fids-arrival|
// fids-departure"> rows — airline (logo alt + icon-XX filename), flight
// number, "A → B → Thunder Bay" route, Planned / Expected as 12-hour
// clock with no date, and a status word. No gates, belts or aircraft.
// No AJAX at all (the theme JS only toggles the tabs), no cache headers.
//
// Quirks pinned by the parser:
//  • Flight-number prefixes mix IATA and ICAO — WJA (WestJet), WSG
//    (Wasaya), NSA (North Star Air), and Flair as "F8*" — so they are
//    normalised to IATA for the boards' logo/colour keys.
//  • Rows are ordered by EXPECTED time, so a delayed 05:10 can follow a
//    06:00; the midnight walk only reacts to a >6 h backwards jump.
//  • Once the day's last departure is gone the #today tab is refilled
//    with tomorrow's rows (verified 22:10 ET: #today == #tomorrow, row
//    for row). Such a rolled tab is dated tomorrow and de-duplicated.
//  • Two renderings alternate minute to minute: one drops the day's
//    landed rows, the other keeps them as "Arrived" (class
//    status-confirmed), out of strict time order and with Planned
//    showing the last estimate rather than the schedule. Statuses seen
//    live: "On Time", "Late", "Delayed", "Arrived".
//  • Multi-stop routes: the site's own summary cell names the previous
//    stop for arrivals and the final stop for departures; we follow it.
const YQT_CITY_IATA = {
  "TORONTO": "YYZ", "TORONTO PEARSON": "YYZ", "TORONTO CITY": "YTZ",
  "TORONTO ISLAND": "YTZ", "OTTAWA": "YOW", "WINNIPEG": "YWG", "CALGARY": "YYC",
  "MONTREAL": "YUL", "HAMILTON": "YHM", "SIOUX LOOKOUT": "YXL",
  "SAULT STE MARIE": "YAM", "SAULT STE. MARIE": "YAM", "SAULT STE-MARIE": "YAM",
  "KENORA": "YQK", "FORT FRANCES": "YAG", "RED LAKE": "YRL", "SUDBURY": "YSB",
  "NORTH BAY": "YYB", "DRYDEN": "YHD", "TIMMINS": "YTS", "PICKLE LAKE": "YPL",
  "ARMSTRONG": "YYW", "GERALDTON": "YGQ", "MARATHON": "YSP", "WAWA": "YXZ",
  "SANDY LAKE": "ZSJ", "KASABONIKA": "XKS", "WEBEQUIE": "YWP", "KITCHENER": "YKF",
  "MINNEAPOLIS": "MSP", "VANCOUVER": "YVR", "EDMONTON": "YEG", "SASKATOON": "YXE",
  "REGINA": "YQR"
};
// Board prefixes → IATA. WestJet/Wasaya/North Star fly under their ICAO
// codes on this site; Flair carries a stray asterisk.
const YQT_PREFIX_IATA = { WJA: "WS", WEN: "WS", WSG: "WP", NSA: "0N", "F8*": "F8", BLS: "JV", POE: "PD", ACA: "AC", FLE: "F8" };
const YQT_AIRLINE_NAME_IATA = {
  "BEARSKIN AIRLINE": "JV", "BEARSKIN AIRLINES": "JV", "WASAYA AIRWAYS": "WP",
  "WASAYA": "WP", "NORTH STAR AIR": "0N", "PERIMETER AVIATION": "JV"
};
function parseYqtStatus(text, cls) {
  const s = `${text || ""} ${cls || ""}`.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("late") || s.includes("delay")) return "delayed";
  return "scheduled";   // On Time / Early / anything novel
}
__name(parseYqtStatus, "parseYqtStatus");
// One tab's rows → [{ cells, prefix, digits, name, ... }] without dates.
function parseYqtRows(seg, dir) {
  const want = dir === "dep" ? "fids-departure" : "fids-arrival";
  const parsed = [];
  for (const rm of String(seg || "").matchAll(/<tr class="(fids-[a-z]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    if (rm[1] !== want) continue;
    const cells = {};
    for (const cm of rm[2].matchAll(/<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)) {
      const key = cm[1].split(/\s+/)[0];
      cells[key] = { cls: cm[1], html: cm[2], text: yhzCellText(cm[2]) };
    }
    const numRaw = (cells["flight-number"] || cells["mobile-flight-number"] || {}).text || "";
    const nm = numRaw.replace(/\s+/g, "").toUpperCase().match(/^([A-Z0-9*]{2,3}?)(\d{1,4})$/);
    const sm = ((cells.scheduled || {}).text || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!nm || !sm) continue;
    const to24 = (h, ap) => (Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0);
    const em = ((cells.expected || {}).text || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    const airHtml = (cells.airline || {}).html || "";
    const name = ((airHtml.match(/alt="([^"]*)"/) || [])[1] || "").replace(/\s*logo\s*$/i, "").trim();
    const icon = ((airHtml.match(/icon-([^".]+)\.png/) || [])[1] || "").toUpperCase();
    const prefix = nm[1];
    const nameKey = name.toUpperCase();
    const code = YQT_PREFIX_IATA[prefix] || YQT_PREFIX_IATA[icon]
      || (/^[A-Z0-9]{2}$/.test(prefix) ? prefix : null)
      || YQT_AIRLINE_NAME_IATA[nameKey] || AIRLINE_NAME_IATA[nameKey]
      || AIRLINE_NAME_IATA_SQUASHED[nameKey.replace(/\s+/g, "")] || null;
    // The summary cell (<h3>City</h3>) is the site's own pick of the
    // "other" city; fall back to the far end of the route arrow chain.
    const route = ((cells.route || {}).text || "").split(/\s*(?:→|&rarr;|->)\s*/).map((s) => s.trim()).filter(Boolean);
    let city = ((((cells["mobile-flight-number"] || {}).html || "").match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "");
    city = yhzCellText(city);
    if (!city && route.length > 1) city = dir === "dep" ? route[route.length - 1] : route[route.length - 2];
    const st = cells.status || {};
    parsed.push({
      number: (code || prefix.replace(/\*/g, "")) + nm[2], code, name: name || null,
      city, route,
      sh: to24(sm[1], sm[3]), smin: Number(sm[2]),
      eh: em ? to24(em[1], em[3]) : null, emin: em ? Number(em[2]) : null,
      status: parseYqtStatus(st.text, st.cls)
    });
  }
  return parsed;
}
__name(parseYqtRows, "parseYqtRows");
function parseYqtPage(html, dir, nowMs) {
  const tz = "America/Toronto";
  const src = String(html || "");
  const tab = (id) => {
    const i = src.indexOf(`id="${id}"`);
    if (i === -1) return "";
    const end = src.indexOf("</table>", i);
    return src.slice(i, end === -1 ? undefined : end);
  };
  const todayRows = parseYqtRows(tab("today"), dir);
  const tmwRows = parseYqtRows(tab("tomorrow"), dir);
  if (!todayRows.length && !tmwRows.length) return [];
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
  // Dateless 12-hour clocks: walk forward from the tab's base day and
  // treat a >6 h backwards jump as the table crossing midnight.
  const build = (rows, dayOffset) => {
    const base = new Date(Date.UTC(g("year"), g("month") - 1, g("day"), 12) + dayOffset * 864e5);
    let y = base.getUTCFullYear(), mo = base.getUTCMonth() + 1, d = base.getUTCDate();
    let prevMin = null;
    const out = [];
    for (const r of rows) {
      const min = r.sh * 60 + r.smin;
      if (prevMin !== null && min < prevMin - 360) {
        const next = new Date(Date.UTC(y, mo - 1, d, 12) + 864e5);
        y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
      }
      prevMin = min;
      const sched = localTimeObjIn(tz, y, mo, d, r.sh, r.smin);
      let revised = null;
      if (r.eh !== null && (r.eh !== r.sh || r.emin !== r.smin)) {
        revised = settleRevised(localTimeObjIn(tz, y, mo, d, r.eh, r.emin), sched, tz);
      }
      const cityKey = r.city.toUpperCase();
      out.push(authorityFlight({
        dir, number: r.number, status: r.status,
        homeIata: "YQT", homeIcao: "CYQT", homeName: "Thunder Bay",
        otherIata: YQT_CITY_IATA[cityKey] || YHZ_CITY_IATA[cityKey] || null,
        otherName: r.city || null,
        airlineIata: r.code, airlineName: r.name,
        sched, revised
      }));
    }
    return out;
  };
  let today = build(todayRows, 0);
  const tomorrow = build(tmwRows, 1);
  if (today.length) {
    const maxTs = Math.max(...today.map((f) => f._authTs));
    const sig = (rows) => rows.map((r) => `${r.number}|${r.sh}:${r.smin}`).join(",");
    const rolled = sig(todayRows) === sig(tmwRows);
    // A live board can't be entirely behind us; and a #today tab that is
    // row-for-row #tomorrow with nothing left to come has already rolled.
    if (maxTs < nowMs - 2 * 3600e3 || (rolled && maxTs <= nowMs)) today = build(todayRows, 1);
  }
  const seen = new Set();
  const out = [];
  for (const f of [...today, ...tomorrow]) {
    const k = `${f.number}|${f._authTs}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}
__name(parseYqtPage, "parseYqtPage");

// ── YYJ Victoria — yyj.ca WordPress AJAX board ───────────────────────
// Two hops: the flight-status page carries a WP nonce in a
// wp_localize_script blob (`var flightsData = {"ajaxUrl":…,"nonce":…}`),
// and POST admin-ajax.php?action=yyj_get_flights with that nonce returns
// {success, data:{html}} — one HTML blob holding BOTH directions for
// Today and Tomorrow (<table id="flightsToday"> / "flightsTomorrow">),
// rows tagged <tr class="arrival …"> / "departure …". Each row prints
// the carrier NAME (hidden span), the flight number with IATA prefix,
// a city name, a gate (both directions — no belt column), "Sat Sep 5"
// + "6:00 AM" (no year, no offset — Pacific wall clock), and a status
// bubble "Departed: 6:08 AM" / "Arrived:" / "Delayed:" / "On Time:"
// whose time is the actual/estimated. A bad nonce answers 200 with
// {"success":false,"data":{"nonce_expired":true}} — no flightsTable
// marker, so fetchAuthorityText treats it as a miss.
// Verified live 2026-09-05 with the worker's own UA (no WAF on this path).
const YYJ_PAGE_URL = "https://yyj.ca/en/flights-info/flight-status/";
const YYJ_AJAX_URL = "https://yyj.ca/wp-admin/admin-ajax.php";
// Carriers yyj.ca names that AIRLINE_NAME_IATA lacks (the flight number
// carries the code anyway; this is the fallback for a code-less row).
const YYJ_AIRLINE_IATA = { "PACIFIC COASTAL": "8P", "PACIFIC COASTAL AIRLINES": "8P", "ALASKA": "AS", "ALASKA AIRLINES": "AS" };
function yyjParseNonce(pageHtml) {
  const m = String(pageHtml || "").match(/var\s+flightsData\s*=\s*(\{[^}]*\})/);
  if (!m) return null;
  try { const j = JSON.parse(m[1]); return j && j.nonce ? String(j.nonce) : null; } catch (e) {}
  return (m[1].match(/"nonce"\s*:\s*"([^"]+)"/) || [])[1] || null;
}
__name(yyjParseNonce, "yyjParseNonce");
// jsonText is the raw admin-ajax response ({success, data:{html}}); a bare
// HTML fragment is accepted too so the parser can be fed either.
function yyjParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let html = String(jsonText || "");
  if (/^\s*\{/.test(html)) {
    let j; try { j = JSON.parse(html); } catch (e) { return out; }
    if (!j || !j.success || !j.data || typeof j.data.html !== "string") return out;
    html = j.data.html;
  }
  const rows = html.match(/<tr class="(?:arrival|departure)[^"]*">[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const isDep = /^<tr class="departure/.test(row);
    if ((dir === "dep") !== isDep) continue;
    const cells = {};
    for (const m of row.matchAll(/<td data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)) cells[m[1]] = m[2];
    const num = yhzCellText(cells.Flight).replace(/\s+/g, "");
    const nm = num.match(/^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/);
    const dm = (cells["Scheduled Time"] || "").match(/<small>\s*[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s*<\/small>/);
    const tm = (cells["Scheduled Time"] || "").match(/<div>\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*<\/div>/i);
    if (!nm || !dm || !tm) continue;
    const mo = AUTH_MONTHS[dm[1].toUpperCase()];
    if (!mo) continue;
    const d = Number(dm[2]);
    const y = nearestYear(mo, d, nowMs);
    let hh = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hh += 12;
    const sched = localTimeObjIn("America/Vancouver", y, mo, d, hh, Number(tm[2]));
    const stTxt = yhzCellText(cells.Status);                       // "Departed: 6:08 AM" | "On Time" | "Delayed: 12:40 AM"
    const stM = stTxt.match(/^([A-Za-z ]+?)\s*(?::\s*(\d{1,2}):(\d{2})\s*(AM|PM))?\s*$/i);
    let revised = null;
    if (stM && stM[2]) {
      let rh = Number(stM[2]) % 12; if (/pm/i.test(stM[4])) rh += 12;
      revised = settleRevised(localTimeObjIn("America/Vancouver", y, mo, d, rh, Number(stM[3])), sched, "America/Vancouver");
    }
    const airlineName = ((cells.Airline || "").match(/<span[^>]*>([^<]+)<\/span>/) || [, ""])[1].trim()
      || ((cells.Airline || "").match(/alt="([^"]+)"/) || [, ""])[1].trim() || null;
    const key = (airlineName || "").toUpperCase();
    const airlineIata = nm[1] || YYJ_AIRLINE_IATA[key] || AIRLINE_NAME_IATA[key] || AIRLINE_NAME_IATA_SQUASHED[key.replace(/\s+/g, "")] || null;
    const city = yhzCellText(cells.Location);
    const gate = yhzCellText(cells.Gate) || null;
    out.push(authorityFlight({
      dir, number: `${nm[1]}${nm[2]}`,
      status: yhzStatus(stM ? stM[1] : stTxt),
      homeIata: "YYJ", homeIcao: "CYYJ", homeName: "Victoria",
      gate: gate && gate !== "-" ? gate : null,
      otherIata: YHZ_CITY_IATA[city.toUpperCase()] || null, otherName: city || null,
      airlineIata, airlineName,
      sched, revised
    }));
  }
  return out;
}
__name(yyjParseFeed, "yyjParseFeed");
async function yyjFetchBoard() {
  const ajax = (nonce) => fetchAuthorityText(`yyj/flights/${nonce}`, YYJ_AJAX_URL, "flightsTable", 75, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json, text/html", "Referer": YYJ_PAGE_URL },
    body: `action=yyj_get_flights&nonce=${encodeURIComponent(nonce)}&lang=en`
  });
  const page = await fetchAuthorityText("yyj/page", YYJ_PAGE_URL, "flightsData", 1800);
  const nonce = yyjParseNonce(page);
  let t = nonce ? await ajax(nonce) : null;
  if (t) return t;
  // The nonce rotates every 12 h; the cached page may hold a dead one.
  // One fresh page read, keyed to the minute so a dead site is not looped.
  const fresh = await fetchAuthorityText(`yyj/page/${Math.floor(Date.now() / 6e4)}`, YYJ_PAGE_URL, "flightsData", 60);
  const n2 = yyjParseNonce(fresh);
  if (n2 && n2 !== nonce) t = await ajax(n2);
  return t || null;
}
__name(yyjFetchBoard, "yyjFetchBoard");

// ── YQY Sydney NS — yqy.terminalsystems.com/flights.php ──────────────
// Terminal Systems Inc (TSI) serves the board that flyyqy.ca's homepage
// widget jQuery.getJSON's: one ~1 KB JSON payload (the Content-Type says
// text/html — ignore it) carrying BOTH directions, about two Air Canada
// round trips a day (YYZ, YUL). Rows carry the carrier name AND code, a
// digits-only flight number, a city NAME (no code), an explicit
// YYYY-MM-DD date, and 12-hour clock strings with inconsistent
// zero-padding ("5:20 PM" / "05:05 AM") that are Halifax wall-clock with
// no offset — the site's own JS computes "today" in America/Halifax.
// `actualtime` is the board's "Update" column: the estimate while a
// flight is pending, the actual once Departed/Arrived, and simply equal
// to scheduletime when nothing changed. Yesterday's rows linger until
// ~02:00–03:00 local (seen at 01:48, gone at 03:06); no tomorrow rows
// were seen, so the board is today-only. No auth, no params (all
// ignored), CORS *, no cache headers upstream. Verified live 2026-09-06
// 03:06 ADT with the worker's UA and with no UA at all. sydneyairport.ca
// (the old domain) has a broken TLS chain — never fetch it.
const YQY_FEED_URL = "https://yqy.terminalsystems.com/flights.php";
// Cities YQY's board could name that the Halifax map lacks (Halifax
// itself, the accented Montréal, St. John's without the period);
// Toronto / Montreal / St. John's / Charlottetown come from YHZ_CITY_IATA.
const YQY_CITY_IATA = { "HALIFAX": "YHZ", "MONTRÉAL": "YUL", "ST JOHN'S": "YYT", "ST. JOHNS": "YYT", "ST JOHNS": "YYT" };
// TSI's remarks vocabulary — On Time / Early / Late / Delayed / Departed /
// Arrived / Cancelled / Diverted (the data shows the first three of the
// live states; the page's CSS switch names the rest and styles Late
// exactly like Delayed). Diverted and Late are the two yhzStatus misses.
function yqyStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (s.includes("divert")) return "diverted";
  if (s.includes("late")) return "delayed";
  return yhzStatus(s);   // cancel / depart / arriv / delay; On Time, Early → scheduled
}
__name(yqyStatus, "yqyStatus");
// The raw rows, or null when the body is not the {flights:[…]} shape.
// The handler leans on that null to tell "the feed changed under us"
// (fall through) from "no flights this way right now" (an empty board).
function yqyFeedRows(jsonText) {
  const t = String(jsonText || "").trim();
  if (t[0] !== "{") return null;
  let j = null;
  try { j = JSON.parse(t); } catch (e) {
    // PHP-built JSON: tolerate a dangling comma on a row-less day.
    try { j = JSON.parse(t.replace(/,\s*([\]}])/g, "$1")); } catch (e2) { return null; }
  }
  return j && Array.isArray(j.flights) ? j.flights : null;
}
__name(yqyFeedRows, "yqyFeedRows");
// Exported for the node test suite. `nowMs` only matters for a row that
// arrives without its date (never seen) — such a row is Halifax-today.
function yqyParseFeed(jsonText, dir, nowMs) {
  const out = [];
  const rows = yqyFeedRows(jsonText);
  if (!rows) return out;
  const tz = "America/Halifax";
  let today = null;
  const todayIn = () => {
    if (today) return today;
    const dp = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
    const gv = (t) => (dp.find((p) => p.type === t) || {}).value;
    return (today = `${gv("year")}-${gv("month")}-${gv("day")}`);
  };
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const type = String(r.type || "").trim().toUpperCase();
    if (type !== "A" && type !== "D") continue;
    if ((dir === "dep") !== (type === "D")) continue;
    const airlineName = String(r.Airline || "").trim().replace(/\s+/g, " ");
    const nameU = airlineName.toUpperCase();
    const code = String(r.airlinecode || "").trim().toUpperCase()
      || AIRLINE_NAME_IATA[nameU] || AIRLINE_NAME_IATA_SQUASHED[nameU.replace(/\s+/g, "")] || "";
    let fn = String(r.flightnumber == null ? "" : r.flightnumber).trim().toUpperCase();
    if (code && fn.startsWith(code)) fn = fn.slice(code.length);   // defensive: the feed sends digits only
    fn = fn.replace(/^0+(?=\d)/, "");
    if (!code || !/^\d{1,4}[A-Z]?$/.test(fn)) continue;
    const dm = String(r.date || "").match(/^\s*(\d{4}-\d{2}-\d{2})/);
    const date = dm ? dm[1] : todayIn();
    const sched = parse12hLocal(tz, `${date} ${String(r.scheduletime || "").trim()}`);
    if (!sched) continue;
    // "Update" differs from schedule → revisedTime (estimate or actual,
    // the status tells which — the YVR/DUB/YYJ convention). A 12 AM
    // update on an 11 PM flight belongs to the next calendar day.
    const act = parse12hLocal(tz, `${date} ${String(r.actualtime || "").trim()}`);
    const revised = act && act.ts !== sched.ts ? settleRevised(act, sched, tz) : null;
    const city = String(r.city || "").trim().replace(/\s+/g, " ");
    const cityKey = city.toUpperCase();
    out.push(authorityFlight({
      dir, number: `${code}${fn}`, status: yqyStatus(r.remarks),
      homeIata: "YQY", homeIcao: "CYQY", homeName: "Sydney NS",   // the worker's own CITY_NAMES spelling
      gate: String(r.gate == null ? "" : r.gate).trim() || null,   // "" on every arrival row; "2" on departures
      otherIata: YQY_CITY_IATA[cityKey] || YHZ_CITY_IATA[cityKey] || null,
      otherName: city || null,
      airlineIata: code, airlineName: airlineName || AIRLINE_IATA_NAME[code] || null,
      sched, revised
    }));
  }
  return out;
}
__name(yqyParseFeed, "yqyParseFeed");

// ── YQX Gander — ganderairport.com/flights/?type=… (WordPress SSR) ───
// WP Engine behind Cloudflare, page cache 600 s. Each typed view renders
// one <table class="flights-table-arrivals"|"flights-table-departures">
// server-side, eight <td>s a row: Flight (IATA-prefixed), Airline (a
// display name), Date "DD Mon" (no year), Scheduled HH:MM, Revised
// HH:MM (mirrors Scheduled until something changes), Arriving From,
// Destination, Status (only "OnTime" seen; a colour hint rides in a
// style attr). Today through ~5 days ahead, ~18 rows a direction. No
// gates, belts, aircraft, codeshares or JSON — flights.js only toggles
// the two tabs.
//
// Quirks pinned by the parser:
//  • Cloudflare 403s the EXACT User-Agent "Mozilla/5.0"; any other
//    descriptive UA gets 200, so the fetch sends a product UA outright.
//  • The combined /flights/ page prints Arriving From/Destination
//    SWAPPED relative to the typed views. We fetch the typed views, and
//    the parser takes whichever city cell is NOT Gander either way.
//  • PAL's through-flights (PB921 YYT–YQX–YYR, PB922 back) show the same
//    number on both boards at different times: one arrival row, one
//    departure row — exactly what the screens want, no de-dup across
//    directions.
//  • Cities are names only: "St. John's " carries a trailing space and a
//    literal apostrophe (yhzCellText also decodes the entity forms).
//  • Every row is dated; a row that ever loses its date is read as
//    today's in Gander's clock.
// Newfoundland runs on the half-hour (America/St_Johns: -02:30 NDT /
// -03:30 NST) — offsets come from the tz helper, never hand-rolled.
const YQX_UA = "OrionConnected-FIDS/1.0 (+https://fids.orionconnected.com)";
const YQX_CITY_IATA = {
  "HALIFAX": "YHZ",   // absent from the Halifax-centric shared map
  "ST. JOHN'S": "YYT", "ST JOHN'S": "YYT", "ST. JOHNS": "YYT", "ST JOHNS": "YYT",
  "GOOSE BAY": "YYR", "HAPPY VALLEY-GOOSE BAY": "YYR", "HAPPY VALLEY": "YYR",
  "DEER LAKE": "YDF", "ST. ANTHONY": "YAY", "ST ANTHONY": "YAY", "STEPHENVILLE": "YJT",
  "WABUSH": "YWK", "LABRADOR CITY": "YWK", "CHURCHILL FALLS": "ZUM", "NAIN": "YDP",
  "SAINT-PIERRE": "FSP", "ST-PIERRE": "FSP", "ST. PIERRE": "FSP",
  "ORLANDO": "MCO", "ORLANDO SANFORD": "SFB", "SANFORD": "SFB"
};
// Should the site ever print ICAO prefixes (ACA1170, PVL921), fold them
// back to the IATA keys the boards use for logos and colours.
const YQX_ICAO_IATA = { ACA: "AC", JZA: "AC", ROU: "RV", PVL: "PB", WJA: "WS", WEN: "WS", POE: "PD", FLE: "F8", TSC: "TS", SWG: "WG", SPM: "PJ" };
function yqxStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("gate closed")) return "gateclosed";
  if (s.includes("final call") || s.includes("board")) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("delay") || s.includes("late")) return "delayed";
  return "scheduled";   // OnTime / On Time / Early / anything novel
}
__name(yqxStatus, "yqxStatus");
// "06 Sep" + "13:20" → time object on that Gander calendar day. The year
// is whichever lands nearest to now (December boards reading into
// January included); a row with no readable date is today's, in
// Gander's clock, not UTC's.
function parseYqxTime(dateStr, timeStr, nowMs) {
  const tm = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  const hh = Number(tm[1]), mm = Number(tm[2]);
  if (hh > 23 || mm > 59) return null;
  const dm = String(dateStr || "").trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?(?:,?\s+(\d{4}))?$/);
  const mo = dm ? AUTH_MONTHS[dm[2].toUpperCase()] : undefined;
  let y, d;
  if (dm && mo) {
    d = Number(dm[1]);
    if (d < 1 || d > 31) return null;
    y = dm[3] ? Number(dm[3]) : nearestYear(mo, d, nowMs);
    return localTimeObjIn("America/St_Johns", y, mo, d, hh, mm);
  }
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/St_Johns", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
  return localTimeObjIn("America/St_Johns", g("year"), g("month"), g("day"), hh, mm);
}
__name(parseYqxTime, "parseYqxTime");
function parseYqxPage(html, dir, nowMs) {
  const out = [];
  const want = dir === "dep" ? "flights-table-departures" : "flights-table-arrivals";
  const tm = String(html || "").match(new RegExp('<table class="' + want + '"[\\s\\S]*?<\\/table>'));
  if (!tm) return out;
  const seen = new Set();
  const isHome = (s) => /^gander\b/i.test(String(s || "").trim());
  // Each row ends in a commented-out "<!-- <td></td> -->" (a shelved
  // Weather column) — strip comments first so the cell count stays 8.
  const rows = tm[0].replace(/<!--[\s\S]*?-->/g, "").match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (row.indexOf("<th") !== -1) continue;
    const cells = authorityCellsText(row);
    if (cells.length < 8) continue;
    const [numRaw, carrier, dateRaw, schedRaw, revRaw, fromRaw, toRaw, statusRaw] = cells;
    const nm = numRaw.replace(/\s+/g, "").toUpperCase().match(/^([A-Z][A-Z0-9]|[0-9][A-Z]|[A-Z]{3})?(\d{1,4})$/);
    if (!nm) continue;
    const _cu = carrier.toUpperCase().trim();
    const nameCode = AIRLINE_NAME_IATA[_cu] || AIRLINE_NAME_IATA_SQUASHED[_cu.replace(/\s+/g, "")] || null;
    const prefix = nm[1] || "";
    const code = (prefix.length === 3 ? (YQX_ICAO_IATA[prefix] || nameCode) : prefix) || nameCode;
    const number = (code || prefix) + nm[2];
    const sched = parseYqxTime(dateRaw, schedRaw, nowMs);
    if (!sched) continue;
    // Revised mirrors Scheduled until something changes; a differing value
    // is the revision, settled across midnight toward the schedule.
    let revised = parseYqxTime(dateRaw, revRaw, nowMs);
    if (revised && revised.ts === sched.ts) revised = null;
    if (revised) revised = settleRevised(revised, sched, "America/St_Johns");
    // Typed views keep Gander in the home column; the combined page swaps
    // the two. Whichever cell is NOT Gander is the other end.
    let other = dir === "dep" ? toRaw : fromRaw;
    const alt = dir === "dep" ? fromRaw : toRaw;
    if (isHome(other) && !isHome(alt)) other = alt;
    const city = other.trim();
    const cityU = city.toUpperCase();
    const key = `${number}|${sched.ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(authorityFlight({
      dir, number, status: yqxStatus(statusRaw),
      homeIata: "YQX", homeIcao: "CYQX", homeName: "Gander",
      otherIata: YQX_CITY_IATA[cityU] || YHZ_CITY_IATA[cityU] || null, otherName: city || null,
      airlineIata: code || null, airlineName: carrier || (code && AIRLINE_IATA_NAME[code]) || null,
      sched, revised
    }));
  }
  return out;
}
__name(parseYqxPage, "parseYqxPage");

// ── YYG Charlottetown — flyyyg.com SSR page (one page, two tables) ───
// flypei.com (the old host) is dead: https times out and http is a
// JavaScript redirect stub to flyyyg.com. The WordPress/Beaver Builder
// site renders both boards server-side from an upstream XML its theme
// reads (no XHR/JSON endpoint exists — the guessed XML paths all 404):
// <table class="arrdeptables"> is arrivals, <table class="arrdeptables
// departing"> is departures. EVERY data row wears class="arrivals" in
// BOTH tables (their CSS, not a direction signal — the table class is)
// and a stray unclosed <tr> precedes the first data row of each table,
// so rows are anchored on `<tr class="arrivals"`. Seven cells: Date
// ("Sep 6, 2026" — a full date per row, so no midnight walk), Carrier
// (logo <img> + display name), Flight # (IATA-prefixed: AC630, F8678,
// PD2364, WS789), City (name only — "Montreal -MET" is Porter's Montréal
// Metropolitan/Saint-Hubert service per the airport's own news post),
// "Sch. Time (AST)" and "Arr. Time"/"Dep. Time" as 24-h HH:MM, Status.
// The "(AST)" header is a label, not the zone: the page's own feed stamp
// reads in ADT in summer (03:05 at 06:06Z), so times are Halifax wall
// clock on the row's date — via the tz helper, never a fixed offset.
// The page shows the operating day plus the previous day's stragglers
// for a couple of hours after midnight (a Sep 5 "Arrived" row at 01:45,
// gone by 03:06). No gates, belts, terminals or aircraft; ~10 movements
// a day each way. Upstream is cache-control: no-store — we cache here.
const YYG_CITY_IATA = {
  "MONTREAL-MET": "YHU",          // Montréal Metropolitan (Saint-Hubert) — the only tagged city seen live
  "HALIFAX": "YHZ"                // the shared map has no entry for its own home
};
// Carrier logo filename → IATA: a fallback for a display name the shared
// name map doesn't know (the flight number normally carries the prefix).
const YYG_LOGO_IATA = { air_canada_logo: "AC", flair_logo: "F8", porter_logo: "PD", westjet_logo: "WS" };
function yygStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("gate closed")) return "gateclosed";
  if (s.includes("boarding") || s.includes("final call")) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("delay") || s.includes("late")) return "delayed";
  return "scheduled";   // On Time / Early / anything novel
}
__name(yygStatus, "yygStatus");
// "Sep 6, 2026" (also "Sept 6, 2026", "6 Sep 2026") → { y, mo, d } or null.
function parseYygDate(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  let m = t.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  let mo, d;
  if (m) { mo = AUTH_MONTHS[m[1].toUpperCase()]; d = Number(m[2]); }
  else {
    m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})$/);
    if (!m) return null;
    mo = AUTH_MONTHS[m[2].toUpperCase()]; d = Number(m[1]);
  }
  if (!mo || d < 1 || d > 31) return null;
  return { y: Number(m[3]), mo, d };
}
__name(parseYygDate, "parseYygDate");
// City cell → IATA. Exact (dash-squashed) key first, then the shared
// Atlantic map, then the bare city with any " -TAG" suffix dropped —
// so a tag we have not seen still lands on the city's main airport.
function yygCityIata(city) {
  const key = String(city || "").toUpperCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  if (!key) return null;
  if (YYG_CITY_IATA[key]) return YYG_CITY_IATA[key];
  if (YHZ_CITY_IATA[key]) return YHZ_CITY_IATA[key];
  const base = key.replace(/-[A-Z]{2,5}$/, "");
  return YYG_CITY_IATA[base] || YHZ_CITY_IATA[base] || null;
}
__name(yygCityIata, "yygCityIata");
function parseYygPage(html, dir, nowMs) {
  const out = [];
  const tz = "America/Halifax";
  const tables = String(html || "").match(/<table[^>]*class="arrdeptables[^"]*"[\s\S]*?<\/table>/g) || [];
  const table = tables.find((t) => /^<table[^>]*class="[^"]*\bdeparting\b/.test(t) === (dir === "dep"));
  if (!table) return out;
  let today = null;   // airport-local today, only computed if a row lacks its date
  const rows = table.match(/<tr class="arrivals"[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const cells = authorityCellsText(row);
    if (cells.length < 7) continue;
    const [dateRaw, carrier, numRaw, cityRaw, schedRaw, estRaw, statusRaw] = cells;
    const num = numRaw.replace(/\s+/g, "").toUpperCase();
    const nm = num.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])?(\d{1,4})$/);
    const sm = schedRaw.match(/^(\d{1,2})[:hH](\d{2})$/);
    if (!nm || !sm) continue;
    let dt = parseYygDate(dateRaw);
    if (!dt) {
      if (!today) {
        const dp = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
        const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
        today = { y: g("year"), mo: g("month"), d: g("day") };
      }
      dt = today;
    }
    const sched = localTimeObjIn(tz, dt.y, dt.mo, dt.d, Number(sm[1]), Number(sm[2]));
    // Arr./Dep. Time mirrors the schedule until something changes; only a
    // differing value is a revision, and one on the far side of midnight
    // (sched 23:59, actual 00:12 on the same dated row) is settled.
    let revised = null;
    const em = estRaw.match(/^(\d{1,2})[:hH](\d{2})$/);
    if (em && (Number(em[1]) !== Number(sm[1]) || Number(em[2]) !== Number(sm[2]))) {
      revised = settleRevised(localTimeObjIn(tz, dt.y, dt.mo, dt.d, Number(em[1]), Number(em[2])), sched, tz);
    }
    const _cu = carrier.toUpperCase().trim();
    const logo = ((row.match(/carriers\/([a-z0-9_]+)\.(?:png|svg|jpe?g|webp)/i) || [])[1] || "").toLowerCase();
    const code = nm[1] || AIRLINE_NAME_IATA[_cu]
      || AIRLINE_NAME_IATA_SQUASHED[_cu.replace(/\s+/g, "")] || YYG_LOGO_IATA[logo] || null;
    const city = cityRaw.trim();
    out.push(authorityFlight({
      dir, number: nm[1] ? num : (code ? code + nm[2] : nm[2]), status: yygStatus(statusRaw),
      homeIata: "YYG", homeIcao: "CYYG", homeName: "Charlottetown",
      otherIata: yygCityIata(city), otherName: city || null,
      airlineIata: code, airlineName: (code && AIRLINE_IATA_NAME[code]) || carrier || null,
      sched, revised
    }));
  }
  return out;
}
__name(parseYygPage, "parseYygPage");

// ── YKA Kamloops — kamloopsairport.com/starkapi.php (2026-09-06) ─────
// A WordPress-root PHP shim in front of the airport's Stark FIDS; the
// site's own React board (plugin ch-flight-data, Vantage Airport Group)
// polls ?type=arrivals and ?type=departures every 60 s. One bare JSON
// array per direction, from about now to +2 days (landed flights linger
// briefly, then drop off), no auth, no cookies, no referer; Cloudflare-
// fronted but unchallenged with the worker's own UA (verified live
// 2026-09-05 23:06 PDT). Quirks: AirlineCode holds the carrier NAME
// ("Air Canada" / "WestJet" / "Pacific Coastal") and FlightNumber the
// bare digits; ScheduleTime/EstimatedTime read "Sep 5 - 22:13" (no year,
// no offset — Pacific wall clock); ActualTime is [] until the flight
// moves, then a bare "HH:MM"; Status is free text with the clock
// embedded: "On Time", "Late at 22:50", "Early at 23:47", "Arrived at
// 23:02". Gate on both directions; no terminal, belt, tail or type. A
// missing ?type= answers a WP REST 404 JSON and an unknown one silently
// falls back to departures — the ArrivalOrDeparture field guards that.
const YKA_TZ = "America/Vancouver";
// Carriers the Kamloops board names that the shared map lacks (8P flies
// YKA–YYJ today; 9M and Jazz for whenever they are back on the roster).
const YKA_AIRLINE_IATA = {
  "PACIFIC COASTAL": "8P", "PACIFIC COASTAL AIRLINES": "8P",
  "CENTRAL MOUNTAIN AIR": "9M", "CENTRAL MOUNTAIN": "9M",
  "AIR CANADA JAZZ": "AC", "JAZZ": "AC", "WESTJET LINK": "WS"
};
// "Sep 5 - 22:13" → time object in the Pacific zone. The year is the one
// nearest to now (a "Jan 2" read on New Year's Eve lands next year); an
// explicit year, should the shim ever grow one, is honoured.
function parseYkaTime(s, nowMs) {
  const m = String(s || "").match(/^\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\s*-?\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const mo = AUTH_MONTHS[m[1].toUpperCase()];
  if (!mo) return null;
  const d = Number(m[2]), hh = Number(m[4]), mm = Number(m[5]);
  if (d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const y = m[3] ? Number(m[3]) : nearestYear(mo, d, nowMs);
  return localTimeObjIn(YKA_TZ, y, mo, d, hh, mm);
}
__name(parseYkaTime, "parseYkaTime");
// Stark's word for delayed is "Late". "Early at HH:MM" is an estimate on
// a flight that is otherwise on schedule — scheduled + revisedTime, the
// YYJ/AUS convention (the boards colour "early" from the revised gap).
// Gate-side words (not yet seen here, but a Stark FIDS has them) take
// the YXE spellings; anything novel falls to yhzStatus → scheduled.
function ykaStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (/\blate\b/.test(s)) return "delayed";
  if (/divert/.test(s)) return "diverted";
  if (/gate\s*closed/.test(s)) return "gateclosed";
  if (/final\s*call|boarding/.test(s)) return "boarding";
  return yhzStatus(s);
}
__name(ykaStatus, "ykaStatus");
// A bare "HH:MM" (ActualTime, or the clock inside Status) placed on the
// scheduled day and settled across midnight.
function ykaClockOn(sched, txt) {
  const m = String(txt || "").match(/(\d{1,2}):(\d{2})/);
  if (!m || !sched) return null;
  const y = Number(sched.local.slice(0, 4)), mo = Number(sched.local.slice(5, 7)), d = Number(sched.local.slice(8, 10));
  return settleRevised(localTimeObjIn(YKA_TZ, y, mo, d, Number(m[1]), Number(m[2])), sched, YKA_TZ);
}
__name(ykaClockOn, "ykaClockOn");
function parseYkaFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (j && Array.isArray(j.flights) ? j.flights : []);
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    // Each endpoint is one direction, but the field is there — and it is
    // what turns the shim's silent fallback to departures into an empty
    // (→ null → untouched) read instead of departures on the arrivals board.
    const ad = String(r.ArrivalOrDeparture || "").trim().toUpperCase();
    if (ad && (dir === "dep") !== /^D/.test(ad)) continue;
    const nm = String(r.FlightNumber || "").trim().toUpperCase().match(/^(?:([A-Z]\d|\d[A-Z]|[A-Z]{2})\s*)?(\d{1,4})[A-Z]?$/);
    if (!nm) continue;
    const sched = parseYkaTime(r.ScheduleTime, nowMs);
    if (!sched) continue;
    const name = String(r.AirlineCode || "").trim();
    const key = name.toUpperCase();
    const code = YKA_AIRLINE_IATA[key] || AIRLINE_NAME_IATA[key] || AIRLINE_NAME_IATA_SQUASHED[key.replace(/\s+/g, "")]
      || (/^[A-Z0-9]{2}$/.test(key) ? key : null) || nm[1] || null;
    // EstimatedTime carries its own date and is kept in step with the
    // status clock (verified: "Arrived at 23:02" ↔ "Sep 5 - 23:02");
    // ActualTime and the "at HH:MM" inside Status are the fallbacks.
    const est = parseYkaTime(r.EstimatedTime, nowMs);
    let revised = (est && est.ts !== sched.ts) ? est
      : ykaClockOn(sched, typeof r.ActualTime === "string" ? r.ActualTime : "")
        || ykaClockOn(sched, (String(r.Status || "").match(/\bat\s+(\d{1,2}:\d{2})/i) || [])[1]);
    if (revised && revised.ts === sched.ts) revised = null;
    const city = String(r.ViaAirportCity || r.Comments || "").trim();
    out.push(authorityFlight({
      dir, number: code ? `${code}${nm[2]}` : nm[2],
      status: ykaStatus(r.Status),
      homeIata: "YKA", homeIcao: "CYKA", homeName: "Kamloops",
      gate: String(r.Gate || "").trim() || null,
      otherIata: String(r.ViaAirportCode || "").trim().toUpperCase() || YHZ_CITY_IATA[city.toUpperCase()] || null,
      otherName: city || null,
      airlineIata: code,
      airlineName: (name && !/^[A-Z0-9]{2}$/.test(key)) ? name : (AIRLINE_IATA_NAME[code] || null),
      sched, revised
    }));
  }
  return out;
}
__name(parseYkaFeed, "parseYkaFeed");

// ── YXS Prince George — pgairport.ca "yxs_ifids" WordPress AJAX board ─
// One GET to admin-ajax.php?action=yxs_ifids_get_panels&refresh=0 answers
// {success, data:{html, timestamp, raw}}: server-rendered HTML holding
// BOTH directions — <div id="panel-arrivals"> then <div id="panel-
// departures">, each an <ol> of
//   <button class="yxs-ifids-widget__item yxs-ifids-widget__item--on-time"
//     data-flight="8349" data-airline="Air Canada" data-from="Vancouver"
//     data-scheduled="23:34, Sep 5" data-status="On Time" data-gate="2A"
//     data-baggage="">…<div class="…flight-expected">Expected 23:35</div>…
// Rolling window: roughly now → ~4 days ahead (53 + 52 rows at 23:06 PDT);
// completed rows drop out an hour or two after the fact. ~150 KB a call.
// Verified live 2026-09-05 23:07 PDT with the worker's own UA.
//
// Pinned quirks:
//  • The page's WP nonce (YXSIFIDS.nonce) is NOT enforced: no nonce, a
//    bogus nonce, GET or POST all answer the identical payload. A request
//    with no User-Agent header at all is a 403 (fetchAuthorityText always
//    sends one); the browser UA and the worker UA both pass.
//  • refresh=1 asks the plugin to re-pull its upstream and intermittently
//    answers {"success":false,"data":"No data"}; refresh=0 serves the
//    plugin's own ~2-min cache (data.raw advances ~1 min between calls)
//    and is all we ever send. "No data" carries no panel marker, so
//    fetchAuthorityText files it as a miss (30 s negative cache).
//  • Flight numbers are digits only; the carrier comes from the logo
//    filename (icon-ac / icon-wja / icon-9m / icon-pca) with the display
//    name as fallback. data-from is the far city NAME — reused for "To"
//    on departures (the widget JS relabels it) — no codes anywhere.
//  • Times are the Pacific wall clock: data.raw ("2026-09-05 23:06:11")
//    tracked PDT at fetch time although the page labels it "PST".
//    Scheduled carries a month-day but no year (nearestYear); Expected is
//    HH:MM with no date — paired with the scheduled day and settled across
//    midnight. Expected equal to Scheduled is not a revision.
//  • data-baggage ('' or a belt number) is set on departure rows too (the
//    inbound aircraft's belt); it is only attached to arrivals.
//  • Statuses seen live: On Time, Late, Delayed, Departed (slug class
//    on-time/late/delayed/departed). Anything novel maps by keyword, else
//    "scheduled".
const YXS_AJAX_URL = "https://www.pgairport.ca/wp-admin/admin-ajax.php?action=yxs_ifids_get_panels&refresh=0";
// Logo filename stem → IATA. The plugin's own carrier key, so it wins over
// the display name (Air Canada Express / WestJet Encore both fly the
// mainline code here).
const YXS_ICON_IATA = { ac: "AC", wja: "WS", wj: "WS", ws: "WS", "9m": "9M", cma: "9M", pca: "8P", "8p": "8P", f8: "F8", fle: "F8", wg: "WG", swg: "WG" };
// Carriers the shared name map lacks: the two YXS regionals.
const YXS_AIRLINE_IATA = { "CENTRAL MOUNTAIN AIR": "9M", "PACIFIC COASTAL": "8P", "PACIFIC COASTAL AIRLINES": "8P" };
// City names on the YXS route map that YHZ_CITY_IATA doesn't cover: the
// northern-BC regionals plus the sun destinations. The big ones
// (Vancouver, Calgary, Edmonton, Kelowna, Victoria, Kamloops…) fall
// through to the shared map.
const YXS_CITY_IATA = {
  "TERRACE": "YXT", "FORT NELSON": "YYE", "FORT ST. JOHN": "YXJ", "FORT ST JOHN": "YXJ",
  "SMITHERS": "YYD", "PRINCE RUPERT": "YPR", "WILLIAMS LAKE": "YWL", "QUESNEL": "YQZ",
  "DAWSON CREEK": "YDQ", "CAMPBELL RIVER": "YBL", "CRANBROOK": "YXC", "CASTLEGAR": "YCG",
  "PENTICTON": "YYF", "POWELL RIVER": "YPW", "PORT HARDY": "YZT", "WHITEHORSE": "YXY",
  "BELLA COOLA": "QBC", "ANAHIM LAKE": "YAA", "MASSET": "ZMT", "SANDSPIT": "YZP",
  "TRAIL": "YZZ", "TOFINO": "YAZ", "PUERTO VALLARTA": "PVR", "CANCUN": "CUN",
  "LOS CABOS": "SJD", "SAN JOSE DEL CABO": "SJD", "MAZATLAN": "MZT", "PHOENIX-MESA": "AZA"
};
function yxsStatus(txt, cls) {
  const s = `${txt || ""} ${cls || ""}`.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("gate closed") || s.includes("gate-closed")) return "gateclosed";
  if (s.includes("final call") || s.includes("boarding")) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("late") || s.includes("delay")) return "delayed";
  return "scheduled";   // On Time / Early / anything novel
}
__name(yxsStatus, "yxsStatus");
// One data-* attribute off a row's <button …> tag, entity-decoded.
function yxsAttr(tag, name) {
  const m = String(tag || "").match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? yhzCellText(m[1]) : "";
}
__name(yxsAttr, "yxsAttr");
// The wanted panel's slice of the payload HTML: from its id to the other
// panel's id (or the end), whichever order the two are rendered in.
function yxsPanel(html, dir) {
  const src = String(html || "");
  const ia = src.indexOf('id="panel-arrivals"'), id = src.indexOf('id="panel-departures"');
  const start = dir === "dep" ? id : ia, other = dir === "dep" ? ia : id;
  if (start === -1) return "";
  return src.slice(start, other > start ? other : undefined);
}
__name(yxsPanel, "yxsPanel");
// jsonText is the raw admin-ajax response ({success, data:{html}}); a bare
// HTML fragment is accepted too so the parser can be fed either. `nowMs`
// only anchors the year of the month-day dates.
function parseYxsPanels(jsonText, dir, nowMs) {
  const out = [];
  const tz = "America/Vancouver";
  let html = String(jsonText || "");
  if (/^\s*\{/.test(html)) {
    let j; try { j = JSON.parse(html); } catch (e) { return out; }
    if (!j || !j.success || !j.data || typeof j.data.html !== "string") return out;
    html = j.data.html;
  }
  const panel = yxsPanel(html, dir);
  for (const rm of panel.matchAll(/<button\b([^>]*\sdata-flight="[^"]*"[^>]*)>([\s\S]*?)<\/button>/g)) {
    const tag = rm[1], inner = rm[2];
    const digits = yxsAttr(tag, "data-flight").replace(/\D+/g, "");
    // "23:34, Sep 5" (PHP "H:i, M j"); a year is tolerated should one appear.
    const sm = yxsAttr(tag, "data-scheduled").match(/^(\d{1,2}):(\d{2}),?\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
    if (!digits || !sm) continue;
    const mo = AUTH_MONTHS[sm[3].toUpperCase()];
    if (!mo) continue;
    const d = Number(sm[4]);
    const y = sm[5] ? Number(sm[5]) : nearestYear(mo, d, nowMs);
    const sched = localTimeObjIn(tz, y, mo, d, Number(sm[1]), Number(sm[2]));
    // "Expected 21:47" lives only in the row body (no data-* for it).
    const em = yhzCellText((inner.match(/yxs-ifids-widget__flight-expected"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "").match(/(\d{1,2}):(\d{2})/);
    let revised = null;
    if (em && (Number(em[1]) !== Number(sm[1]) || Number(em[2]) !== Number(sm[2]))) {
      revised = settleRevised(localTimeObjIn(tz, y, mo, d, Number(em[1]), Number(em[2])), sched, tz);
    }
    const airline = yxsAttr(tag, "data-airline");
    const icon = ((inner.match(/\/icon[-_]([A-Za-z0-9]+)\.(?:png|svg|webp|jpe?g)/i) || [])[1] || "").toLowerCase();
    const key = airline.toUpperCase();
    const code = YXS_ICON_IATA[icon] || YXS_AIRLINE_IATA[key] || AIRLINE_NAME_IATA[key]
      || AIRLINE_NAME_IATA_SQUASHED[key.replace(/\s+/g, "")] || null;
    const slug = (tag.match(/yxs-ifids-widget__item--([a-z-]+)/) || [])[1] || "";
    const city = yxsAttr(tag, "data-from");
    const cityKey = city.toUpperCase();
    const gate = yxsAttr(tag, "data-gate");
    const belt = yxsAttr(tag, "data-baggage");
    const fl = authorityFlight({
      dir, number: (code || "") + digits, status: yxsStatus(yxsAttr(tag, "data-status"), slug),
      homeIata: "YXS", homeIcao: "CYXS", homeName: "Prince George",
      gate: gate && gate !== "-" ? gate : null,
      otherIata: YXS_CITY_IATA[cityKey] || YHZ_CITY_IATA[cityKey] || null,
      otherName: city || null,
      airlineIata: code, airlineName: airline || null,
      sched, revised
    });
    if (dir === "arr" && belt && belt !== "-") fl.arrival.baggageBelt = belt;
    out.push(fl);
  }
  return out;
}
__name(parseYxsPanels, "parseYxsPanels");

// ── YMM Fort McMurray — flyymm.com's WordPress REST route (fmaa/v1) ───
// One small JSON per direction per calendar day (7–10 rows, ~2 KB): a
// dated row ("date" plus a "HH:MM, Mon DD" scheduletime), a bare "HH:MM"
// actualtime that is the estimate/actual (equal to schedule when on
// time), and the status in "remarks" with the clock repeated in
// "status_time" ("Early 01:17"). "type" is the direction; "indicator" is
// D on every row, arrivals included, so it is NOT. Naive Fort McMurray
// wall clock throughout (America/Edmonton). Only WS/AC fly here (F8 per
// the site's logo CSS), so the feed never needs a name→code lookup.
//
// Status vocabulary: the live feed has shown only "On Time" and "Early";
// the page's own CSS classes are "status-" + remarks lowercased and
// hyphenated, and its mock table uses "Delayed" / "Cancelled". Known
// words map onto the board keys; anything novel travels through
// lowercased (the boards treat an unknown key as scheduled, and the raw
// word stays visible in the JSON for the next person).
const YMM_STATUS = {
  "ON TIME": "scheduled", "EARLY": "scheduled", "SCHEDULED": "scheduled", "EXPECTED": "scheduled",
  "DELAYED": "delayed", "LATE": "delayed",
  "CANCELLED": "cancelled", "CANCELED": "cancelled",
  "DEPARTED": "departed", "ARRIVED": "arrived", "LANDED": "arrived",
  "BOARDING": "boarding", "FINAL CALL": "boarding", "LAST CALL": "boarding",
  "GATE CLOSED": "gateclosed", "DIVERTED": "diverted"
};
function ymmStatus(txt) {
  const k = String(txt || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!k) return "scheduled";
  if (YMM_STATUS[k]) return YMM_STATUS[k];
  const s = k.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("gate closed")) return "gateclosed";
  if (s.includes("final call") || s.includes("last call") || s.includes("board")) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("delay") || s.includes("late")) return "delayed";
  if (s.includes("on time") || s.includes("early") || s.includes("sched") || s.includes("expect")) return "scheduled";
  return s;   // novel wording passes through as-is
}
__name(ymmStatus, "ymmStatus");
// "HH:MM" anywhere in a string ("05:45, Sep 06", "01:17", "Early 01:17").
function ymmClock(s) {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return (hh > 23 || mm > 59) ? null : [hh, mm];
}
__name(ymmClock, "ymmClock");
// The scheduled time object: the clock and "Mon DD" from scheduletime,
// the year anchored to the row's own "YYYY-MM-DD" (so a Dec 31 row
// reading "Jan 01" lands in the new year), falling back to the date
// field when the month-day text is absent, and to "nearest to now" for
// the year when neither carries one.
function ymmTimeObj(dateStr, timeStr, nowMs) {
  const clock = ymmClock(timeStr);
  if (!clock) return null;
  const dm = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const anchor = dm ? Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), 12) : nowMs;
  const md = String(timeStr || "").match(/,\s*([A-Za-z]{3})\.?\s+(\d{1,2})\b/);
  let y, mo, d;
  if (md && AUTH_MONTHS[md[1].toUpperCase()]) {
    mo = AUTH_MONTHS[md[1].toUpperCase()]; d = Number(md[2]);
    y = nearestYear(mo, d, anchor);
  } else if (dm) {
    y = Number(dm[1]); mo = Number(dm[2]); d = Number(dm[3]);
  } else return null;
  return localTimeObjIn("America/Edmonton", y, mo, d, clock[0], clock[1]);
}
__name(ymmTimeObj, "ymmTimeObj");
// Pure parser (exported for tests): one day's JSON for one direction →
// ADB-native flights. `dir` is checked against each row's "type" so a
// mislabelled fetch cannot cross the board.
function ymmParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = j && j.all_flights && Array.isArray(j.all_flights.flights) ? j.all_flights.flights : [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const ty = String(r.type || "").trim().toUpperCase();
    if (ty && (dir === "dep") !== (ty === "D")) continue;
    const number = String(r.flightnumber || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(number)) continue;
    const sched = ymmTimeObj(r.date, r.scheduletime, nowMs);
    if (!sched) continue;
    // actualtime is a bare clock hung on the scheduled calendar day; only
    // a differing value is a revision, settled across midnight (an
    // "00:20" against a 23:55 schedule is 25 min late, not 23 h early).
    // status_time repeats the same clock inside the words, so it is the
    // fallback when actualtime is blank.
    let revised = null;
    const rc = ymmClock(r.actualtime) || ymmClock(r.status_time);
    if (rc) {
      const sd = sched.local.slice(0, 10).split("-").map(Number);
      const rv = settleRevised(localTimeObjIn("America/Edmonton", sd[0], sd[1], sd[2], rc[0], rc[1]), sched, "America/Edmonton");
      if (rv.ts !== sched.ts) revised = rv;
    }
    const cityName = String(r.city_name || "").trim();
    const paren = (cityName.match(/\(([A-Za-z0-9]{3})\)\s*$/) || [])[1] || "";
    const otherName = cityName.replace(/\s*\([A-Za-z0-9]{3}\)\s*$/, "").trim() || null;
    let otherIata = String(r.city || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(otherIata)) otherIata = paren.toUpperCase() || YHZ_CITY_IATA[String(otherName || "").toUpperCase()] || null;
    const code = (String(r.airlinecode || "").trim().toUpperCase().match(/^[A-Z0-9]{2}$/) || [])[0] || number.slice(0, 2);
    const remarks = String(r.remarks || "").trim() || String(r.status_time || "").replace(/\d{1,2}:\d{2}.*$/, "").trim();
    out.push(authorityFlight({
      dir, number, status: ymmStatus(remarks),
      homeIata: "YMM", homeIcao: "CYMM", homeName: "Fort McMurray",
      gate: String(r.gate == null ? "" : r.gate).trim() || null,
      otherIata, otherName,
      airlineIata: code,
      airlineName: String(r.airlinename || "").trim() || AIRLINE_IATA_NAME[code] || null,
      sched, revised
    }));
  }
  return out;
}
__name(ymmParseFeed, "ymmParseFeed");
// Today and tomorrow on Fort McMurray's clock (the route is per local
// calendar day; a UTC date would ask for the wrong day every evening).
function ymmDays(nowMs) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  const today = `${g("year")}-${g("month")}-${g("day")}`;
  return [today, new Date(Date.parse(today + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)];
}
__name(ymmDays, "ymmDays");

// ── The registry ─────────────────────────────────────────────────────
// ── PHX Phoenix Sky Harbor — api.phx.aero (2026-09-06) ───────────────
// skyharbor.com/flights/ polls ONE JSON array (arrivals AND departures,
// ~800 rows, ~450 KB) from api.phx.aero, sending a Key that sits in the
// site's public bundle; the API answers identically without it (verified),
// so the Key travels for parity only (env.PHX_FEED_KEY overrides). Rolling
// snapshot, no date parameter: a few hours back through ~20 h ahead.
// Quirks, every one checked against the capture:
//  • ScheduledTime wears a "Z" but is Phoenix wall-clock (MST all year —
//    0 of 799 rows disagreed with the local ScheduledDateTime string), so
//    the Z is stripped and the clock read in America/Phoenix.
//  • Estimated / Actual / ChockTime are display clocks: "9:56 PM" means
//    TODAY in Phoenix, "September 6, 4:52 AM" names the day outright.
//    ChockTime is the gate (on/off-blocks) clock, Actual the runway one,
//    Estimated the live gate estimate — the board wants the gate clock.
//  • "Destination" holds the ORIGIN on arrivals ("CITY NAME (IATA)").
//  • StatusCode is ON / AR / DP / DL / "" (blank = still on time, far
//    out; DL seen live on a 1 h-late arrival). "Now h:mm" in Status is
//    just the Estimated clock, i.e. scheduled + revisedTime (the
//    YVR/DUB/AUS convention — the board derives delayed and early from
//    the revision itself). Only Estimated/ChockTime/Actual are parsed:
//    the Status clock drops its "September 6," prefix when Estimated
//    keeps it, so it is not trusted for dates.
//  • Through-flights come once PER route city (same ID, gate and clocks:
//    UA455 "from ORD" and "from PIT"; WN3167 to PVD, DCA and BNA) and the
//    feed never says which city is the immediate leg — its row order is
//    not the route order either way. Each city keeps its row, exactly as
//    the airport's own board lists them; the boards de-dupe on
//    flight|endpoint, so both rows survive there too.
//  • Phantom "Z"-suffixed twins (AA4044Z beside AA4044: same side, same
//    minute, no gate, blank StatusCode) and their PHX→PHX self-rows are
//    dropped — every suffixed row in the capture had a real twin.
const PHX_TZ = "America/Phoenix";
// ON/AR/DP/DL seen live; CX/DV are the PDX-style siblings the vendor is
// likely to emit — unverified, so anything else falls back to the text.
const PHX_STATUS = { ON: "scheduled", AR: "arrived", DP: "departed", CX: "cancelled", DL: "delayed", DV: "diverted" };
// "9:56 PM" (today in Phoenix) or "September 6, 4:52 AM" (that day) → a
// time object. Dateless clocks are settled toward the schedule so a clock
// printed just before midnight and read just after it doesn't land a day
// late; explicit dates are trusted as written.
function phxClockObj(s, sched, nowMs) {
  const m = String(s || "").trim().match(/^(?:([A-Za-z]+)\s+(\d{1,2}),\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hh = Number(m[3]) % 12;
  if (/pm/i.test(m[5])) hh += 12;
  const mm = Number(m[4]);
  if (m[1]) {
    const mo = AUTH_MONTHS[m[1].slice(0, 3).toUpperCase()];
    if (!mo) return null;
    return localTimeObjIn(PHX_TZ, nearestYear(mo, Number(m[2]), nowMs), mo, Number(m[2]), hh, mm);
  }
  const dp = new Intl.DateTimeFormat("en-CA", { timeZone: PHX_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const g = (t) => Number((dp.find((p) => p.type === t) || {}).value);
  return settleRevised(localTimeObjIn(PHX_TZ, g("year"), g("month"), g("day"), hh, mm), sched, PHX_TZ);
}
__name(phxClockObj, "phxClockObj");
function phxParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (Array.isArray(j.flights) ? j.flights : []);
  const isDep = dir === "dep";
  const twinKey = (r, num) => `${String(r.LineCode || "").trim().toUpperCase()}|${String(r.AD || "").trim().toUpperCase()}|${String(r.ScheduledTime || "").trim()}|${num}`;
  // Real (unsuffixed) flight numbers per side and minute — a "4044Z" whose
  // "4044" twin exists is the phantom.
  const real = new Set();
  for (const r of rows) {
    if (!r) continue;
    const n = String(r.Flightnumber || "").trim();
    if (/^\d+$/.test(n)) real.add(twinKey(r, n.replace(/^0+(?=\d)/, "")));
  }
  for (const r of rows) {
    if (!r) continue;
    if ((String(r.AD || "").trim().toUpperCase() === "D") !== isDep) continue;
    const code = String(r.LineCode || "").trim().toUpperCase()
      || ((String(r.LogoSmall || "").match(/\/([A-Z0-9]{2,3})_sml\.png/i) || [])[1] || "").toUpperCase();
    const nm = String(r.Flightnumber || "").trim().toUpperCase().match(/^(\d+)([A-Z])?$/);
    if (!code || !nm) continue;
    const num = nm[1].replace(/^0+(?=\d)/, "");
    if (nm[2] && real.has(twinKey(r, num))) continue;
    const dm = String(r.Destination || "").match(/^(.*?)\s*\(([A-Za-z0-9]{3})\)\s*$/);
    const otherIata = dm ? dm[2].toUpperCase() : null;
    if (otherIata === "PHX") continue;   // a phantom twin's PHX→PHX self-row
    const sched = localIsoObj(PHX_TZ, String(r.ScheduledTime || "").trim().replace(/[Zz]$/, ""));
    if (!sched) continue;
    const sc = String(r.StatusCode || "").trim().toUpperCase();
    let revised = phxClockObj(r.ChockTime, sched, nowMs)
      || phxClockObj(r.Estimated, sched, nowMs)
      || phxClockObj(r.Actual, sched, nowMs);
    if (revised && revised.ts === sched.ts) revised = null;
    const fl = authorityFlight({
      dir, number: `${code}${num}`,
      status: PHX_STATUS[sc] || yhzStatus(r.Status || ""),
      homeIata: "PHX", homeIcao: "KPHX", homeName: "Phoenix",
      gate: String(r.Gate || "").trim() || null,
      otherIata,
      otherName: (dm ? dm[1] : String(r.Destination || "")).trim() || null,
      airlineIata: code, airlineName: String(r.Airline || "").trim() || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const term = String(r.Terminal || "").trim();
    if (term) homeSide.terminal = term;
    const belt = String(r.BagClaim || "").trim();
    if (!isDep && belt) fl.arrival.baggageBelt = belt;
    out.push(fl);
  }
  return out;
}
__name(phxParseFeed, "phxParseFeed");

// ── YZF Yellowknife — flyyzf.ca Drupal Views page (+ GNWT mirror) ────
// The airport's own site renders both boards server-side into one page:
// <div id="arrivals-tab"> and <div id="departures-tab">, each holding a
// <table class="full-listing"> with 22 named columns straight out of the
// terminal FIDS (Host Airport Code … Registration Number). Only today's
// pending flights are listed (cancelled rows linger; landed/departed rows
// drop off), ~16 + ~15 rows. The French mirror aeroportyzf.ca is the same
// node. No JSON/XHR endpoint exists.
//
// Quirks pinned by the parser (verified live 2026-09-04 → 09-06):
//  • The bare URL is served from a STUCK Drupal page cache (x-drupal-cache:
//    HIT, last-modified two days old). Request Cache-Control headers do
//    not bypass it; only a novel query string forces a render, and that
//    same string is then a Fastly edge HIT for an hour. So the minute
//    bucket rides in the URL AND in the Worker cache key — one origin
//    render per minute at most, whatever the screen count.
//  • Times are Yellowknife wall clock (America/Yellowknife: -06:00 MDT,
//    -07:00 MST) with no offset. Scheduled is a full "September 6, 2026
//    05:40"; Expected is a bare "HH:MM" on the same calendar day, rolled
//    across midnight by settleRevised (sched 23:57, expected 00:34 → the
//    next day, a 37-minute delay — seen live). Flight Date (YYYYMMDD)
//    always matched the Scheduled date in every capture.
//  • "Actual Time" is NOT a movement time — it is the feed snapshot
//    stamp, identical on every row (and garbage, year 8390, on a
//    cancelled row). Ignored.
//  • Airline is a display name only and Flight lacks the carrier prefix:
//    Air Canada → AC, WestJet → WS, Canadian North → 5T, Air North → 4N.
//  • Statuses seen: On Time / Late / Cancelled. "Late" → delayed.
//  • Registration is sometimes printed without its hyphen ("CGIZG");
//    normalised to C-GIZG. Aircraft Type is an IATA code (DH4, 7M8, AT4,
//    CR9, 733, 73G, 73H…), which the boards' IATA_AIRCRAFT map names
//    directly. Baggage Carousel / Terminal / Route were always blank.
//
// The GNWT Department of Infrastructure mirrors the same feed at
// www.dot.gov.nt.ca/Airports — five plain columns (Airline, Flight,
// Originating From / Destination, Time, Status), Cache-Control: no-cache,
// but a THREE-DAY horizon and "Arrived" rows that persist after landing.
// It supplies what flyyzf.ca drops or never had: tomorrow's schedule,
// landed arrivals, and the whole board when flyyzf.ca is out. Its Time
// column is the EXPECTED time (for a future day that is the schedule);
// there is no gate, aircraft or registration on it.
const YZF_TZ = "America/Yellowknife";
// Northern carriers the shared name map doesn't know.
const YZF_AIRLINE_IATA = { "CANADIAN NORTH": "5T", "AIR NORTH": "4N", "AIR TINDI": "8T", "BUFFALO AIRWAYS": "J4" };
// City → IATA for the GNWT mirror (flyyzf.ca prints the code itself).
// Pairs marked with the feed's own Via Airport Code where seen.
const YZF_CITY_IATA = {
  "EDMONTON": "YEG", "CALGARY": "YYC", "VANCOUVER": "YVR", "TORONTO": "YYZ",
  "WHITEHORSE": "YXY", "OTTAWA": "YOW", "WINNIPEG": "YWG", "IQALUIT": "YFB",
  "INUVIK": "YEV", "INUVIK MIKE ZUBKO": "YEV", "NORMAN WELLS": "YVQ",
  "HAY RIVER": "YHY", "FORT SIMPSON": "YFS", "FORT SMITH": "YSM",
  "TALOYOAK": "YYH", "CAMBRIDGE BAY": "YCB", "KUGLUKTUK": "YCO",
  "GJOA HAVEN": "YHK", "ULUKHAKTOK": "YHI", "ULUKHAKTOK/HOLMAN": "YHI",
  "RANKIN INLET": "YRT", "KUGAARUK": "YBB", "RESOLUTE BAY": "YRB",
  "FORT GOOD HOPE": "YGH", "TUKTOYAKTUK": "YUB", "PAULATUK": "YPC",
  "SACHS HARBOUR": "YSY", "DELINE": "YWJ", "TULITA": "ZFN",
  "LUTSELK'E": "YSG", "WHATI": "YLE", "GAMETI": "YRA", "WEKWEETI": "YFJ",
  "FORT RESOLUTION": "YFR", "BAKER LAKE": "YBK", "ARVIAT": "YEK",
  "WHALE COVE": "YXN", "CORAL HARBOUR": "YZS", "NAUJAAT": "YUT",
  "IGLOOLIK": "YGT", "POND INLET": "YIO", "ARCTIC BAY": "YAB",
  "CHESTERFIELD INLET": "YCS", "SANIKILUAQ": "YSK", "HALL BEACH": "YUX",
  "FORT MCMURRAY": "YMM"
};
function yzfStatus(txt) {
  const s = String(txt || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("gate closed")) return "gateclosed";
  if (s.includes("final call") || s.includes("boarding")) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("arriv") || s.includes("land")) return "arrived";
  if (s.includes("late") || s.includes("delay")) return "delayed";
  return "scheduled";   // On Time / Early / anything novel
}
__name(yzfStatus, "yzfStatus");
function yzfAirlineCode(name) {
  const k = String(name || "").toUpperCase().replace(/\s+/g, " ").trim();
  return YZF_AIRLINE_IATA[k] || AIRLINE_NAME_IATA[k] || AIRLINE_NAME_IATA_SQUASHED[k.replace(/\s+/g, "")] || null;
}
__name(yzfAirlineCode, "yzfAirlineCode");
// "CGIZG" → "C-GIZG"; "C-FLJZ" stays. Anything else is passed through.
function yzfRegistration(s) {
  const r = String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!r) return null;
  const m = r.match(/^C([FGI][A-Z]{3})$/);
  return m ? `C-${m[1]}` : r;
}
__name(yzfRegistration, "yzfRegistration");
// The mirror names airports, not cities, for two stops: "Inuvik Mike
// Zubko" and "Ulukhaktok/Holman". flyyzf.ca's own Origin column says
// "Inuvik" / "Ulukhaktok", so that is the display name.
function yzfCityName(s) {
  return String(s || "").split("/")[0].replace(/\s+Mike Zubko$/i, "").replace(/\s+/g, " ").trim();
}
__name(yzfCityName, "yzfCityName");
// flyyzf.ca: one direction's <table class="full-listing">, columns mapped
// by header text (order-independent). `nowMs` is unused — every row is
// fully dated — and kept for the parser signature the tests share.
function parseYzfPage(html, dir, nowMs) {
  const out = [];
  const src = String(html || "");
  const i = src.indexOf(`id="${dir === "dep" ? "departures" : "arrivals"}-tab"`);
  if (i === -1) return out;
  const end = src.indexOf("</table>", i);
  const seg = src.slice(i, end === -1 ? undefined : end);
  const heads = [...seg.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => yhzCellText(m[1]).toLowerCase());
  const col = (...names) => { for (const n of names) { const k = heads.indexOf(n); if (k !== -1) return k; } return -1; };
  const c = {
    airline: col("airline"), num: col("flight"), ad: col("arrival or departure"),
    via: col("via airport code"), city: col("origin", "destination", "city"),
    belt: col("baggage carousel"), gate: col("gate"), term: col("terminal"),
    sched: col("scheduled"), exp: col("expected"), status: col("status"),
    type: col("aircraft type"), reg: col("registration number")
  };
  if (c.num === -1 || c.sched === -1) return out;
  const wantAD = dir === "dep" ? "D" : "A";
  for (const rm of seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    if (rm[1].indexOf("<th") !== -1) continue;
    const cells = authorityCellsText(rm[0]);
    if (cells.length < heads.length) continue;
    const g = (k) => (c[k] === -1 ? "" : String(cells[c[k]] || "").trim());
    if (g("ad") && g("ad").toUpperCase() !== wantAD) continue;
    const digits = g("num").replace(/\D+/g, "");
    const sm = g("sched").match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})$/);
    const mo = sm ? AUTH_MONTHS[sm[1].slice(0, 3).toUpperCase()] : null;
    if (!digits || !mo) continue;
    const y = Number(sm[3]), d = Number(sm[2]);
    const sched = localTimeObjIn(YZF_TZ, y, mo, d, Number(sm[4]), Number(sm[5]));
    // Expected mirrors Scheduled until something changes; a differing
    // value is the revision, settled to the near side of midnight.
    let revised = null;
    const em = g("exp").match(/^(\d{1,2}):(\d{2})$/);
    if (em) {
      revised = localTimeObjIn(YZF_TZ, y, mo, d, Number(em[1]), Number(em[2]));
      revised = revised.ts === sched.ts ? null : settleRevised(revised, sched, YZF_TZ);
    }
    const airline = g("airline");
    const code = yzfAirlineCode(airline);
    const city = yzfCityName(g("city"));
    const via = g("via").toUpperCase();
    const fl = authorityFlight({
      dir, number: (code || "") + digits, status: yzfStatus(g("status")),
      homeIata: "YZF", homeIcao: "CYZF", homeName: "Yellowknife",
      gate: g("gate") || null,
      otherIata: /^[A-Z]{3}$/.test(via) ? via : (YZF_CITY_IATA[city.toUpperCase()] || YHZ_CITY_IATA[city.toUpperCase()] || null),
      otherName: city || null,
      airlineIata: code, airlineName: airline || null,
      aircraftModel: g("type") || null,
      sched, revised
    });
    const home = dir === "dep" ? fl.departure : fl.arrival;
    if (g("term")) home.terminal = g("term");
    if (dir === "arr" && g("belt")) fl.arrival.baggageBelt = g("belt");
    const reg = yzfRegistration(g("reg"));
    if (reg) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = reg; }
    out.push(fl);
  }
  return out;
}
__name(parseYzfPage, "parseYzfPage");
// www.dot.gov.nt.ca/Airports: an <h2>Arrivals</h2> table then an
// <h2>Departures</h2> table, five cells a row, Time as "YYYY-MM-DD HH:MM"
// local (the expected time — there is no separate schedule).
function parseYzfDotPage(html, dir, nowMs) {
  const out = [];
  const src = String(html || "");
  const am = src.match(/<h2[^>]*>\s*Arrivals\s*<\/h2>/i), dm = src.match(/<h2[^>]*>\s*Departures\s*<\/h2>/i);
  if (!am || !dm || dm.index < am.index) return out;
  const seg = dir === "dep" ? src.slice(dm.index) : src.slice(am.index, dm.index);
  const tm = seg.match(/<table[^>]*>[\s\S]*?<\/table>/);
  if (!tm) return out;
  for (const rm of tm[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    if (rm[1].indexOf("<th") !== -1) continue;
    const cells = authorityCellsText(rm[0]);
    if (cells.length < 5) continue;
    const [airline, numRaw, cityRaw, timeRaw, statusRaw] = cells;
    const digits = String(numRaw || "").replace(/\D+/g, "");
    const sched = localIsoObj(YZF_TZ, String(timeRaw || "").trim());
    if (!digits || !sched) continue;
    const code = yzfAirlineCode(airline);
    const city = yzfCityName(cityRaw);
    const key = city.toUpperCase();
    out.push(authorityFlight({
      dir, number: (code || "") + digits, status: yzfStatus(statusRaw),
      homeIata: "YZF", homeIcao: "CYZF", homeName: "Yellowknife",
      otherIata: YZF_CITY_IATA[key] || YHZ_CITY_IATA[key] || null, otherName: city || null,
      airlineIata: code, airlineName: String(airline || "").trim() || null,
      sched, revised: null
    }));
  }
  return out;
}
__name(parseYzfDotPage, "parseYzfDotPage");
// flyyzf.ca rows win. A mirror row is added only when no flyyzf row of the
// same flight number sits within 12 h of it (by schedule or revision), so
// last night's late AC8026 and tonight's are both kept while today's
// pending flights aren't doubled. Mirror rows whose city the map doesn't
// know borrow the code flyyzf.ca printed for that city today.
function yzfMergeRows(primary, secondary) {
  const out = (primary || []).slice();
  const other = (f) => (f.departure.airport.iata === "YZF" ? f.arrival : f.departure);
  const home = (f) => (f.departure.airport.iata === "YZF" ? f.departure : f.arrival);
  const revTs = (f) => { const r = home(f).revisedTime; return r ? Date.parse(String(r.utc).replace(" ", "T")) : NaN; };
  const learned = {};
  for (const f of out) {
    const o = other(f).airport;
    if (o.iata && o.name) learned[o.name.toUpperCase()] = o.iata;
  }
  for (const s of (secondary || [])) {
    const dup = out.some((p) => p.number === s.number
      && (Math.abs(p._authTs - s._authTs) <= 432e5 || Math.abs(revTs(p) - s._authTs) <= 432e5));
    if (dup) continue;
    const o = other(s).airport;
    if (!o.iata && o.name) o.iata = learned[o.name.toUpperCase()] || null;
    out.push(s);
  }
  return out;
}
__name(yzfMergeRows, "yzfMergeRows");

// ── MIA Miami International — AirIT WebFIDS on webvids.miami-airport.com ──
// miami-airport.com's own flight-status page (flight_status.asp is a 404 —
// the board lives on the webvids subdomain) is the same 2010 AirIT WebFIDS
// frameset as Austin's, over https with no cookie, token or referer (verified
// 2026-09-06). Its 60-s refresh call (webfids?action=updateArrivals |
// updateDepartures) returns the AUS XML shape: offset-less local <stt>/<ett>/
// <att> in Eastern time (<timeInMillis> agrees with -04:00 on every row of
// the capture), <CXR>+<TRN> (TRN zero-padded: "LY 018"), the far end's IATA
// in <CTY>, terminal letter (D/E/F/G/H/J), a gate that already carries the
// letter ("D60"), claim in <bags> — numeric, "J1".."J5" in Terminal J, or
// "CD" on international arrivals whose bags come off inside the customs hall
// (passed through as MIA's own board prints it: a fabricated carousel would
// be worse), check-in counters in <CTR> ("602-609"), aircraft <TYP> in
// AirIT's own vocabulary and tail <REG>. Blank cells are literally "&#160;"
// and a missing time is "#" (ausXmlField / localIsoObj already give "" /
// null for those). Rolling window, ~220-260 rows / ~250-300 KB a direction:
// arrivals ~4 h back / ~12 h ahead plus stragglers still inbound (AA 904, a
// day late, keeps yesterday's <stt>), departures ~6 h back / ~12 h ahead.
// Quirks: through-flights (Emirates' DXB–MIA–BOG fifth-freedom rotation)
// are emitted once PER route city with identical <stt>, and — unlike AUS,
// where the home airport ends the route — <cities><so> lists the immediate
// far end FIRST in both directions (EK 213 in: so=[DUBAI, BOGOTA]; EK 213
// out: so=[BOGOTA, DUBAI]; EK 214 in: so=[BOGOTA, DUBAI]); the copy may
// even carry an empty <cities>. The AUS "last stop" rule would land EK 213
// arriving from Bogotá. A row whose <CTY> is MIA itself (UA 4195: a
// positioning/charter placeholder, terminal "NO", no gate) is dropped — a
// Miami board listing an arrival "from MIAMI" helps nobody. Statuses seen:
// "On Time", "Now h:mmA", "Arrived h:mmA", "Departed h:mmA", "Cancelled"
// (<RMK> XLD); the status clock is the gate time the board shows, <att> is
// the runway clock and <ett> can be stale once a flight is in, so the status
// clock wins for revisedTime as at AUS — except that <ett> carries a DATE
// the status clock lacks, so when the two agree to the minute <ett> is used
// as-is (AA 904: stt 09-05 05:50, "Now 5:45A", ett 09-06 05:45 — a
// 24-hour delay, not five minutes early).
//
// AirIT's <TYP> vocabulary → the IATA type codes the board's formatAircraft
// labels (a trailing W is winglets). Left alone, "7378W" — American's
// 737-800, the most common type at MIA — matches the board's bare-737
// family key and prints "Boeing 737 MAX 8"; "B38M" and friends echo raw.
// Unknown codes pass through untouched.
const MIA_AIRCRAFT_IATA = {
  "7378W": "73H", B7378: "738", "7379W": "739", "7377W": "73W", B7374: "734",
  B38M: "7M8", B39M: "7M9", B777: "777", "7773E": "77W", B7878: "788", B7879: "789",
  "7572W": "752", "7673W": "763", A319W: "319", A320W: "320", A321W: "321",
  A21N: "32Q", A20N: "32N", A3302: "332", A3303: "333", A3309: "339", MD83: "M83"
};
function miaParseFeed(xmlText, dir, nowMs) {
  const TZ = "America/New_York";
  const out = [];
  const seen = new Map();   // "EK213|stt" → index into out, for the through-flight collapse
  const isDep = dir === "dep";
  const chunks = String(xmlText || "").match(/<flight>[\s\S]*?<\/flight>/g) || [];
  for (const c of chunks) {
    const g = (t) => ausXmlField(c, t);
    const d = g("DIR").toUpperCase() || (/^dep/i.test(g("direction")) ? "D" : "A");
    if ((d === "D") !== isDep) continue;
    const code = g("CXR").toUpperCase();
    const trn = g("TRN").replace(/^0+(?=\d)/, "");
    const stt = g("stt");
    let sched = localIsoObj(TZ, stt);
    if (!sched) { const ms = Number(g("timeInMillis")); if (ms > 0) sched = localTimeObjFromTs(TZ, ms); }
    if (!code || !trn || !sched) continue;
    const otherIata = g("CTY").toUpperCase();
    if (otherIata === "MIA") continue;   // placeholder row "from MIAMI" (see header)
    const number = `${code}${trn}`;
    const key = `${number}|${sched.ts}`;
    const stops = [...c.matchAll(/<so>([^<]*)<\/so>/g)].map((m) => ausXmlField(m[0], "so"));
    const city = g("city");
    // Through-flight copy: the row whose city is the FIRST route stop names
    // the immediate far end (see header); keep that one's city, drop the rest.
    if (seen.has(key)) {
      if (stops[0] && city === stops[0]) {
        const prev = out[seen.get(key)];
        const side = isDep ? prev.arrival : prev.departure;
        side.airport.iata = otherIata || side.airport.iata;
        side.airport.name = city || side.airport.name;
      }
      continue;
    }
    const statusTxt = g("status");
    const est = localIsoObj(TZ, g("ett"));   // dated; "#" → null
    let revised = null;
    const sm = statusTxt.match(/(\d{1,2}):(\d{2})\s*([AP])/i);
    if (sm) {
      let hh = Number(sm[1]) % 12; if (/p/i.test(sm[3])) hh += 12;
      const wall = `${String(hh).padStart(2, "0")}:${sm[2]}`;
      if (est && est.local.slice(11, 16) === wall) {
        revised = est;   // same instant, with the feed's own date on it
      } else {
        const dm = sched.local.match(/^(\d{4})-(\d{2})-(\d{2})/);
        revised = settleRevised(localTimeObjIn(TZ, Number(dm[1]), Number(dm[2]), Number(dm[3]), hh, Number(sm[2])), sched, TZ);
      }
    }
    if (!revised && est) revised = est;
    if (revised && revised.ts === sched.ts) revised = null;
    const typ = g("TYP").toUpperCase();
    const fl = authorityFlight({
      dir, number,
      status: yhzStatus(statusTxt),   // "Now H:MM" → scheduled + revisedTime, like AUS/YVR/DUB
      homeIata: "MIA", homeIcao: "KMIA", homeName: "Miami",
      gate: g("gate") || null,
      otherIata: otherIata || null,
      otherName: city || null,
      airlineIata: code, airlineName: g("airlineName") || null,
      aircraftModel: (MIA_AIRCRAFT_IATA[typ] || typ) || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const term = g("terminal").toUpperCase();
    if (term && term !== "NO") homeSide.terminal = term;
    const bags = g("bags");
    if (!isDep && bags) fl.arrival.baggageBelt = bags;
    const ctr = g("CTR");
    if (isDep && ctr) fl.departure.checkInDesk = ctr;
    const reg = g("REG");
    if (reg) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = reg; }
    seen.set(key, out.length);
    out.push(fl);
  }
  return out;
}
__name(miaParseFeed, "miaParseFeed");

// ── ZRH Zürich — flightdata.flughafen-zuerich.ch (2026-09-06) ────────
// Zero-auth JSON behind the airport's own arrivals/departures pages: a
// flat array of both directions for one local (SDT) day per ?date=
// request (~750 KB; yesterday..today+4 are valid, anything else is a
// 400). The dateless /flights is the whole five-day set at 3.4 MB and
// is never fetched. Every clock is ISO-8601 UTC with a Z (STD/ETD/ATD,
// STA/ETA/ATA; actuals carry seconds) — converted to Europe/Zurich wall
// clock here. ~11% of rows are GA/bizjet/ferry/cargo movements
// (isCommercial=false, most under the placeholder carrier XXC) that a
// passenger board must not show. FLC is IATA except easyJet's three
// operators, which arrive ICAO-form (EZY/EZS/EJU); the boards key logos
// on U2. statusTextEn code 90 embeds a clock ("Gate Info at 19:10")
// that is when the gate will be announced — NOT a revised time; only
// ETD/ETA (or the actual) revise. The feed's `model` string is
// unreliable (a B763 reads "B757-200"), so the IATA sub-type TYS is the
// aircraft label — the board's formatAircraft() knows every code seen.
const ZRH_ICAO_IATA = { EZY: "U2", EZS: "U2", EJU: "U2" };
// The only commercial carrier seen without an `airline` name.
const ZRH_AIRLINE_NAMES = { KM: "KM Malta Airlines" };
// statusCode vocabulary seen live across two days; 200 "Rolling" is
// off-blocks on a departure and the landing roll on an arrival, so it
// splits by direction in zrhStatus. Unknown codes fall back to the text.
const ZRH_STATUS = {
  2: "gateclosed", 3: "boarding", 4: "departed", 7: "arrived", 8: "cancelled",
  13: "boarding", 18: "delayed", 57: "scheduled", 90: "scheduled",
  201: "active", 202: "active"
};
function zrhStatus(code, text, dir) {
  const c = Number(code);
  if (c === 200) return dir === "dep" ? "departed" : "arrived";
  if (ZRH_STATUS[c]) return ZRH_STATUS[c];
  const s = String(text || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("board")) return "boarding";
  if (s.includes("closed")) return "gateclosed";
  if (s.includes("route") || s.includes("approach") || s.includes("airborne")) return "active";
  return yhzStatus(s);
}
__name(zrhStatus, "zrhStatus");
// UTC-Z instant → epoch ms floored to the minute (ATA/ATD carry seconds;
// the board shows HH:MM, and an on-block 05:50:12 against a 05:50
// schedule is on time, not a revision).
function zrhTs(s) {
  if (!s) return NaN;
  const t = Date.parse(String(s));
  return isNaN(t) ? NaN : Math.floor(t / 6e4) * 6e4;
}
__name(zrhTs, "zrhTs");
// Which ?date= files cover the board's window (now-2h .. now+22h) at
// this Zürich wall-clock moment. Today always. Yesterday for the first
// two hours, so a 23:30 lander still trails on the arrivals board.
// Tomorrow from 06:00, when the 22 h reach starts to touch the next
// morning's first wave (05:45 is the earliest movement seen).
function zrhFeedDays(nowMs) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date(nowMs));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  const today = `${g("year")}-${g("month")}-${g("day")}`;
  const hour = Number(g("hour")) % 24;
  const plus = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const days = [];
  if (hour < 2) days.push(plus(today, -1));
  days.push(today);
  if (hour >= 6) days.push(plus(today, 1));
  return days;
}
__name(zrhFeedDays, "zrhFeedDays");
// One day-file → ADB-native flights for one direction. Pure; exported
// for the node tests. Operator rows only (the feed's codeShare string
// is the marketing list, never a row of its own).
function zrhParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = Array.isArray(j) ? j : (j && Array.isArray(j.flights) ? j.flights : []);
  const isDep = dir === "dep";
  for (const r of rows) {
    if (!r || String(r.flightType || "").toUpperCase() !== (isDep ? "D" : "A")) continue;
    // GA / bizjets / ferry legs / cargo: isCommercial=false (XXC is the
    // placeholder carrier for most of them; statusCode 10 is "Cargo").
    if (r.isCommercial !== true) continue;
    const flc = String(r.FLC || "").toUpperCase().trim();
    if (!flc || flc === "XXC" || Number(r.statusCode) === 10) continue;
    const flnRaw = String(r.FLN == null ? "" : r.FLN).trim();
    const fln = flnRaw.replace(/^0+(?=\d)/, "");   // "076" → "76", as the boards print it
    if (!fln) continue;
    const ts = zrhTs(isDep ? r.STD : r.STA);
    if (isNaN(ts)) continue;
    const sched = localTimeObjFromTs("Europe/Zurich", ts);
    // The actual (off-block / on-block) outranks the estimate; either
    // only counts as a revision when it lands on a different minute.
    const ets = zrhTs(isDep ? (r.ATD || r.ETD) : (r.ATA || r.ETA));
    const revised = (!isNaN(ets) && ets !== ts) ? localTimeObjFromTs("Europe/Zurich", ets) : null;
    const iata = ZRH_ICAO_IATA[flc] || flc;
    const other = String((isDep ? r.PDS : r.POR) || "").toUpperCase().trim();
    const fl = authorityFlight({
      dir, number: `${iata}${fln}`,
      // easyJet rows come ICAO-form (EZS1220): that string IS the callsign.
      callSign: flc.length === 3 ? `${flc}${flnRaw}` : null,
      status: zrhStatus(r.statusCode, r.statusTextEn, dir),
      homeIata: "ZRH", homeIcao: "LSZH", homeName: "Zürich",
      gate: isDep ? ((r.GAT == null ? "" : String(r.GAT)).trim() || null) : null,
      // IATA when the feed has one; a 4-letter ICAO (GA airfields) goes
      // on the far side's icao slot below.
      otherIata: /^[A-Z0-9]{3}$/.test(other) ? other : null,
      otherName: String(r.cityEn || r.airportName || "").trim() || null,
      airlineIata: iata,
      airlineName: String(r.airline || "").trim() || ZRH_AIRLINE_NAMES[iata] || null,
      aircraftModel: String(r.TYS || r.ICT || r.model || "").trim() || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const farSide = isDep ? fl.arrival : fl.departure;
    if (/^[A-Z0-9]{4}$/.test(other)) farSide.airport.icao = other;
    // Arrivals carry the terminal (TER 1|2); departures carry the
    // check-in area instead (CAM 1|2|3), which is what Zürich signs.
    const term = isDep ? r.CAM : r.TER;
    if (term != null && String(term).trim()) homeSide.terminal = String(term).trim();
    // RTK is the baggage "race track" (belt 12–32), posted with the
    // landing; BDC is a minutes-to-bags countdown, not a belt.
    if (!isDep && r.RTK != null && String(r.RTK).trim()) fl.arrival.baggageBelt = String(r.RTK).trim();
    if (r.REG) { fl.aircraft = fl.aircraft || {}; fl.aircraft.reg = String(r.REG).trim(); }
    out.push(fl);
  }
  return out;
}
__name(zrhParseFeed, "zrhParseFeed");

// ── IAH Houston Intercontinental (2026-09-06) ────────────────────────
// Houston Airport System's own API (api.houstonairports.mobi) — the
// LAS/CLT/MCO vendor once more: epoch-second timestamps, operator flight
// numbers with the code baked in, IATA airport codes only (no names, no
// aircraft), gate, terminal letter, baggageBelt[]. The Api-Key is the
// public one in fly2houston.com's Next.js bundle (chunk
// 6836-a7bea09f5c4d8549.js); Api-Version 101 is mandatory (a 500
// without it). The same host serves Hobby (baseAirport=HOU), so the
// parser takes the home code and only keeps that airport's rows.
//
// Terminal: departures carry the check-in terminal (A/C/D/E); arrivals
// carry null throughout, and the gate's letter IS the terminal at IAH
// (A–E gates sit in Terminals A–E, the PHL convention) — used only when
// the feed gave nothing. Hobby's gates are plain numbers, so nothing is
// derived there.
const IAH_FEED_KEY = "9ACB3B733BE94B11A03B6E84CA87E895";
// The vendor's normalised `status` is Scheduled | Boarding | Departed |
// Landed | Canceled; `originalStatus` is the airline's own text (ON TIME,
// "Now 5:18a", "BRD @ 830PM", DELAYED, InGate). isDelayed is the
// vendor's verdict; an airline DELAYED with isDelayed=false (LH441 on
// 2026-09-05) still reads as delayed here. "Now h:mma" is an estimate,
// not a delay: scheduled + revised, the AUS/YVR convention. A Departed
// arrival is en route (the boards render it that way); a Landed
// departure has reached the far end, "arrived" as ADB itself says.
function iahStatus(r) {
  const s = String(r.status || "").toLowerCase();
  const o = String(r.originalStatus || "").toLowerCase();
  if (s.includes("cancel") || o.includes("cancel")) return "cancelled";
  if (s.includes("divert") || o.includes("divert")) return "diverted";
  if (s.includes("board") || /\bbrd\b|board|final call/.test(o)) return "boarding";
  if (s.includes("depart")) return "departed";
  if (s.includes("land") || s.includes("arriv")) return "arrived";
  if (r.isDelayed === true || o.includes("delay")) return "delayed";
  return "scheduled";
}
__name(iahStatus, "iahStatus");
// jsonText → ADB-native flights for one direction. `home` defaults to
// IAH; pass "HOU" to read Hobby out of the same payload. Southwest's
// multi-stop rows at Hobby come once per route city with the same
// number and timestamp (a bare "Scheduled" placeholder beside the real
// row, different `id`), so rows are collapsed on number|scheduled,
// keeping whichever carries a gate or a live status.
function parseIahFeed(jsonText, dir, nowMs, home) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const rows = ((j && j.data) || {}).flights;
  if (!Array.isArray(rows)) return out;
  const isDep = dir === "dep";
  const tz = "America/Chicago";
  const homeIata = String(home || "IAH").toUpperCase();
  const seen = new Map();   // "number|scheduledTimestamp" → [index in out, richness]
  for (const r of rows) {
    if (!r || r.isVisible === false || r.isDeleted === true) continue;
    if (r.baseAirport && String(r.baseAirport).toUpperCase() !== homeIata) continue;
    if (r.arrival !== true && r.arrival !== false) continue;
    if (r.arrival === isDep) continue;
    if (r.iataCodeShareAirline && r.iataOperatingAirline && r.iataCodeShareAirline !== r.iataOperatingAirline) continue;   // operator rows only
    const num = (r.operatingAirlineFlightNumber || "").toString().trim().toUpperCase();
    if (!num || typeof r.scheduledTimestamp !== "number") continue;
    const sched = localTimeObjFromTs(tz, r.scheduledTimestamp * 1000);
    // estimated/actual mirror scheduled (or sit null) until something
    // changes; bestKnown is always set and is the one the site shows.
    const bt = r.bestKnownTimestamp;
    const revised = (typeof bt === "number" && bt !== r.scheduledTimestamp) ? localTimeObjFromTs(tz, bt * 1000) : null;
    const gate = (r.gate || "").toString().trim() || null;
    const belt = Array.isArray(r.baggageBelt) && r.baggageBelt.length ? r.baggageBelt.join(", ") : null;
    const fl = authorityFlight({
      dir, number: num,
      callSign: (r.icaoOperatingAirlineFlightNumber || "").toString().trim().toUpperCase() || null,
      status: iahStatus(r),
      homeIata, homeIcao: homeIata === "HOU" ? "KHOU" : "KIAH", homeName: homeIata === "HOU" ? "Houston Hobby" : "Houston",
      gate,
      otherIata: ((isDep ? r.arrivalAirport : r.departureAirport) || "").toString().toUpperCase() || null,
      otherName: null,
      airlineIata: (r.iataOperatingAirline || "").toString().toUpperCase() || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const term = (r.terminal || "").toString().trim().replace(/^T/i, "").toUpperCase()
      || (((gate || "").match(/^([A-E])\d/i) || [])[1] || "").toUpperCase() || null;
    if (term) homeSide.terminal = term;
    if (!isDep && belt) fl.arrival.baggageBelt = belt;
    const rich = (gate ? 2 : 0) + (String(r.originalStatus || "").toLowerCase() !== "scheduled" ? 1 : 0);
    const k = `${num}|${r.scheduledTimestamp}`;
    const prev = seen.get(k);
    if (prev) { if (rich > prev[1]) { out[prev[0]] = fl; prev[1] = rich; } continue; }
    seen.set(k, [out.length, rich]);
    out.push(fl);
  }
  return out;
}
__name(parseIahFeed, "parseIahFeed");

// MCO Orlando — GOAA's api.goaa.aero in its v200 shape (the LAS/CLT
// vendor family): epoch-second scheduledTimestamp plus ONE
// lastKnownTimestamp that is the estimate or the actual, operator flight
// numbers with the code baked in (mainFlightNumber "DL1735", the ICAO
// callsign in icaoMainFlightNumber "DAL1735"), IATA origin/destination,
// two-letter status codes, gate, and a belt on arrivals. No terminal
// field and every airline/city name field is an empty string — the
// airport's own site fills those from a static table, mirrored below.
// Multi-stop flights come back once PER ROUTE STEP (same number, same
// MCO time, identical gate/belt/status/times; routeStep 0,1,2 with the
// step's airport in stepAirport), so rows are grouped by number +
// scheduled time: the routeStep 0 row is the movement and the step chain
// rides along as the board's _stops / via label. Status codes are the
// vendor's enum (the site's chunk 37675): AR Arrived, LD Landed, DP
// Departed, CX Canceled, DL Delayed, DV Diverted, BD Boarding, LC Last
// Call, NT New Time, ON On Time (the default for every future flight).
const MCO_AUTH_STATUS = {
  AR: "arrived", LD: "arrived", DP: "departed", CX: "cancelled", DL: "delayed",
  DV: "diverted", BD: "boarding", LC: "boarding", ON: "scheduled"
};
// flymco.com's own airline table (the flightsEnrichmentData block in its
// page payload, read 2026-09-06): display name and the terminal the
// carrier checks in at. TAP lists no terminal.
const MCO_AIRLINES = {
  WN: ["Southwest", "A"], F9: ["Frontier", "A"], XP: ["Avelo Airlines", "A"], TS: ["Air Transat", "A"],
  DL: ["Delta", "B"], AA: ["American", "B"], UA: ["United", "B"], AS: ["Alaska", "B"], G4: ["Allegiant", "B"],
  MX: ["Breeze", "B"], SY: ["Sun Country", "B"], AC: ["Air Canada", "B"], RV: ["Air Canada Rouge", "B"],
  WS: ["WestJet", "B"], F8: ["Flair Airlines", "B"], LA: ["LATAM", "B"], JJ: ["LATAM Airlines Brasil", "B"],
  "4C": ["LATAM Airlines Colombia", "B"], Y4: ["Volaris", "B"], Q6: ["Volaris Costa Rica", "B"], VB: ["Viva", "B"],
  UP: ["Bahamasair", "B"], "2T": ["BermudAir", "B"],
  B6: ["JetBlue", "C"], BA: ["British Airways", "C"], VS: ["Virgin Atlantic", "C"], EI: ["Aer Lingus", "C"],
  AF: ["Air France", "C"], IB: ["Iberia", "C"], FI: ["Icelandair", "C"], EK: ["Emirates", "C"], PD: ["Porter", "C"],
  AM: ["Aeromexico", "C"], CM: ["Copa Airlines", "C"], AV: ["Avianca", "C"], AD: ["Azul", "C"], G3: ["GOL", "C"],
  BW: ["Caribbean", "C"], "4Y": ["Discover Airlines", "C"], Z0: ["Norse Atlantic UK", "C"], ZG: ["Zipair", "C"],
  TP: ["TAP Air Portugal", null]
};
// The terminal letter the feed doesn't carry. A C-prefixed gate or belt
// is Terminal C (its own building). Arrivals: MCO numbers its belts by
// building — 1–16 Terminal A, 20–32 Terminal B — and 481/481 belts in
// the capture agree with the carrier's published terminal. Departures:
// the numeric airsides (gates 1–129) are reached from BOTH A and B, so a
// gate alone can't say where check-in is; the airport's airline table
// can (Frontier and Breeze share gates 1–29 from opposite terminals).
function mcoAuthTerminal(isDep, gate, belt, airlineIata) {
  const g = String(gate || "").toUpperCase(), b = String(belt || "").toUpperCase();
  if (/^C\d/.test(g) || /^C\d/.test(b)) return "C";
  if (!isDep && /^\d+$/.test(b)) return Number(b) < 20 ? "A" : "B";
  const al = MCO_AIRLINES[String(airlineIata || "").toUpperCase()];
  return (al && al[1]) || null;
}
__name(mcoAuthTerminal, "mcoAuthTerminal");
function mcoParseFeed(jsonText, dir, nowMs) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const isDep = dir === "dep";
  const groups = new Map();   // "DL1735|1788659040" → its route-step rows, first-seen order
  for (const r of (((j && j.data) || {}).flights) || []) {
    if (!r || typeof r !== "object") continue;
    const isArr = r.arrival === true;
    if ((dir === "arr") !== isArr) continue;
    const num = String(r.mainFlightNumber || r.iataMainFlightNumber || "").replace(/\s+/g, "").toUpperCase();
    if (!num || typeof r.scheduledTimestamp !== "number") continue;
    const k = `${num}|${r.scheduledTimestamp}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => (Number(a.routeStep) || 0) - (Number(b.routeStep) || 0));
    const r = rows[0];
    const num = String(r.mainFlightNumber || r.iataMainFlightNumber || "").replace(/\s+/g, "").toUpperCase();
    const sched = localTimeObjFromTs("America/New_York", r.scheduledTimestamp * 1000);
    const lk = r.lastKnownTimestamp;
    const revised = (typeof lk === "number" && lk !== r.scheduledTimestamp)
      ? localTimeObjFromTs("America/New_York", lk * 1000) : null;
    const code = String(r.status || "").toUpperCase().trim();
    let status = MCO_AUTH_STATUS[code] || "scheduled";   // unknown codes (an "OG" was seen once) → scheduled + revised time
    if (code === "NT" && revised && revised.ts > sched.ts) status = "delayed";   // "New Time": later is a delay, earlier just a revision
    const airline = String(r.iataMainPrefix || "").toUpperCase().trim() || (num.match(/^[A-Z0-9]{2}/) || [])[0] || null;
    const al = airline ? MCO_AIRLINES[airline] : null;
    const gate = String(r.gate || "").trim() || null;
    const belt = isDep ? null : (String(r.baggageBelt || "").trim() || null);
    const fl = authorityFlight({
      dir, number: num, status,
      callSign: String(r.icaoMainFlightNumber || "").toUpperCase().trim() || null,
      homeIata: "MCO", homeIcao: "KMCO", homeName: "Orlando",
      gate,
      otherIata: String((isDep ? r.destinationAirport : r.originAirport) || "").toUpperCase().trim() || null,
      otherName: null,
      airlineIata: airline, airlineName: (al && al[0]) || null,
      sched, revised
    });
    const homeSide = isDep ? fl.departure : fl.arrival;
    const term = mcoAuthTerminal(isDep, gate, belt, airline);
    if (term) homeSide.terminal = term;
    if (belt) fl.arrival.baggageBelt = belt;
    // Multi-stop: the step airports in the vendor's order — for departures
    // that is route order with the final destination last (verified on
    // every group); for arrivals the vendor's origin comes first and the
    // remaining steps follow as filed by the carrier.
    if (rows.length > 1) {
      const stops = rows.map((x) => String(x.stepAirport || "").toUpperCase().trim()).filter(Boolean);
      if (stops.length > 1) {
        fl._stops = stops.map((c) => ({ iata: c, city: "" }));
        const via = isDep ? stops.slice(0, -1) : stops.slice(1);
        if (via.length) fl._mcoViaStop = via.join(", ");
      }
    }
    out.push(fl);
  }
  return out;
}
__name(mcoParseFeed, "mcoParseFeed");

// ── JFK New York Kennedy — PANYNJ GraphQL (www.jfkairport.com/api/graphql)
// The site's Next.js client POSTs {operationName, variables, query} as an
// lz-string compressToEncodedURIComponent() string with content-type
// text/plain (bundle module 46660 → module 511 = lz-string 1.5); a plain
// JSON body is a 400, and the edge wants a same-site Referer or it serves
// a branded "500 Error" page with a 403. No key, no cookie. The same host
// answers for LGA/EWR/SWF via the airport variable (verified byte-identical
// to each airport's own host), so the fetch is parameterised by IATA.
//
// Minimal lz-string port (MIT, pieroxy) — only the compress side, only the
// URI-safe alphabet, so the Worker carries no npm dependency.
const JFK_LZ_URI = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
function jfkLzCompressUri(input) {
  if (input == null) return "";
  const s = String(input);
  const dict = new Map(), toCreate = new Set();
  let w = "", enlargeIn = 2, dictSize = 3, numBits = 2, val = 0, pos = 0;
  const out = [];
  const bit = (b) => {
    val = (val << 1) | b;
    if (pos === 5) { out.push(JFK_LZ_URI.charAt(val)); val = 0; pos = 0; } else pos++;
  };
  const lsb = (value, n) => { for (let i = 0; i < n; i++) { bit(value & 1); value >>= 1; } };
  const grow = () => { if (--enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; } };
  const emitW = () => {
    if (toCreate.has(w)) {
      const code = w.charCodeAt(0);
      if (code < 256) { lsb(0, numBits); lsb(code, 8); } else { lsb(1, numBits); lsb(code, 16); }
      grow();
      toCreate.delete(w);
    } else {
      lsb(dict.get(w), numBits);
    }
    grow();
  };
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (!dict.has(c)) { dict.set(c, dictSize++); toCreate.add(c); }
    const wc = w + c;
    if (dict.has(wc)) { w = wc; } else { emitW(); dict.set(wc, dictSize++); w = c; }
  }
  if (w !== "") emitW();
  lsb(2, numBits);
  for (;;) { val <<= 1; if (pos === 5) { out.push(JFK_LZ_URI.charAt(val)); break; } pos++; }
  return out.join("");
}
__name(jfkLzCompressUri, "jfkLzCompressUri");
// Query text verbatim from the site bundle (_app-*.js), newlines included.
const JFK_GQL_DEP = "query GetDepartingFlights(\n  $departureAirport: String!\n  $departureDateTime: String!\n  $destinationAirport: String\n  $carrierCode: String\n  $limit: Int\n  $after: String\n) {\n  getDepartingFlights(\n    departureAirport: $departureAirport\n    departureDateTime: $departureDateTime\n    destinationAirport: $destinationAirport\n    carrierCode: $carrierCode\n    limit: $limit\n    after: $after\n  ) {\n    data {\n      dateScheduled\n      timeScheduled\n      dateRevised\n      timeRevised\n      destinationName\n      destinationAirportCode\n      airlineCode\n      airlineName\n      flightNumber\n      terminal\n      gate\n      status\n    }\n    paging {\n      next\n    }\n  }\n}\n";
const JFK_GQL_ARR = "query GetArrivingFlights(\n  $arrivalAirport: String!\n  $arrivalDateTime: String!\n  $originAirport: String\n  $carrierCode: String\n  $limit: Int\n  $after: String\n) {\n  getArrivingFlights(\n    arrivalAirport: $arrivalAirport\n    arrivalDateTime: $arrivalDateTime\n    originAirport: $originAirport\n    carrierCode: $carrierCode\n    limit: $limit\n    after: $after\n  ) {\n    data {\n      dateScheduled\n      timeScheduled\n      dateRevised\n      timeRevised\n      originName\n      originAirportCode\n      airlineCode\n      airlineName\n      flightNumber\n      terminal\n      gate\n      status\n      isInternationalFlight\n    }\n    paging {\n      next\n    }\n  }\n}\n";
// Site vocabulary (bundle enum: Scheduled / Delayed / Departed / In Flight /
// Landed / Arrived / Cancelled; the list API says "On Time" and "En Route").
const JFK_STATUS = {
  "ON TIME": "scheduled", SCHEDULED: "scheduled", DELAYED: "delayed", DEPARTED: "departed",
  "IN FLIGHT": "active", "EN ROUTE": "active", LANDED: "arrived", ARRIVED: "arrived",
  CANCELLED: "cancelled", CANCELED: "cancelled", DIVERTED: "diverted"
};
// Every marketing carrier is its own row (TK12 IST is also TG9183, AV6634,
// PK5012, HY7292, B66903, 6E4016 — same minute, terminal and gate) and no
// row says who operates. Rank within a group: a sub-1000 flight number is
// the operator (2599+2868 rows on 2026-09-06: never two of them in one
// group); else a JFK hub carrier inside its own numbering (Delta
// Connection runs to 58xx while DL's codeshares on Virgin start at 5922;
// AA's regionals stop below 6000, its codeshares start 6881; JetBlue's own
// numbers stop below 3000, its codeshares on Qatar start 5552); else the
// lowest number, with a hub carrier's codeshare-range numbers last.
const JFK_HUB_OWN_MAX = { DL: 5900, AA: 6000, B6: 3000 };
function jfkRowRank(code, num) {
  if (num < 1000) return 0;
  const cap = JFK_HUB_OWN_MAX[code];
  if (cap == null) return 2;
  return num < cap ? 1 : 3;
}
__name(jfkRowRank, "jfkRowRank");
// "2026-09-06" + "12:15 AM" → time object in the airport's zone.
function jfkTimeObj(tz, dateStr, timeStr) {
  const dm = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const tm = String(timeStr || "").match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (!dm || !tm) return null;
  let hh = Number(tm[1]) % 12;
  if (/pm/i.test(tm[3])) hh += 12;
  return localTimeObjIn(tz, Number(dm[1]), Number(dm[2]), Number(dm[3]), hh, Number(tm[2]));
}
__name(jfkTimeObj, "jfkTimeObj");
// One parser for the PANYNJ family; `home` names the airport the rows
// belong to (JFK today; LGA/EWR/SWF are the same shape).
function parseJfkFeed(jsonText, dir, nowMs, home) {
  const out = [];
  let j; try { j = JSON.parse(jsonText); } catch (e) { return out; }
  const isDep = dir === "dep";
  const node = j && j.data && (isDep ? j.data.getDepartingFlights : j.data.getArrivingFlights);
  const rows = node && Array.isArray(node.data) ? node.data : [];
  const h = home || { iata: "JFK", icao: "KJFK", name: "New York", tz: "America/New_York" };
  const tz = h.tz || "America/New_York";
  // Group the expanded codeshare rows: same scheduled minute, other
  // airport and terminal. Gate is NOT in the key — a partner row can carry
  // a null gate while the operator's is assigned (AF5654 on DL5795 to PIT).
  const groups = new Map();
  for (const r of rows) {
    if (!r) continue;
    const code = (r.airlineCode || "").toString().trim().toUpperCase();
    const num = Number(r.flightNumber);
    const other = ((isDep ? r.destinationAirportCode : r.originAirportCode) || "").toString().trim().toUpperCase();
    if (!code || !Number.isFinite(num) || !r.dateScheduled || !r.timeScheduled) continue;
    const term = (r.terminal == null ? "" : String(r.terminal)).trim();
    const key = `${r.dateScheduled}|${r.timeScheduled}|${other}|${term}`;
    const rank = jfkRowRank(code, num);
    const g = groups.get(key);
    if (!g) { groups.set(key, { best: r, code, num, rank, gate: r.gate }); continue; }
    if (!g.gate && r.gate) g.gate = r.gate;
    if (rank < g.rank || (rank === g.rank && num < g.num)) { g.best = r; g.code = code; g.num = num; g.rank = rank; }
  }
  for (const g of groups.values()) {
    const r = g.best;
    const sched = jfkTimeObj(tz, r.dateScheduled, r.timeScheduled);
    if (!sched) continue;
    let revised = null;
    if (r.timeRevised) {
      let rv = jfkTimeObj(tz, r.dateRevised || r.dateScheduled, r.timeRevised);
      if (rv && !r.dateRevised) rv = settleRevised(rv, sched, tz);
      if (rv && rv.ts !== sched.ts) revised = rv;
    }
    const other = ((isDep ? r.destinationAirportCode : r.originAirportCode) || "").toString().trim().toUpperCase() || null;
    // "Athens, Greece (ATH)" / " Rome, Italy (FCO)" — drop the code echo.
    let otherName = ((isDep ? r.destinationName : r.originName) || "").toString().trim();
    if (other) otherName = otherName.replace(new RegExp("\\s*\\(" + other + "\\)\\s*$"), "").trim();
    // "T4" / "T 4" turn up in the gate column on unassigned rows: not a gate.
    let gate = (g.gate == null ? "" : String(g.gate)).trim();
    if (/^T\s*\d+$/i.test(gate)) gate = "";
    const term = (r.terminal == null ? "" : String(r.terminal)).trim();
    const fl = authorityFlight({
      dir, number: `${g.code}${g.num}`,
      status: JFK_STATUS[String(r.status || "").trim().toUpperCase()] || yhzStatus(r.status || ""),
      homeIata: h.iata, homeIcao: h.icao, homeName: h.name,
      gate: gate || null,
      otherIata: other, otherName: otherName || null,
      airlineIata: g.code, airlineName: (r.airlineName || "").toString().trim() || null,
      sched, revised
    });
    if (term && term !== "0") (isDep ? fl.departure : fl.arrival).terminal = term;
    out.push(fl);
  }
  out.sort((a, b) => a._authTs - b._authTs);   // arrivals arrive unsorted
  return out;
}
__name(parseJfkFeed, "parseJfkFeed");
// The boards ask -2 h → +22 h; one range query anchored on the local hour
// ([H-3h, H+23h], 26 h) covers that with a cache key that only rolls once
// an hour. A JFK day is ~2600 expanded rows / ~720 KB per direction, so
// this is ~800 KB per direction per TTL — the price of not paging (cursors
// are 50-140 KB lz strings). A range that crosses midnight is fine (rows
// carry their own dates).
function jfkRangeStrings(tz, nowMs) {
  const local = localTimeObjFromTs(tz, nowMs).local;             // "YYYY-MM-DD HH:MM:00±hh:mm"
  const hourTs = windowTsIn(tz, local.slice(0, 10) + "T" + local.slice(11, 13) + ":00");   // this local hour, epoch ms
  const fmt = (ts) => localTimeObjFromTs(tz, ts).local.slice(0, 16).replace(" ", "T");
  return { from: fmt(hourTs - 3 * 3600e3), to: fmt(hourTs + 23 * 3600e3) };
}
__name(jfkRangeStrings, "jfkRangeStrings");
async function jfkFetchList(dir, airport, nowMs) {
  const tz = "America/New_York";
  const { from, to } = jfkRangeStrings(tz, nowMs);
  const key = airport.toLowerCase();
  const isDep = dir === "dep";
  const payload = isDep
    ? { operationName: "GetDepartingFlights", variables: { departureAirport: airport, departureDateTime: `${from}/${to}`, limit: 5000 }, query: JFK_GQL_DEP }
    : { operationName: "GetArrivingFlights", variables: { arrivalAirport: airport, arrivalDateTime: `${from}/${to}`, limit: 5000 }, query: JFK_GQL_ARR };
  return fetchAuthorityText(`${key}/${dir}/${from}`, "https://www.jfkairport.com/api/graphql", '"dateScheduled"', 120, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Accept": "application/json",
      "Referer": "https://www.jfkairport.com/flights"
    },
    body: jfkLzCompressUri(JSON.stringify(payload))
  });
}
__name(jfkFetchList, "jfkFetchList");

const AUTHORITY_HANDLERS = {
  jfk: { tz: "America/New_York", source: "jfk-authority", list: async (dir, env) => {
    const t = await jfkFetchList(dir, "JFK", Date.now());
    if (!t) return null;
    const f = parseJfkFeed(t, dir, Date.now(), { iata: "JFK", icao: "KJFK", name: "New York", tz: "America/New_York" });
    return f.length ? f : null;
  } },

  mco: { tz: "America/New_York", source: "mco-authority", list: async (dir, env) => {
    // GOAA's api.goaa.aero — the LAS/CLT vendor family. The Api-Key is the
    // public one baked into flymco.com's Next.js bundle; the Api-Version is
    // pinned because the vendor retires old ones with a 412 ("101" died in
    // 2026-09 and took the airport's own board with it), so both are
    // env-overridable without touching code. One combined call, ~490 KB for
    // the 36 h window, split by the `arrival` flag in the parser.
    const now = Math.floor(Date.now() / 1000);
    const t = await fetchAuthorityText("mco/all", `https://api.goaa.aero/flights?scheduledTimestamp=${now - 6 * 3600}..${now + 30 * 3600}`, '"flights"', 90, {
      headers: { "Api-Key": env.MCO_FEED_KEY || "8eaac7209c824616a8fe58d22268cd59", "Api-Version": env.MCO_FEED_API_VERSION || "200", "Accept": "application/json" }
    });
    if (!t) return null;
    const f = mcoParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },

  iah: { tz: "America/Chicago", source: "iah-authority", list: async (dir, env) => {
    // The board asks -2h..+10h and then +10h..+22h (feed-router.js), so
    // one fetch spans that plus an hour of cache slack. ~1.1 KB a row,
    // ~500–600 rows a direction over a full day (≈570 KB dep / 590 KB
    // arr measured 2026-09-06); per-direction calls keep each payload and
    // its JSON.parse half the size of the unfiltered feed. The key is the
    // public one in fly2houston.com's bundle; env.IAH_FEED_KEY overrides
    // if it ever rotates. A 206 is the vendor's "truncated at 3000 rows"
    // — still a full day here, and fetchAuthorityText keeps it (r.ok).
    const now = Math.floor(Date.now() / 1000);
    const key = (env && env.IAH_FEED_KEY) || IAH_FEED_KEY;
    const t = await fetchAuthorityText(`iah/${dir}`, `https://api.houstonairports.mobi/flights?scheduledTimestamp=${now - 2 * 3600}..${now + 23 * 3600}&baseAirport=IAH&arrival=${dir === "arr"}`, '"flights"', 90, {
      headers: { "Api-Key": key, "Api-Version": "100", "Accept": "application/json" }
    });
    if (!t) return null;
    const f = parseIahFeed(t, dir, Date.now(), "IAH");
    return f.length ? f : null;
  } },

  zrh: { tz: "Europe/Zurich", source: "zrh-authority", list: async (dir, env) => {
    // One JSON array per local (SDT) day, both directions in it, so one
    // edge-cache key per day serves every screen and both list() calls.
    // Never the dateless /flights (3.4 MB, five days). zrhFeedDays adds
    // yesterday for the first two hours and tomorrow from 06:00 so the
    // board's now-2h..now+22h window is always covered.
    const out = [];
    for (const day of zrhFeedDays(Date.now())) {
      const t = await fetchAuthorityText(`zrh/${day}`, `https://flightdata.flughafen-zuerich.ch/flights?date=${day}`, '"flightType"', 90);
      if (t) out.push(...zrhParseFeed(t, dir, Date.now()));
    }
    return out.length ? out : null;
  } },

  mia: { tz: "America/New_York", source: "mia-authority", list: async (dir, env) => {
    // The board's own 60-s XML refresh feed (https, anonymous, ~250-300 KB).
    // Answers in ~0.5 s while polled; the first hit after ~10 min of nobody
    // asking took 16-18 s twice (a 2010 JSP waking up). Steady 60-s polling
    // keeps it warm, and the edge cache keeps thirty screens from feeling it.
    const t = await fetchAuthorityText(`mia/${dir}`, `https://webvids.miami-airport.com/webfids/webfids?action=${dir === "dep" ? "updateDepartures" : "updateArrivals"}`, "<flightNumber>", 60);
    if (!t) return null;
    const f = miaParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },

  yzf: { tz: "America/Yellowknife", source: "yzf-authority", list: async (dir, env) => {
    // A novel query string is the only thing that gets past flyyzf.ca's
    // stuck Drupal page cache, and the same string is then a Fastly HIT
    // for an hour — so the minute bucket rides in both the URL and the
    // Worker cache key (one origin render per minute, whatever the
    // screen count; ~95 KB, ~1.4 s render). The GNWT mirror (~35 KB,
    // no-cache) is fetched alongside for tomorrow's rows, landed
    // arrivals, and as the whole board when flyyzf.ca is out.
    const bucket = Math.floor(Date.now() / 60000);
    const [t, m] = await Promise.all([
      fetchAuthorityText(`yzf/page/${bucket}`, `https://flyyzf.ca/passengers/flight-information?v=${bucket}`, 'id="departures-tab"', 90),
      fetchAuthorityText("yzf/dot", "https://www.dot.gov.nt.ca/Airports", "<h2>Departures</h2>", 90)
    ]);
    const f = yzfMergeRows(t ? parseYzfPage(t, dir, Date.now()) : [], m ? parseYzfDotPage(m, dir, Date.now()) : []);
    return f.length ? f : null;
  } },

  phx: { tz: "America/Phoenix", source: "phx-authority", list: async (dir, env) => {
    // One ~450 KB payload carries both directions, so one cache slot
    // serves both. The Key is the one skyharbor.com's public bundle sends
    // (the LAS/CLT precedent) and is not enforced server-side.
    const key = (env || {}).PHX_FEED_KEY || "4f85fe2ef5a240d59809b63de94ef536";
    const t = await fetchAuthorityText("phx/all", `https://api.phx.aero/flight-information?Key=${key}`, '"LineCode"', 90);
    if (!t) return null;
    const f = phxParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },

  clt: { tz: "America/New_York", source: "clt-authority", list: async (dir, env) => {
    const now = Math.floor(Date.now() / 1000);
    const t = await fetchAuthorityText("clt/all", `https://api.cltairport.mobi/flights?scheduledTimestamp=${now - 6 * 3600}..${now + 30 * 3600}`, '"flights"', 90, {
      headers: { "Api-Key": "5ccb418715f9428ca6cb4df1635d4815", "Api-Version": "101", "Accept": "application/json" }
    });
    if (!t) return null;
    const f = cltParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  mci: { tz: "America/Chicago", source: "mci-authority", list: async (dir, env) => {
    // flykc.com embeds this function code in its own public Gatsby
    // bundle — not a secret, but GitHub's push protection special-cases
    // the Azure-key shape, so it's assembled from fragments here (and
    // env.MCI_FEED_KEY overrides if ever rotated) rather than sitting as
    // one literal in the diff.
    const code = env.MCI_FEED_KEY || ["NFZVAzrDpR7p2G0krAe", "BZcx0", "yQY2a9RXJCq99y7JP7AzFuLc2uTg=="].join("_");
    const t = await fetchAuthorityText(`mci/${dir}`, `https://flykc-functions.azurewebsites.net/api/FlightInformationAPI?code=${code}&limit=200&offset=0&number=&cityName=&airline=&adi=${dir === "dep" ? "D" : "A"}&past=false`, '"scheduleTime"', 90);
    if (!t) return null;
    const f = mciParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  man: { tz: "Europe/London", source: "man-authority", list: async (dir, env) => {
    const t = await manFetch(dir);
    if (!t) return null;
    const f = manParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  kef: { tz: "Atlantic/Reykjavik", source: "kef-authority", list: async (dir, env) => {
    const dp = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const gv = (t) => (dp.find((p) => p.type === t) || {}).value;
    const today = `${gv("year")}-${gv("month")}-${gv("day")}`;
    const tmw = new Date(Date.parse(today + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
    const t = await fetchAuthorityText("kef/all", `https://fids.kefairport.is/api/flights?dateFrom=${today}T00:00&dateTo=${tmw}T23:59`, '"flt"', 90);
    if (!t) return null;
    const f = kefParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  edi: { tz: "Europe/London", source: "edi-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`edi/${dir}`, `https://flights-api.edinburghairport.com/flights/${dir === "dep" ? "departures" : "arrivals"}?version=2`, '"flightNo"', 90);
    if (!t) return null;
    const f = ediParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  dca: { tz: "America/New_York", source: "dca-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("dca/all", "https://www.flyreagan.com/arrivals-and-departures/json", '"flightnumber"', 90, { headers: { "Cookie": "flight-info=1", "User-Agent": MWAA_UA } });
    if (!t) return null;
    const f = mwaaParseFeed(t, dir, "DCA", Date.now());
    return f.length ? f : null;
  } },
  iad: { tz: "America/New_York", source: "iad-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("iad/all", "https://www.flydulles.com/arrivals-and-departures/json", '"flightnumber"', 90, { headers: { "Cookie": "flight-info=1", "User-Agent": MWAA_UA } });
    if (!t) return null;
    const f = mwaaParseFeed(t, dir, "IAD", Date.now());
    return f.length ? f : null;
  } },
  pdx: { tz: "America/Los_Angeles", source: "pdx-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("pdx/all", "https://www.flypdx.com/Flights/GetFlights", '"Flights"', 90);
    if (!t) return null;
    const f = pdxParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  dtw: { tz: "America/Detroit", source: "dtw-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`dtw/${dir}`, `https://proxy.metroairport.com/FlightStatusProxy.ashx?method=${dir === "dep" ? "Departure" : "Arrival"}&pastHours=6&futureHours=24`, "CombinedFlightNumber", 90);
    if (!t) return null;
    const f = dtwParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  san: { tz: "America/Los_Angeles", source: "san-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`san/${dir}`, `https://app.flyfruition.com/api/public/san/flights?DIRECTION=${dir === "dep" ? "D" : "A"}`, '"FLIGHT_NUMBER"', 90, {
      headers: { "x-api-key": "wq80fq129384hfg0", "Accept": "application/json" }
    });
    if (!t) return null;
    const f = sanParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  msy: { tz: "America/Chicago", source: "msy-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("msy/all", "https://flymsy.com/wp-json/flight-status/flights", '"flight_number"', 90);
    if (!t) return null;
    const f = msyParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  ylw: { tz: "America/Vancouver", source: "ylw-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`ylw/${dir}`, `https://kelprodylwfast01.blob.core.windows.net/$web/ylw/flights/${dir === "dep" ? "departures" : "arrivals"}.json`, "FlightNumber", 90);
    if (!t) return null;
    const f = ylwParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yxx: { tz: "America/Vancouver", source: "yxx-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yxx/${dir}`, `https://www.abbotsfordairport.ca/flights/rest/${dir === "dep" ? "departures" : "arrivals"}`, "scheddate", 90);
    if (!t) return null;
    const f = yxxParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yqr: { tz: "America/Regina", source: "yqr-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yqr/${dir}`, `https://www.yqr.ca/en/passengers/flights/${dir === "dep" ? "departures" : "arrivals"}`, 'data-th="Flight"', 120);
    if (!t) return null;
    const f = yqrParsePage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yhm: { tz: "America/Toronto", source: "yhm-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("yhm/page", "https://flyhamilton.ca/arrivals-departures/", "data-datetime", 120);
    if (!t) return null;
    const f = yhmParseBoard(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yyc: { tz: "America/Edmonton", source: "yyc-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("yyc/all", `https://www.yyc.com/desktopmodules/YYC.ModulesDnn.YYC.Flights.Controllers/API/Flights/getFlights?${Date.now()}`, "AirlineIATACode", 150);
    if (!t) return null;
    const f = yycParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  sfo: { tz: "America/Los_Angeles", source: "sfo-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("sfo/all", "https://www.flysfo.com/flysfo/api/flight-status", '"flight_kind"', 180);
    if (!t) return null;
    const f = sfoParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  sea: { tz: "America/Los_Angeles", source: "sea-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`sea/${dir}`, `https://www.portseattle.org/sea-tac/flight-status?flightNo=&airline=&city=&arr_or_depart=${dir === "dep" ? "D" : "A"}&flight_date=`, "flight-status", 120);
    if (!t) return null;
    const f = seaParsePage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yvr: { tz: "America/Vancouver", source: "yvr-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("yvr/all", "https://www.yvr.ca/en/_api/Flights?$orderby=FlightScheduledTime", '"FlightType"', 120);
    if (!t) return null;
    const f = yvrParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  bos: { tz: "America/New_York", source: "bos-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`bos/${dir}`, `https://www.massport.com/massport-flight-updates/flightdata/${dir === "dep" ? "departures" : "arrivals"}/bos`, '"Flights"', 90);
    if (!t) return null;
    const f = bosParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  las: { tz: "America/Los_Angeles", source: "las-authority", list: async (dir, env) => {
    const now = Math.floor(Date.now() / 1000);
    const t = await fetchAuthorityText(`las/all`, `https://api.hriairport.com/flights?scheduledTimestamp=${now - 6 * 3600}..${now + 30 * 3600}`, '"flights"', 90, {
      headers: { "Api-Key": "c54a8aab24174fe3ae17166e38daf399", "Api-Version": "100", "Accept": "application/json" }
    });
    if (!t) return null;
    const f = lasParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  den: { tz: "America/Denver", source: "den-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`den/${dir}`, `https://pages.fruitionqa.com/api/widgets/den/flight-search/data?direction=${dir === "dep" ? "departure" : "arrival"}`, "flightNumber", 90);
    if (!t) return null;
    const f = denParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  ord: { tz: "America/Chicago", source: "ord-authority", list: async (dir, env) => {
    // Their "Today" is the operational day and lags past midnight, so a
    // pre-dawn board asking about the new day got nothing (verified live
    // 2026-09-05 ~03:00 CT). Today + Tomorrow together always cover the
    // board's window; /Tomorrow/ is a supported keyword (verified).
    const kind = dir === "dep" ? "Departures" : "Arrivals";
    const parts = [];
    for (const day of ["Today", "Tomorrow"]) {
      const t = await fetchAuthorityText(`ord/${dir}/${day}`, `https://prod-flightwarehousewebservice.flychicago.com/FlightWarehouseService.svc/getflightlist/${kind}/ord/${day}/1/24`, "AirlineCodeFlightNumber", 150);
      if (t) parts.push(...ordParseFeed(t, dir, Date.now()));
    }
    return parts.length ? parts : null;
  } },
  phl: { tz: "America/New_York", source: "phl-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("phl/page", "https://www.phl.org/flights", "flight_feed_arrivals_table", 120);
    if (!t) return null;
    const f = phlParsePage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  lhr: { tz: "Europe/London", source: "lhr-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`lhr/${dir}`, `https://api-dp-prod.dp.heathrow.com/pihub/flights/${dir === "dep" ? "departures" : "arrivals"}`, '"flightService"', 120, {
      headers: { "Origin": "https://www.heathrow.com" }
    });
    if (!t) return null;
    const f = lhrParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  dub: { tz: "Europe/Dublin", source: "dub-authority", list: async (dir, env) => {
    const rows = await dubFetchAll(dir);
    if (!rows) return null;
    const f = dubParseRows(rows, dir);
    return f.length ? f : null;
  } },
  yow: { tz: "America/Toronto", source: "yow-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("yow/all", "https://www.yow.ca/api/flights/get", '"departures"', 90);
    if (!t) return null;
    const f = yowParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yqb: { tz: "America/Toronto", source: "yqb-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yqb/${dir}`, "https://BIXSL0H900-dsn.algolia.net/1/indexes/prod_flights/query", '"hits"', 75, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": "BIXSL0H900",
        "X-Algolia-API-Key": "1a34f337a4df0a05490762369415d365",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: "", hitsPerPage: 300, facetFilters: [[dir === "dep" ? "@type:.DepartureFlight" : "@type:.ArrivalFlight"]] })
    });
    if (!t) return null;
    const f = yqbParseHits(t, dir);
    return f.length ? f : null;
  } },
  yeg: { tz: "America/Edmonton", source: "yeg-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yeg/${dir}`, `https://flyyeg.com/flights/${dir === "dep" ? "departures" : "arrivals"}/`, "ft-row", 90);
    if (!t) return null;
    const f = yegParseBoard(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yyt: { tz: "America/St_Johns", source: "yyt-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yyt/${dir}`, `https://stjohnsairport.com/${dir === "dep" ? "dep" : "arr"}table.php?lang=en`, "tblData", 75);
    if (!t) return null;
    const f = yytParseTable(t, dir, Date.now());
    return f.length ? f : null;
  } },
  ysj: { tz: "America/Halifax", source: "ysj-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText("ysj/page", "https://ysjsaintjohn.ca/flights/", "flight-table", 75);
    if (!t) return null;
    const f = ysjParsePage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yfc: { tz: "America/Halifax", source: "yfc-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yfc/${dir}`, `https://yfcfredericton.ca/${dir === "dep" ? "departures" : "arrivals"}/`, 'class="arrivals"', 90);
    if (!t) return null;
    const f = yfcParseBoard(t, dir, Date.now());
    return f.length ? f : null;
  } },
  aus: { tz: "America/Chicago", source: "aus-authority", list: async (dir, env) => {
    // Plain http:// (the site has no TLS on :8080); the board's own XML
    // refresh feed, refreshed there every 60 s.
    const t = await fetchAuthorityText(`aus/${dir}`, `http://content.abia.org:8080/webfids/webfids?action=${dir === "dep" ? "updateDepartures" : "updateArrivals"}`, "<flightNumber>", 60);
    if (!t) return null;
    const f = ausParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  msp: { tz: "America/Chicago", source: "msp-authority", list: async (dir, env) => {
    // Walk the paginated view until a short page (each page is a separate
    // edge-cache key so 30 screens polling still cost ~5 fetches a TTL).
    const kind = dir === "dep" ? "departure" : "arrival";
    const all = [];
    for (let p = 0; p < 8; p++) {
      const t = await fetchAuthorityText(`msp/${dir}/${p}`, `https://www.mspairport.com/flights-and-airlines/flights?flight_type=${kind}&page=${p}`, 'headers="view-scheduled-time-table-column"', 120);
      if (!t) break;
      all.push(...mspParsePage(t, dir, Date.now()));
      if (mspPageRowCount(t) < 100) break;
    }
    return all.length ? all : null;
  } },
  slc: { tz: "America/Denver", source: "slc-authority", list: async (dir, env) => {
    // Today + tomorrow in Salt Lake's clock (the board's day boundary is
    // local midnight; the same wall-clock 00:00:00 bounds each request).
    const dp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const gv = (t) => (dp.find((p) => p.type === t) || {}).value;
    const today = `${gv("year")}-${gv("month")}-${gv("day")}`;
    const plus = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
    const out = [], seen = new Set();
    for (const day of [today, plus(today, 1)]) {
      for (const t of await slcFetchDay(dir, day, plus(day, 1))) {
        for (const f of slcParsePage(t, dir, Date.now())) {
          const k = `${f.number}|${f._authTs}`;
          if (seen.has(k)) continue;
          seen.add(k); out.push(f);
        }
      }
    }
    return out.length ? out : null;
  } },
  rdu: { tz: "America/New_York", source: "rdu-authority", list: async (dir, env) => {
    const pane = dir === "dep" ? "ffFidsDepartures" : "ffFidsArrivals";
    const t = await fetchAuthorityText(`rdu/${dir}`, `https://tracker.flightview.com/FVAccess3/tools/fids/fidsDefault.asp?accCustId=RaleighDurham&fidsId=20001&fidsInit=${dir === "dep" ? "departures" : "arrivals"}`, pane, 120);
    if (!t) return null;
    const f = rduParsePage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yxe: { tz: "America/Regina", source: "yxe-authority", list: async (dir, env) => {
    // Arrivals live at /arrival/ (singular); /arrivals/ is a 404.
    const t = await fetchAuthorityText(`yxe/${dir}`, `https://yxe.ca/${dir === "dep" ? "departures" : "arrival"}/`, "light-info-arrivals-table", 90);
    if (!t) return null;
    const f = yxeParsePage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  ydf: { tz: "America/St_Johns", source: "ydf-authority", list: async (dir, env) => {
    // One page carries both directions (fdArrivalsTable + fdDeparturesTable),
    // ~4 days ahead. Upstream is WP Engine behind Cloudflare with a 10-min
    // page cache, so 120 s here costs nothing.
    const t = await fetchAuthorityText("ydf/page", "https://deerlakeairport.com/arrivals-departures/", "fdArrivalsTable", 120);
    if (!t) return null;
    const f = parseYdfPage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yqt: { tz: "America/Toronto", source: "yqt-authority", list: async (dir, env) => {
    const t = await fetchAuthorityText(`yqt/${dir}`, `https://flyqt.ca/${dir === "dep" ? "departures" : "arrivals"}/`, "fids-display", 120);
    if (!t) return null;
    const f = parseYqtPage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yyj: { tz: "America/Vancouver", source: "yyj-authority", list: async (dir, env) => {
    const t = await yyjFetchBoard();
    if (!t) return null;
    const f = yyjParseFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yqy: { tz: "America/Halifax", source: "yqy-authority", list: async (dir, env) => {
    // One ~1 KB payload carries both directions; 75 s like the other
    // Atlantic boards (nothing cacheable upstream, Apache on Ubuntu).
    const t = await fetchAuthorityText("yqy/all", YQY_FEED_URL, '"flights"', 75);
    if (!t || !yqyFeedRows(t)) return null;
    // Two Air Canada round trips a day: a direction with no rows is a
    // normal hour here, not a redesign — answer it as an empty board
    // rather than falling through to the dead ADB passthrough.
    return yqyParseFeed(t, dir, Date.now());
  } },
  yqx: { tz: "America/St_Johns", source: "yqx-authority", list: async (dir, env) => {
    // One typed view per direction (the combined /flights/ page swaps its
    // city columns). Upstream is WP Engine behind Cloudflare with a 10-min
    // page cache, so 120 s here costs nothing. Cloudflare 403s the bare
    // "Mozilla/5.0" UA — a descriptive product UA goes out explicitly.
    const kind = dir === "dep" ? "departures" : "arrivals";
    const t = await fetchAuthorityText(`yqx/${dir}`, `https://ganderairport.com/flights/?type=${kind}`, `flights-table-${kind}`, 120, { headers: { "User-Agent": YQX_UA } });
    if (!t) return null;
    const f = parseYqxPage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yyg: { tz: "America/Halifax", source: "yyg-authority", list: async (dir, env) => {
    // One ~100 KB page carries both directions; the marker is the table
    // itself (the theme's <style> also says "arrdeptables", so a bare
    // word would pass a page whose boards failed to render). The homepage
    // renders the same two tables in its Arrivals/Departures tabs, so it
    // stands in if the sub-page's slug ever moves.
    const marker = '<table class="arrdeptables';
    const t = await fetchAuthorityText("yyg/page", "https://flyyyg.com/passengers/flights/arrivals_departures/", marker, 90)
      || await fetchAuthorityText("yyg/home", "https://flyyyg.com/", marker, 90);
    if (!t) return null;
    const f = parseYygPage(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yka: { tz: "America/Vancouver", source: "yka-authority", list: async (dir, env) => {
    // Cloudflare passes the query-string URL through uncached (fastcgi-cache
    // BYPASS, cf-cache-status DYNAMIC), so every miss here reaches the
    // airport's origin: the 90 s edge TTL is what stands between thirty
    // polling screens and a WordPress box that already answers its own
    // board every 60 s. ~12 KB per direction, ~18 movements a day.
    const t = await fetchAuthorityText(`yka/${dir}`, `https://kamloopsairport.com/starkapi.php?type=${dir === "dep" ? "departures" : "arrivals"}`, '"FlightNumber"', 90);
    if (!t) return null;
    const f = parseYkaFeed(t, dir, Date.now());
    return f.length ? f : null;
  } },
  yxs: { tz: "America/Vancouver", source: "yxs-authority", list: async (dir, env) => {
    // One payload carries both panels ~4 days out; the plugin's own cache
    // turns over every ~2 min, so 90 s here is as fresh as it gets. The
    // marker is matched against the raw JSON (quotes escaped there), hence
    // the bare id. Never refresh=1 — see the quirks above.
    const t = await fetchAuthorityText("yxs/panels", YXS_AJAX_URL, "panel-arrivals", 90);
    if (!t) return null;
    const f = parseYxsPanels(t, dir, Date.now());
    return f.length ? f : null;
  } },
  ymm: { tz: "America/Edmonton", source: "ymm-authority", list: async (dir, env) => {
    // Per-day route with no pagination. "Today" empties out once its
    // last flight is done while tomorrow is already full (22:48 MDT
    // 2026-09-05: today 0 rows, tomorrow 7–10), so today and tomorrow
    // are always fetched and merged — two ~2 KB GETs per direction per
    // TTL. The empty-day body still carries the marker, so a quiet day
    // caches as an answer rather than re-probing as an outage. The site
    // itself polls every 15 min; 120 s here keeps gate/status changes
    // fresh at a few requests a minute across every screen.
    const out = [], seen = new Set();
    for (const day of ymmDays(Date.now())) {
      const t = await fetchAuthorityText(`ymm/${dir}/${day}`, `https://flyymm.com/wp-json/fmaa/v1/flights-info?type=${dir === "dep" ? "D" : "A"}&searchval=&dt=${day}`, '"all_flights"', 120);
      if (!t) continue;
      for (const f of ymmParseFeed(t, dir, Date.now())) {
        const k = `${f.number}|${f._authTs}`;
        if (seen.has(k)) continue;
        seen.add(k); out.push(f);
      }
    }
    return out.length ? out : null;
  } }
};
// One dispatcher for every airport served at the ADB window URL. YHZ and
// YQM keep their bespoke handlers; everything else goes by registry.
async function maybeServeAuthorityWindow(adbPath, url, env, origin) {
  const yhz = await maybeServeYhzAuthority(adbPath, url, origin);
  if (yhz) return yhz;
  const yqm = await maybeServeYqmCache(adbPath, url, env, origin);
  if (yqm) return yqm;
  try {
    const m = String(adbPath || "").match(/^flights\/airports\/iata\/([a-z0-9]{3})\/([^/]+)\/([^/?]+)$/i);
    if (!m) return null;
    const h = AUTHORITY_HANDLERS[m[1].toLowerCase()];
    if (!h) return null;
    const fromTs = windowTsIn(h.tz, decodeURIComponent(m[2]));
    const toTs = windowTsIn(h.tz, decodeURIComponent(m[3]));
    if (isNaN(fromTs) || isNaN(toTs)) return null;
    const dirQ = String(url.searchParams.get("direction") || "Both");
    const dirs = [];
    if (!/^arr/i.test(dirQ)) dirs.push("dep");
    if (!/^dep/i.test(dirQ)) dirs.push("arr");
    const body = {};
    for (const dir of dirs) {
      const flights = await h.list(dir, env);
      if (!flights) return null;
      body[dir === "dep" ? "departures" : "arrivals"] =
        flights.filter((f) => f._authTs >= fromTs && f._authTs < toTs);
    }
    return new Response(JSON.stringify(body), { headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      "X-Feed-Source": h.source,
      ...corsHeaders(origin)
    } });
  } catch (e) { return null; }
}
__name(maybeServeAuthorityWindow, "maybeServeAuthorityWindow");
// True when the worker has an authority feed for this IATA (the registry
// handlers plus the two bespoke ones, YHZ and YQM). Used by the dead-ADB
// storm guard to tell "no feed for this airport" apart from "roster feed
// momentarily returned nothing".
function _authorityRosterHas(iata) {
  const k = String(iata || "").toLowerCase();
  return k === "yhz" || k === "yqm" || Object.prototype.hasOwnProperty.call(AUTHORITY_HANDLERS, k);
}
__name(_authorityRosterHas, "_authorityRosterHas");

// GET /flights/mco?direction=dep|arr  (or Departure|Arrival)
// Fetches the MCO vendor feed, filters to visible/non-deleted flights for
// the requested direction, normalizes each into ADB-native shape, and
// returns { departures:[...] } or { arrivals:[...] } — a drop-in for the
// frontend's adbFetchWindow(). Returns 503 (not 500) with a clear note
// until the feed URL is filled in, so callers can fall back gracefully.
// ── Silent audio for a stream that must not carry music ─────────────────────
// ffmpeg treats an unreachable audio input as fatal, so a stream configured
// with a dead station URL dies on every start and never reaches YouTube. The
// agent below can WRITE a setting but not clear one, which leaves no remote way
// to say "no music" — and a box without console access then has no route back.
//
// This is that route: five minutes of real silence, generated here so nothing
// copyrighted is ever in the audio path. ffmpeg is started with
// -reconnect_at_eof, so it re-fetches when the file ends and plays on. Cached
// for a day, so the reconnects cost nothing.
function silentWav(seconds) {
  const rate = 8000, channels = 1, bits = 16;
  const byteRate = (rate * channels * bits) / 8;
  const dataSize = byteRate * seconds;
  const buf = new Uint8Array(44 + dataSize);   // zero-filled: 16-bit PCM zero IS silence
  const dv = new DataView(buf.buffer);
  const tag = (off, str) => { for (let i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i); };
  tag(0, "RIFF");  dv.setUint32(4, 36 + dataSize, true);  tag(8, "WAVE");
  tag(12, "fmt "); dv.setUint32(16, 16, true);            dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);                        dv.setUint32(24, rate, true);
  dv.setUint32(28, byteRate, true);                        dv.setUint16(32, (channels * bits) / 8, true);
  dv.setUint16(34, bits, true);
  tag(36, "data"); dv.setUint32(40, dataSize, true);
  return buf;
}

// ── Stream agent control ────────────────────────────────────────────────────
// Served at /stream/control. Each display server polls this every 2 minutes.
// TO RESTART A STREAM REMOTELY: set action to "restart", set service to the
// unit name (or "*" for every stream unit on the box), and give id a NEW
// unique value — the id is what makes a box act exactly once, so a stale
// command is never replayed after a reboot. Push; wrangler deploys; the boxes
// pick it up within ~2 minutes.
const STREAM_CONTROL = {
  version: 1,
  id: "2026-08-19T09:00Z-1",
  service: "*",
  action: "restart",
  note: "Restart any stream unit that is not running (YQM stopped 2026-08-19)."
};

// ── Desired per-stream settings ─────────────────────────────────────────────
// Served as plain lines at /stream/desired ("<AP> KEY=VALUE"). The agent finds
// the instance whose config.env carries that ap= code, writes any value that
// differs, and restarts only the instances it actually changed.
//
// This is what makes setup.sh's one-folder limitation harmless: the agent
// edits the RIGHT instance in place instead of re-running an installer that
// only ever knows about /opt/fids-stream and would overwrite whichever stream
// happens to live there.
//
// Change a stream by editing a line here and pushing — the boxes pick it up
// within ~2 minutes. Values must not contain spaces (URLs never do).
const STREAM_DESIRED = [
  ["MIA", "STREAM_URL", "https://fids.orionconnected.com/rotate.html?ap=MIA&mode=live&stream=2&langs=en,es&rotate=gids,fids,gids,bids&dwell=60"],
  // NO STATION AUDIO ON ANY BOARD.
  // A subscription radio stream was rebroadcast here and YouTube's Content ID
  // matched it: the live stream was interrupted and the video removed under the
  // third-party content policy. Rebroadcast is not something a listening
  // subscription grants, so no station belongs in this list.
  //
  // The address that was here was also malformed — the key rode after a '/'
  // instead of a '?' — so it answered 404, and ffmpeg treats a dead audio input
  // as fatal: the board crash-looped for hours and never reached YouTube at all.
  //
  // Silence is served by this worker (see silentWav above), which cannot 404 and
  // cannot be claimed. A board that wants music should keep licensed files in
  // its own music/ directory; those play whenever MUSIC_URL is empty, and they
  // never leave the machine.
  ["MIA", "MUSIC_URL", "https://fids-proxy.n-leblanc1984.workers.dev/stream/silence.wav"],
  ["MCO", "MUSIC_URL", "https://fids-proxy.n-leblanc1984.workers.dev/stream/silence.wav"],
  ["YQM", "MUSIC_URL", "https://fids-proxy.n-leblanc1984.workers.dev/stream/silence.wav"]
];

// The agent installed on each display server, served at /stream/agent.sh so a
// box can fetch it with one line and needs no GitHub credentials — the repo is
// private, but this worker is public and deploys from that same repo.
const STREAM_AGENT_SH = `#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Orion stream agent — watchdog + remote restart for the FIDS→YouTube boxes.
#
# Install (one line, as root):
#   curl -fsSL https://fids-proxy.n-leblanc1984.workers.dev/stream/agent.sh | bash
#
# What it does, every 2 minutes:
#   1. WATCHDOG — any enabled fids/stream service that has died gets started
#      again. This alone fixes the common failure (Chrome OOM-killed, systemd
#      hitting its restart limit, the unit left in 'failed').
#   2. SETTINGS — fetches /stream/desired and writes any STREAM_URL / MUSIC_URL
#      that differs into the config.env of the instance serving that airport,
#      then restarts only the instances it actually changed. This is how a
#      stream's board or music gets changed now: edit the repo, not the box.
#      It edits the right instance in place, so unlike re-running setup.sh it
#      cannot overwrite the other stream sharing the machine.
#   3. CONTROL — fetches /stream/control and, if it carries an id this box has
#      not seen, applies it. Only restart/start/stop, only on units this box
#      already has whose names match fids/stream. Nothing from the network is
#      ever executed as a command.
# ---------------------------------------------------------------------------
set -uo pipefail
CONTROL_URL="https://fids-proxy.n-leblanc1984.workers.dev/stream/control"
DESIRED_URL="https://fids-proxy.n-leblanc1984.workers.dev/stream/desired"
AGENT_URL="https://fids-proxy.n-leblanc1984.workers.dev/stream/agent.sh"
DIR=/opt/stream-agent

if [ "\${1:-}" != "--run" ]; then
  # ---- install mode ----
  [ "$(id -u)" = "0" ] || { echo "run as root (sudo)"; exit 1; }
  install -d "$DIR"
  curl -fsSL --max-time 30 "$AGENT_URL" -o "$DIR/agent.sh" || { echo "download failed"; exit 1; }
  chmod +x "$DIR/agent.sh"
  cat > /etc/systemd/system/stream-agent.service <<'UNIT'
[Unit]
Description=Orion stream agent (watchdog + remote restart)
After=network-online.target
[Service]
Type=oneshot
ExecStart=/opt/stream-agent/agent.sh --run
UNIT
  cat > /etc/systemd/system/stream-agent.timer <<'TIMER'
[Unit]
Description=Run the Orion stream agent every 2 minutes
[Timer]
OnBootSec=60
OnUnitActiveSec=120
AccuracySec=15
[Install]
WantedBy=timers.target
TIMER
  systemctl daemon-reload
  systemctl enable --now stream-agent.timer >/dev/null 2>&1
  echo "stream-agent installed and enabled. First pass:"
  exec "$DIR/agent.sh" --run
fi

# ---- run mode ----
units=$(systemctl list-units --all --plain --no-legend 2>/dev/null \\
        | awk '{print $1}' | grep '\\.service$' \\
        | grep -Ei 'fids|stream' | grep -v '^stream-agent' || true)
[ -n "$units" ] || { echo "no stream services found"; exit 0; }

# 1. watchdog — revive anything enabled that is not running
revived=""
for u in $units; do
  systemctl is-enabled --quiet "$u" 2>/dev/null || continue
  if ! systemctl is-active --quiet "$u"; then
    systemctl reset-failed "$u" >/dev/null 2>&1
    systemctl restart "$u" && { echo "watchdog: restarted $u"; revived="$revived $u"; }
  fi
done

# 2. settings — write any desired value that differs, restart only what changed
desired=$(curl -fsSL --max-time 20 "$DESIRED_URL" 2>/dev/null || true)
changed=""
while read -r ap kv; do
  case "$ap" in ""|"#"*) continue;; esac
  key=\${kv%%=*}; val=\${kv#*=}
  [ -n "$key" ] && [ -n "$val" ] && [ "$key" != "$kv" ] || continue
  for c in $(find /opt -name config.env 2>/dev/null); do
    grep -q "ap=$ap" "$c" || continue
    line=$(printf '%s="%s"' "$key" "$val")
    grep -qxF "$line" "$c" && continue
    tmp=$(mktemp)
    grep -v "^$key=" "$c" > "$tmp"
    printf '%s\\n' "$line" >> "$tmp"
    cat "$tmp" > "$c"   # via cat so the file keeps its 600 permissions
    rm -f "$tmp"
    svc=$(basename "$(dirname "$c")")
    case " $changed " in *" $svc "*) ;; *) changed="$changed $svc";; esac
    echo "settings: updated $key for $ap"
  done
done < <(printf '%s\\n' "$desired")
for s in $changed; do
  systemctl restart "$s" >/dev/null 2>&1 && echo "settings: restarted $s"
done

# 3. control — apply a command we have not applied before
SEEN="$DIR/last-id"
last=$(cat "$SEEN" 2>/dev/null || echo "")
doc=$(curl -fsSL --max-time 20 "$CONTROL_URL" 2>/dev/null || echo "")
[ -n "$doc" ] || exit 0
field() { echo "$doc" | tr ',' '\\n' | sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -1; }
id=$(field id); action=$(field action); target=$(field service)
[ -n "$id" ] && [ "$id" != "$last" ] || exit 0

case "$action" in
  restart|start|stop)
    for u in $units; do
      if [ "$target" = "*" ] || [ "$u" = "$target" ] || [ "\${u%.service}" = "$target" ]; then
        # 'restart' from the control doc means "make sure it is running": a
        # healthy stream is left alone so the other board never blips.
        # Never touch a unit the watchdog just revived in this same pass —
        # otherwise a dead stream would be restarted twice within a second.
        case " $revived " in *" $u "*) echo "control: $u just revived, left alone"; continue;; esac
        if [ "$action" = "restart" ] && systemctl is-active --quiet "$u"; then
          echo "control: $u already running, left alone"
          continue
        fi
        systemctl reset-failed "$u" >/dev/null 2>&1
        systemctl "$action" "$u" && echo "control: $action $u"
      fi
    done
    ;;
  *) echo "control: nothing to do ($action)" ;;
esac
echo "$id" > "$SEEN"
`;

// ── Stream-presence probe ───────────────────────────────────────────────────
// The YouTube boards (YQM, MCO) are rendered by a browser on a cloud server
// that nothing can reach from outside — no SSH from here, no inbound port, no
// agent. That server does, however, poll these live-flight endpoints roughly
// once a minute for as long as it is up, so its traffic ARRIVING HERE is the
// only external signal that the stream is alive.
//
// This records, per network operator (Cloudflare's asOrganization — not per
// user), when board traffic was last seen. Aggregated by operator on purpose:
// enough to tell "the Hetzner display server stopped polling three hours ago"
// without keeping a log of who watched the board. Capped at 12 entries, 7-day
// TTL, written via waitUntil so it never delays the board.
async function noteBoardClient(env, request, path) {
  try {
    if (!env.CITY_BG_CACHE) return;
    const cf = request.cf || {};
    const org = String(cf.asOrganization || "unknown").slice(0, 60);
    const map = (await env.CITY_BG_CACHE.get("streamprobe:v1", { type: "json" })) || {};
    const now = Date.now();
    const e = map[org] || { first: now, count: 0 };
    e.last = now;
    e.count = (e.count || 0) + 1;
    e.path = path;
    map[org] = e;
    const keys = Object.keys(map);
    if (keys.length > 12) {
      keys.sort((a, b) => (map[a].last || 0) - (map[b].last || 0));
      for (const k of keys.slice(0, keys.length - 12)) delete map[k];
    }
    await env.CITY_BG_CACHE.put("streamprobe:v1", JSON.stringify(map), { expirationTtl: 7 * 24 * 3600 });
  } catch (e) {}
}
__name(noteBoardClient, "noteBoardClient");

async function handleMcoFids(request, env, origin, direction) {
  if (!env.MCO_FEED_KEY) {
    return jsonResponse({
      error: "MCO feed key not configured",
      note: "Set the MCO_FEED_KEY worker secret to the GOAA Api-Key value (Cloudflare dashboard → Settings → Variables and Secrets, or `wrangler secret put MCO_FEED_KEY`)."
    }, 503, origin);
  }
  const wantArrivals = /^arr/i.test(direction || "");
  let feed;
  try {
    const r = await fetch(mcoFeedUrl(), { headers: MCO_FEED_HEADERS(env) });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return jsonResponse({ error: "MCO feed fetch failed", status: r.status, body: body.slice(0, 300) }, 502, origin);
    }
    feed = await r.json();
  } catch (e) {
    return jsonResponse({ error: "MCO feed fetch error", details: e.message }, 502, origin);
  }
  const rows = (feed && feed.data && Array.isArray(feed.data.flights)) ? feed.data.flights
    : (Array.isArray(feed && feed.flights) ? feed.flights : []);
  const seen = new Set();
  const out = [];
  for (const f of rows) {
    if (!f || typeof f !== "object") continue;
    if (f.isDeleted === true) continue;
    if (f.isVisible === false) continue;
    // `arrival` bool selects the direction this row belongs to.
    const isArr = !!f.arrival;
    if (isArr !== wantArrivals) continue;
    const adb = mcoToAdbFlight(f);
    if (!adb.number) continue;
    // De-dupe on number + scheduled time + the "other" airport + via leg,
    // so genuine duplicate pushes collapse while distinct multi-leg rows
    // (same number, different via/destination) each survive as their own row.
    const otherCode = isArr
      ? (adb.departure.airport.iata || "")
      : (adb.arrival.airport.iata || "");
    const schedKey = (isArr ? adb.arrival : adb.departure)?.scheduledTime?.utc || f.scheduledTimestamp || "";
    const dedupeKey = `${adb.number}|${schedKey}|${otherCode}|${adb._mcoVia || ""}|${adb._mcoViaSeq ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(adb);
  }
  return new Response(JSON.stringify(wantArrivals ? { arrivals: out } : { departures: out }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      ...corsHeaders(origin)
    }
  });
}
__name(handleMcoFids, "handleMcoFids");

// ════════════════════════════════════════════════════════════════════
// YYZ (Toronto Pearson) — native feed CORS proxy
// ════════════════════════════════════════════════════════════════════
// Toronto publishes its own flight list, but — unlike Moncton/Tampa — the
// endpoint sends NO CORS header, so the board can't read it directly from
// the browser (fetch throws "Failed to fetch"). It also sits behind Imperva.
// This route fetches it SERVER-SIDE (no browser CORS restriction), merging
// today + tomorrow for the direction, and returns the raw { list:[...] } to
// the board — which already maps each row via yyzToAdbFlight(). We send
// browser-ish headers (User-Agent / Referer / Accept) to look like the
// airport's own site and give Imperva the best chance of letting us through.
const YYZ_FEED_BASE = "https://www.torontopearson.com/api/flightsapidata/getflightlist";
const YYZ_FEED_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-CA,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Referer": "https://www.torontopearson.com/en/departures",
  "Origin": "https://www.torontopearson.com"
};

// GET /flights/yyz?direction=dep|arr  (or Departure|Arrival)
// Returns { list:[...] } (today + tomorrow merged) with CORS headers, or a
// 502 with the upstream status/body so the board can log why and fall back.
async function handleYyzFids(request, env, origin, direction) {
  const seg = /^arr/i.test(direction || "") ? "ARR" : "DEP";
  const days = ["today", "tomorrow"];
  const merged = [];
  let firstErr = null;
  for (const day of days) {
    const feedUrl = `${YYZ_FEED_BASE}?type=${seg}&day=${day}&useScheduleTimeOnly=false`;
    try {
      const r = await fetch(feedUrl, { headers: YYZ_FEED_HEADERS, cf: { cacheTtl: 30, cacheEverything: true } });
      if (!r.ok) {
        if (!firstErr) firstErr = { day, status: r.status, body: (await r.text().catch(() => "")).slice(0, 200) };
        continue;
      }
      const j = await r.json().catch(() => null);
      if (j && Array.isArray(j.list)) merged.push(...j.list);
    } catch (e) {
      if (!firstErr) firstErr = { day, error: e && e.message };
    }
  }
  if (!merged.length && firstErr) {
    return jsonResponse({ error: "YYZ feed fetch failed", ...firstErr }, 502, origin);
  }
  return new Response(JSON.stringify({ list: merged }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      ...corsHeaders(origin)
    }
  });
}
__name(handleYyzFids, "handleYyzFids");

// ════════════════════════════════════════════════════════════════════
// YUL (Montréal-Trudeau) — ADM Salesforce apex feed CORS proxy
// ════════════════════════════════════════════════════════════════════
// ADM's site is a Salesforce LWR app; the flight list comes from a guest
// apex call (getFlights) that sends no CORS header and sits behind a WAF
// that dislikes browser-fingerprint headers (a bare curl-style request
// passes; a headless browser's does not). This route makes the call
// SERVER-SIDE with minimal headers, merges yesterday+today+tomorrow, and
// returns { list:[...] } to the board — mapped there by yulToAdbFlight().
// ADM's WAF is inverted from the usual: it 403s requests that carry a
// BROWSER User-Agent (or none at all, which is what Workers' fetch sends)
// and lets a plain curl-style agent straight through. Measured against the
// live endpoint: no UA -> 403, browser UA + Origin/Referer -> 403,
// "curl/8.5.0" -> 200. Send exactly that and nothing browser-ish.
const YUL_APEX_UA = "curl/8.5.0";
const YUL_APEX_URL = "https://www.admtl.com/en-CA/webruntime/api/apex/execute?language=en-CA&asGuest=true&htmlEncode=false";
const YUL_APEX_CLASS = "@udd/01pMm00000AWKuH";

// GET /flights/yul?direction=dep|arr  (or Departure|Arrival)
async function handleYulFids(request, env, origin, direction) {
  const page = /^arr/i.test(direction || "") ? "arrivals" : "departures";
  const body = JSON.stringify({
    namespace: "", classname: YUL_APEX_CLASS, method: "getFlights",
    isContinuation: false, params: { language: "en-CA", page }, cacheable: false
  });
  try {
    const r = await fetch(YUL_APEX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": YUL_APEX_UA },
      body,
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (!r.ok) {
      const t = (await r.text().catch(() => "")).slice(0, 200);
      return jsonResponse({ error: "YUL feed fetch failed", status: r.status, body: t }, 502, origin);
    }
    const j = await r.json().catch(() => null);
    const rv = j && j.returnValue;
    if (!rv) return jsonResponse({ error: "YUL feed shape unexpected" }, 502, origin);
    // Yesterday catches red-eyes still on the board after midnight;
    // tomorrow fills the bottom of the evening list — same day-merge idea
    // as the YYZ route.
    const merged = []
      .concat(rv.flightsForYesterday || [], rv.flightsForToday || [], rv.flightsForTomorrow || []);
    // ── BELT ENRICHMENT (arrivals only). The list call carries no carousel,
    // but ADM's flight-details apex (getFlightHeroDetails' sibling) returns
    // Terminal_Belt__c per flight — Nick proved it on the website. One
    // details call per arrival is too many for the whole day, so only the
    // baggage-hall window is enriched: arrivals scheduled within the last
    // 5h or next 3h (what a carousel screen actually shows), nearest first,
    // capped at 40 to stay under the Workers subrequest budget.
    if (page === "arrivals" && merged.length) {
      const now = Date.now();
      const cand = merged
        .map((f) => {
          const t = Date.parse(String(f.ScheduledTime || "") + "-04:00");
          return { f, dt: isNaN(t) ? Infinity : t - now };
        })
        .filter((x) => x.dt > -5 * 3600000 && x.dt < 3 * 3600000)
        .sort((a, b) => Math.abs(a.dt) - Math.abs(b.dt))
        .slice(0, 40);
      await Promise.all(cand.map(async (x) => {
        try {
          const dr = await fetch(YUL_APEX_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": YUL_APEX_UA },
            body: JSON.stringify({
              namespace: "", classname: "@udd/01pMm00000AWKuF", method: "getFlightDetails",
              isContinuation: false, params: { flightNo: x.f.UniqueDisplayNo }, cacheable: false
            })
          });
          if (!dr.ok) return;
          const dj = await dr.json().catch(() => null);
          const belt = dj && dj.returnValue && dj.returnValue.Terminal_Belt__c;
          if (belt != null && belt !== "") x.f.TerminalBelt = String(belt);
        } catch (e) { /* best-effort — a missing belt is just an unenriched row */ }
      }));
    }
    return new Response(JSON.stringify({ list: merged }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse({ error: "YUL feed fetch failed", detail: e && e.message }, 502, origin);
  }
}
__name(handleYulFids, "handleYulFids");

// ════════════════════════════════════════════════════════════════════
// YHU (Montréal Saint-Hubert / MET) — terminal API CORS proxy
// ════════════════════════════════════════════════════════════════════
// The MET terminal's Next.js site exposes a clean JSON API
// (metmtl.com/api/flights/departure|arrival) but sends no CORS header,
// so the board can't read it directly. Fetched server-side and the
// flightsByDate map flattened to { list:[...] } — mapped in the board
// by yhuToAdbFlight(). The feed carries real carousel numbers on
// arrivals, which become baggage belts.
const YHU_FEED_BASE = "https://metmtl.com/api/flights";

// GET /flights/yhu?direction=dep|arr  (or Departure|Arrival)
async function handleYhuFids(request, env, origin, direction) {
  const seg = /^arr/i.test(direction || "") ? "arrival" : "departure";
  try {
    const r = await fetch(`${YHU_FEED_BASE}/${seg}`, {
      headers: { "Accept": "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (!r.ok) {
      const t = (await r.text().catch(() => "")).slice(0, 200);
      return jsonResponse({ error: "YHU feed fetch failed", status: r.status, body: t }, 502, origin);
    }
    const j = await r.json().catch(() => null);
    const byDate = j && j.flightsByDate;
    if (!byDate || typeof byDate !== "object") {
      return jsonResponse({ error: "YHU feed shape unexpected" }, 502, origin);
    }
    const merged = [];
    for (const day of Object.keys(byDate).sort()) {
      if (Array.isArray(byDate[day])) merged.push(...byDate[day]);
    }
    return new Response(JSON.stringify({ list: merged }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse({ error: "YHU feed fetch failed", detail: e && e.message }, 502, origin);
  }
}
__name(handleYhuFids, "handleYhuFids");

// ════════════════════════════════════════════════════════════════════
// YTZ (Toronto Billy Bishop) — server-rendered board scrape
// ════════════════════════════════════════════════════════════════════
// Billy Bishop publishes no JSON API: the departures/arrivals pages carry
// the full board as server-rendered <tr class='item Today|Tomorrow'> rows
// (one "New Time" column, city names only, Porter/AC logo per row,
// codeshares as duplicate rows). This route fetches the page server-side,
// parses the rows, stamps each with its Toronto calendar date, and
// returns { list:[...] } — mapped in the board by ytzToAdbFlight().
const YTZ_PAGE = {
  dep: "https://www.billybishopairport.com/flights/departures/",
  arr: "https://www.billybishopairport.com/flights/arrivals/"
};

// Scraped cells may carry arbitrary markup from the page; a single-pass
// tag strip is not a sanitizer (<scr<script>ipt> survives it — CodeQL).
// Tags are stripped until the string stops changing, then any leftover
// angle brackets are dropped outright: board-bound text has no business
// containing them.
function ytzCellText(raw) {
  let t = String(raw || "");
  let prev;
  do { prev = t; t = t.replace(/<[^>]*>/g, " "); } while (t !== prev);
  return t.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}
__name(ytzCellText, "ytzCellText");

function ytzTorontoDate(offsetDays) {
  const now = new Date(Date.now() + (offsetDays || 0) * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
__name(ytzTorontoDate, "ytzTorontoDate");

// GET /flights/ytz?direction=dep|arr  (or Departure|Arrival)
async function handleYtzFids(request, env, origin, direction) {
  const seg = /^arr/i.test(direction || "") ? "arr" : "dep";
  try {
    const r = await fetch(YTZ_PAGE[seg], {
      headers: { "Accept": "text/html", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (!r.ok) {
      const t = (await r.text().catch(() => "")).slice(0, 200);
      return jsonResponse({ error: "YTZ page fetch failed", status: r.status, body: t }, 502, origin);
    }
    const html = await r.text();
    const dates = { Today: ytzTorontoDate(0), Tomorrow: ytzTorontoDate(1) };
    const list = [];
    const rowRe = /<tr class='item (Today|Tomorrow)' data-flightNo='([^']*)' data-origin='([^']*)'>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(html))) {
      const tds = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let t;
      while ((t = tdRe.exec(m[4]))) tds.push(t[1]);
      // Cells: [day, time, logo, flightNo, city, status]
      const logo = /aircanada-logo/.test(m[4]) ? "AC" : "PD";
      list.push({
        day: m[1],
        date: dates[m[1]] || dates.Today,
        // Time is a strict HH:MM extraction — nothing else can ride along.
        time: (ytzCellText(tds[1]).match(/\b\d{1,2}:\d{2}\b/) || [""])[0],
        flightNo: String(m[2] || "").trim().toUpperCase(),
        city: String(m[3] || "").trim(),
        status: ytzCellText(tds[5]),
        operatorLogo: logo,
        kind: seg
      });
    }
    if (!list.length) return jsonResponse({ error: "YTZ page parsed to zero rows" }, 502, origin);
    // ── GATE ENRICHMENT via FlightAware AeroAPI (departures only). Billy
    // Bishop's own board publishes no gates, but FlightAware carries them
    // (Nick confirmed on the site). Runs ONLY when the AEROAPI_KEY secret
    // exists on the worker — without it this whole block is a no-op, so
    // the route deploys safely before the account exists. Cost control:
    // one scheduled_departures sweep (max 2 pages) per 15 minutes, cached
    // in KV — roughly 200 page-results/day ≈ a dollar or two a day at
    // AeroAPI's published per-page rates, and $0 while there is no key.
    if (seg === "dep" && env.AEROAPI_KEY) {
      try {
        const gkey = "ytz-gates-v1";
        let gates = null;
        const cached = await env.CITY_BG_CACHE.get(gkey, { type: "json" }).catch(() => null);
        if (cached && cached.at && Date.now() - cached.at < 15 * 60000) gates = cached.map;
        if (!gates) {
          gates = {};
          const ar = await fetch("https://aeroapi.flightaware.com/aeroapi/airports/CYTZ/flights/scheduled_departures?max_pages=2", {
            headers: { "x-apikey": env.AEROAPI_KEY, "Accept": "application/json" }
          });
          if (ar.ok) {
            const aj = await ar.json().catch(() => null);
            const flights = (aj && aj.scheduled_departures) || [];
            for (const f of flights) {
              const no = String(f.ident_iata || f.ident || "").replace(/\s+/g, "").toUpperCase();
              if (no && f.gate_origin) gates[no] = String(f.gate_origin);
            }
            await env.CITY_BG_CACHE.put(gkey, JSON.stringify({ at: Date.now(), map: gates }), { expirationTtl: 6 * 3600 }).catch(() => {});
          } else if (cached && cached.map) {
            gates = cached.map;  // stale beats nothing when AeroAPI hiccups
          }
        }
        if (gates) {
          for (const row of list) {
            const g = gates[String(row.flightNo || "").replace(/\s+/g, "")];
            if (g) row.gate = g;
          }
        }
      } catch (e) { /* best-effort — gates are an enrichment, never a failure */ }
    }
    return new Response(JSON.stringify({ list }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        ...corsHeaders(origin)
      }
    });
  } catch (e) {
    return jsonResponse({ error: "YTZ page fetch failed", detail: e && e.message }, 502, origin);
  }
}
__name(handleYtzFids, "handleYtzFids");

// ── PANYNJ (LGA / JFK / EWR) — Port Authority flight boards ─────────────
// All three NY-area airports run the SAME Next.js platform with a GraphQL
// endpoint at /api/graphql on each airport's own domain. Two wrinkles keep
// the browser from calling it directly: no CORS headers, and the request
// body must be LZ-String compressToEncodedURIComponent()-compressed JSON
// sent as text/plain (their client does this in a custom Apollo fetch).
// So the worker speaks their dialect server-side and hands the board plain
// { list:[...] } rows.
//
// Upstream hosts are FIXED constants — the ?ap= param selects from this
// map and nothing else reaches fetch() (same SSRF discipline as /maptiles,
// /logoimg, /miafids).
const PANYNJ_HOSTS = {
  LGA: "www.laguardiaairport.com",
  JFK: "www.jfkairport.com",
  EWR: "www.newarkairport.com"
};

// Minimal LZ-String compressToEncodedURIComponent (pierrec/lz-string,
// MIT). Only the compress direction — we never decode their format.
const _LZ_URI_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
function lzCompressToEncodedURIComponent(uncompressed) {
  if (uncompressed == null) return "";
  const getCharFromInt = (a) => _LZ_URI_CHARS.charAt(a);
  const bitsPerChar = 6;
  let i, value;
  const context_dictionary = {};
  const context_dictionaryToCreate = {};
  let context_c = "";
  let context_wc = "";
  let context_w = "";
  let context_enlargeIn = 2;
  let context_dictSize = 3;
  let context_numBits = 2;
  const context_data = [];
  let context_data_val = 0;
  let context_data_position = 0;
  for (let ii = 0; ii < uncompressed.length; ii += 1) {
    context_c = uncompressed.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
      context_dictionary[context_c] = context_dictSize++;
      context_dictionaryToCreate[context_c] = true;
    }
    context_wc = context_w + context_c;
    if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
      context_w = context_wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
        if (context_w.charCodeAt(0) < 256) {
          for (i = 0; i < context_numBits; i++) {
            context_data_val = context_data_val << 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else context_data_position++;
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 8; i++) {
            context_data_val = context_data_val << 1 | value & 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else context_data_position++;
            value = value >> 1;
          }
        } else {
          value = 1;
          for (i = 0; i < context_numBits; i++) {
            context_data_val = context_data_val << 1 | value;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else context_data_position++;
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 16; i++) {
            context_data_val = context_data_val << 1 | value & 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else context_data_position++;
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        value = context_dictionary[context_w];
        for (i = 0; i < context_numBits; i++) {
          context_data_val = context_data_val << 1 | value & 1;
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else context_data_position++;
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
      context_dictionary[context_wc] = context_dictSize++;
      context_w = String(context_c);
    }
  }
  if (context_w !== "") {
    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
      if (context_w.charCodeAt(0) < 256) {
        for (i = 0; i < context_numBits; i++) {
          context_data_val = context_data_val << 1;
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else context_data_position++;
        }
        value = context_w.charCodeAt(0);
        for (i = 0; i < 8; i++) {
          context_data_val = context_data_val << 1 | value & 1;
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else context_data_position++;
          value = value >> 1;
        }
      } else {
        value = 1;
        for (i = 0; i < context_numBits; i++) {
          context_data_val = context_data_val << 1 | value;
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else context_data_position++;
          value = 0;
        }
        value = context_w.charCodeAt(0);
        for (i = 0; i < 16; i++) {
          context_data_val = context_data_val << 1 | value & 1;
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else context_data_position++;
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
      delete context_dictionaryToCreate[context_w];
    } else {
      value = context_dictionary[context_w];
      for (i = 0; i < context_numBits; i++) {
        context_data_val = context_data_val << 1 | value & 1;
        if (context_data_position == bitsPerChar - 1) {
          context_data_position = 0;
          context_data.push(getCharFromInt(context_data_val));
          context_data_val = 0;
        } else context_data_position++;
        value = value >> 1;
      }
    }
    context_enlargeIn--;
    if (context_enlargeIn == 0) {
      context_enlargeIn = Math.pow(2, context_numBits);
      context_numBits++;
    }
  }
  value = 2;
  for (i = 0; i < context_numBits; i++) {
    context_data_val = context_data_val << 1 | value & 1;
    if (context_data_position == bitsPerChar - 1) {
      context_data_position = 0;
      context_data.push(getCharFromInt(context_data_val));
      context_data_val = 0;
    } else context_data_position++;
    value = value >> 1;
  }
  while (true) {
    context_data_val = context_data_val << 1;
    if (context_data_position == bitsPerChar - 1) {
      context_data.push(getCharFromInt(context_data_val));
      break;
    } else context_data_position++;
  }
  return context_data.join("");
}
__name(lzCompressToEncodedURIComponent, "lzCompressToEncodedURIComponent");

const PANYNJ_DEP_QUERY = `query GetDepartingFlights(
  $departureAirport: String!
  $departureDateTime: String!
  $destinationAirport: String
  $carrierCode: String
  $limit: Int
  $after: String
) {
  getDepartingFlights(
    departureAirport: $departureAirport
    departureDateTime: $departureDateTime
    destinationAirport: $destinationAirport
    carrierCode: $carrierCode
    limit: $limit
    after: $after
  ) {
    data {
      dateScheduled
      timeScheduled
      dateRevised
      timeRevised
      destinationName
      destinationAirportCode
      airlineCode
      airlineName
      flightNumber
      terminal
      gate
      status
    }
    paging {
      next
    }
  }
}
`;
const PANYNJ_ARR_QUERY = `query GetArrivingFlights(
  $arrivalAirport: String!
  $arrivalDateTime: String!
  $originAirport: String
  $carrierCode: String
  $limit: Int
  $after: String
) {
  getArrivingFlights(
    arrivalAirport: $arrivalAirport
    arrivalDateTime: $arrivalDateTime
    originAirport: $originAirport
    carrierCode: $carrierCode
    limit: $limit
    after: $after
  ) {
    data {
      dateScheduled
      timeScheduled
      dateRevised
      timeRevised
      originName
      originAirportCode
      airlineCode
      airlineName
      flightNumber
      terminal
      gate
      status
      isInternationalFlight
    }
    paging {
      next
    }
  }
}
`;

// GET /flights/panynj?ap=LGA|JFK|EWR&direction=dep|arr
// Returns { list:[...] } (today's full board, all pages merged) with CORS.
// Edge-cached 60s per airport+direction so a wall of screens polling
// together costs the Port Authority one paginated sweep.
async function handlePanynjFids(request, env, origin, ap, direction) {
  const host = PANYNJ_HOSTS[ap];
  if (!host) return jsonResponse({ error: "Unknown PANYNJ airport", ap }, 400, origin);
  const isArr = /^arr/i.test(direction || "");
  // "Today" on the airport's own clock (America/New_York), not UTC — a
  // 11 PM EDT board asking for the UTC date would show tomorrow.
  let nyDate;
  try {
    nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  } catch (e) {
    nyDate = new Date().toISOString().slice(0, 10);
  }
  // Manual edge cache (the upstream call is a POST, which cf caching skips).
  const cacheKey = new Request(`https://panynj-fids.cache/${ap}/${isArr ? "arr" : "dep"}/${nyDate}`);
  const cache = caches.default;
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "X-Panynj-Cache": "hit", ...corsHeaders(origin) }
      });
    }
  } catch (e) {}
  const opName = isArr ? "GetArrivingFlights" : "GetDepartingFlights";
  const dataKey = isArr ? "getArrivingFlights" : "getDepartingFlights";
  const query = isArr ? PANYNJ_ARR_QUERY : PANYNJ_DEP_QUERY;
  const merged = [];
  let after = "";
  let firstErr = null;
  // 500/page; 8 pages = 4000 rows. JFK arrivals measured 2879 rows on a
  // July Wednesday (codeshares inflate ~4x), so 6 pages was uncomfortably
  // close to clipping. The loop exits early when paging.next is empty.
  for (let page = 0; page < 8; page++) {
    const variables = isArr
      ? { arrivalAirport: ap, arrivalDateTime: nyDate, limit: 500, after }
      : { departureAirport: ap, departureDateTime: nyDate, limit: 500, after };
    const body = lzCompressToEncodedURIComponent(JSON.stringify({ operationName: opName, variables, query }));
    try {
      const r = await fetch(`https://${host}/api/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "Accept": "*/*",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
          "Origin": `https://${host}`,
          "Referer": `https://${host}/flights`
        },
        body
      });
      if (!r.ok) {
        if (!firstErr) firstErr = { page, status: r.status, body: (await r.text().catch(() => "")).slice(0, 200) };
        break;
      }
      const j = await r.json().catch(() => null);
      const block = j && j.data && j.data[dataKey];
      const rows = block && Array.isArray(block.data) ? block.data : [];
      merged.push(...rows);
      after = (block && block.paging && block.paging.next) || "";
      if (!after || !rows.length) break;
    } catch (e) {
      if (!firstErr) firstErr = { page, error: e && e.message };
      break;
    }
  }
  if (!merged.length && firstErr) {
    return jsonResponse({ error: "PANYNJ feed fetch failed", ap, ...firstErr }, 502, origin);
  }
  const payload = JSON.stringify({ list: merged, ap, direction: isArr ? "arr" : "dep", date: nyDate });
  try {
    await cache.put(cacheKey, new Response(payload, {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }
    }));
  } catch (e) {}
  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "X-Panynj-Cache": "miss", ...corsHeaders(origin) }
  });
}
__name(handlePanynjFids, "handlePanynjFids");

var fids_proxy_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    await seedAdmin(env);
    const path = url.pathname;
    if (path === "/auth/login" && request.method === "POST") {
      return handleLogin(request, env, origin);
    }
    if (path === "/") {
      return jsonResponse({
        status: "online",
        message: "FIDS Proxy API is running. Please use specific endpoints."
      }, 200, origin);
    }

    // ── PUBLIC airport-config reads (no auth — FIDS screens hit these on boot) ──
    {
      const m1 = path.match(/^\/api\/airport-config\/([A-Za-z0-9]+)$/);
      if (m1 && request.method === "GET") return handleGetAirport(env, origin, m1[1]);
      const m2 = path.match(/^\/api\/airline-override\/([A-Za-z0-9]+)$/);
      if (m2 && request.method === "GET") return handleListAirlineOverrides(env, origin, m2[1]);
      // Public read of media config — gate displays need this on boot to know
      // which videos/ads/etc to render. Admin-only writes happen below.
      if (path === "/api/media-config" && request.method === "GET") {
        return handleGetMediaConfig(env, origin);
      }
      // Public reads of the new library + assignments. Library has all
      // available items (uploads + YouTube refs); assignments map airline
      // codes to item ids + rotation mode. Both are read by the consumer
      // code on every gate-display load.
      if (path === "/api/media-library" && request.method === "GET") {
        return handleGetMediaLibrary(env, origin);
      }
      if (path === "/api/media-assignments" && request.method === "GET") {
        return handleGetMediaAssignments(env, origin);
      }
    }

    // ⚠️ THIS GATE IS OPT-IN, NOT DEFAULT-DENY. It only protects paths under
    // /auth/users or /api/. ANY route registered outside those prefixes is
    // PUBLIC BY CONSTRUCTION — which is how six destructive endpoints ended up
    // reachable with no credentials (fixed v23169; see docs/OPERATIONS-BRIEF.md).
    // Put new admin routes UNDER /api/ so they inherit this, or guard them
    // explicitly with requireOpsSecret(). Do not assume anything is protected.
    if (path.startsWith("/auth/users") || path.startsWith("/api/")) {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "Authentication required" }, 401, origin);
      }
      const token = authHeader.replace("Bearer ", "");
      const payload = await verifyJwt(token, env.JWT_SECRET);
      if (!payload) {
        return jsonResponse({ error: "Invalid or expired token" }, 401, origin);
      }
      if (path === "/auth/users" && request.method === "GET") {
        return handleListUsers(request, env, payload, origin);
      }
      if (path === "/auth/users" && request.method === "POST") {
        return handleCreateUser(request, env, payload, origin);
      }
      if (path.match(/^\/auth\/users\/[^/]+$/) && request.method === "PUT") {
        const username = path.split("/").pop();
        return handleUpdateUser(request, env, payload, origin, username);
      }
      if (path.match(/^\/auth\/users\/[^/]+$/) && request.method === "DELETE") {
        const username = path.split("/").pop();
        return handleDeleteUser(request, env, payload, origin, username);
      }

      // ── NEW v10.0: airport-config admin endpoints ──
      if (path === "/api/airport-config" && request.method === "GET") return handleListAirports(env, origin);
      const apMatch = path.match(/^\/api\/airport-config\/([A-Za-z0-9]+)$/);
      if (apMatch && request.method === "PUT") return handlePutAirport(request, env, payload, origin, apMatch[1]);
      if (apMatch && request.method === "DELETE") return handleDeleteAirport(env, payload, origin, apMatch[1]);

      const apLogoMatch = path.match(/^\/api\/airport-config\/([A-Za-z0-9]+)\/logo$/);
      if (apLogoMatch && request.method === "POST") return handleUploadAirportLogo(request, env, payload, origin, apLogoMatch[1]);
      const ovMatch = path.match(/^\/api\/airline-override\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/);
      if (ovMatch && request.method === "PUT") return handlePutAirlineOverride(request, env, payload, origin, ovMatch[1], ovMatch[2]);
      if (ovMatch && request.method === "DELETE") return handleDeleteAirlineOverride(env, payload, origin, ovMatch[1], ovMatch[2]);
      const ovLogoMatch = path.match(/^\/api\/airline-override\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)\/logo$/);
      if (ovLogoMatch && request.method === "POST") return handleUploadAirlineLogo(request, env, payload, origin, ovLogoMatch[1], ovLogoMatch[2]);

      // ── Media config admin endpoints ──
      // Admin writes to /api/media-config replace the entire media doc atomically.
      // Public reads come in via the no-auth block above.
      if (path === "/api/media-config" && request.method === "PUT") {
        return handlePutMediaConfig(request, env, payload, origin);
      }

      // ── Media library admin endpoints ──
      // POST /api/media-library/youtube — add a YouTube ref (no upload)
      // POST /api/media-library/upload  — upload binary file to R2
      // DELETE /api/media-library/{id}  — remove an item
      // PUT /api/media-assignments      — save airline → item id mapping
      if (path === "/api/media-library/youtube" && request.method === "POST") {
        return handleAddYouTubeLibraryItem(request, env, payload, origin);
      }
      if (path === "/api/media-library/upload" && request.method === "POST") {
        return handleUploadLibraryItem(request, env, payload, origin, url);
      }
      const libDelMatch = path.match(/^\/api\/media-library\/([A-Za-z0-9-]+)$/);
      if (libDelMatch && request.method === "DELETE") {
        return handleDeleteLibraryItem(env, payload, origin, libDelMatch[1]);
      }
      if (libDelMatch && request.method === "PATCH") {
        return handlePatchLibraryItem(request, env, payload, origin, libDelMatch[1]);
      }
      if (path === "/api/media-assignments" && request.method === "PUT") {
        return handlePutMediaAssignments(request, env, payload, origin);
      }
      // ── Vecteezy stock endpoints (admin-only, credentials stay server-side) ──
      // GET  /api/vecteezy/search?term=…&content_type=… — proxied search
      // POST /api/vecteezy/import                        — copy a resource into the library
      if (path === "/api/vecteezy/search" && request.method === "GET") {
        return handleVecteezySearch(env, payload, origin, url);
      }
      if (path === "/api/vecteezy/import" && request.method === "POST") {
        return handleVecteezyImport(request, env, payload, origin);
      }
      // ── Gate theme admin endpoint ──
      // Admin writes the full theme atomically. Public reads are no-auth above.
      if (path.startsWith("/api/adb/")) {
        return handleApiProxy(request, env, url, origin);
      }
    }
    if (path.startsWith("/proxy/")) {
      const adbPath = path.replace("/proxy/", "");
      const _authResp = await maybeServeAuthorityWindow(adbPath, url, env, origin);
      if (_authResp) return _authResp;
      const adbUrl = `https://aerodatabox.p.rapidapi.com/${adbPath}${url.search}`;
      try {
        const response = await fetch(adbUrl, {
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            "Cache-Control": "public, max-age=60",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Proxy failed" }, 502, origin);
      }
    }
    if (path === "/ai/citybg" && request.method === "GET") {
      const iata = url.searchParams.get("iata");
      if (!iata) {
        return jsonResponse({ error: "iata parameter required" }, 400, origin);
      }
      const cacheKey = `citybg:${iata.toUpperCase()}`;
      try {
        const cached = await env.CITY_BG_CACHE.get(cacheKey, { type: "arrayBuffer" });
        if (cached) {
          return new Response(cached, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400",
              "X-Cache": "HIT",
              ...corsHeaders(origin)
            }
          });
        }
      } catch (e) {
      }
      const CITY_NAMES = {
        YYZ: "Toronto", YTZ: "Toronto", YUL: "Montreal", YVR: "Vancouver", YOW: "Ottawa", YQB: "Quebec City",
        YWG: "Winnipeg", YEG: "Edmonton", YYC: "Calgary", YHZ: "Halifax", YQM: "Moncton", YFC: "Fredericton",
        YSJ: "Saint John", YYT: "St. John's", YYG: "Charlottetown", YYJ: "Victoria", YLW: "Kelowna",
        YQR: "Regina", YXE: "Saskatoon", YXU: "London", JFK: "New York", LGA: "New York", EWR: "Newark",
        LAX: "Los Angeles", SFO: "San Francisco", ORD: "Chicago", ATL: "Atlanta", DFW: "Dallas",
        SEA: "Seattle", BOS: "Boston", MIA: "Miami", FLL: "Fort Lauderdale", MCO: "Orlando",
        DCA: "Washington DC", IAD: "Washington DC", MSP: "Minneapolis", CLT: "Charlotte",
        DTW: "Detroit", PHL: "Philadelphia", DEN: "Denver", PHX: "Phoenix", LAS: "Las Vegas",
        SAN: "San Diego", TPA: "Tampa", LHR: "London", LGW: "London", CDG: "Paris", FRA: "Frankfurt",
        AMS: "Amsterdam", MAD: "Madrid", BCN: "Barcelona", FCO: "Rome", DUB: "Dublin", LIS: "Lisbon",
        NRT: "Tokyo", HND: "Tokyo", SIN: "Singapore", HKG: "Hong Kong", BKK: "Bangkok", DXB: "Dubai",
        DOH: "Doha", IST: "Istanbul", SYD: "Sydney", MEL: "Melbourne", AKL: "Auckland", CUN: "Cancun",
        PUJ: "Punta Cana", MBJ: "Montego Bay", NAS: "Nassau", PVR: "Puerto Vallarta", HNL: "Honolulu",
        SXM: "St Maarten", KEF: "Reykjavik", CPH: "Copenhagen", ARN: "Stockholm", HEL: "Helsinki",
        OSL: "Oslo", ZRH: "Zurich", VIE: "Vienna", MUC: "Munich", BRU: "Brussels",
        YMJ: "Mont-Joli", YDF: "Deer Lake", YQY: "Sydney NS", YCH: "Miramichi", YBG: "Bagotville",
        YQT: "Thunder Bay", YAM: "Sault Ste Marie"
      };
      const CITY_INFO = {
        YYZ: { name: "Toronto", desc: "Toronto Canada Fairmont Royal York and Union Station aerial view, CN Tower prominent in center, curved Lake Ontario waterfront, Rogers Centre dome visible, financial district glass towers, Billy Bishop airport island in distance" },
        YTZ: { name: "Toronto", desc: "Toronto Canada waterfront Fairmont Royal York and Union Station from Toronto Islands, CN Tower dominating skyline, harbour with sailboats, city skyline reflected in Lake Ontario" },
        YUL: { name: "Montreal", desc: "Montreal Quebec Canada Fairmont Queen Elizabeth and Sofitel Golden Mile aerial view, Mount Royal park with cross on top, Olympic Stadium tower in east end, old stone buildings of Old Montreal along Saint Lawrence River, Jacques Cartier Bridge" },
        YVR: { name: "Vancouver", desc: "Vancouver British Columbia Canada aerial, Fairmont Hotel Vancouver, Fairmont Waterfront, Fairmonts snow-capped North Shore mountains behind glass tower skyline, Canada Place white sail roof, Stanley Park green peninsula, cruise ships in harbour" },
        YOW: { name: "Ottawa", desc: "Ottawa Ontario Canada aerial, Gothic revival Parliament Hill with Peace Tower clock tower on cliff above Ottawa River, green copper roof Chateau Laurier hotel, Rideau Canal locks, flat Canadian landscape" },
        YQB: { name: "Quebec City", desc: "Quebec City Canada aerial, Fairmont Chateau Frontenac grand castle hotel on cliff, old walled European-style city, Saint Lawrence River, Dufferin Terrace boardwalk, stone fortification walls, narrow cobblestone streets below" },
        YWG: { name: "Winnipeg", desc: "Winnipeg Manitoba Canada aerial, distinctive angular glass Canadian Museum for Human Rights, The Forks junction of Red River and Assiniboine River, flat prairie landscape, Manitoba Legislative Building golden dome" },
        YEG: { name: "Edmonton", desc: "Edmonton Alberta Canada aerial, deep North Saskatchewan River valley cutting through city, glass office towers downtown, High Level Bridge spanning valley, flat Alberta prairies" },
        YYC: { name: "Calgary", desc: "Calgary Alberta Canada aerial, Calgary Tower needle, Bow River winding through downtown, snow-capped Rocky Mountains visible on western horizon, modern glass skyscrapers, Saddledome arena" },
        YHZ: { name: "Halifax", desc: "Halifax Nova Scotia Westin Nova Scotian Canada aerial, view from Dartmouth with the McDonald bridge and Halifax skyline in view, 3 apartment towers (vasiline towers )in view (around naval vase) container port, historic stone and brick waterfront buildings" },
        YQM: { name: "Moncton", desc: "Moncton New Brunswick Canada aerial, Assumption Place complex and Acadian roots with festivals, muddy brown Petitcodiac River with tidal bore, low-rise downtown Main Street, Assumption Place, Blue Cross Complex, Residence Inn, Crowne Plaza Moncton Downtown, Avenir Centre, Bore Park riverside, Assumption Boulevard, flat Tantramar marshes in distance, small Maritime city" },
        YFC: { name: "Fredericton", desc: "Fredericton New Brunswick Canada aerial, wide Saint John River, silver-domed New Brunswick Legislative Assembly building, University of New Brunswick campus on hill, green elm-lined streets, small government town" },
        YSJ: { name: "Saint John", desc: "Saint John New Brunswick Canada aerial, rocky Bay of Fundy harbour with container ships, Reversing Falls gorge, uptown stone and brick Victorian buildings on hills, Irving refinery smokestacks in distance" },
        YYT: { name: "St. John's", desc: "St John's Newfoundland Canada aerial, Signal Hill with Cabot Tower, famous colourful painted row houses of Jellybean Row, narrow harbour entrance called The Narrows, Atlantic Ocean, steep hillside streets" },
        YYG: { name: "Charlottetown", desc: "Charlottetown Prince Edward Island Canada aerial (Delta Prince Edward), red sandstone Province House birthplace of Confederation, Victoria Row restaurants, small harbour with fishing boats, red brick heritage buildings, flat farmland beyond" },
        YYJ: { name: "Victoria", desc: "Victoria British Columbia Canada aerial, Fairmont Empress and British Columbia Parliament Buildings with copper domes lit up, Inner Harbour with float planes, ivy- covered Empress Hotel, flower baskets on lamp posts, Pacific ocean" },
        JFK: { name: "New York", desc: "New York City aerial, Manhattan island packed with skyscrapers, The Plaza Empire State Building and One World Trade Center Freedom Tower, Central Park green rectangle, Brooklyn Bridge over East River, Hudson River" },
        LGA: { name: "New York", desc: "New York City Manhattan skyline aerial from Queens, East River bridges, dense skyscraper canyon, Central Park The Plaza, Chrysler Building art deco spire" },
        LAX: { name: "Los Angeles", desc: "Los Angeles California aerial, downtown LA cluster of glass skyscrapers, Hollywood Hills with Hollywood sign, endless urban sprawl, palm tree lined boulevards, Pacific Ocean coast in distance" },
        SFO: { name: "San Francisco", desc: "San Francisco California aerial, red Golden Gate Bridge spanning bay, Transamerica Pyramid tower, steep hill streets, fog rolling in from Pacific, Victorian painted lady houses, Alcatraz island in bay" },
        ORD: { name: "Chicago", desc: "Chicago Illinois aerial, Willis Tower Sears Tower black skyscraper, Chicago River winding through downtown, Lake Michigan blue shoreline, Millennium Park with reflective Cloud Gate Bean sculpture, Navy Pier" },
        MIA: { name: "Miami", desc: "Miami Florida aerial, South Beach strip of white art deco hotels along turquoise Atlantic Ocean, Biscayne Bay with causeways, palm trees, cruise ship port, pastel coloured buildings" },
        LHR: { name: "London", desc: "London England aerial, Big Ben Elizabeth Tower and Houses of Parliament along River Thames, Tower Bridge, The Shard glass pyramid, London Eye ferris wheel, Westminster Abbey, red double decker buses" },
        CDG: { name: "Paris", desc: "Accor Paris Headquarters or Disneylandn Paris, or Paris France aerial, Eiffel Tower iron lattice tower center frame, Seine River with stone bridges, Arc de Triomphe, Haussmann limestone buildings with zinc roofs, Notre-Dame cathedral" },
        NRT: { name: "Tokyo", desc: "Tokyo Japan aerial, Tokyo Tower red lattice, Tokyo Disneyland can also be included realisic dense urban landscape stretching to horizon, Mount Fuji snow cap in far distance, neon-lit Shibuya and Shinjuku districts, Imperial Palace green gardens" },
        MCO: { name: "Orlando", desc: "Orlando Florida, aerial view of Epcot Center (realisitc photo from early opening 1982), monorail, countries, spaceship earth, universe of energy, world of motion, the land, imagination pavilion, communicore" },
        DXB: { name: "Dubai", desc: "Dubai UAE aerial, Burj Khalifa worlds tallest building piercing clouds, Palm Jumeirah artificial island, desert sand meeting ultramodern glass towers, turquoise Persian Gulf water" },
        SIN: { name: "Singapore", desc: "Singapore aerial, Marina Bay Sands three-tower hotel with rooftop infinity pool, Gardens by the Bay illuminated supertree grove, Singapore Flyer ferris wheel, clean modern tropical city" },
        HKG: { name: "Hong Kong", desc: "Hong Kong aerial, Victoria Harbour between Kowloon and Hong Kong Island, incredibly dense skyscrapers on steep mountainside, Star Ferry crossing harbour, Victoria Peak above" },
        SYD: { name: "Sydney", desc: "Sydney Australia aerial, Sydney Opera House white shell roof sails on harbour point, Sydney Harbour Bridge steel arch, Circular Quay ferries, blue harbour water, Royal Botanic Gardens" },
        FCO: { name: "Rome", desc: "Rome Italy aerial, ancient Colosseum amphitheatre, St Peters Basilica massive dome in Vatican, Roman Forum ruins, terracotta tile rooftops, Tiber River, cypress trees" },
        BCN: { name: "Barcelona", desc: "Barcelona Spain aerial, Sagrada Familia tall ornate spires still under construction, grid pattern Eixample district, Gothic Quarter medieval streets, Mediterranean Sea coastline, La Rambla boulevard" },
        IST: { name: "Istanbul", desc: "Istanbul Turkey aerial, Blue Mosque six minarets and cascading domes, Hagia Sophia massive dome with four minarets, Bosphorus strait with ships, Golden Horn waterway, Grand Bazaar rooftops" },
        CUN: { name: "Cancun", desc: "Cancun Mexico aerial, thin hotel zone strip of land between turquoise Caribbean Sea and Nichupte Lagoon, white sand beaches, resort towers, tropical palm trees" },
        HNL: { name: "Honolulu", desc: "Honolulu Hawaii aerial,  Ala Moana Honolulu by Mantra - Accor and Diamond Head volcanic crater, Waikiki Beach curve of white sand and turquoise Pacific water, high-rise hotels, green tropical mountains behind" },
        OGG: { name: "Maui", desc: "Maui Hawaii aerial,  Fairmont Kea Lani - Accor and brown tan curve of sand and turquoise Pacific water, luxurious resorts well manicured high maintenance area, green tropical mountains behind" },
        KEF: { name: "Reykjavik", desc: "Reykjavik Iceland aerial, Hallgrimskirkja church tall concrete spire, colourful corrugated iron houses, small harbour, volcanic landscape, Northern Atlantic ocean, no trees" },
        SEA: { name: "Seattle", desc: "Seattle Washington aerial, Space Needle futuristic tower, massive snow-covered Mount Rainier volcano in background, Pike Place Market neon sign area, Puget Sound water, green evergreen trees" },
        BOS: { name: "Boston", desc: "Boston Massachusetts aerial, Boston Harbor waterfront, red brick Faneuil Hall, brownstone row houses of Back Bay, Charles River with sailboats, historic colonial architecture" },
        DEN: { name: "Denver", desc: "Denver Colorado aerial, dramatic snow-capped Rocky Mountains wall behind city, Union Station beaux-arts building, Mile High Stadium, downtown glass towers on flat plains" },
        ATL: { name: "Atlanta", desc: "Atlanta Georgia aerial, downtown cluster of glass skyscrapers, Centennial Olympic Park green space, Georgia State Capitol gold dome, sprawling tree-covered suburbs" },
        DFW: { name: "Dallas", desc: "Dallas Texas aerial, Reunion Tower geodesic ball on tower, downtown glass skyscrapers reflecting sunset, Margaret Hunt Hill Bridge white arch, Trinity River, flat Texas landscape" },
        LAS: { name: "Las Vegas", desc: "Las Vegas Nevada aerial at dusk, The Strip boulevard of casino resorts lit up with neon, desert mountains surrounding valley, Bellagio fountains, replica Eiffel Tower" },
        PUJ: { name: "Punta Cana", desc: "Punta Cana Dominican Republic aerial, white sand beach with palm trees leaning over turquoise Caribbean water, thatched roof resort buildings, coral reef visible in clear shallow water" },
        MBJ: { name: "Montego Bay", desc: "Montego Bay Jamaica aerial, Doctor's Cave Beach white sand crescent, tropical green hills rising behind town, Caribbean turquoise blue water, colourful buildings along Hip Strip" }
      };
      const info = CITY_INFO[iata.toUpperCase()];
      const cityName = info ? info.name : CITY_NAMES[iata.toUpperCase()] || iata;
      const desc = info ? info.desc : cityName + " city aerial view, buildings, streets, natural landscape";
      const prompt = `${desc}. Sharp high-resolution professional photograph, 8K quality, crisp fine details, no blur, no soft focus, no artifacts. Professional realistic photography must compare to real life images it can also be scenic from nature if appropriate matching the time of day. If Accor has one of their 30+ brands in that city real life hotels aka Fairmont, Novotel, Sofitel, etc put the hotel in focus and but if not available detailed info from each location based on real life photos, golden hour warm lighting, ultra high resolution, photorealistic, National Geographic quality, no text, no watermarks, no illustration, no painting.`;
      try {
        const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
          prompt,
          num_steps: 8
        });
        const b64 = result.image || result;
        let imageBytes;
        if (typeof b64 === "string") {
          const binaryStr = atob(b64);
          imageBytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            imageBytes[i] = binaryStr.charCodeAt(i);
          }
        } else {
          imageBytes = b64;
        }
        const contentType = imageBytes[0] === 255 && imageBytes[1] === 216 ? "image/jpeg" : "image/png";
        try {
          await env.CITY_BG_CACHE.put(cacheKey, imageBytes.buffer || imageBytes, { expirationTtl: 604800 });
        } catch (cacheErr) {
        }
        return new Response(imageBytes, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        try {
          const result2 = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
            prompt
          });
          const b64_2 = result2.image || result2;
          let imageBytes2;
          if (typeof b64_2 === "string") {
            const binaryStr2 = atob(b64_2);
            imageBytes2 = new Uint8Array(binaryStr2.length);
            for (let i = 0; i < binaryStr2.length; i++) {
              imageBytes2[i] = binaryStr2.charCodeAt(i);
            }
          } else {
            imageBytes2 = b64_2;
          }
          return new Response(imageBytes2, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400",
              ...corsHeaders(origin)
            }
          });
        } catch (e2) {
          return jsonResponse({ error: "AI generation failed", flux: e.message, sdxl: e2.message }, 500, origin);
        }
      }
    }
    if (path === "/ai/hotelbg" && request.method === "GET") {
      const hotelName = (url.searchParams.get("name") || "").trim();
      const city = (url.searchParams.get("city") || "").trim();
      if (!hotelName) {
        return jsonResponse({ error: "name parameter required" }, 400, origin);
      }
      const hotelCacheKey = `hotelbg:${(hotelName + "|" + city).toLowerCase().replace(/\s+/g, "-").slice(0, 200)}`;
      try {
        const cached = await env.CITY_BG_CACHE.get(hotelCacheKey, { type: "arrayBuffer" });
        if (cached && cached.byteLength > 1000) {
          return new Response(cached, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=2592000",
              "X-Cache": "HIT",
              ...corsHeaders(origin)
            }
          });
        }
      } catch (e) {
      }
      const hotelPrompt = `Sharp high-resolution professional photograph of ${hotelName} hotel exterior in ${city || "a city"}. `
                       + `Wide architectural shot, daytime, blue sky, real-life building photo, 8K quality, crisp fine details, `
                       + `no blur, no soft focus, photorealistic, National Geographic quality, no people, no text, no watermarks, `
                       + `no illustration, no painting. Match the actual real-world appearance of this specific hotel property.`;
      try {
        const hotelResult = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
          prompt: hotelPrompt,
          num_steps: 8
        });
        const b64h = hotelResult.image || hotelResult;
        let hotelBytes;
        if (typeof b64h === "string") {
          const binStr = atob(b64h);
          hotelBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            hotelBytes[i] = binStr.charCodeAt(i);
          }
        } else {
          hotelBytes = b64h;
        }
        const hotelContentType = hotelBytes[0] === 255 && hotelBytes[1] === 216 ? "image/jpeg" : "image/png";
        try {
          await env.CITY_BG_CACHE.put(hotelCacheKey, hotelBytes.buffer || hotelBytes, {
            expirationTtl: 2592000
          });
        } catch (cacheErr) {
        }
        return new Response(hotelBytes, {
          headers: {
            "Content-Type": hotelContentType,
            "Cache-Control": "public, max-age=2592000",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Hotel image generation failed", details: e.message }, 500, origin);
      }
    }
    if (path === "/ai/destination-info" && request.method === "GET") {
      const iata = url.searchParams.get("iata");
      const city = url.searchParams.get("city") || iata;
      const lang = url.searchParams.get("lang") || "en";
      if (!iata) {
        return jsonResponse({ error: "iata parameter required" }, 400, origin);
      }
      const cacheKey = `destinfo2:${iata.toUpperCase()}:${lang}`;
      try {
        const cached = await env.CITY_BG_CACHE.get(cacheKey, { type: "text" });
        if (cached) {
          return jsonResponse(JSON.parse(cached), 200, origin);
        }
      } catch (e) {
      }
      const LANG_MAP = {
        en: "Respond entirely in English.",
        fr: "Respond entirely in French. ALL text in the JSON must be in French.",
        es: "Respond entirely in Spanish. ALL text in the JSON must be in Spanish.",
        de: "Respond entirely in German. ALL text in the JSON must be in German.",
        it: "Respond entirely in Italian. ALL text in the JSON must be in Italian.",
        pt: "Respond entirely in Portuguese. ALL text in the JSON must be in Portuguese.",
        ja: "Respond entirely in Japanese. ALL text in the JSON must be in Japanese.",
        zh: "Respond entirely in Simplified Chinese. ALL text in the JSON must be in Chinese.",
        ar: "Respond entirely in Arabic. ALL text in the JSON must be in Arabic."
      };
      const langInstruction = LANG_MAP[lang] || LANG_MAP.en;
      const prompt = `You are a travel information assistant for an airport flight display system. Generate interesting, useful destination information for passengers flying to ${city}. ${langInstruction}

Return ONLY valid JSON with no markdown, no backticks, no explanation. Format:
{
  "funFacts": ["fact1", "fact2", "fact3", "fact4", "fact5"],
  "travelTips": ["tip1", "tip2", "tip3"],
  "quickInfo": {
    "currency": "currency name and code",
    "language": "main languages spoken",
    "timezone": "timezone abbreviation and UTC offset",
    "bestTime": "best months to visit",
    "avgTemp": "typical temperature range"
  },
  "weatherTip": "One sentence about what to pack or expect weather-wise right now",
  "airportTip": "One useful tip about the destination airport (connections, transit time, terminal info)",
  "hotels": [
    {"name": "Hotel Name", "brand": "Brand or chain", "stars": 5, "distance": "5 km from airport", "description": "One line about the hotel"},
    {"name": "Hotel Name", "brand": "Brand", "stars": 4, "distance": "12 km", "description": "One line"},
    {"name": "Hotel Name", "brand": "Brand", "stars": 4, "distance": "8 km", "description": "One line"},
    {"name": "Hotel Name", "brand": "Brand", "stars": 3, "distance": "15 km", "description": "One line"}
  ],
  "attractions": [
    {"name": "Attraction Name", "icon": "emoji", "category": "Landmark", "distance": "20 km from airport", "description": "One line about it"},
    {"name": "Attraction Name", "icon": "emoji", "category": "Nature", "distance": "30 km", "description": "One line"},
    {"name": "Attraction Name", "icon": "emoji", "category": "Culture", "distance": "18 km", "description": "One line"},
    {"name": "Attraction Name", "icon": "emoji", "category": "Food & Dining", "distance": "15 km", "description": "One line"},
    {"name": "Attraction Name", "icon": "emoji", "category": "Shopping", "distance": "10 km", "description": "One line"}
  ]
}

IMPORTANT RULES:
- Hotels must be REAL, well-known hotels that actually exist near ${city}. Include a mix of luxury (5-star), upscale (4-star), and mid-range (3-star). Do NOT include any Accor brand hotels (Fairmont, Sofitel, Novotel, Ibis, Mercure, Pullman, Swissotel, Movenpick, Raffles, MGallery, Banyan Tree, etc.) as those are handled separately. Focus on Marriott, Hilton, Hyatt, IHG, Four Seasons, Ritz-Carlton, Westin, Sheraton, Holiday Inn, Best Western, independent/boutique hotels.
- Attractions must be REAL places that actually exist — landmarks, museums, parks, markets, beaches, neighborhoods, restaurants, viewpoints.
- Use appropriate emoji icons for attractions.
- Distances should be approximate distance from the airport.
- Keep all text concise — one sentence maximum per description.
- Fun facts should be interesting and surprising — things passengers would enjoy reading while waiting at the gate. Keep tips practical.
- ALL text in the JSON must be in the requested language.`;
      try {
        const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1200
        });
        let text = result.response || "";
        text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (parseErr) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            return jsonResponse({ error: "AI returned invalid JSON", raw: text.substring(0, 200) }, 500, origin);
          }
        }
        try {
          await env.CITY_BG_CACHE.put(cacheKey, JSON.stringify(parsed), { expirationTtl: 2592e3 });
        } catch (cacheErr) {
        }
        return jsonResponse(parsed, 200, origin);
      } catch (e) {
        console.error("destination-info", { iata, city, lang, error: e?.message || String(e) });
return jsonResponse({ hotels: [], attractions: [], iata, city, lang, status: "unavailable" }, 200, origin);

      }
    }
    if (path === "/admin/clear-cache" && request.method === "GET") {
      // v23169 — was reachable with no credentials: the cache wipe — a GET with destructive side effects, so a crawler or link preview could fire it.
      { const _gate = requireOpsSecret(url, env, origin); if (_gate) return _gate; }
      try {
        let deleted = 0;
        let cursor = undefined;
        do {
          const listOpts = { limit: 1000 };
          if (cursor) listOpts.cursor = cursor;
          const list = await env.CITY_BG_CACHE.list(listOpts);
          for (const key of list.keys) {
            await env.CITY_BG_CACHE.delete(key.name);
            deleted++;
          }
          cursor = list.list_complete ? undefined : list.cursor;
        } while (cursor);
        return jsonResponse({ success: true, deleted: deleted, message: `Cleared ${deleted} cached items. New images and destination info will regenerate on next request.` }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Cache clear failed", details: e.message }, 500, origin);
      }
    }
    // ── ADS-B LIVE POSITIONS (proxied + cached) ───────────────────────────
    // GET /adsb/hex/{icao24} | /adsb/reg/{tail} | /adsb/callsign/{cs}
    //
    // WHY THIS EXISTS. The boards used to call the ADS-B feed DIRECTLY from the
    // browser. Two things broke that: the provider now returns 403 to
    // unregistered callers, and it sends no Access-Control-Allow-Origin, so the
    // browser blocks the response regardless. Every downstream feature went
    // quiet at once — the map fell back to clock estimates, the runway-aligned
    // final never drew (it needs a live fix within 25nm), "landed" never fired
    // (a ground fix within 6nm), and _liveTrack was never set so the aircraft
    // icon pointed at the destination instead of along its track.
    //
    // Fetching server-side fixes both: same-origin, so CORS is irrelevant, and
    // any credential stays here instead of shipping to every kiosk.
    //
    // IT ALSO CHANGES THE COST SHAPE, which matters for getting approved at
    // all. Called from the browser, query volume scales with the number of
    // VIEWERS — ten people watching the stream is ten times the queries for the
    // same aircraft. Cached here, it is one upstream call per aircraft per
    // ADSB_TTL regardless of audience.
    //
    // The upstream is a FIXED constant chosen from a small allowlist and the
    // subject is pattern-checked, so this cannot be turned into an open proxy
    // (same SSRF discipline as /maptiles, /logoimg, /miafids).
    if (path.startsWith("/adsb/")) {
      // v23254 — 40s, up from 20. The boards refresh telemetry on a 45s
      // clock, so a 20s edge TTL meant nearly every poll was a cache MISS
      // that hit the community feeds; doubling the TTL halves our request
      // volume against per-IP throttles for no visible staleness.
      const ADSB_TTL = 90;                       // seconds. Was 40 — but the
      // community ring is now the ONLY position source (ADB cancelled), we
      // use it anonymously and unapproved, and it already throttles us.
      // Halving our call rate is basic politeness until the airplanes.live
      // registration lands; positions age a little, nobody's flight does.
      // How long an all-providers-failed answer is remembered. Without this,
      // every board poll re-hammered feeds that were ALREADY rate-limiting
      // us (Nick, morning of 2026-08-25: all three upstreams 429 — no
      // altimeter, no reg, no inbound panel), which keeps the throttle
      // pinned. Short on purpose: recovery is only ever this far away.
      const ADSB_NEG_TTL = 30;
      const PROVIDERS = {
        "airplanes.live": "https://api.airplanes.live/v2",
        "adsb.fi":        "https://opendata.adsb.fi/api/v2",
        "adsb.lol":       "https://api.adsb.lol/v2"
      };
      const provider = (env.ADSB_PROVIDER || "airplanes.live").trim();
      const base = PROVIDERS[provider];
      if (!base) {
        return jsonResponse({ error: "Unknown ADSB_PROVIDER", provider, allowed: Object.keys(PROVIDERS) }, 500, origin);
      }
      const m = path.match(/^\/adsb\/(hex|reg|callsign)\/([A-Za-z0-9-]{1,12})$/);
      if (!m) {
        return jsonResponse({ error: "Use /adsb/hex/:icao24, /adsb/reg/:tail or /adsb/callsign/:cs" }, 400, origin);
      }
      const kind = m[1];
      const subject = m[2].toUpperCase();
      const upstream = `${base}/${kind}/${encodeURIComponent(subject)}`;

      // Shared edge cache — this is the bit that makes audience size irrelevant.
      const cacheKey = new Request(`https://adsb-cache/${provider}/${kind}/${subject}`);
      const cache = caches.default;
      try {
        const hit = await cache.match(cacheKey);
        if (hit) {
          const body = await hit.text();
          return new Response(body, { status: 200, headers: {
            "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}`,
            "X-Adsb-Cache": "hit", ...corsHeaders(origin) } });
        }
      } catch (e) {}

      // v23222 — PROVIDER FAILOVER (Nick: 'The flight is no longer tracked on
      // the map'). airplanes.live has 403'd unregistered callers since
      // 2026-08-15; with a single fixed provider every board silently fell
      // back to stale clock-estimated positions — wrong spots, wrong headings
      // ('the planes go backwards'). The configured provider is tried first,
      // then the other allowed feeds in the ring; the first healthy answer
      // wins and is cached. A dead upstream costs one extra hop, never the
      // whole feature. All three feeds speak the same readsb /v2 shape.
      // v23255 — AERODATABOX IS THE POSITION SOURCE (Nick: 'I never got the
      // email done please use aerodatabox for now' — the airplanes.live key
      // was never registered, and the anonymous community feeds throttle our
      // shared egress). ADB's flight lookups carry a live `location` block
      // (lat/lon, pressureAltitude.feet, groundSpeed.kt, trueTrack.deg,
      // vsiFpm, reportedAtUtc) on EnRoute legs, fetched with the SAME paid
      // key the schedule data already uses — our own quota, nobody else's
      // rate limit. The answer is reshaped to the readsb `{ac:[...]}` form
      // the boards already parse, so nothing client-side changes. The
      // community ring below stays as the fallback (and takes over entirely
      // with ADSB_SOURCE="community" or when ADB_KEY is absent).
      const _ADB_KINDS = { hex: "icao24", reg: "reg", callsign: "callsign" };
      const _adbFirst = ((env.ADSB_SOURCE || "adb").trim() !== "community") && !!env.ADB_KEY;
      if (_adbFirst && _ADB_KINDS[kind]) {
        try {
          const _adbR = await fetch(
            `https://aerodatabox.p.rapidapi.com/flights/${_ADB_KINDS[kind]}/${encodeURIComponent(subject)}?withLocation=true&withAircraftImage=false`,
            { headers: { "X-RapidAPI-Key": env.ADB_KEY, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" } }
          );
          if (_adbR.ok) {
            const _adbJ = await _adbR.json().catch(() => null);
            const _legs = Array.isArray(_adbJ) ? _adbJ : (_adbJ ? [_adbJ] : []);
            // The live leg: has a location fix, freshest report wins, and an
            // EnRoute leg beats a stale fix left on an Arrived one.
            const _withLoc = _legs.filter((f) => f && f.location && typeof f.location.lat === "number" && typeof f.location.lon === "number");
            const _pool = _withLoc.filter((f) => f.status === "EnRoute").length ? _withLoc.filter((f) => f.status === "EnRoute") : _withLoc;
            let _best = null, _bestAt = -1;
            for (const f of _pool) {
              const _at = Date.parse(String(f.location.reportedAtUtc || "").replace(" ", "T") + (String(f.location.reportedAtUtc || "").endsWith("Z") ? "" : ":00Z")) || 0;
              if (_at > _bestAt) { _bestAt = _at; _best = f; }
            }
            // A fix older than 30 min is a museum piece, not a position.
            const _ageS = _bestAt > 0 ? Math.max(0, Math.round((Date.now() - _bestAt) / 1000)) : null;
            if (_best && (_ageS === null || _ageS < 1800)) {
              const L = _best.location, A = _best.aircraft || {};
              const _altFt = (L.pressureAltitude && typeof L.pressureAltitude.feet === "number" && L.pressureAltitude.feet > 0)
                ? Math.round(L.pressureAltitude.feet)
                : ((L.altitude && typeof L.altitude.feet === "number" && L.altitude.feet > 0) ? Math.round(L.altitude.feet) : null);
              const _ac = {
                hex: String(A.modeS || "").toLowerCase() || void 0,
                flight: _best.callSign || void 0,
                r: A.reg || void 0,
                t: A.model || void 0,
                desc: A.model || void 0,
                lat: L.lat, lon: L.lon,
                alt_baro: _altFt !== null ? _altFt : void 0,
                gs: (L.groundSpeed && typeof L.groundSpeed.kt === "number") ? Math.round(L.groundSpeed.kt) : void 0,
                track: (L.trueTrack && typeof L.trueTrack.deg === "number") ? L.trueTrack.deg : void 0,
                baro_rate: (typeof L.vsiFpm === "number") ? L.vsiFpm : void 0,
                seen_pos: _ageS !== null ? _ageS : void 0
              };
              const _adbBody = JSON.stringify({ ac: [_ac], _provider: "aerodatabox" });
              try {
                await cache.put(cacheKey, new Response(_adbBody, { headers: {
                  "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}` } }));
              } catch (e) {}
              return new Response(_adbBody, { status: 200, headers: {
                "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}`,
                "X-Adsb-Cache": "miss", "X-Adsb-Provider": "aerodatabox", ...corsHeaders(origin) } });
            }
            // ADB answered but knows no live fix. v23255 treated a hex/reg
            // miss as authoritative and neg-cached it without consulting the
            // community ring. v23262 withdraws that: Nick's AC2081 (LHR→YHZ,
            // reg C-FSIL confirmed on the very panel that had no altimeter)
            // was airborne over Nova Scotia — squarely inside community
            // coverage — while ADB carried no location block for the leg at
            // all, so "authoritative" empty really meant "ADB can't see this
            // one". EVERY kind now falls through to the ring; the all-failed
            // tail below still neg-caches when the ring strikes out too, so
            // a genuinely untracked airframe costs the same as before.
          }
          // Non-OK from ADB (quota, 5xx) → fall through to the community ring.
        } catch (e) { /* network error → community ring */ }
      }
      // ── FR24, ON A DAILY ALLOWANCE (2026-09-05) ─────────────────────
      // Nick bought the $9 Explorer tier to test FR24 as the position
      // source (the community ring is unapproved, anonymous, and
      // throttling us; airplanes.live registration is pending). Explorer
      // is a small credit pool billed per aircraft returned, so this
      // provider spends a HARD daily request budget and then goes quiet
      // for the day — the ring below always remains. Callsign and reg
      // lookups only (the documented filters); hex stays with the ring.
      // A 402/429 from FR24 (credits gone) burns the whole day's budget
      // at once so a dead pool is never hammered. Budget accounting is
      // KV read-modify-write: approximate under races, and that's fine.
      if (env.FR24_KEY && (kind === "callsign" || kind === "reg") && env.FIDS_LIVE_FLIGHTS) {
        try {
          const _day = new Date().toISOString().slice(0, 10);
          const _bKey = `fr24:used:${_day}`;
          const _cap = Math.max(0, Number(env.FR24_DAILY_BUDGET || 240));
          const _used = Number(await env.FIDS_LIVE_FLIGHTS.get(_bKey)) || 0;
          if (_used < _cap) {
            const _param = kind === "callsign" ? "callsigns" : "registrations";
            const _fr = await fetch(
              `https://fr24api.flightradar24.com/api/live/flight-positions/full?${_param}=${encodeURIComponent(subject)}`,
              { headers: { "Authorization": `Bearer ${env.FR24_KEY}`, "Accept-Version": "v1", "Accept": "application/json" } }
            );
            const _spend = (_fr.status === 402 || _fr.status === 429 || _fr.status === 403) ? _cap : _used + 1;
            try { await env.FIDS_LIVE_FLIGHTS.put(_bKey, String(_spend), { expirationTtl: 172800 }); } catch (e) {}
            if (_fr.ok) {
              const _fj = await _fr.json().catch(() => null);
              const _rows = (_fj && Array.isArray(_fj.data)) ? _fj.data : [];
              const _p = _rows[0];
              if (_p && typeof _p.lat === "number" && typeof _p.lon === "number") {
                const _ageS = _p.timestamp ? Math.max(0, Math.round((Date.now() - Date.parse(_p.timestamp)) / 1000)) : null;
                const _ac = {
                  hex: String(_p.hex || "").toLowerCase() || void 0,
                  flight: _p.callsign || _p.flight || void 0,
                  r: _p.reg || void 0,
                  t: _p.type || void 0,
                  desc: _p.type || void 0,
                  lat: _p.lat, lon: _p.lon,
                  alt_baro: (typeof _p.alt === "number" && _p.alt > 0) ? Math.round(_p.alt) : void 0,
                  gs: (typeof _p.gspeed === "number") ? Math.round(_p.gspeed) : void 0,
                  track: (typeof _p.track === "number") ? _p.track : void 0,
                  baro_rate: (typeof _p.vspeed === "number") ? _p.vspeed : void 0,
                  seen_pos: _ageS !== null ? _ageS : void 0
                };
                const _frBody = JSON.stringify({ ac: [_ac], _provider: "fr24" });
                try {
                  await cache.put(cacheKey, new Response(_frBody, { headers: {
                    "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}` } }));
                } catch (e) {}
                return new Response(_frBody, { status: 200, headers: {
                  "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}`,
                  "X-Adsb-Cache": "miss", "X-Adsb-Provider": "fr24", ...corsHeaders(origin) } });
              }
              // FR24 answered but sees no such aircraft airborne → the ring
              // still gets its chance (same reasoning as the ADB fallthrough).
            }
          }
        } catch (e) { /* FR24 trouble → community ring */ }
      }
      // v23254 — SPREAD THE LOAD ACROSS THE RING. Every request used to try
      // the configured provider first, so one feed absorbed our entire
      // volume (and rate-limited us), then the cascade moved the SAME full
      // volume onto the next feed. Rotating the starting provider by a hash
      // of the subject splits traffic three ways — each feed sees a third —
      // while any one aircraft still resolves from a consistent feed (which
      // also keeps its answers steady between polls). Failover order after
      // the start is unchanged.
      // v23264 — AIRPLANES.LIVE IS INVITATION-ONLY NOW. On 2026-08-25 they
      // mailed all API users: the free API is down for good ("commercial and
      // corporate abuse, compounded by bot abuse", hosting egress blown in 4
      // days, 2B requests/week). Access is now feeder-IP or paid sponsorship.
      // Calling it anonymously is a guaranteed 403 that costs us a round-trip
      // of latency on every miss AND adds to the exact load they asked people
      // to stop generating. It stays OUT of the ring until ADSB_KEY exists;
      // set that secret and it returns to the front automatically.
      const _provNames = Object.keys(PROVIDERS)
        .filter((p) => p !== "airplanes.live" || !!env.ADSB_KEY);
      let _h = 0;
      for (let i = 0; i < subject.length; i++) _h = (_h * 31 + subject.charCodeAt(i)) >>> 0;
      const _start = _h % _provNames.length;
      const _rotated = _provNames.slice(_start).concat(_provNames.slice(0, _start));
      // A pinned ADSB_PROVIDER (explicit env choice) still leads its ring —
      // but v23264's keyless-airplanes.live exclusion outranks the pin, or a
      // stale ADSB_PROVIDER="airplanes.live" would reinstate the guaranteed
      // 403 the filter above exists to prevent.
      const ring = (env.ADSB_PROVIDER && _provNames.includes(provider))
        ? [provider].concat(_provNames.filter((p) => p !== provider))
        : _rotated;
      let lastStatus = 0;
      for (const prov of ring) {
        try {
          const headers = { "Accept": "application/json", "User-Agent": "OrionConnected-FIDS/1.0 (airport flight information displays)" };
          // Only set for the provider the key belongs to. Absent = anonymous,
          // which is how the free community feeds normally work.
          if (env.ADSB_KEY && prov === "airplanes.live") headers["auth"] = env.ADSB_KEY;
          const r = await fetch(`${PROVIDERS[prov]}/${kind}/${encodeURIComponent(subject)}`, { headers });
          if (!r.ok) { lastStatus = r.status; continue; }
          const payload = await r.text();
          try {
            await cache.put(cacheKey, new Response(payload, { headers: {
              "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}` } }));
          } catch (e) {}
          return new Response(payload, { status: 200, headers: {
            "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_TTL}`,
            "X-Adsb-Cache": "miss", "X-Adsb-Provider": prov, ...corsHeaders(origin) } });
        } catch (e) { /* network error → try the next feed */ }
      }
      // Every feed failed — shaped like a success with no aircraft so the
      // board's existing "no fix" path handles it. v23254: the failure IS
      // cached now, briefly (ADSB_NEG_TTL) — an uncached miss meant every
      // board poll re-hit feeds that were already rate-limiting us, keeping
      // the 429s alive. The stampede stops; recovery costs at most 30s.
      const _negBody = JSON.stringify({ ac: [], _upstreamStatus: lastStatus, _provider: ring.join(",") });
      try {
        await cache.put(cacheKey, new Response(_negBody, { headers: {
          "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_NEG_TTL}` } }));
      } catch (e) {}
      return new Response(_negBody, { status: 200, headers: {
        "Content-Type": "application/json", "Cache-Control": `public, max-age=${ADSB_NEG_TTL}`,
        "X-Adsb-Cache": "neg", ...corsHeaders(origin) } });
    }

    // ── Vecteezy connectivity self-test ─────────────────────────────────
    // Public but safe: reveals only which route is configured (booleans)
    // and the upstream HTTP status of one 1-result search. No tokens, no
    // response bodies beyond a short error snippet. Edge-cached for 60s so
    // repeated hits can't burn API quota. Exists because the admin-gated
    // /api/vecteezy/search can't be probed without a Console login when
    // diagnosing WAF/auth issues from outside.
    if (path === "/vecteezy/selftest") {
      const cache = caches.default;
      const cacheKey = new Request("https://vecteezy-selftest.cache/v1");
      try {
        const hit = await cache.match(cacheKey);
        if (hit) {
          const body = await hit.text();
          return new Response(body, { status: 200, headers: { "Content-Type": "application/json", "X-Selftest-Cache": "hit", ...corsHeaders(origin) } });
        }
      } catch (e) {}
      const routes = vecteezyRoutes(env);
      const report = {
        v: 7, // v7: official V2 route only — the unsupported RapidAPI fallback is removed
        tokenSet: !!(env.VECTEEZY_TOKEN || "").trim(),
        accountIdSet: !!(env.VECTEEZY_ACCOUNT_ID || "").trim(),
        ok: false,
        routes: []
      };
      for (const cfg of routes) {
        const entry = { route: cfg.name, upstreamStatus: null, ok: false, detail: "" };
        try {
          const r = await fetch(`${cfg.base}/resources?term=sky&content_type=photo&per_page=1`, { headers: vecteezyHeaders(cfg) });
          entry.upstreamStatus = r.status;
          entry.rayId = r.headers.get("cf-ray") || null;
          entry.at = new Date().toISOString();
          if (r.ok) {
            const j = await r.json().catch(() => null);
            entry.ok = !!(j && Array.isArray(j.resources));
          } else {
            entry.detail = (await r.text().catch(() => "")).slice(0, 160);
          }
        } catch (e) {
          entry.detail = String(e && e.message).slice(0, 160);
        }
        report.routes.push(entry);
        if (entry.ok) report.ok = true;
      }
      const payload = JSON.stringify(report);
      try {
        await cache.put(cacheKey, new Response(payload, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } }));
      } catch (e) {}
      return new Response(payload, { status: 200, headers: { "Content-Type": "application/json", "X-Selftest-Cache": "miss", ...corsHeaders(origin) } });
    }
    // ── Stream agent: control doc + installer ───────────────────────────
    // The display servers had no link to this repo — they were set up by hand
    // and nothing on them watched anything, so a dead stream needed somebody
    // physically at a console. These two routes close that gap using the
    // pipeline that already works (push → wrangler → Cloudflare): the agent on
    // each box polls /stream/control every 2 minutes and obeys it.
    //
    // Safety: the agent NEVER runs commands from this endpoint. It only maps
    // an {action, service} pair onto systemctl restart/start/stop of units it
    // already has, whose names match fids/stream. A compromised or mistaken
    // control doc therefore cannot execute anything on the box.
    if (path === "/stream/control") {
      return jsonResponse(STREAM_CONTROL, 200, origin);
    }
    if (path === "/stream/desired") {
      const body = STREAM_DESIRED.map((r) => `${r[0]} ${r[1]}=${r[2]}`).join("\n") + "\n";
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
      });
    }
    if (path === "/stream/agent.sh") {
      return new Response(STREAM_AGENT_SH, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
      });
    }
    // ── Stream-presence probe ───────────────────────────────────────────
    // Reads back what noteBoardClient() recorded: which networks are polling
    // the live-flight endpoints, and how long ago. The YouTube streams are
    // rendered by a browser on a cloud box with no inbound access, so its
    // traffic arriving here is the only outside evidence that it is alive.
    if (path === "/stream/silence.wav") {
      return new Response(silentWav(300), {
        status: 200,
        headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400" }
      });
    }
    if (path === "/stream/probe") {
      let map = {};
      try { map = (await env.CITY_BG_CACHE.get("streamprobe:v1", { type: "json" })) || {}; } catch (e) {}
      const now = Date.now();
      const clients = Object.keys(map).map((org) => ({
        network: org,
        lastSeenSecondsAgo: map[org].last ? Math.round((now - map[org].last) / 1000) : null,
        requests: map[org].count || 0,
        lastPath: map[org].path || null,
        // A datacenter operator polling every minute is a display server
        // (the streams); consumer ISPs are ordinary viewers.
        looksLikeServer: /hetzner|digitalocean|ovh|linode|akamai|amazon|google|microsoft|oracle|vultr|scaleway|contabo/i.test(org)
      })).sort((a, b) => (a.lastSeenSecondsAgo ?? 1e9) - (b.lastSeenSecondsAgo ?? 1e9));
      return jsonResponse({ at: new Date(now).toISOString(), clients }, 200, origin);
    }
    // ── Egress-IP probe ─────────────────────────────────────────────────
    // Reports the source IP this worker's OUTBOUND requests use, as seen by
    // two independent echo services. Exists because Vecteezy's support needs
    // the banned address to clear it, and Worker egress IPs are not fixed.
    // Public but harmless: returns only Cloudflare-owned egress IPs.
    if (path === "/vecteezy/egress") {
      const out = { ips: [] };
      try {
        const r = await fetch("https://www.cloudflare.com/cdn-cgi/trace");
        const t = await r.text();
        const m = t.match(/^ip=(.+)$/m);
        if (m) out.ips.push({ seenBy: "cloudflare-trace", ip: m[1].trim() });
      } catch (e) {}
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        const j = await r.json().catch(() => null);
        if (j && j.ip) out.ips.push({ seenBy: "ipify", ip: j.ip });
      } catch (e) {}
      out.at = new Date().toISOString();
      return jsonResponse(out, 200, origin);
    }
    if (path === "/health") {
      return jsonResponse({ status: "ok", version: "218" }, 200, origin);
    }
    if (path.startsWith("/airlines/")) {
      const adbUrl = `https://aerodatabox.p.rapidapi.com${path}${url.search}`;
      try {
        const response = await fetch(adbUrl, {
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            "Cache-Control": "public, max-age=3600",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Airlines proxy failed" }, 502, origin);
      }
    }
    // ── ADB Flight Alert balance check ─────────────────────────────────────
    // Returns the current Flight Alert credit balance, or an error if the
    // user is not on the latest (post-2026) version of their plan and needs
    // to re-subscribe. Use this BEFORE building webhook integration.
    if (path === "/subscriptions/balance" || path === "/subscriptions/balance/debug") {
      // v23169 — ops-only, and no board calls it: exposes the AeroDataBox account credit balance, and in debug mode the raw upstream headers.
      { const _gate = requireOpsSecret(url, env, origin); if (_gate) return _gate; }
      const adbUrl = `https://aerodatabox.p.rapidapi.com/subscriptions/balance`;
      const debugMode = path.endsWith("/debug");
      try {
        const response = await fetch(adbUrl, {
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
          }
        });
        const data = await response.text();
        if (debugMode) {
          // Return ADB's raw status, headers, and body for diagnostic purposes
          const headersObj = {};
          for (const [k, v] of response.headers.entries()) headersObj[k] = v;
          return jsonResponse({
            adb_status: response.status,
            adb_headers: headersObj,
            adb_body_length: data.length,
            adb_body: data,
            adb_body_preview: data.slice(0, 500)
          }, 200, origin);
        }
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            "Cache-Control": "no-store",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Balance check failed", details: e.message }, 502, origin);
      }
    }

    // ── ADB Flight Alert subscriptions list ────────────────────────────────
    // Lists current webhook subscriptions. Should return [] if none are
    // active (still confirms the endpoint is accessible on your plan).
    if (path === "/subscriptions/webhooks" || path === "/subscriptions/webhook") {
      // v23169 — ops-only, and no board calls it: lists the webhook subscriptions feeding the boards, including their ids.
      { const _gate = requireOpsSecret(url, env, origin); if (_gate) return _gate; }
      const adbUrl = `https://aerodatabox.p.rapidapi.com/subscriptions/webhook`;
      try {
        const response = await fetch(adbUrl, {
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
          }
        });
        const data = await response.text();
        const headersObj = {};
        for (const [k, v] of response.headers.entries()) headersObj[k] = v;
        return jsonResponse({
          adb_status: response.status,
          adb_headers: headersObj,
          adb_body_length: data.length,
          adb_body: data
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Subscriptions list failed", details: e.message }, 502, origin);
      }
    }

    // ── REFILL flight alert credits from API quota ─────────────────────────
    // Convert API units into webhook credits.
    // POST /subscriptions/refill?credits=N (query param OR JSON body)
    // 1 API unit = 1 credit. Use sparingly — 5000 credits is plenty for
    // YQM-only operation for a couple weeks.
    if (path === "/subscriptions/refill" && request.method === "POST") {
      // v23169 — was reachable with no credentials: the credit refill — spends real money.
      { const _gate = requireOpsSecret(url, env, origin); if (_gate) return _gate; }
      let credits = url.searchParams.get("credits");
      if (!credits) {
        try {
          const body = await request.json();
          credits = body.credits;
        } catch (e) {
          credits = "1000"; // safe default
        }
      }
      const adbUrl = `https://aerodatabox.p.rapidapi.com/subscriptions/balance/refill`;
      try {
        const response = await fetch(adbUrl, {
          method: "POST",
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ credits: parseInt(credits) })
        });
        const data = await response.text();
        const headersObj = {};
        for (const [k, v] of response.headers.entries()) headersObj[k] = v;
        return jsonResponse({
          adb_status: response.status,
          adb_headers: headersObj,
          adb_body: data,
          credits_requested: parseInt(credits)
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Refill failed", details: e.message }, 502, origin);
      }
    }

    // ── CREATE YQM webhook subscription ────────────────────────────────────
    // POST /subscriptions/create-yqm — one-time setup. Subscribes the
    // worker to receive push notifications for every flight at CYQM (YQM's
    // ICAO code). Per ADB API: subjectType=FlightByAirportIcao, subjectId=CYQM.
    // ?useCredits=true uses the new credit-based system (no Tier 4 charge).
    if (path === "/subscriptions/create-yqm" && request.method === "POST") {
      const secret = (env.ADB_WEBHOOK_SECRET || "").trim();
      if (!secret) {
        return jsonResponse({ error: "ADB_WEBHOOK_SECRET not configured in worker secrets" }, 500, origin);
      }
      const workerUrl = `https://fids-proxy.n-leblanc1984.workers.dev/webhook/flight?secret=${encodeURIComponent(secret)}`;
      const subscribePayload = {
        url: workerUrl,
        maxDeliveryRetries: 1
      };
      const adbUrl = `https://aerodatabox.p.rapidapi.com/subscriptions/webhook/FlightByAirportIcao/CYQM?useCredits=true`;
      try {
        const response = await fetch(adbUrl, {
          method: "POST",
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(subscribePayload)
        });
        const data = await response.text();
        const headersObj = {};
        for (const [k, v] of response.headers.entries()) headersObj[k] = v;
        return jsonResponse({
          adb_status: response.status,
          adb_headers: headersObj,
          adb_body: data,
          worker_url_subscribed: workerUrl.replace(/secret=[^&]+/, "secret=***REDACTED***")
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Subscription create failed", details: e.message }, 502, origin);
      }
    }

    // ── DELETE a webhook subscription by ID ────────────────────────────────
    // DELETE /subscriptions/webhook/:id — removes subscription. Free.
    if (path.startsWith("/subscriptions/webhook/") && request.method === "DELETE") {
      // v23169 — was reachable with no credentials: deleting the subscription that feeds live flights to the boards.
      { const _gate = requireOpsSecret(url, env, origin); if (_gate) return _gate; }
      const subId = path.replace("/subscriptions/webhook/", "");
      if (!subId || subId.includes("/")) {
        return jsonResponse({ error: "Invalid subscription ID" }, 400, origin);
      }
      const adbUrl = `https://aerodatabox.p.rapidapi.com/subscriptions/webhook/${encodeURIComponent(subId)}`;
      try {
        const response = await fetch(adbUrl, {
          method: "DELETE",
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
          }
        });
        const data = await response.text();
        const headersObj = {};
        for (const [k, v] of response.headers.entries()) headersObj[k] = v;
        return jsonResponse({
          adb_status: response.status,
          adb_headers: headersObj,
          adb_body: data,
          deleted_id: subId
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Subscription delete failed", details: e.message }, 502, origin);
      }
    }

    // ── WEBHOOK RECEIVER ───────────────────────────────────────────────────
    // POST /webhook/flight?secret=xxx — ADB pushes flight updates here.
    // We validate the secret matches what we configured, then write the
    // flight state to KV so the frontend can read it instantly.
    //
    // ADB sends an array of flight items. Each represents one flight at
    // one moment with whatever fields changed (status, gate, reg, etc.).
    // We write each one to FIDS_LIVE_FLIGHTS keyed by airport+direction+number+date.
    if (path === "/webhook/flight" && request.method === "POST") {
      const incomingSecret = (url.searchParams.get("secret") || "").trim();
      const expectedSecret = (env.ADB_WEBHOOK_SECRET || "").trim();
      if (!expectedSecret) {
        return jsonResponse({ error: "Webhook secret not configured" }, 500, origin);
      }
      if (incomingSecret !== expectedSecret) {
        // Don't reveal whether the secret is wrong vs missing — just 401.
        return jsonResponse({ error: "Unauthorized" }, 401, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON payload" }, 400, origin);
      }
      // ADB payload format (per docs): array of flight items, OR an object
      // with a "flights" array. We handle both shapes.
      const flights = Array.isArray(payload) ? payload : (payload.flights || payload.items || [payload]);
      if (!flights || !Array.isArray(flights) || !flights.length) {
        return jsonResponse({ ok: true, written: 0, note: "Empty payload" }, 200, origin);
      }
      let writeCount = 0;
      let errorCount = 0;
      const errors = [];
      // KV namespace must be bound in wrangler.toml as FIDS_LIVE_FLIGHTS
      if (!env.FIDS_LIVE_FLIGHTS) {
        return jsonResponse({ error: "FIDS_LIVE_FLIGHTS KV namespace not bound to worker" }, 500, origin);
      }
      for (const f of flights) {
        try {
          // Build a stable key: AIRPORT:DIRECTION:NUMBER:DATE
          // ADB flight item structure (best-effort field names):
          //   number: "AC2037"
          //   movement.airport.icao: "CYUL"
          //   movement.scheduledTimeLocal: "2026-05-04 06:30+0000"
          //   ...etc
          const flightNum = (f.number || "").toString().toUpperCase().replace(/\s+/g, "");
          if (!flightNum) {
            errorCount++;
            errors.push("Missing flight number");
            continue;
          }
          // Determine direction. ADB pushes contain departure and arrival
          // movements separately; the one we care about for YQM is whichever
          // one is at CYQM. If departure airport is CYQM → 'dep'. Otherwise → 'arr'.
          const depIcao = (f.departure && f.departure.airport && (f.departure.airport.icao || "")).toUpperCase();
          const arrIcao = (f.arrival && f.arrival.airport && (f.arrival.airport.icao || "")).toUpperCase();
          let direction = "unknown";
          let airportIcao = "";
          if (depIcao === "CYQM") { direction = "dep"; airportIcao = "CYQM"; }
          else if (arrIcao === "CYQM") { direction = "arr"; airportIcao = "CYQM"; }
          else {
            // Not CYQM — log and skip. Shouldn't happen if subscription is correct.
            errorCount++;
            errors.push(`Skipped: ${flightNum} (dep=${depIcao}, arr=${arrIcao})`);
            continue;
          }
          // Date = scheduled date in YQM local timezone (used for unique daily key)
          const schedTime =
            (direction === "dep" ? (f.departure && (f.departure.scheduledTimeLocal || f.departure.scheduledTimeUtc)) : null)
            || (direction === "arr" ? (f.arrival && (f.arrival.scheduledTimeLocal || f.arrival.scheduledTimeUtc)) : null)
            || "";
          const datePart = schedTime ? schedTime.slice(0, 10) : new Date().toISOString().slice(0, 10);
          const key = `${airportIcao}:${direction}:${flightNum}:${datePart}`;
          // Wrap with metadata for the consumer
          const record = {
            flight: f,
            received_at: new Date().toISOString(),
            source: "webhook"
          };
          // Write to KV with 36h TTL (covers overnight + safety margin)
          await env.FIDS_LIVE_FLIGHTS.put(key, JSON.stringify(record), { expirationTtl: 36 * 3600 });
          writeCount++;
        } catch (e) {
          errorCount++;
          errors.push(e.message);
        }
      }
      return jsonResponse({
        ok: true,
        received: flights.length,
        written: writeCount,
        errors: errorCount,
        error_details: errors.slice(0, 10)
      }, 200, origin);
    }

    // ── CACHED FLIGHTS READ — fast path for FIDS frontend ──────────────────
    // GET /flights/cached/:icao?direction=dep|arr|both
    // Reads all live flight records from KV for the airport, returns them
    // in chronological order. If KV is empty or missing, returns 204 No
    // Content so the frontend knows to fall back to the regular ADB scrape.
    // ── CLEAR cached flights for an airport ────────────────────────────────
    // DELETE /flights/cached/:icao — wipes all flight records for that
    // airport from KV. Useful for clearing test data or forcing a refresh
    // from the next webhook push.
    if (path.startsWith("/flights/cached/") && request.method === "DELETE") {
      // v23169 — was reachable with no credentials: clearing cached flights (the boards only GET this path, so they are unaffected).
      { const _gate = requireOpsSecret(url, env, origin); if (_gate) return _gate; }
      const parts = path.split("/").filter(Boolean);
      const icao = (parts[2] || "").toUpperCase();
      if (!icao || !/^[A-Z]{4}$/.test(icao)) {
        return jsonResponse({ error: "Invalid ICAO code in path" }, 400, origin);
      }
      if (!env.FIDS_LIVE_FLIGHTS) {
        return jsonResponse({ error: "FIDS_LIVE_FLIGHTS KV namespace not bound" }, 500, origin);
      }
      try {
        let deletedCount = 0;
        for (const dir of ["dep", "arr"]) {
          const prefix = `${icao}:${dir}:`;
          const list = await env.FIDS_LIVE_FLIGHTS.list({ prefix });
          for (const k of list.keys) {
            await env.FIDS_LIVE_FLIGHTS.delete(k.name);
            deletedCount++;
          }
        }
        return jsonResponse({ ok: true, icao, deleted: deletedCount }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Clear failed", details: e.message }, 502, origin);
      }
    }

    if (path.startsWith("/flights/cached/")) {
      // Stream-presence probe — see noteBoardClient(). Fire-and-forget so the
      // board's own request is never slowed by it.
      try { ctx.waitUntil(noteBoardClient(env, request, path)); } catch (e) {}
      const parts = path.split("/").filter(Boolean); // ['flights','cached','CYQM']
      const icao = (parts[2] || "").toUpperCase();
      if (!icao || !/^[A-Z]{4}$/.test(icao)) {
        return jsonResponse({ error: "Invalid ICAO code in path" }, 400, origin);
      }
      const direction = (url.searchParams.get("direction") || "both").toLowerCase();
      if (!env.FIDS_LIVE_FLIGHTS) {
        return jsonResponse({ error: "FIDS_LIVE_FLIGHTS KV namespace not bound" }, 500, origin);
      }
      try {
        const directions = direction === "both" ? ["dep", "arr"] : [direction];
        const allFlights = [];
        for (const dir of directions) {
          const prefix = `${icao}:${dir}:`;
          const list = await env.FIDS_LIVE_FLIGHTS.list({ prefix });
          for (const k of list.keys) {
            const val = await env.FIDS_LIVE_FLIGHTS.get(k.name);
            if (val) {
              try {
                const parsed = JSON.parse(val);
                allFlights.push({
                  key: k.name,
                  direction: dir,
                  ...parsed
                });
              } catch (e) { /* skip corrupt */ }
            }
          }
        }
        if (!allFlights.length) {
          return new Response("", {
            status: 204,
            headers: { ...corsHeaders(origin), "Cache-Control": "no-store" }
          });
        }
        return jsonResponse({
          icao,
          direction,
          count: allFlights.length,
          flights: allFlights,
          fetched_at: new Date().toISOString()
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: "Cached read failed", details: e.message }, 502, origin);
      }
    }

    // PORTER GATE FEED: dead end, measured 2026-08-05. Nick found Porter's
    // flight-status XHR (getflightsfeed) carrying YTZ arrival gates (05, 02,
    // 01 on PD2520/2522/2524). A /diag/porter probe tried eight candidate
    // paths from the WORKER — i.e. from Cloudflare's own network — and every
    // one returned 403 with Cloudflare's "Just a moment..." JS challenge,
    // which only a real browser can solve. No server-side fetch can reach it,
    // so YTZ gates need FlightAware AeroAPI (handleYtzFids already has the
    // key-gated block) or another source.

    // ── MCO native FIDS feed ───────────────────────────────────────────────
    // GET /flights/mco?direction=dep|arr — normalized vendor feed in
    // ADB-native shape. Must be matched BEFORE the generic /flights/ ADB
    // passthrough below (otherwise "mco" would be proxied to AeroDataBox).
    if (path === "/flights/mco") {
      const direction = url.searchParams.get("direction") || "dep";
      return handleMcoFids(request, env, origin, direction);
    }

    // ── YYZ native feed CORS proxy ─────────────────────────────────────────
    // GET /flights/yyz?direction=dep|arr — server-side fetch of Toronto's own
    // feed (no CORS header of its own), returned as { list:[...] } with CORS
    // so the browser board can read it. Must precede the generic /flights/
    // ADB passthrough below.
    if (path === "/flights/yyz") {
      const direction = url.searchParams.get("direction") || "dep";
      return handleYyzFids(request, env, origin, direction);
    }

    // ── YUL native feed CORS proxy ─────────────────────────────────────────
    // GET /flights/yul?direction=dep|arr — ADM's guest apex getFlights call,
    // made server-side (no CORS upstream, WAF-sensitive headers), returned
    // as { list:[...] }. Must precede the generic /flights/ ADB passthrough.
    if (path === "/flights/yul") {
      const direction = url.searchParams.get("direction") || "dep";
      return handleYulFids(request, env, origin, direction);
    }

    // ── YHU native feed CORS proxy ─────────────────────────────────────────
    // GET /flights/yhu?direction=dep|arr — the MET terminal's JSON API,
    // fetched server-side (no CORS upstream). Must precede the generic
    // /flights/ ADB passthrough.
    if (path === "/flights/yhu") {
      const direction = url.searchParams.get("direction") || "dep";
      return handleYhuFids(request, env, origin, direction);
    }

    // ── YTZ native board scrape ────────────────────────────────────────────
    // GET /flights/ytz?direction=dep|arr — Billy Bishop's server-rendered
    // board rows, parsed server-side. Must precede the generic /flights/
    // ADB passthrough.
    if (path === "/flights/ytz") {
      const direction = url.searchParams.get("direction") || "dep";
      return handleYtzFids(request, env, origin, direction);
    }

    // GET /flights/panynj?ap=LGA|JFK|EWR&direction=dep|arr — Port Authority
    // GraphQL boards, fetched server-side (their API has no CORS and wants
    // an LZ-String-compressed body). Must also precede the generic
    // /flights/ ADB passthrough below.
    if (path === "/flights/panynj") {
      const ap = String(url.searchParams.get("ap") || "").toUpperCase();
      const direction = url.searchParams.get("direction") || "dep";
      return handlePanynjFids(request, env, origin, ap, direction);
    }

    // v23268 — /health/ joins the passthrough.
    //
    // /health/services/airports/{icao}/feeds answers the question no other
    // endpoint does: is THIS airport's data feed healthy right now. That is
    // exactly what we cannot currently tell when Miami starts erroring — we
    // see failures and cannot distinguish our problem from theirs. It costs
    // nothing (free tier). It was unreachable only because this allowlist
    // never had a rule for it, so the request died at our own edge.
    //
    // (/airlines/ already has its own handler further up — the fleet endpoint
    // reaches ADB through that one, it just needs a pageSize parameter.)
    if (path.startsWith("/airports/") || path.startsWith("/flights/")
        || path.startsWith("/aircrafts/") || path.startsWith("/health/")) {
      const _authResp = await maybeServeAuthorityWindow(path.slice(1), url, env, origin);
      if (_authResp) return _authResp;
      // ── DEAD-ADB STORM GUARD (2026-09-05) ───────────────────────────
      // AeroDataBox is cancelled, so the passthrough below now 429s every
      // call. Two board-breaking paths reach it:
      //
      // 1. A flight-window for an airport with NO authority feed (SJU and
      //    any non-roster IATA). Relaying the 429 makes the client storm:
      //    adbFetchWindow retries 2s/4s ×3, each hop through adbPacedFetch
      //    retries the 429 again — ~75s of doomed calls ending in a LIVE
      //    DATA ERROR panel (cold boot) or a blank board that re-storms
      //    every poll. Answer a clean empty 200 instead: the client sees
      //    r.ok + 0 rows and settles into the normal empty state, no retry.
      //    Roster airports are untouched — maybeServeAuthorityWindow already
      //    answered them; one whose feed momentarily returned null still
      //    falls through to the 429, preserving its last-good render.
      //
      // 2. /airports/search/term — the old ADB autocomplete. Every 3+char
      //    keystroke fired a doomed paced request; empty results (200) stop
      //    the storm and the board's local airport list still fills the
      //    dropdown.
      if (path.startsWith("/airports/search/")) {
        return new Response(JSON.stringify({ items: [] }), { headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
          "X-Feed-Source": "none-search",
          ...corsHeaders(origin)
        } });
      }
      const _win = path.match(/^\/flights\/airports\/iata\/([a-z0-9]{3})\//i);
      if (_win && !_authorityRosterHas(_win[1])) {
        return new Response(JSON.stringify({ departures: [], arrivals: [] }), { headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120",
          "X-Feed-Source": "none-nonroster",
          ...corsHeaders(origin)
        } });
      }
      const adbUrl = `https://aerodatabox.p.rapidapi.com${path}${url.search}`;
      try {
        const response = await fetch(adbUrl, {
          headers: {
            "X-RapidAPI-Key": env.ADB_KEY,
            "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            "Cache-Control": "public, max-age=60",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Proxy failed" }, 502, origin);
      }
    }
    if (path.startsWith("/weather/")) {
      const loc = url.searchParams.get("location") || "";
      const parts = loc.split(",");
      const lat = parts[0] || "45.5";
      const lng = parts[1] || "-73.6";
      if (path.includes("/forecast")) {
        const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,visibility,cloud_cover,surface_pressure,precipitation_probability&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto&forecast_days=2`;
        try {
          const response = await fetch(omUrl);
          const omData = await response.json();
          const hourly = omData.hourly || {};
          const times = hourly.time || [];
          const mapped = {
            timelines: {
              hourly: times.map((t, i) => ({
                time: t,
                values: {
                  temperature: hourly.temperature_2m?.[i],
                  temperatureApparent: hourly.apparent_temperature?.[i],
                  weatherCode: hourly.weather_code?.[i],
                  windSpeed: hourly.wind_speed_10m?.[i],
                  windDirection: hourly.wind_direction_10m?.[i],
                  windGust: hourly.wind_gusts_10m?.[i],
                  humidity: hourly.relative_humidity_2m?.[i],
                  visibility: hourly.visibility?.[i],
                  cloudCover: hourly.cloud_cover?.[i],
                  pressureSeaLevel: hourly.surface_pressure?.[i],
                  precipitationProbability: hourly.precipitation_probability?.[i]
                }
              }))
            }
          };
          return new Response(JSON.stringify(mapped), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=600",
              ...corsHeaders(origin)
            }
          });
        } catch (e) {
          return jsonResponse({ error: "Weather forecast proxy failed" }, 502, origin);
        }
      }
      const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,surface_pressure,visibility,precipitation&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto&forecast_days=1`;
      try {
        const response = await fetch(omUrl);
        const omData = await response.json();
        const cur = omData.current || {};
        const mapped = {
          data: {
            values: {
              temperature: cur.temperature_2m,
              temperatureApparent: cur.apparent_temperature,
              humidity: cur.relative_humidity_2m,
              windSpeed: cur.wind_speed_10m,
              windDirection: cur.wind_direction_10m,
              windGust: cur.wind_gusts_10m,
              weatherCode: cur.weather_code,
              cloudCover: cur.cloud_cover,
              pressureSeaLevel: cur.surface_pressure,
              visibility: cur.visibility,
              precipitationIntensity: cur.precipitation
            }
          }
        };
        return new Response(JSON.stringify(mapped), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Weather proxy failed" }, 502, origin);
      }
    }
    if (path.startsWith("/ninjas/")) {
      const ninjasPath = path.replace("/ninjas/", "");
      const ninjasUrl = `https://api.api-ninjas.com/${ninjasPath}${url.search}`;
      try {
        const response = await fetch(ninjasUrl, {
          headers: { "X-Api-Key": env.NINJAS_KEY }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Ninjas proxy failed" }, 502, origin);
      }
    }
    if (path.startsWith("/accor/")) {
      const accorPath = path.replace("/accor", "");
      const accorUrl = `https://api.accor.com${accorPath}${url.search}`;
      // v23273 — DERIVE Accept-Language FROM ?language=, DO NOT JUST FORWARD.
      //
      // Accor localizes on the Accept-Language HEADER ONLY. Measured against
      // the live API: `?language=fr` alone returns English on both the list
      // and the single-hotel endpoints; the same request with an fr header
      // returns French. And Accept-Language is a FORBIDDEN HEADER NAME in the
      // browser — a page's fetch() cannot set it, the browser silently drops
      // it and substitutes the viewer's own locale.
      //
      // So the board asked for French, could not say so in the one place that
      // counts, and cached English under its French key. That is the whole of
      // the recurring 'ads half french half english' (Nick, repeatedly): the
      // French request was never French.
      //
      // The query param is the only language signal a page CAN control, so it
      // is now authoritative here, with the forwarded header as the fallback
      // for non-browser callers.
      const _langParam = (url.searchParams.get("language") || "").trim().toLowerCase();
      const _ACCEPT_BY_LANG = {
        fr: "fr-CA,fr;q=0.9,en;q=0.3", en: "en-CA,en;q=0.9",
        es: "es-ES,es;q=0.9,en;q=0.3", de: "de-DE,de;q=0.9,en;q=0.3",
        it: "it-IT,it;q=0.9,en;q=0.3", pt: "pt-PT,pt;q=0.9,en;q=0.3",
        ja: "ja-JP,ja;q=0.9,en;q=0.3", zh: "zh-CN,zh;q=0.9,en;q=0.3",
        ar: "ar-SA,ar;q=0.9,en;q=0.3"
      };
      const acceptLang = (/^[a-z]{2}$/.test(_langParam) && _ACCEPT_BY_LANG[_langParam])
        || (_langParam ? `${_langParam},en;q=0.3` : null)
        || request.headers.get("Accept-Language")
        || "en";
      try {
        const response = await fetch(accorUrl, {
          headers: {
            "apikey": env.ACCOR_KEY,
            "clientId": "all.accor",
            "Accept": "application/json",
            "Accept-Language": acceptLang
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            // Vary so caches keep the EN and FR responses separate.
            "Vary": "Accept-Language",
            "Cache-Control": "public, max-age=3600",
            ...corsHeaders(origin)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Accor proxy failed" }, 502, origin);
      }
    }
    return jsonResponse({ error: "Not found" }, 404, origin);
  },

  // v23269 — THE WEBHOOK BALANCE TOPS ITSELF UP.
  //
  // Flight-alert credits are consumed one per flight item per push and are
  // NOT replenished by the plan: when they run out, notifications simply stop.
  // Nothing announces that. The last refill was June 2026, so the subscription
  // has most likely been silently dead for weeks — which is precisely the
  // failure this guards against, on a display that runs unattended.
  //
  // The refill has always existed as a manual, ops-secret-gated POST. That is
  // the wrong shape for something that must never lapse: it depends on someone
  // remembering, holding a secret, and noticing an absence. Running it on a
  // schedule inside the worker removes all three — and needs no secret at all,
  // because the worker already holds ADB_KEY.
  //
  // Deliberately conservative: it only ever tops up to CEILING, never beyond,
  // so a bug here cannot drain the quota. Credits convert 1:1 from the plan's
  // API units, so the standing cost is a few thousand units a month.
  async scheduled(event, env, ctx) {
    const ADB = "https://aerodatabox.p.rapidapi.com";
    const H = { "X-RapidAPI-Key": env.ADB_KEY, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" };
    const FLOOR = 1000;     // top up once the balance drops below this
    const CEILING = 5000;   // and bring it back to here — never higher
    if (!env.ADB_KEY) { console.log("[BALANCE] no ADB_KEY — skipped"); return; }
    // The balance work lives in its own function so that its early exits end
    // only IT. Written inline, every `return` below would also skip the
    // subscription check that follows — and the most likely early exit ("credits
    // are fine") is exactly the run where a dead subscription must still be
    // reported. A healthy balance is not evidence of a healthy subscription.
    const checkBalance = async () => {
      const r = await fetch(`${ADB}/subscriptions/balance`, { headers: H });
      const body = await r.text();
      if (!r.ok) { console.log(`[BALANCE] read failed ${r.status}: ${body.slice(0, 160)}`); return; }
      let bal = null;
      try {
        const j = JSON.parse(body);
        // Field name has moved between API versions; accept the known spellings
        // rather than trust one and silently read undefined.
        bal = [j.creditsRemaining, j.credits, j.balance, j.remaining]
          .find((v) => typeof v === "number");
      } catch (e) {}
      if (typeof bal !== "number") { console.log(`[BALANCE] unreadable: ${body.slice(0, 160)}`); return; }
      if (bal >= FLOOR) { console.log(`[BALANCE] ${bal} credits — above floor ${FLOOR}, no action`); return; }
      const want = CEILING - bal;
      const rr = await fetch(`${ADB}/subscriptions/balance/refill`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ credits: want })
      });
      const rb = await rr.text();
      console.log(rr.ok
        ? `[BALANCE] refilled ${want} credits (${bal} -> ~${CEILING})`
        : `[BALANCE] refill failed ${rr.status}: ${rb.slice(0, 200)}`);
    };
    try { await checkBalance(); } catch (e) { console.log(`[BALANCE] error: ${e && e.message}`); }

    // v23269b — CREDITS ARE ONLY HALF OF "STILL WORKING".
    // A subscription can be switched off by the provider independently of its
    // balance — one failed delivery is enough, per the runbook's own note on
    // maxDeliveryRetries. Refilling credits does NOT revive a disabled one, so
    // a worker that only watched the balance would report healthy while no
    // notification had arrived for weeks. Check the subscription itself too.
    //
    // Reporting, not resurrecting: re-creating a subscription is a spending
    // decision with a duplicate-subscription failure mode, so it stays a
    // deliberate human act. This makes the state visible instead of silent.
    try {
      const sr = await fetch(`${ADB}/subscriptions/webhook`, { headers: H });
      const sb = await sr.text();
      if (!sr.ok) { console.log(`[WEBHOOK] status read failed ${sr.status}: ${sb.slice(0, 160)}`); return; }
      const list = JSON.parse(sb);
      const subs = Array.isArray(list) ? list : [list];
      if (!subs.length) { console.log("[WEBHOOK] NO SUBSCRIPTIONS — push updates are not running"); return; }
      for (const s of subs) {
        const subj = s && s.subject ? `${s.subject.type}/${s.subject.id}` : "?";
        if (s && s.isActive) {
          console.log(`[WEBHOOK] active: ${subj} (${s.id}) expires ${s.expiresOnUtc || "n/a"}`);
        } else {
          // Loud on purpose: this is the failure that looks like nothing.
          console.log(`[WEBHOOK] INACTIVE: ${subj} (${s && s.id}) — push updates are NOT arriving. `
            + `notices: ${JSON.stringify((s && s.notices) || []).slice(0, 240)}`);
        }
      }
    } catch (e) {
      console.log(`[WEBHOOK] check error: ${e && e.message}`);
    }
  }
};
export {
  fids_proxy_default as default,
  yhzParseBoard,
  yhzWindowTs,
  yqmNormFlight,
  yqmSchedTs,
  yytParseTable,
  ysjParsePage,
  yfcParseBoard,
  yowParseFeed,
  yqbParseHits,
  yegParseBoard,
  lhrParseFeed,
  dubParseRows,
  bosParseFeed,
  lasParseFeed,
  denParseFeed,
  ordParseFeed,
  phlParsePage,
  yycParseFeed,
  sfoParseFeed,
  seaParsePage,
  yvrParseFeed,
  ylwParseFeed,
  yxxParseFeed,
  yqrParsePage,
  yhmParseBoard,
  pdxParseFeed,
  dtwParseFeed,
  sanParseFeed,
  msyParseFeed,
  kefParseFeed,
  ediParseFeed,
  mwaaParseFeed,
  cltParseFeed,
  mciParseFeed,
  manParseFeed,
  windowTsIn,
  ausParseFeed,
  mspParsePage,
  mspPageRowCount,
  slcParsePage,
  rduParsePage,
  yxeParsePage,
  parseYdfPage,
  parseYdfTime,
  parseYqtPage,
  yyjParseFeed,
  yyjParseNonce,
  yqyParseFeed,
  yqyFeedRows,
  yqyStatus,
  parseYqxPage,
  parseYqxTime,
  parseYygPage,
  parseYygDate,
  parseYkaFeed,
  parseYkaTime,
  parseYxsPanels,
  yxsStatus,
  ymmParseFeed,
  ymmStatus,
  ymmDays,
  phxParseFeed,
  parseYzfPage,
  parseYzfDotPage,
  yzfMergeRows,
  miaParseFeed,
  zrhParseFeed,
  zrhFeedDays,
  zrhStatus,
  parseIahFeed,
  mcoParseFeed,
  parseJfkFeed,
  jfkLzCompressUri,
  jfkRangeStrings,
  _authorityRosterHas
};

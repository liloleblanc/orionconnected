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
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'").replace(/’/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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
  "PASCAN": "P6", "PASCAN AVIATION": "P6", "AIR TRANSAT": "TS", "SUNWING": "WG",
  "AIR SAINT-PIERRE": "PJ", "UNITED": "UA", "UNITED AIRLINES": "UA",
  "DELTA": "DL", "DELTA AIR LINES": "DL", "AMERICAN AIRLINES": "AA", "AMERICAN": "AA"
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
      airlineIata: nm[1], sched, revised
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
      const code = AIRLINE_NAME_IATA[carrier.toUpperCase()] || null;
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

// ── The registry ─────────────────────────────────────────────────────
const AUTHORITY_HANDLERS = {
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
  windowTsIn
};

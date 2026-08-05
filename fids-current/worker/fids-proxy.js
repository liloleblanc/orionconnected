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
//
// REQUIRED bindings:
//   FIDS_USERS, FIDS_AIRPORT_CONFIG, CITY_BG_CACHE, FIDS_MEDIA — KV namespaces
//   FIDS_ASSETS                                                — R2 bucket
//   AI                                                         — Workers AI

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}
__name(hashPassword, "hashPassword");
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
      passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD || crypto.randomUUID()),
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
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) {
    return jsonResponse({ error: "Invalid credentials" }, 401, origin);
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
    passwordHash: await hashPassword(password),
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
    user.passwordHash = await hashPassword(updates.password);
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
  const fields = ["displayName", "longName", "logo", "theme", "hideAirlinePrefix", "hideWeather", "airlineStyle"];
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

// GET /flights/mco?direction=dep|arr  (or Departure|Arrival)
// Fetches the MCO vendor feed, filters to visible/non-deleted flights for
// the requested direction, normalizes each into ADB-native shape, and
// returns { departures:[...] } or { arrivals:[...] } — a drop-in for the
// frontend's adbFetchWindow(). Returns 503 (not 500) with a clear note
// until the feed URL is filled in, so callers can fall back gracefully.
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
      // ── Gate theme admin endpoint ──
      // Admin writes the full theme atomically. Public reads are no-auth above.
      if (path.startsWith("/api/adb/")) {
        return handleApiProxy(request, env, url, origin);
      }
    }
    if (path.startsWith("/proxy/")) {
      const adbPath = path.replace("/proxy/", "");
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

    // ── PORTER GATE FEED PROBE (diagnostic) ────────────────────────────────
    // GET /diag/porter — Nick found Porter's flight status XHR
    // (getflightsfeed?removeGroupCarrierCodes=true, 83.5 kB) which carries
    // YTZ gate numbers. flyporter.com sits behind Cloudflare bot protection
    // and 403s every request from our dev container — including paths that
    // don't exist — so the shield blocks at the edge. This probe answers the
    // one open question: can a request from CLOUDFLARE'S OWN network get
    // through? It tries the likely paths and reports status + a peek at each,
    // changing no board behaviour. Delete once we have the answer.
    if (path === "/diag/porter") {
      const PORTER_CANDIDATES = [
        // Nick's Network tab: the XHR is same-origin and the referring page
        // is /en-ca/manage-flights/flight-status — so this is the likeliest.
        "https://www.flyporter.com/en-ca/manage-flights/flight-status/getflightsfeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/en-ca/manage-flights/getflightsfeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/en-ca/api/getflightsfeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/api/getflightsfeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/en-ca/travel-information/flight-status/getflightsfeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/umbraco/api/flightstatus/getflightsfeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/Api/FlightStatus/GetFlightsFeed?removeGroupCarrierCodes=true",
        "https://www.flyporter.com/en-ca/travel-information/flight-status"
      ];
      const results = [];
      for (const u of PORTER_CANDIDATES) {
        try {
          const r = await fetch(u, {
            headers: {
              "Accept": "application/json, text/plain, */*",
              "Accept-Language": "en-CA,en;q=0.9",
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
              "Referer": "https://www.flyporter.com/en-ca/manage-flights/flight-status"
            }
          });
          const body = await r.text().catch(() => "");
          results.push({
            url: u,
            status: r.status,
            contentType: r.headers.get("content-type") || "",
            bytes: body.length,
            peek: body.slice(0, 180).replace(/\s+/g, " ")
          });
        } catch (e) {
          results.push({ url: u, error: String(e && e.message).slice(0, 120) });
        }
      }
      return jsonResponse({ probe: "porter-gate-feed", results }, 200, origin);
    }

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

    if (path.startsWith("/airports/") || path.startsWith("/flights/") || path.startsWith("/aircrafts/")) {
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
      // Forward the caller's Accept-Language so Accor returns localized
      // (e.g. French) descriptions/amenities. Without this it always
      // defaults to English — Canada requires both languages equally.
      const acceptLang = request.headers.get("Accept-Language") || "en";
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
  }
};
export {
  fids_proxy_default as default
};

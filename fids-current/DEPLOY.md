# FIDS v8 — Deployment & Migration Guide

## Architecture Overview

```
Entry Screen (index.html)
    ├── DEMO → Screen Picker (picker.html)
    └── LOGIN → Worker JWT Auth → Screen Picker (picker.html)
                                      ├── FIDS (fids.html) — Flight board
                                      ├── GIDS (gids.html) — Gate displays
                                      └── BIDS (bids.html) — Baggage claim
```

### Auth Flow
```
User clicks LOGIN → Login modal → POST /auth/login → Worker validates
→ JWT issued (24h) → stored in sessionStorage → picker.html
→ All API calls include Bearer token → Worker verifies → proxies to ADB
```

### Roles
| Role     | View | Settings | Override | Users | API |
|----------|------|----------|----------|-------|-----|
| Admin    | ✓    | ✓        | ✓        | ✓     | ✓   |
| Operator | ✓    | ✓        | ✓        | ✗     | ✓   |
| Viewer   | ✓    | ✗        | ✗        | ✗     | ✓   |
| Demo     | ✓    | ✗        | ✗        | ✗     | ✗   |

---

## Step 1: Deploy the Cloudflare Worker

### 1a. Create KV Namespace
```bash
cd fids-app
wrangler kv:namespace create FIDS_USERS
```
Copy the ID from the output and paste it into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "FIDS_USERS"
id = "YOUR_NAMESPACE_ID_HERE"
```

### 1b. Set Secrets
```bash
# Generate a strong JWT secret (at least 32 chars)
wrangler secret put JWT_SECRET
# Paste: your-strong-secret-key-at-least-32-characters

# Set your AeroDataBox API key
wrangler secret put ADB_KEY
# Paste your RapidAPI/AeroDataBox key (NEVER commit this value)
```

### 1c. Update Account ID
In `wrangler.toml`, set your Cloudflare account ID:
```toml
account_id = "your-cloudflare-account-id"
```

### 1d. Deploy Worker
```bash
wrangler deploy
```

The worker will auto-seed a default admin account on first deploy:
- **Username:** admin
- **Password:** value of `SEED_ADMIN_PASSWORD` secret (if unset, a random
  UUID is used and you will NOT be able to log in — set this secret first)

```bash
wrangler secret put SEED_ADMIN_PASSWORD
# Paste a strong password you actually want to use
```

**Rotate this password** via the user management API after first login.

---

## Step 2: Deploy the Frontend

### Option A: Cloudflare Pages (Recommended)
```bash
# From the fids-app directory
wrangler pages deploy . --project-name=fids
```

Or connect your Git repo to Cloudflare Pages via the dashboard:
1. Go to Cloudflare Dashboard → Pages
2. Create project → Connect Git
3. Build settings: None (static HTML)
4. Root directory: `fids-app/`

### Option B: Manual Upload
Upload all files to your existing hosting at `fids.orionconnected.com`.

---

## Step 3: Font Migration

The original file has the RocGrotesk-Medium font embedded as base64 in the HTML.
You need to extract it:

1. From the original `index.html`, copy the base64 font data from the `@font-face` src
2. Decode it to a .woff2 file:
   ```bash
   # Extract the base64 string and decode
   echo "BASE64_STRING" | base64 -d > fonts/RocGrotesk-Medium.woff2
   ```
3. Place in `fids-app/fonts/RocGrotesk-Medium.woff2`
4. Or keep the base64 embedded in `css/shared.css`

---

## Step 4: Migrate Board Logic

The `fids.html` file is a shell that needs the original board logic migrated in.
Here's what to extract from the original `index.html`:

### CSS (lines 24–1576)
Extract everything between `<style>` and `</style>` (the main CSS block),
**excluding** the lobby screen CSS (which is replaced by the new entry/picker).
Place in a new `css/fids.css` or embed in `fids.html`.

### HTML (lines 1718–1973)
Extract the board HTML: header, ticker, table, panels, gate view, baggage view.
**Remove** the `.ctrl` toolbar div (lines 1720–1759) — replaced by overlay menu.
**Remove** the `.ap-panel` div (lines 1761–1773) — airport is now in the menu.

### JavaScript (lines 2177–8772)
Extract all the JS functions. Modifications needed:
1. **Remove:** `enterFIDS()`, `returnToLobby()`, lobby-related code
2. **Remove:** `toggleToolbar()`, ctrl bar show/hide logic
3. **Replace:** API calls to use `Auth.authFetch()` when in live mode
4. **Add:** Permission checks with `Auth.can('settings')` before settings changes
5. **Update:** `showLoginModal()` → redirect to `index.html`
6. **Update:** ESC key handler to toggle overlay menu

### Key function changes:
```javascript
// OLD: direct API call
const response = await fetch(proxyUrl + path);

// NEW: authenticated API call
const response = Auth.isLive()
  ? await Auth.authFetch(Auth.workerUrl + '/api/adb/' + path)
  : await fetch(proxyUrl + path);  // demo mode fallback
```

---

## Step 5: Create GIDS and BIDS Pages

The `gids.html` and `bids.html` pages are the same structure as `fids.html`
but auto-select the gate or baggage screen type on load:

```javascript
// gids.html — add to init script
document.getElementById('menuScreenType').value = 'gate';
changeScreenType('gate');

// bids.html — add to init script
document.getElementById('menuScreenType').value = 'baggage';
changeScreenType('baggage');
```

---

## Step 6: User Management

### Via API (using curl)
```bash
WORKER_URL="https://fids-proxy.n-leblanc1984.workers.dev"

# Login as admin to get a token
TOKEN=$(curl -s -X POST $WORKER_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-admin-password>"}' | jq -r '.token')

# Create an operator
curl -X POST $WORKER_URL/auth/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"username":"ops1","password":"SecurePass123","role":"operator","displayName":"Airport Ops"}'

# Create a viewer
curl -X POST $WORKER_URL/auth/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"username":"viewer1","password":"ViewPass123","role":"viewer","displayName":"Display Viewer"}'

# List all users
curl $WORKER_URL/auth/users \
  -H "Authorization: Bearer $TOKEN"

# Update a user's role
curl -X PUT $WORKER_URL/auth/users/ops1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"role":"admin"}'

# Change a user's password
curl -X PUT $WORKER_URL/auth/users/ops1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"password":"NewSecurePass456"}'

# Delete a user
curl -X DELETE $WORKER_URL/auth/users/viewer1 \
  -H "Authorization: Bearer $TOKEN"
```

### Future: Admin Panel
An admin panel can be built into the overlay menu (visible only to admin role)
to manage users from the UI instead of curl commands.

---

## File Structure Summary

```
fids-app/
├── index.html          ← Entry screen (DEMO / LOGIN)
├── picker.html         ← Screen picker (FIDS / GIDS / BIDS)
├── fids.html           ← Flight board + overlay menu
├── gids.html           ← Gate display (same structure, gate mode)
├── bids.html           ← Baggage display (same structure, baggage mode)
├── css/
│   ├── shared.css      ← Variables, reset, common components
│   ├── entry.css       ← Entry screen + picker + login modal
│   ├── menu.css        ← Fullscreen overlay menu
│   └── fids.css        ← Board-specific styles (extract from monolith)
├── js/
│   ├── auth.js         ← JWT auth, role checks, user management
│   └── menu.js         ← Overlay menu logic
├── worker/
│   └── fids-proxy.js   ← Cloudflare Worker (auth + API proxy)
├── wrangler.toml       ← Worker deployment config
└── DEPLOY.md           ← This file
```

---

## Security Checklist

- [ ] Change default admin password after first deploy
- [ ] Set a strong JWT_SECRET (32+ characters, random)
- [ ] ADB_KEY stored as a Cloudflare secret (not in code)
- [ ] CORS configured to allow only your domain
- [ ] Token expiry set appropriately (default: 24h)
- [ ] Viewer role cannot modify any settings
- [ ] Demo mode never hits the real API
- [ ] Legacy `/proxy/` route removed after migration complete

---

## Quick Test After Deploy

1. Open `https://fids.orionconnected.com/` → Entry screen appears
2. Click **DEMO** → Picker screen → Click **FIDS** → Demo board loads
3. Go back, click **LOGIN** → Enter admin / <your-admin-password> → Picker shows LIVE badge
4. Click **FIDS** → Live data loads via authenticated Worker proxy
5. Press **☰** or click trigger → Fullscreen menu opens
6. Verify role permissions: viewers can't see settings sections

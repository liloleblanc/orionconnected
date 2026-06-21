# Instant Flight Updates — Webhook Runbook (YQM / CYQM)

Quick reference for the AeroDataBox **push webhook** that powers instant flight
updates. Lives in the **`fids-proxy`** Cloudflare worker
(`https://fids-proxy.n-leblanc1984.workers.dev`).

> The webhook secret is **NOT** in this file on purpose. None of these
> commands need it — the worker reads `ADB_WEBHOOK_SECRET` from its own
> environment. Never paste the secret into a committed file.

---

## Key facts

- **Airport:** YQM → ICAO **CYQM**
- **Subscription subject:** `FlightByAirportIcao / CYQM`
- **Billing:** credit-based. **1 credit per flight item per notification.**
  No daily fee, balance never expires — it only burns when ADB pushes an update.
- **Current active subscription ID:** `99e0c441-cfc7-4c50-b501-3140c44d4e7e`
  (created 2026-06-21) — this is your **emergency-brake** ID.
- **Old dead subscription ID:** `675a3714-8a6c-4664-bac9-e727ad22c7d9`
  (`isActive:false`, can't charge — delete whenever for tidiness).

All commands send a browser `User-Agent` (the worker's WAF rejects bare curl)
and print the HTTP status.

---

## 1. Check the subscription status

Shows what AeroDataBox has on file — look for `"isActive": true` and a clean
secret (no `%0A` newline at the end of the webhook URL).

```bash
curl -sS -H "User-Agent: Mozilla/5.0" -w "\n--- HTTP %{http_code} ---\n" \
  "https://fids-proxy.n-leblanc1984.workers.dev/subscriptions/webhook"
```

## 2. Check the credit balance / burn rate

`5000 − creditsRemaining` over time elapsed = your real burn rate. For YQM
(low traffic) it should move slowly — tens to low hundreds per day.

```bash
curl -sS -H "User-Agent: Mozilla/5.0" -w "\n--- HTTP %{http_code} ---\n" \
  "https://fids-proxy.n-leblanc1984.workers.dev/subscriptions/balance"
```

## 3. Refill credits (when balance gets low)

1 credit = 1 API unit (drawn from the monthly unit quota). `5000` ≈ a couple
weeks for YQM. Bump the number to last longer.

```bash
curl -sS -X POST -H "User-Agent: Mozilla/5.0" -w "\n--- HTTP %{http_code} ---\n" \
  "https://fids-proxy.n-leblanc1984.workers.dev/subscriptions/refill?credits=5000"
```

## 4. (Re)create the subscription

Use after a refill if the subscription went `isActive:false` (it disables at
0 credits). Creating is free (`API=0`). The worker trims the secret, so the new
subscription URL is clean.

```bash
curl -sS -X POST -H "User-Agent: Mozilla/5.0" -w "\n--- HTTP %{http_code} ---\n" \
  "https://fids-proxy.n-leblanc1984.workers.dev/subscriptions/create-yqm"
```

## 5. Emergency brake — delete the subscription (stops all charges instantly)

Use if the balance is draining abnormally fast. Replace the ID if it changes
(get the current one from command #1).

```bash
curl -sS -X DELETE -H "User-Agent: Mozilla/5.0" -w "\n--- HTTP %{http_code} ---\n" \
  "https://fids-proxy.n-leblanc1984.workers.dev/subscriptions/webhook/99e0c441-cfc7-4c50-b501-3140c44d4e7e"
```

---

## Verify webhooks are flowing

In Cloudflare → Observability, query:

```
message:"/webhook/flight"
```

You should see POSTs arriving within a few minutes of a YQM flight changing
status. No events = ADB isn't pushing (check #1 for `isActive` and #2 for credits).

---

## What went wrong on 2026-06-10 (for reference)

- The subscription is **credit-based** and **ran out of credits** (last
  deduction 2026-06-10 → balance hit `0`). At `0`, ADB auto-set `isActive:false`
  and stopped pushing. That was the disconnect — credits, not code.
- The old subscription's webhook URL had a trailing `%0A` (newline) in the
  secret — a latent gotcha. Credits are charged when ADB **sends** a
  notification, even if the receiver rejects it, so a malformed secret can waste
  credits on bounced deliveries. The re-created subscription has a clean secret.

## Hardening (optional, prevents a repeat)

1. **Strip the trailing newline** from `ADB_WEBHOOK_SECRET` in Cloudflare →
   Workers → `fids-proxy` → Settings → Variables and Secrets. Re-enter with no
   Enter at the end, then re-run command #4.
2. **Bump `maxDeliveryRetries: 1` → `3`–`5`** in the deployed worker (≈ line
   1303) so one bad delivery never disables the subscription.
3. **Fix the `rconsole` typo → `console`** in the deployed worker (≈ line 1135,
   destination-info handler) — unrelated to webhooks, but it spams errors.
4. **Set a reminder** to check command #2 weekly so you refill before hitting 0.

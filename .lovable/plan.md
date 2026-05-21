# Live Order Lookup via Admin Relay

## Aap ka scenario (jo mein samjha)

- **Sirf aap** ke pass company portal ka login + VPN access hai
- **14 users** ke pass na login hai, na VPN
- 14 users mein se koi bhi Lovable portal par order number daalega → search karega
- Query aap ki machine se ho kar `cops.ptml.pk` jayegi → result wapas us user ko **live** dikhega
- **Kuch bhi store nahi hoga** — sirf live fetch

## Architecture

```text
[User #1-14 browser]                    [Aap ki machine — VPN ON]
        |                                        |
   Lovable app                          Chrome Extension
   (order # daala,                      (background, always
    "Search" click)                      listening)
        |                                        |
        v                                        ^
   Lovable Cloud  <----- WebSocket relay -----> /
   (request queue,                      |  fetches cops.ptml.pk
    no DB storage)                      |  with aap ka session
        |                               v
        v                          parses result
   Result wapas user ko             returns JSON
   live dikhe                       via WebSocket
```

### Flow step by step

1. User #5 Lovable app pe order number `12345` type karta hai → "Search" click
2. Request Lovable Cloud par jata hai → ek pending job ban jata hai (in-memory, koi DB row nahi)
3. **Aap ki machine pe Chrome extension** WebSocket se Lovable se connected hai — usay job mil jata hai
4. Extension `cops.ptml.pk` par aap ke session cookies ke sath fetch karta hai (VPN already ON, login already hai)
5. HTML response parse karke JSON banata hai → WebSocket pe wapas Lovable ko bhejta hai
6. Lovable us result ko User #5 ko live show karta hai
7. **Result kahin save nahi hota** — sirf us user ke browser screen pe

### Aap ki taraf zaroori condition

- Aap ki machine **online honi chahiye** + VPN ON + portal mein logged in + Chrome extension running
- Agar aap offline hain → 14 users ko message milega: **"Admin offline — try later"**

## Lovable app mein kya banega

**Pages:**
1. **Login page** — 15 users (1 admin + 14) email/password
2. **Search page (14 users ke liye)** — order number input, search button, live result card, "Admin online/offline" status indicator
3. **Admin page (sirf aap ke liye)** — connection status, kitne requests aaye, extension connected hai ya nahi
4. **Setup/help** — extension download + install instructions

**Backend (Lovable Cloud, sirf yeh tables):**
- `profiles` — 15 users (sirf auth ke liye)
- `user_roles` — admin vs user role
- **Koi orders table nahi** — kuch save nahi hota

**Server function:**
- WebSocket / Server-Sent Events bridge: user request → admin extension → response back

## Chrome extension (sirf aap install karenge)

- Manifest V3
- Permission: `cops.ptml.pk/*`
- Background service worker: Lovable Cloud se WebSocket connection
- Jab job aaye → portal fetch → HTML parse → JSON wapas
- Status icon: green (connected) / red (disconnected)

## Trade-offs (saaf saaf)

| Plus | Minus |
|---|---|
| Kuch store nahi hota | Aap machine off → koi search nahi kar sakta |
| 14 users ko VPN/login nahi chahiye | Aap ki machine load uthayegi (15-20 req/min OK) |
| Live data, hamesha fresh | 2 users ek saath search karein → queue (1-2 sec wait) |
| Aap ka credential 14 users ko nahi milega | Aap ko Chrome khula rakhna padega |

## Aap se 2 confirmations chahiye

1. **Lovable Cloud enable karna padega** (15 users ke login ke liye). Sirf auth use hoga, orders save nahi honge. Permission hai?
2. **Aap ki machine "always-on relay" banegi** — yeh approach OK hai? (Agar aap office band karte hain, search bhi band)

Confirm karein to mein implementation shuru karta hoon.

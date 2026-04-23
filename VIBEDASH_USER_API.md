# VibeDash User Data API — Implementation Guide

## Context

This project is connected to **VibeDash**, a personal project management dashboard. VibeDash periodically pulls user analytics from this project to display stats and AI-generated dashboards.

You need to implement **one API endpoint** that VibeDash calls to retrieve user information.

---

## The Endpoint

```
GET /api/vibedash/users
```

This route must:
1. Validate the `Authorization: Bearer <token>` header against the `VIBEDASH_TOKEN` environment variable
2. Return a JSON payload describing the project's users

---

## Environment Variable Required

The following variable must be set in `.env` (or `.env.local`):

```
VIBEDASH_TOKEN=vd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

This token is provided by VibeDash. Do **not** hardcode it in source code.

---

## Authentication Logic

```typescript
const token = request.headers.get("authorization")?.replace("Bearer ", "");
if (!token || token !== process.env.VIBEDASH_TOKEN) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

## Response Schema

Return a JSON object with the following shape. All fields marked **required** must be present. Fields marked *optional* can be omitted if not applicable.

```typescript
{
  // ── Required ──────────────────────────────────────────────────────────────
  meta: {
    projectName: string;       // Human-readable name of this project
    fetchedAt: string;         // ISO 8601 timestamp of when data was gathered
  };

  summary: {
    totalUsers: number;        // All registered users (ever)
    premiumUsers: number;      // Users on a paid plan
    newUsersToday: number;     // Registered today (UTC)
    newUsersThisWeek: number;  // Registered in the last 7 days
    newUsersThisMonth: number; // Registered in the last 30 days
  };

  // ── Optional — add any metrics specific to this project ───────────────────
  metrics?: {
    [key: string]: number | string; // e.g. avgPostsPerUser, totalCharacters, churnRate
  };

  // ── Optional — arrays that VibeDash can render as charts ──────────────────
  charts?: {
    userGrowth?: Array<{ date: string; count: number }>; // daily new users (last 30 days)
    planBreakdown?: Array<{ plan: string; count: number }>;
    [key: string]: Array<Record<string, unknown>> | undefined;
  };

  // ── Optional — array of individual users (enables table views in VibeDash) -
  users?: Array<{
    id: string;
    email?: string;
    plan: string;             // e.g. "free" | "pro" | "enterprise"
    createdAt: string;        // ISO 8601
    [key: string]: unknown;   // any extra per-user fields
  }>;
}
```

---

## Implementation Examples

### Next.js (App Router) — `app/api/vibedash/users/route.ts`

```typescript
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // 1. Auth
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token !== process.env.VIBEDASH_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Fetch data from your database
  // Replace these with real DB queries
  const totalUsers = await db.users.count();
  const premiumUsers = await db.users.count({ where: { plan: "pro" } });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const newUsersToday = await db.users.count({ where: { createdAt: { gte: today } } });
  const week = new Date(Date.now() - 7 * 86400000);
  const newUsersThisWeek = await db.users.count({ where: { createdAt: { gte: week } } });
  const month = new Date(Date.now() - 30 * 86400000);
  const newUsersThisMonth = await db.users.count({ where: { createdAt: { gte: month } } });

  // 3. Return payload
  return Response.json({
    meta: {
      projectName: "My App",
      fetchedAt: new Date().toISOString(),
    },
    summary: {
      totalUsers,
      premiumUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
    },
    metrics: {
      // Add project-specific metrics here
      // avgPostsPerUser: 4.2,
      // totalSitesCreated: 320,
    },
    charts: {
      planBreakdown: [
        { plan: "free", count: totalUsers - premiumUsers },
        { plan: "pro", count: premiumUsers },
      ],
    },
  });
}
```

### Next.js (Pages Router) — `pages/api/vibedash/users.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token || token !== process.env.VIBEDASH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ... fetch from DB ...

  return res.status(200).json({
    meta: { projectName: "My App", fetchedAt: new Date().toISOString() },
    summary: { totalUsers: 0, premiumUsers: 0, newUsersToday: 0, newUsersThisWeek: 0, newUsersThisMonth: 0 },
  });
}
```

### Express / Node.js

```typescript
import express from "express";
const router = express.Router();

router.get("/api/vibedash/users", async (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token || token !== process.env.VIBEDASH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ... fetch from DB ...

  return res.json({
    meta: { projectName: "My App", fetchedAt: new Date().toISOString() },
    summary: { totalUsers: 0, premiumUsers: 0, newUsersToday: 0, newUsersThisWeek: 0, newUsersThisMonth: 0 },
  });
});
```

---

## Project-Specific Metrics Guide

Add any fields relevant to this project inside `metrics`. VibeDash AI will read these and automatically generate stat cards and charts for them. Use clear, descriptive key names.

**Examples by project type:**

| Project type | Suggested metrics keys |
|---|---|
| Blog / content platform | `totalPosts`, `avgPostsPerUser`, `totalSites`, `avgSitesPerUser` |
| AI character app | `totalCharacters`, `avgCharactersPerUser`, `totalImagesGenerated`, `avgImagesPerUser` |
| SaaS tool | `activeSubscriptions`, `monthlyRecurringRevenue`, `churnRatePercent`, `avgSessionsPerUser` |
| E-commerce | `totalOrders`, `avgOrderValue`, `repeatPurchaseRate` |

---

## Testing the Endpoint

Once implemented, test it locally before connecting to VibeDash:

```bash
curl -H "Authorization: Bearer $VIBEDASH_TOKEN" http://localhost:3000/api/vibedash/users
```

Expected: `200 OK` with a JSON body matching the schema above.
Expected with wrong/missing token: `401 Unauthorized`.

---

## Connecting to VibeDash

1. Deploy your project (or expose it via a tunnel like `ngrok` for local testing)
2. In VibeDash, open the project → **Users tab** → **Connect**
3. Enter the full URL: `https://yourapp.com/api/vibedash/users`
4. Click **Fetch Data** to pull stats, then **Generate View** to let AI build the dashboard

---

## Security Notes

- Never commit `VIBEDASH_TOKEN` to version control
- The endpoint should be read-only (GET only) — reject other methods
- If you include a `users` array with real email addresses, treat it as sensitive data — only include it if you specifically want user-level table views in VibeDash
- Rate limiting is not required since VibeDash only calls this endpoint on demand (manual fetch)

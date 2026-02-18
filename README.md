# Ledger

**The world's first zero-fee trading card exchange**

A waitlist landing page with animated sales visualization (dollar amounts and stock emojis).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. **Connect GitHub repository:**
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "Add New Project"
   - Import `johnohannesian/ledgerwaitlist` from GitHub
   - Vercel will auto-detect Next.js settings

2. **Environment Variables (optional):**
   - If you want eBay API features, add `RAPIDAPI_KEY` in Vercel project settings → Environment Variables
   - Otherwise, the app works with web-researched fallback comps

3. **Deploy:**
   - Vercel will automatically deploy when you push to `main`
   - Or manually trigger: `git push origin main`

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- GetWaitlist widget integration
- Animated background sales visualization

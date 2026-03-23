# MindCloud — AI Mind Mapper

An AI-powered mind mapping tool. Enter words and Claude groups them into draggable, connectable thought clouds.

## Project Structure

```
mindcloud/
├── api/
│   └── categorize.js     ← Vercel serverless function (API proxy)
├── public/
│   └── index.html        ← Frontend (zero API keys inside)
├── .env.example          ← Copy to .env.local for local dev
├── .gitignore
├── package.json
└── vercel.json
```

---

## Deploy to Vercel (step by step)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mindcloud.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework Preset → **Other**
4. Root Directory → leave as `/` (default)
5. Click **Deploy** — it will fail on first deploy (no key yet, that's fine)

### 3. Add your API key in Vercel

1. Go to your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-api03-xxxxxxxxxxxxxxxx`
   - **Environments:** ✅ Production ✅ Preview ✅ Development
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deploy → **Redeploy**

Your app is now live and the API key is 100% hidden from the browser.

---

## Local Development

```bash
# Install Vercel CLI
npm i -g vercel

# Copy env example
cp .env.example .env.local
# Edit .env.local and add your real key

# Run locally (emulates serverless functions)
vercel dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How the security works

```
Browser (public)          Vercel Serverless           Anthropic API
────────────────          ─────────────────           ─────────────
POST /api/categorize  →   reads ANTHROPIC_API_KEY →   POST with key
{ words: [...] }          from environment vars        sk-ant-...

← { categories: [...] }  ← forwards result        ←   response
```

The API key **never touches the browser** at any point.

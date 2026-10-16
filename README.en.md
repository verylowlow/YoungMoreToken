# 🐑 羊毛token · YoungMoreToken

> **Weave every free AI generation quota on the internet into one token pool of your own.**
> Video, image, voice — one web page, all done.

**🌐 Languages:** [English](README.en.md) | [中文](README.md)

---

## 💭 Sound familiar?

You want to make a video. Open platform A — today's free quota is used up.
You want to draw an image. Open platform B — it demands payment to remove the watermark.
You want a voiceover. Open platform C — the free tier is only enough for three sentences…

So you signed up for ten platforms. Twenty links are lying in your bookmarks.
Before every session you have to recall: **which one still has free quota today? How do I fill in the parameters for that one? Whose key just expired?**

Your time is worth far more than a few bucks of membership fee.

**羊毛token (YoungMoreToken) was born to end this.**

It's a small tool that runs on your own computer:
it merges the free quotas of every platform into **one pool**. You just type a prompt and hit generate —
which platform to pick, how much quota is left, switching to the next one when this one breaks — all automatic.

You feel nothing. It takes everything free.

---

## ✨ What it can do

| Capability | Description |
| --- | --- |
| 🎬 **Video generation** | Text-to-video / first-frame image-to-video / last-frame control. 27 platforms to choose from, with duration, ratio and resolution options |
| 🎨 **Image generation** | FLUX, Qwen-Image, Kolors, CogView, SDXL, gpt-image-1 — all callable from one entrance |
| 🔊 **Text to speech** | Edge-TTS (free & unlimited) + ElevenLabs + Azure + Google + SiliconFlow CosyVoice2, with multiple voices |
| 🧠 **Smart source selection** | Automatically picks the best platform by 「quality rating → remaining quota → health」 |
| 🔀 **Auto-failover** | When one platform hits its limit / errors / acts up, it switches to the next one in 0 seconds. Your task never breaks |
| 🎛️ **Parameter filtering** | You pick a 30-second duration? Only sources that support 30 seconds will serve you — and vice versa |
| 📊 **Quota ledger** | How much each key has used, how many successes, how much latency — all at a glance |
| 🔐 **Local encryption** | API keys are AES-256-GCM encrypted in a local SQLite file. Nothing is uploaded to any server |

---

## 🖥️ Four pages, that's the entire UI

- **`/generate`** — the generation workbench. Pick a modality (video/image/audio), type a prompt, upload first/last frames, tune parameters. The right panel **shows in real time** which sources are available for the current parameters and their remaining quotas.
- **`/tasks`** — the task queue. Submit, queue, retry, cancel — progress refreshes in real time.
- **`/settings`** — key management. One platform can hold multiple keys (3 Vidu accounts = 3× free quota). Platforms are grouped into modality TABs and CN/overseas sections; platform switches, routing strategy and priorities all live here.
- **`/stats`** — the ledger & statistics. How much you generated today, how much money you saved, which platform is the most reliable.

---

## 🚀 Up and running in five minutes

**Prerequisites:** Node.js ≥ 20 (optional: Python 3.8+, for free Edge-TTS voices)

```bash
# 1. Clone
git clone https://github.com/verylowlow/YoungMoreToken.git
cd YoungMoreToken

# 2. Install dependencies
npm install

# 3. Generate a master key (used to encrypt your API keys — keep it secret)
#    Windows PowerShell:
#     $k = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($k); [Convert]::ToBase64String($k)
#    Linux / macOS:
#     openssl rand -base64 32

# 4. Write the .env file
cat > .env <<'EOF'
DATABASE_URL="file:../data/dev.db"
FREEVIDEO_MASTER_KEY="paste the key from the previous step here"
EOF

# 5. Create the database
npx prisma migrate dev --name init

# 6. Start
npm run dev
```

Open **http://localhost:3000**, head to `/settings`, add your first key, and start harvesting.

> 💡 **Want to try it without any key at all?**
> The Edge-TTS voice channel needs **no key and is free forever**. Just install the Python dependency:
> ```bash
> pip install edge-tts
> ```

---

## 🆓 Built-in sources (27 platforms)

> In the settings page, platforms are split into modality TABs (video / image / audio),
> and inside each TAB grouped by **CN / overseas** —
> CN platforms are direct-connection friendly and consumed first; overseas platforms
> may need a proxy from within China, and when unreachable the router automatically
> degrades and switches sources, so no need to disable them manually.

### 🎬 Video (10)

| Platform | Region | Free quota | Key required |
| --- | --- | --- | --- |
| **ModelScope** (Wan2.2) | 🇨🇳 | Daily free API quota | ✅ |
| **Zhipu AI** (CogVideoX-Flash) | 🇨🇳 | Free | ✅ |
| **MiniMax Hailuo** (video) | 🇨🇳 | Free tier (watermarked) | ✅ |
| **Alibaba Bailian** (Wanx) | 🇨🇳 | Free quota for new users | ✅ |
| **Volcengine** (Jimeng Seedance) | 🇨🇳 | Free quota | ✅ |
| **Kling** | 🇨🇳 | Daily free credits | ✅ |
| **Vidu** | 🇨🇳 | Free credits | ✅ |
| **Luma Dream Machine** | 🌐 | Free quota (watermarked) | ✅ |
| **Agnes AI** (Singapore · all-modality free) | 🌐 | Free indefinitely | ✅ |
| **Runway** (Gen-4) | 🌐 | Free quota (watermarked) | ✅ |

### 🎨 Image (10)

| Platform | Region | Free quota | Key required |
| --- | --- | --- | --- |
| **ModelScope** (Qwen-Image) | 🇨🇳 | Free API quota | ✅ |
| **SiliconFlow** (Kolors / Qwen-Image) | 🇨🇳 | ¥14 credit on signup, models free | ✅ |
| **Zhipu AI** (CogView-3-Flash) | 🇨🇳 | Free | ✅ |
| **Alibaba Bailian** (Wanx image) | 🇨🇳 | 100 images in 90 days | ✅ |
| **Cloudflare Workers AI** (FLUX) | 🌐 | ~200 requests/day | ✅ |
| **OpenRouter** (image models) | 🌐 | Some models free | ✅ |
| **Agnes AI** (Singapore · image) | 🌐 | Free indefinitely | ✅ |
| **Stability AI** (SDXL) | 🌐 | Free credit on signup | ✅ |
| **Together AI** (FLUX.1-schnell) | 🌐 | Free tier | ✅ |
| **OpenAI** (gpt-image-1) | 🌐 | Pay as you go | ✅ |

### 🔊 Voice (7)

| Platform | Region | Free quota | Key required |
| --- | --- | --- | --- |
| **Edge-TTS** (Microsoft Read Aloud) | 🇨🇳 | Unlimited | ❌ None |
| **SiliconFlow** (CosyVoice2) | 🇨🇳 | Free | ✅ |
| **MiniMax** (speech synthesis) | 🇨🇳 | Free quota | ✅ |
| **ElevenLabs** | 🌐 | 10k characters/month | ✅ |
| **Azure TTS** | 🌐 | 500k characters/month | ✅ |
| **Google Cloud TTS** | 🌐 | 1M standard characters/month | ✅ |
| **OpenAI TTS** | 🌐 | Pay as you go | ✅ |

> ⚠️ **Honest disclaimer:** the free quotas above come from each platform's giveaway policy and may change at any time.
> This project is only a "dispatcher" — it does not create free quotas. Please respect each platform's terms of service, and **do not use them for commercial resale**.

---

## 🧭 How does it pick a source?

Every task goes through four steps:

```
① Capability filter    The parameters you chose (duration/ratio/resolution/first frame)
                       → only sources that "can do it" remain
② Quota filter        Keys with 0 remaining quota, in cooldown, or disabled → removed
③ Score & rank        score = 0.5×quality + 0.3×remaining quota + 0.1×health + 0.1×priority
④ Select & execute    Default strategy is quality-first (random among top 3, to avoid
                       hammering a single source); on failure, switch to the next one,
                       up to 3 retries
```

Errors are classified into six categories, each with its own handling: invalid key → disable that key; quota exhausted → cooldown until reset; rate limited → 5-minute cooldown; content violation → switch source directly; network hiccup → retry.
**Every kind of failure has a next step. Tasks never die mysteriously.**

---

## 🏗️ How easy is it to add a platform?

The adapter protocol is the heart of the design — platform differences are locked inside one small file:

```ts
// src/providers/video/my-platform.ts
export const adapter: ProviderAdapter = {
  slug: "my-platform",
  modalities: ["video"],                 // which modalities are supported — the first routing filter
  capabilities: () => ({ durations: [5, 10], ratios: ["16:9"], quality: 80 }),
  async submit(req, key) { /* call upstream, return the unified format */ },
  classifyError(err) { /* tell the router what kind of error this is */ },
};
```

Then add one import line in `src/providers/index.ts`. Done.
Routing, queue, ledger, encryption, frontend — **all take effect automatically. Not a single line to change.**

---

## 🗺️ Roadmap

- [x] Three-modality (video / image / audio) aggregated routing, 27 built-in platforms
- [x] Multi-key pool + quota ledger + automatic failover
- [x] Local AES-256-GCM encrypted storage
- [x] Settings page with modality TABs + CN/overseas grouping
- [ ] Region-aware routing (automatically prefer reachable sources by network environment)
- [ ] Browser extension: one click to capture the current platform's key into the pool while browsing
- [ ] Scheduled tasks: feed every platform's daily free quota into the queue automatically
- [ ] One-command Docker deployment
- [ ] More adapters (Suno music, Canva, Recraft…)

---

## 🤝 Contributing

PRs are welcome, especially **new platform adapters** — that's the most direct help to this project.
When filing an issue, please include: the platform name, a link to its API docs, and the error message you hit.

## 📄 License

MIT. Use it, harvest it — but please treat every platform's free quota kindly:

**Every platform that still insists on giving away free quota deserves to be treated gently.**

---

<p align="center">Made with 🐑 by people who believe good tools shouldn't cost a fortune.</p>

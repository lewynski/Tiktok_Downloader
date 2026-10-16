// Vercel Serverless Function (Node 18+)
// POST /api/download   { url }        -> { title, videoUrl }
// GET  /api/download?src=<videoUrl>   -> streams the file as an attachment

const TIKTOK_RE = /^https?:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\//i;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Only proxy URLs that point at TikTok's CDN, so this can't be abused as an open proxy.
const CDN_RE = /^https:\/\/[^/]*\.(tiktokcdn[^/]*|tiktokv\.com|byteoversea\.com|ibyteimg\.com)\//i;

async function parseTikTok(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("TikTok page could not be loaded.");

  const html = await res.text();
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error("Could not read video data. The page layout may have changed.");

  const data = JSON.parse(match[1]);
  const item =
    data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  const video = item?.video;
  const videoUrl = video?.playAddr || video?.downloadAddr;

  if (!videoUrl) throw new Error("No video found at this link. It may be private or removed.");

  return {
    title: item?.desc?.slice(0, 120) || "tiktok-video",
    videoUrl,
  };
}

export default async function handler(req, res) {
  try {
    // Stream the file to the browser
    if (req.method === "GET") {
      const src = req.query.src;
      if (!src || !CDN_RE.test(src)) return res.status(400).json({ error: "Invalid source." });

      const upstream = await fetch(src, {
        headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/" },
      });
      if (!upstream.ok) return res.status(502).json({ error: "Video download failed." });

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="tiktok-video.mp4"');
      const len = upstream.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);

      const { Readable } = await import("node:stream");
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const url = String(req.body?.url || "").trim();
    if (!TIKTOK_RE.test(url)) {
      return res.status(400).json({ error: "Please paste a valid TikTok link." });
    }

    const info = await parseTikTok(url);
    return res.status(200).json(info);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
      }

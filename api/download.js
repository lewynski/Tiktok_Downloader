
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Safari/537.36";

const TIKTOK_DOMAINS = [
  "tiktok.com"
];

const VIDEO_DOMAINS = [
  "tiktok.com",
  "tiktokcdn.com",
  "tiktokv.com",
  "byteoversea.com",
  "ibyteimg.com"
];

const REDIRECT_CODES = [301, 302, 303, 307, 308];

function allowedHost(hostname, domains) {
  const host = hostname.toLowerCase();

  return domains.some((domain) =>
    host === domain ||
    host.endsWith("." + domain)
  );
}

function validateUrl(raw, domains) {
  let url;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are supported.");
  }

  if (!allowedHost(url.hostname, domains)) {
    throw new Error("URL domain is not allowed.");
  }

  if (
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Invalid URL configuration.");
  }

  return url.toString();
}

async function fetchWithRedirects(
  initialUrl,
  domains,
  headers,
  timeout = 20000
) {
  let currentUrl = validateUrl(initialUrl, domains);

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout)
    });

    if (REDIRECT_CODES.includes(response.status)) {
      const location =
        response.headers.get("location");

      if (!location) {
        throw new Error("Redirect destination missing.");
      }

      const nextUrl =
        new URL(location, currentUrl).toString();

      await response.body?.cancel();

      currentUrl = validateUrl(nextUrl, domains);

      continue;
    }

    return response;
  }

  throw new Error("Too many redirects.");
}

async function parseTikTok(pageUrl) {
  const validUrl = validateUrl(
    pageUrl,
    TIKTOK_DOMAINS
  );

  const response = await fetchWithRedirects(
    validUrl,
    TIKTOK_DOMAINS,
    {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Unable to access TikTok (HTTP ${response.status}).`
    );
  }

  const html = await response.text();

  const match = html.match(
    /<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match) {
    throw new Error(
      "TikTok video information was not found. " +
      "The video may be unavailable, TikTok may " +
      "have blocked the request, or its page " +
      "structure may have changed."
    );
  }

  let data;

  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error("Unable to parse TikTok data.");
  }

  const item =
    data?.__DEFAULT_SCOPE__?.[
      "webapp.video-detail"
    ]?.itemInfo?.itemStruct;

  if (!item) {
    throw new Error(
      "Video details are unavailable. " +
      "Check if the video is public."
    );
  }

  const video = item.video;

  if (!video) {
    throw new Error("This post has no available video.");
  }

  const videoUrl =
    video.playAddr ||
    video.downloadAddr;

  if (!videoUrl) {
    throw new Error(
      "No downloadable video source found."
    );
  }

  validateUrl(videoUrl, VIDEO_DOMAINS);

  return {
    title:
      typeof item.desc === "string"
        ? item.desc.slice(0, 120) || "TikTok Video"
        : "TikTok Video",
    videoUrl
  };
}

async function streamVideo(src, res) {
  const validSrc = validateUrl(
    src,
    VIDEO_DOMAINS
  );

  const upstream = await fetchWithRedirects(
    validSrc,
    VIDEO_DOMAINS,
    {
      "User-Agent": USER_AGENT,
      "Referer": "https://www.tiktok.com/",
      "Accept": "video/*,application/octet-stream"
    },
    25000
  );

  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel();

    const error = new Error(
      `TikTok CDN returned HTTP ${upstream.status}.`
    );

    error.statusCode = 502;
    throw error;
  }

  const contentType = (
    upstream.headers.get("content-type") || ""
  ).toLowerCase();

  const isVideo =
    contentType.startsWith("video/") ||
    contentType.includes("application/octet-stream");

  if (!isVideo) {
    await upstream.body.cancel();

    const error = new Error(
      "The source did not return a video. " +
      "The CDN URL may have expired."
    );

    error.statusCode = 502;
    throw error;
  }

  res.statusCode = 200;

  res.setHeader(
    "Content-Type",
    "video/mp4"
  );

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="clipsaver-video.mp4"'
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  const length =
    upstream.headers.get("content-length");

  if (length && /^\d+$/.test(length)) {
    res.setHeader("Content-Length", length);
  }

  await pipeline(
    Readable.fromWeb(upstream.body),
    res
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

      const url = String(
        body?.url || ""
      ).trim();

      if (!url) {
        return res.status(400).json({
          error: "Please enter a TikTok URL."
        });
      }

      const info = await parseTikTok(url);

      return res.status(200).json(info);
    }

    if (req.method === "GET") {
      const src =
        typeof req.query.src === "string"
          ? req.query.src
          : "";

      if (!src) {
        return res.status(400).json({
          error: "Missing video URL."
        });
      }

      return await streamVideo(src, res);
    }

    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      error: "Method not allowed."
    });

  } catch (error) {
    console.error("ClipSaver API error:", error);

    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    const status =
      error.statusCode ||
      (error.name === "TimeoutError" ? 504 : 500);

    return res.status(status).json({
      error: error.message || "Download failed."
    });
  }
}

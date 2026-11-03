// api/download.js
export default async function handler(req, res) {
  // Set CORS and Header content type
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.query.url || req.body?.url;

  if (!url) {
    return res.status(400).json({ error: 'TikTok URL is required' });
  }

  try {
    // Example: Fetch data from TikTok API / scraper
    // Replace this block with your actual TikTok fetch/extract logic
    const videoData = {
      status: 'success',
      downloadUrl: 'https://example.com/video.mp4', // Extracted video URL
      title: 'TikTok Video'
    };

    return res.status(200).json(videoData);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch TikTok video' });
  }
}

export default async function handler(req, res) {
  // Set CORS Headers
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
    // Fetch video data from TikWM API (No watermark)
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.code === 0 && data.data) {
      return res.status(200).json({
        status: 'success',
        videoUrl: data.data.play, // Direct watermark-free MP4 URL
        downloadUrl: data.data.play, // Fallback key matching both script formats
        title: data.data.title || 'TikTok Video',
        author: data.data.author?.nickname || ''
      });
    } else {
      return res.status(400).json({ error: 'Unable to process this TikTok video. Please check the link.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to connect to video extraction server.' });
  }
}

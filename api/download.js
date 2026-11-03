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

  // 1. Kapag nag-trigger ng Direct Download via proxy (action=?stream=true)
  const streamUrl = req.query.stream;
  if (streamUrl) {
    try {
      const mediaResponse = await fetch(decodeURIComponent(streamUrl));
      if (!mediaResponse.ok) throw new Error('Failed to fetch media');

      // I-set ang Content-Disposition header para FORCE DOWNLOAD sa browser
      const filename = `tiktok-video-${Date.now()}.mp4`;
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Stream ang video data pabalik sa user
      const arrayBuffer = await mediaResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.send(buffer);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to stream video file.' });
    }
  }

  // 2. Fetch video details mula sa TikWM API
  const url = req.query.url || req.body?.url;
  if (!url) {
    return res.status(400).json({ error: 'TikTok URL is required' });
  }

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.code === 0 && data.data) {
      return res.status(200).json({
        status: 'success',
        videoUrl: data.data.play,
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

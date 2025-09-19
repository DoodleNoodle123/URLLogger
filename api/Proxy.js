export default async function handler(req, res) {
  // Log visitor info immediately (background logging)
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const timestamp = new Date().toISOString();
  const originalUrl = req.url.split('?')[1]?.split('url=')[1] || 'unknown'; // Extract ?url= param

  // Log to Vercel console for debugging
  console.log('Video Proxy Access:', {
    ip,
    userAgent,
    timestamp,
    originalVideoUrl: decodeURIComponent(originalUrl)
  });

  // Send log to Discord webhook
  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**Video Proxy Access**\n**IP:** ${ip}\n**User-Agent:** ${userAgent}\n**Timestamp:** ${timestamp}\n**Video URL:** ${decodeURIComponent(originalUrl)}`
        })
      });
    } catch (error) {
      console.error('Discord logging error:', error);
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  try {
    // Fetch the original video with range support for streaming
    const fetchOptions = {
      headers: {
        'User-Agent': userAgent || 'VRChat-Video-Proxy/1.0'
      }
    };

    // Handle range requests (for video seeking)
    const range = req.headers.range;
    if (range) {
      fetchOptions.headers.Range = range;
    }

    const response = await fetch(decodeURIComponent(videoUrl), fetchOptions);
    if (!response.ok) {
      throw new Error(`Video fetch failed: ${response.status}`);
    }

    // Stream the video back to VRChat
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    if (range) {
      res.status(206); // Partial content for ranges
      res.setHeader('Content-Range', response.headers.get('content-range'));
    }

    // Pipe the stream (efficient for large videos)
    return response.body.pipe(res);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy video' });
  }
}

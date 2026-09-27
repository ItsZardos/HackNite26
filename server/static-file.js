import {readFile} from 'node:fs/promises';
import path from 'node:path';

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.wav': 'audio/wav', '.json': 'application/json'
};
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

// Native media players request pieces of a file when loading or seeking. Only a
// single byte range is needed here; malformed/multipart requests are rejected.
function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return {start, end};
}

export async function serveStaticFile(req, res, file) {
  const data = await readFile(file);
  const headers = {
    'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': data.length,
    'Accept-Ranges': 'bytes',
    'Content-Security-Policy': contentSecurityPolicy
  };

  // Range applies to GET. HEAD reports the same metadata as a complete GET,
  // without sending the file body, even when the client includes Range.
  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  if (req.headers.range) {
    const range = byteRange(req.headers.range, data.length);
    if (!range) {
      res.writeHead(416, {...headers, 'Content-Length': 0, 'Content-Range': `bytes */${data.length}`});
      res.end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      'Content-Length': range.end - range.start + 1,
      'Content-Range': `bytes ${range.start}-${range.end}/${data.length}`
    });
    res.end(data.subarray(range.start, range.end + 1));
    return;
  }
  res.writeHead(200, headers);
  res.end(data);
}

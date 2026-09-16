// HeaSec 本地部署辅助脚本：带重定向跟随与断点续传的下载器
// 用法: node download.js <url> <destPath>
const fs = require('fs');
const path = require('path');
const https = require('https');

const url = process.argv[2];
const dest = process.argv[3];
if (!url || !dest) {
  console.error('usage: node download.js <url> <destPath>');
  process.exit(2);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
const tmp = dest + '.part';
let start = 0;
try { start = fs.statSync(tmp).size; } catch (e) { start = 0; }

function fetchFile(u, redirects = 0) {
  if (redirects > 8) throw new Error('too many redirects');
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
  if (start > 0) headers['Range'] = 'bytes=' + start + '-';
  const req = https.get(u, { headers, timeout: 60000 }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      return fetchFile(new URL(res.headers.location, u).href, redirects + 1);
    }
    if (res.statusCode === 416) { // 已下载完成
      res.resume();
      fs.renameSync(tmp, dest);
      console.log('DONE (already complete) ' + dest);
      return;
    }
    if (res.statusCode !== 200 && res.statusCode !== 206) {
      res.resume();
      console.error('HTTP ' + res.statusCode + ' for ' + u);
      process.exit(1);
    }
    const total = res.headers['content-length'] ? Number(res.headers['content-length']) + (res.statusCode === 206 ? start : 0) : 0;
    let got = res.statusCode === 206 ? start : 0;
    if (res.statusCode === 200 && start > 0) { got = 0; }
    const out = fs.createWriteStream(tmp, { flags: res.statusCode === 206 ? 'a' : 'w' });
    let last = Date.now();
    res.on('data', (c) => {
      got += c.length;
      if (Date.now() - last > 2000) {
        last = Date.now();
        const pct = total ? ((got / total) * 100).toFixed(1) + '%' : '?';
        console.log(((got / 1048576).toFixed(1)) + 'MB / ' + (total ? (total / 1048576).toFixed(1) : '?') + 'MB (' + pct + ')');
      }
    });
    res.pipe(out);
    out.on('finish', () => {
      out.close(() => {
        if (total && got < total) {
          console.error('INCOMPLETE ' + got + '/' + total + ', re-run to resume');
          process.exit(1);
        }
        fs.renameSync(tmp, dest);
        console.log('DONE ' + dest + ' (' + (fs.statSync(dest).size / 1048576).toFixed(1) + ' MB)');
      });
    });
    out.on('error', (e) => { console.error('WRITE ERR ' + e.message); process.exit(1); });
  });
  req.on('timeout', () => { req.destroy(new Error('timeout')); });
  req.on('error', (e) => { console.error('ERR ' + e.message); process.exit(1); });
}

fetchFile(url);

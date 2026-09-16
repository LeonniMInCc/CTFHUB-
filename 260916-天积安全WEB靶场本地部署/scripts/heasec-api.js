// HeaSec 部署自检：调用初始化接口 / 检查数据库状态
// 用法: node heasec-api.js <path> [postBody]
const http = require('http');

const path = process.argv[2] || '/api/heasec/check_database.php';
const body = process.argv[3] || '';

function call(p, data) {
  return new Promise((resolve) => {
    const opts = {
      host: '127.0.0.1',
      port: 8080,
      path: p,
      method: data ? 'POST' : 'GET',
      headers: { 'User-Agent': 'HeaSec-deploy-check', 'Accept': 'application/json' },
      timeout: 120000,
    };
    if (data) {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ code: res.statusCode, body: d }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ code: 'TIMEOUT', body: '' }); });
    req.on('error', (e) => resolve({ code: 'ERR', body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const r = await call(path, body);
  console.log('HTTP', r.code, path);
  try {
    const j = JSON.parse(r.body);
    console.log(JSON.stringify(j, null, 1).slice(0, 4000));
  } catch (e) {
    console.log(r.body.slice(0, 2000));
  }
})();

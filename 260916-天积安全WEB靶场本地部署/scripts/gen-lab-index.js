// 读取 MySQL 导出的靶场清单 labs.tsv，生成 Markdown 索引并填入 02-使用方法.md 的占位符
const fs = require('fs');
const path = require('path');

const tsv = 'D:\\天积\\.runtime\\tools\\labs.tsv';
const docDir = process.argv[2];
const doc = path.join(docDir, '02-使用方法.md');

const TOP = {
  'WEB 安全基础知识': ['HTTP协议基础', '网站前端代码基础', '服务端语言基础'],
  '输入验证类漏洞': ['文件类型校验绕过', '文件内容校验绕过', '其他场景校验绕过', '跨站脚本注入', '命令执行', 'SQL注入', 'XML相关漏洞', '反序列化相关漏洞'],
  '业务逻辑类漏洞': ['绕过验证', 'JWT验证', '身份管理类功能', '越权访问', '交易篡改'],
  '综合实战': ['综合实战'],
};

const rows = fs.readFileSync(tsv, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(1)
  .map((line) => {
    const [category, difficulty, title, url] = line.split('\t');
    return { category, difficulty, title, url: (url || '').replace(/^\.\//, '/') };
  });

const byCat = new Map();
for (const r of rows) {
  if (!byCat.has(r.category)) byCat.set(r.category, []);
  byCat.get(r.category).push(r);
}

const out = [];
out.push(`> 下表由平台数据库 \`heasec_cms.links\` 导出（共 ${rows.length} 个靶场），入口地址省略了前缀 \`http://localhost:8080\`。`);
out.push('');
let n = 0;
for (const [top, cats] of Object.entries(TOP)) {
  const total = cats.reduce((s, c) => s + (byCat.get(c) || []).length, 0);
  out.push(`### ${++n}. ${top}（${total} 个）`);
  out.push('');
  for (const c of cats) {
    const list = byCat.get(c);
    if (!list) continue;
    out.push(`#### ${c}（${list.length} 个）`);
    out.push('');
    out.push('| 靶场 | 难度 | 入口 |');
    out.push('|---|---|---|');
    for (const r of list) out.push(`| ${r.title} | ${r.difficulty} | \`${r.url}\` |`);
    out.push('');
  }
}

let text = fs.readFileSync(doc, 'utf8');
if (!text.includes('<!--LAB_INDEX-->')) throw new Error('未找到占位符 <!--LAB_INDEX-->');
text = text.replace('<!--LAB_INDEX-->', out.join('\n').trimEnd());
fs.writeFileSync(doc, text, 'utf8');
console.log('已写入索引：' + rows.length + ' 个靶场，' + byCat.size + ' 个二级分类');
for (const [c, l] of byCat) console.log('  ' + c + ': ' + l.length);

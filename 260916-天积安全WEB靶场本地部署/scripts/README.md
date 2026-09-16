# scripts · 脚本与配置说明

这些文件是本次部署实际使用的脚本/配置，**原样导出**，可直接复用。

## 放置位置

部署完成后它们的实际位置是：

```
D:\天积\.runtime\
├─ start-lab.ps1 / start-lab.cmd     ← 本目录同名文件
├─ stop-lab.ps1  / stop-lab.cmd      ← 本目录同名文件
├─ tools\download.js                 ← 本目录同名文件
├─ tools\heasec-api.js               ← 本目录同名文件
├─ tools\db-probe.php                ← 本目录同名文件
└─ conf...（实际分散在各组件目录）
   ├─ apache\conf\heasec-httpd.conf  ← conf/heasec-httpd.conf
   ├─ php\php.ini                    ← php.ini-development +（conf/php-heasec.ini 追加段）
   └─ mariadb\my-heasec.ini          ← conf/my-heasec.ini
```

> 文档中出现的 `tools\heasec-api.js`、`tools\db-probe.php`、`tools\download.js` 即指本目录中的同名脚本。

## 使用方式

| 文件 | 用法 |
|---|---|
| `start-lab.cmd` | 双击启动（内部调用 `start-lab.ps1`）：拉起 MariaDB(3306) + Apache(8080)，并轮询等待端口就绪 |
| `stop-lab.cmd` | 双击停止：`httpd -k stop` + `mysqladmin shutdown`，带兜底强杀 |
| `download.js` | `node download.js <url> <保存路径>`：跟随 302 跳转、断点续传、进度输出 |
| `heasec-api.js` | `node heasec-api.js <接口路径> [POST 表单串]`，如 `node heasec-api.js /api/heasec/check_database.php` |
| `db-probe.php` | `php db-probe.php`：实测 PDO 连接、已加载扩展、ini 生效情况 |
| `gen-lab-index.js` | 从 MySQL 导出的靶场清单生成 Markdown 索引（生成 `docs/02` 里的 85 个靶场表格用） |

## 三个必须注意的点

1. **`start-lab.ps1` 必须带 UTF-8 BOM**：脚本内有中文提示，Windows PowerShell 5.1 对无 BOM 的 UTF-8 会按 ANSI 解析而报语法错误。本目录内的 `.ps1` 已带 BOM，请勿用会去掉 BOM 的编辑器另存。
2. **Apache 启动时工作目录必须是 PHP 目录**（`start-lab.ps1` 已设置）：PHP 的 `extension_dir` 是相对路径，否则扩展加载失败/崩溃。
3. **`conf/` 里的配置含绝对路径 `D:/天积/.runtime/...`**：换目录部署时请全局替换为自己的实际路径；`my-heasec.ini` 另需保持 **ANSI/GBK 编码**（原因见 [docs/03](../docs/03-踩坑与排错.md) 坑 5）。

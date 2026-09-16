# 天积安全 WEB 靶场平台 · Windows 本地便携部署实录

> 靶场项目：[HeaSec/HeaSecWebLab](https://github.com/HeaSec/HeaSecWebLab)（GPL-3.0，85 个 WEB 安全靶场）
> 部署日期：2026-09-16 ｜ 部署方式：**绿色免安装 Apache + PHP + MariaDB**（不用 PHPStudy、不用 Docker）
> 最终效果：浏览器打开 `http://localhost:8080/` 即用，85 个靶场全部可访问

---

## 一、部署结果速览

| 项目 | 结果 |
|---|---|
| 访问地址 | <http://localhost:8080/> |
| Web 服务 | Apache 2.4.68 Win64（Apache Lounge VS18）+ **mod_php** 方式加载 PHP |
| PHP | **7.3.4** TS VC15 x64（官方 README 推荐版本），已启用 mysqli / pdo_mysql / gd / curl / openssl / soap / sockets 等 |
| 数据库 | **MariaDB 10.6.28**（等价替代官方要求的 MySQL 5.7），`127.0.0.1:3306`，账号 `root` / 密码 `root` |
| 靶场源码 | `D:\天积`（git 工作区保持干净，**源码一行未改**） |
| 运行时 | `D:\天积\.runtime`（三件套 + 数据 + 日志 + 启停脚本，可整体删除＝卸载） |
| 靶场数量 | 85 个（4 大分类），其中需要独立数据库的 **59 个靶场全部初始化成功** |
| 数据库初始化 | 主库 `heasec_cms` 8 张表 + `heasec_common` 3 张表 + 9 个 `heasec_*` 库 |
| 部署耗时 | 约 40 分钟（含约 120MB 组件下载） |

---

## 二、为什么用"便携三件套"而不是 PHPStudy / Docker

官方推荐两条路：PHPStudy 集成环境（图形安装包，需管理员）或 Docker（`docker compose up -d --build`）。
本次部署的机器上：

- **没有** PHP / MySQL / Apache / Docker / PHPStudy；
- 有普通用户权限（非管理员），不希望装 Windows 服务、改注册表、动系统 PATH；
- 希望部署完全落在项目目录内，随时可以整体删除。

因此改为「绿色版（zip 解压即用）三件套」，并把配置逐项**对齐官方仓库自带的 Docker 配置**：

| 官方文件 | 本次对应的本地文件 | 对齐内容 |
|---|---|---|
| `docker/php/zz-heasec.ini` | `.runtime/php/php.ini`（末尾追加段） | short_open_tag、上传 100M、执行 300s、error_reporting、时区等 |
| `docker/apache/000-heasec.conf` | `.runtime/apache/conf/heasec-httpd.conf` | DocumentRoot、AllowOverride All（各靶场 `.htaccess` 生效）、关闭缓存、Timeout 60 |
| `docker-compose.yml` | `.runtime/mariadb/my-heasec.ini` | utf8mb4、默认引擎 MyISAM、max_allowed_packet 16M、lower_case_table_names=1 |
| `docker-compose.yml` 端口 | Apache `Listen 8080` | 与官方一致的 8080 端口 |

---

## 三、本次实测环境

| 项目 | 情况 |
|---|---|
| 操作系统 | Windows（主机名 `DESKTOP-GDHP40A`），x64 |
| 账号权限 | 普通用户 `examp`（**非管理员**，因此全程不装服务） |
| 已有工具 | Git for Windows、Node.js、Python 3.12、Visual C++ 运行库 14.51.36231.0 |
| 缺失组件 | PHP、MySQL、Apache、Docker、PHPStudy 全都没有 |
| 网络 | 可访问 GitHub 与各组件源（GitHub 走本地代理 `127.0.0.1:10808`） |
| 磁盘 | D 盘剩余约 190GB，本次占用约 500MB |

---

## 四、本文件夹内容

| 文件 | 说明 |
|---|---|
| `README.md` | 本文件，总览 + 快速开始 |
| [docs/01-部署步骤.md](docs/01-部署步骤.md) | **详细安装步骤**：从零到可访问的每一条命令、每一份配置 |
| [docs/02-使用方法.md](docs/02-使用方法.md) | **靶场使用方法**：界面导航、做题流程、进度/重置机制、85 个靶场完整索引 |
| [docs/03-踩坑与排错.md](docs/03-踩坑与排错.md) | 7 个真实踩坑记录（中文路径、扩展崩溃、TLS、编码等）与排错速查表 |
| `scripts/start-lab.ps1` / `.cmd` | 一键启动（MariaDB 3306 + Apache 8080，带端口就绪等待） |
| `scripts/stop-lab.ps1` / `.cmd` | 一键停止（优雅关闭两个服务） |
| `scripts/download.js` | 带重定向跟随与断点续传的下载器（Node.js） |
| `conf/heasec-httpd.conf` | Apache 配置（mod_php 加载、靶场 vhost、缓存头） |
| `conf/php-heasec.ini` | PHP 需要追加到 `php.ini` 的配置片段 |
| `conf/my-heasec.ini` | MariaDB 配置（**ANSI/GBK 编码**，见踩坑记录） |

---

## 五、快速开始（复现三步）

假设部署目录为 `D:\天积`（换成你自己的路径即可，**注意路径含中文时的两个坑**，见 `docs/03`）。

**第 1 步：准备组件**

```powershell
# 下载（约 120MB，国内镜像见 docs/01）
node scripts\download.js https://windows.php.net/downloads/releases/archives/php-7.3.4-Win32-VC15-x64.zip php.zip
node scripts\download.js https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260827-Win64-VS18.zip httpd.zip
node scripts\download.js https://mirrors.aliyun.com/mariadb/mariadb-10.6.28/winx64-packages/mariadb-10.6.28-winx64.zip mariadb.zip

# 解压到 D:\天积\.runtime\{apache,php,mariadb}，并把 conf\ 下三份配置放到位
```

**第 2 步：初始化数据库**

```powershell
D:\天积\.runtime\mariadb\bin\mysql_install_db.exe --datadir="D:\天积\.runtime\mariadb-data" --password=root --port=3306
```

**第 3 步：启动并初始化靶场**

```powershell
D:\天积\.runtime\start-lab.cmd      # 等待端口就绪
# 浏览器打开 http://localhost:8080/ ，首次访问会提示初始化数据库，点确认即可
```

---

## 六、部署要点摘要（细节见 docs/01）

1. **版本必须卡准**：PHP 用官方推荐的 **7.3.4**（过高会影响漏洞利用、过低可能跑不起来）；数据库用 MySQL 5.7 或等价的 MariaDB 10.6。
2. **PHP 用 TS（线程安全）版**：Apache 用 mod_php 加载，必须是 TS 构建（`php7ts.dll` + `php7apache2_4.dll`）；扩展目录用**相对路径**，见踩坑 1。
3. **Apache 要 `AllowOverride All`**：各靶场目录下的 `.htaccess` 承担了关键角色（目录浏览、`php_value enable_post_data_reading 0`、`.mjs` MIME），不生效会导致部分关卡行为不一致。
4. **数据库初始化要跑批**：初始化会依次建 59 个子靶场库，约 2 分钟，中途 HTTP 客户端可能超时但服务端仍在执行；首次跑完若有失败，补跑一次即可（本次即 smsbypass 需要补做）。
5. **不要暴露到公网**：靶场故意包含大量漏洞，且前台无登录、带一键重置数据库按钮，数据库还是 `root/root`。默认仅本机使用时最安全。

---

## 七、安全声明

- 本平台代码**故意包含大量已知安全漏洞**，仅可用于合法的安全学习、研究与授权测试。
- 官方 README 明确要求：**切勿直接部署于互联网**。
- 靶场进程以当前登录用户身份运行，RCE / 文件上传类关卡执行代码、落地 webshell 时使用该用户权限；建议做完整目录快照，或用完即清理。
- 本文档仅记录本地学习环境的搭建过程，请勿将上述技术用于未授权目标。

---

## 八、参考资料

- 靶场源码：<https://github.com/HeaSec/HeaSecWebLab>（含官方 PHPStudy / Docker 两种部署方式）
- 社区部署教程：[从 0 到 1 部署天积 WEB 安全靶场](https://www.cnblogs.com/VistaAx/articles/22412753)
- Apache Lounge（Windows 版 Apache）：<https://www.apachelounge.com/download/>
- PHP Windows 历史版本归档：<https://windows.php.net/downloads/releases/archives/>
- MariaDB 镜像：<https://mirrors.aliyun.com/mariadb/>

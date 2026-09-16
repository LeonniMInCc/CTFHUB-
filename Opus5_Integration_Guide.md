# Claude Opus 5 与自动化 CTF Agent 框架集成指南

## 1. 背景与目标
Veria Labs 开发的 `ctf-agent` 是一款曾在 BSidesSF 斩获冠军的自动化 CTF 解决框架。该框架利用“大模型蜂群 (Swarm)”并发破解题目。但由于框架发布较早，默认配置硬编码的是早期的 `claude-opus-4-6` 模型。

本次操作的核心目标是：**在不破坏原有框架逻辑的前提下，将其核心大脑升级为推理能力最强的 Opus 5，让框架在处理逆向工程、复杂密码学和高级 Web 漏洞时具备更高的胜率。**

## 2. 结合原理
框架通过读取 `backend/models.py` 中的全局字典和列表来注册并调度 AI 代理：
*   **模型池 (`DEFAULT_MODELS`)**：调度器 (Coordinator) 从这个列表中选择模型派发到沙箱中执行。我们需要向其注册 `"claude-sdk/claude-opus-5/max"`。
*   **上下文管理 (`CONTEXT_WINDOWS`)**：Agent 在运行 `gdb` 或读取长源码时会产生巨量输出，框架会根据这里配置的 Token 上限（百万级别）来做动态截断。
*   **多模态能力 (`VISION_MODELS`)**：部分 CTF 题目（如隐写术 Stego、取证 Forensics）包含图片。框架判断模型名称是否在此 Set 中，决定是否将图片传入沙箱给大模型。

通过修改这三处配置，框架的调度层 (Dispatcher) 就能完美识别并原生调用 Opus 5。

## 3. 详细实操步骤

### 步骤一：解决环境权限隔离问题
由于 `ctf-agent` 目录及所有代码的拥有者是 `root`，而当前操作用户为普通账户 `kali`，我们无法直接编辑文件。
为避免权限导致的 `Permission denied`，我们采用了 **Root 权限下的 Python 单行脚本 (One-liner) 注入法**，完全避免了手动编辑带来的缩进 (Indentation) 错误。

### 步骤二：参数注入 (Patching)
执行了如下核心逻辑，完成安全注入：
```python
# 1. 注册最强模型
content.replace("DEFAULT_MODELS: list[str] = [", "DEFAULT_MODELS: list[str] = [\n    \"claude-sdk/claude-opus-5/max\",")
# 2. 注册 1M 上下文窗口
content.replace("CONTEXT_WINDOWS: dict[str, int] = {", "CONTEXT_WINDOWS: dict[str, int] = {\n    \"claude-opus-5\": 1_000_000,")
# 3. 注册视觉功能
content.replace("VISION_MODELS: set[str] = {", "VISION_MODELS: set[str] = {\n    \"claude-opus-5\",")
```

### 步骤三：验证与运行
通过 `grep -C 2 "claude-opus-5" backend/models.py` 命令确认注入成功。配置好 `.env` 文件中的 `ANTHROPIC_API_KEY` 后，即可使用 `uv run ctf-solve` 发起高维打击。

## 4. 常见问题：需要用 root 账户重装 Claude 吗？
**不需要。**
*   你现在使用的 `Claude Code CLI` 是安装在 `kali` 用户下的，完全够用，可以直接调用系统命令和相关工具。
*   自动化框架 `ctf-agent` 调用的是云端的 API Key（配置在 `.env` 中），并不依赖本地终端的 Claude 账户。
*   未来如果要在沙箱 (`sandbox`) 中运行危险的二进制题目，使用非 Root 的 `kali` 用户反而更安全。

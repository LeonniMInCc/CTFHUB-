# 勒索病毒逆向分析 —— 复现报告

> **难度**：入门 | **类型**：逆向工程（Reverse） | **关键词**：RC4、XOR、PE分析

---

## 一、题目概览

我们拿到了两个文件：

| 文件名 | 大小 | 说明 |
|--------|------|------|
| `勒索病毒.exe` | 37,376 字节 | 一个 Windows 32位 可执行程序（"勒索病毒"） |
| `enflag.txt` | 22 字节 | 被加密后的 flag 文件 |

**目标**：逆向分析 `勒索病毒.exe` 的加密逻辑，找到密钥，解密 `enflag.txt`，拿到 flag。

---

## 二、前置知识（看不懂后面的先看这里）

### 2.1 什么是 XOR（异或）？

XOR 是一种位运算，规则非常简单：

```
相同为 0，不同为 1

0 XOR 0 = 0
0 XOR 1 = 1
1 XOR 0 = 1
1 XOR 1 = 0
```

**最重要的性质 —— 可逆性**：

```
A XOR B = C
C XOR B = A    ← 再 XOR 一次同样的值，就还原了！
```

举个例子：字母 `'A'` 的 ASCII 码是 65（二进制 `01000001`）

```
65 XOR 31 = 94    （加密）
94 XOR 31 = 65    （解密，又变回来了！）
```

这就是为什么 XOR 在加密中如此常用 —— **加密和解密用同一个操作**。

### 2.2 什么是 RC4？

RC4 是一种**流密码**（Stream Cipher），由 Ron Rivest 在 1987 年设计。它曾广泛用于 WEP（WiFi加密）和 SSL/TLS 中。

你可以把 RC4 想象成一台"随机数生成机"：

```
         ┌─────────┐
 密钥 ──→│  RC4    │──→ 伪随机字节流：0xA3, 0x7F, 0x12, ...
         │  算法    │
         └─────────┘
```

加密时，把这个随机字节流和明文**逐字节 XOR**：

```
明文：    f    l    a    g    {    ...
          ↕XOR ↕XOR ↕XOR ↕XOR ↕XOR
随机流：  0xA3 0x7F 0x12 0x55 0x9B ...
          ↓    ↓    ↓    ↓    ↓
密文：    0xC5 0x13 0x73 0x32 0xE0 ...
```

因为 XOR 可逆，**解密 = 用同样的密钥再跑一次 RC4**。

#### RC4 的两个阶段

**阶段一：KSA（密钥调度算法）—— 打乱一副"牌"**

想象你有一副 256 张牌（编号 0~255），KSA 就是根据密钥把这副牌彻底打乱：

```python
S = [0, 1, 2, 3, ..., 255]   # 初始化：按顺序排好
j = 0
for i in range(256):
    j = (j + S[i] + key[i % key_len]) % 256
    swap(S[i], S[j])          # 根据密钥交换两张牌
```

**阶段二：PRGA（伪随机生成算法）—— 不断抽牌**

每次需要一个随机字节时，就从打乱的牌堆里按规则抽一张：

```python
i = 0, j = 0
for each 明文字节:
    i = (i + 1) % 256
    j = (j + S[i]) % 256
    swap(S[i], S[j])
    t = (S[i] + S[j]) % 256
    随机字节 = S[t]
    密文字节 = 明文字节 XOR 随机字节
```

### 2.3 什么是逆向工程？

简单说，就是**从成品倒推设计图**。

正向：`源代码 → 编译 → 可执行程序`
逆向：`可执行程序 → 反汇编/反编译 → 理解逻辑`

我们拿到的 `.exe` 没有源代码，所以要用工具把机器码"翻译"回人能读的汇编指令，再推理出程序在做什么。

---

## 三、分析过程（一步一步来）

### 第 1 步：初步观察

先看看这个 exe 的基本信息：

```
格式：PE32 (Windows 32位可执行文件)
架构：x86 (i386)
大小：37,376 字节
```

然后提取程序中所有可读的字符串（程序员写的提示信息、文件名等），重点发现了这些：

| 字符串 | 含义猜测 |
|--------|---------|
| `flag.txt` | 程序会读取这个文件（原始 flag） |
| `enflag.txt` | 程序会写入这个文件（加密后的 flag） |
| `choice` | 可能是菜单选项 |
| `sbox` | S-Box = 置换盒，密码学术语，暗示有加密 |
| `DH~mqqvqxB^||zll@Jq~jkwpmvez{` | 一串看起来像乱码的东西…… |

最后那串"乱码"很可疑，我们试试对它做 XOR 解码：

```python
s = "DH~mqqvqxB^||zll@Jq~jkwpmvez{"

# 尝试每个字节 XOR 31 (0x1f)
result = ''.join(chr(ord(c) ^ 0x1f) for c in s)
print(result)
# 输出: [Warnning]Access_Unauthorized
```

**Bingo！** XOR 31 之后变成了 `[Warnning]Access_Unauthorized`（一个写错了的 "Warning"）。

这说明程序用 **XOR 0x1f** 来验证密钥。

### 第 2 步：反汇编核心逻辑

用反汇编工具查看程序的机器码，我们找到了这些关键函数：

#### 主函数流程（简化版）

```
main() {
    打印菜单;
    scanf("%d", &choice);        // 读取用户选择
    
    if (choice == 1) {           // 选择"加密"
        infile  = fopen("flag.txt", "r");
        outfile = fopen("enflag.txt", "w");
        
        printf("请输入密码: ");
        scanf("%s", key);        // 读取用户输入的密钥
        
        verify_key(key, buf);    // 验证密钥
        encrypt(key, sbox1, sbox2, infile, outfile);  // RC4加密
        
        fclose(infile);
        fclose(outfile);
    }
    else if (choice == 2) {
        退出;
    }
}
```

#### 密钥验证函数（地址 0x401A70）

这是最关键的部分，反汇编代码对应的逻辑：

```
verify_key(key, output) {
    key_len = strlen(key);
    
    for (i = 0; i < key_len; i++) {
        output[i] = output[i] + (key[i] ^ 0x1F);
        //          ↑ 初始为0     ↑ 每个字节异或0x1F
        // 化简：output[i] = key[i] ^ 0x1F
    }
    
    // 然后把 output 和硬编码字符串比较
    if (strcmp(output, "DH~mqqvqxB^||zll@Jq~jkwpmvez{") == 0) {
        printf("验证成功\n");
    } else {
        printf("Error!\n");
    }
}
```

对应的关键汇编指令：

```asm
0x401AC7:  movsx ecx, byte ptr [eax]    ; ecx = key[i]
0x401ACA:  xor   ecx, 0x1f              ; ecx = key[i] ^ 0x1F
0x401AD3:  movsx eax, byte ptr [edx]    ; eax = output[i]（初始为0）
0x401AD6:  add   eax, ecx               ; eax = 0 + (key[i] ^ 0x1F)
0x401ADE:  mov   byte ptr [ecx], al     ; output[i] = key[i] ^ 0x1F
```

#### 加密函数群（RC4 的四个步骤）

| 函数地址 | 功能 | 对应 RC4 阶段 |
|---------|------|--------------|
| `0x401800` | 用密钥填充 T 数组（256字节，密钥循环填充） | KSA 准备 |
| `0x401780` | 初始化 S 数组为 `[0, 1, 2, ..., 255]` | KSA 准备 |
| `0x4018E0` | 用 T 数组打乱 S 数组 | KSA 核心 |
| `0x4015E0` | 逐字节读取文件，用 S 数组生成流密钥并 XOR | PRGA + 加密 |

以 KSA 核心（`0x4018E0`）的汇编为例：

```asm
; j = (j + S[i] + T[i]) % 256
0x401930:  movzx ecx, byte ptr [eax]    ; ecx = S[i]
0x401933:  add   ecx, dword ptr [ebp-8] ; ecx += j
0x40193C:  movzx eax, byte ptr [edx]    ; eax = T[i]
0x40193F:  add   ecx, eax               ; ecx += T[i]
0x401947:  and   eax, 0x800000FF        ; % 256 (取低8位)
0x401955:  mov   dword ptr [ebp-8], eax ; j = result

; swap(S[i], S[j])
0x40195E:  mov   cl, byte ptr [eax]     ; temp = S[i]
0x401971:  mov   byte ptr [eax], dl     ; S[i] = S[j]
0x40197C:  mov   byte ptr [eax], cl     ; S[j] = temp
```

这和标准 RC4 的 KSA 完全一致！

### 第 3 步：还原密钥

现在我们知道：

```
验证逻辑：key[i] ^ 0x1F == "DH~mqqvqxB^||zll@Jq~jkwpmvez{"[i]
```

根据 XOR 的可逆性：

```
key[i] = "DH~mqqvqxB^||zll@Jq~jkwpmvez{"[i] ^ 0x1F
```

逐字节计算：

```
'D' (0x44) ^ 0x1F = '[' (0x5B)
'H' (0x48) ^ 0x1F = 'W' (0x57)
'~' (0x7E) ^ 0x1F = 'a' (0x61)
'r' (0x72) ^ 0x1F = 'r' (0x72)    ← 不变？不对，让我算：0x6D ^ 0x1F = 0x72 = 'r'
...以此类推
```

最终得到密钥：**`[Warnning]Access_Unauthorized`**

### 第 4 步：解密 enflag.txt

有了密钥，因为 RC4 加密和解密是同一个操作，我们只需要：

```python
key = b'[Warnning]Access_Unauthorized'
encrypted = open('enflag.txt', 'rb').read()
# [0xC3, 0x82, 0xA3, 0x25, 0xF6, 0x4C, 0x36, 0x3B,
#  0x59, 0xCC, 0xC4, 0xE9, 0xF1, 0xB5, 0x32, 0x18,
#  0xB1, 0x96, 0xAE, 0xBF, 0x08, 0x35]

decrypted = rc4(key, encrypted)
print(decrypted)
# b'flag{RC4&->ENc0d3F1le}'
```

---

## 四、完整解密脚本

```python
"""
勒索病毒逆向 —— RC4 解密脚本
使用方法: python solve.py
"""

def rc4(key: bytes, data: bytes) -> bytes:
    """标准 RC4 算法"""
    
    # ===== 阶段一：KSA（密钥调度） =====
    # 初始化 S 盒为 [0, 1, 2, ..., 255]
    S = list(range(256))
    
    # 用密钥打乱 S 盒
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) % 256
        S[i], S[j] = S[j], S[i]   # 交换
    
    # ===== 阶段二：PRGA（生成密钥流并加/解密） =====
    i = 0
    j = 0
    result = bytearray()
    
    for byte in data:
        i = (i + 1) % 256
        j = (j + S[i]) % 256
        S[i], S[j] = S[j], S[i]           # 交换
        t = (S[i] + S[j]) % 256
        result.append(byte ^ S[t])         # XOR 生成密文/明文
    
    return bytes(result)


# ===== 第一步：还原密钥 =====
# 程序中硬编码的验证字符串
encoded_key = "DH~mqqvqxB^||zll@Jq~jkwpmvez{"

# 每个字节 XOR 0x1F 还原出真正的密钥
key = bytes([ord(c) ^ 0x1F for c in encoded_key])
print(f"还原出的密钥: {key.decode()}")
# 输出: [Warnning]Access_Unauthorized

# ===== 第二步：解密 =====
encrypted = open(r'E:\edge download\final\enflag.txt', 'rb').read()
decrypted = rc4(key, encrypted)

print(f"解密结果: {decrypted.decode()}")
# 输出: flag{RC4&->ENc0d3F1le}
```

---

## 五、整体流程图

```
┌──────────────────────────────────────────────────────────┐
│                    勒索病毒.exe 的工作流程                 │
│                                                          │
│  用户输入密钥 ──→ 每字节 XOR 0x1F ──→ 与硬编码字符串比较   │
│       │              │                     │              │
│       │          验证通过？            不通过→ 报错退出     │
│       │              │                                    │
│       ↓              ↓                                    │
│  密钥 ──────→ RC4 KSA（打乱S盒）                          │
│                      │                                    │
│                      ↓                                    │
│  flag.txt ──→ RC4 PRGA（逐字节XOR）──→ enflag.txt         │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    我们的解密流程                          │
│                                                          │
│  硬编码字符串 ──→ 每字节 XOR 0x1F ──→ 密钥还原             │
│  "DH~mqq..."                    "[Warnning]Access..."    │
│                                        │                  │
│                                        ↓                  │
│  enflag.txt ──→ RC4 解密（和加密操作完全相同）──→ flag      │
│                                                          │
│  flag{RC4&->ENc0d3F1le}  ✓                               │
└──────────────────────────────────────────────────────────┘
```

---

## 六、知识点总结

| 考点 | 说明 |
|------|------|
| **字符串提取** | 用 `strings` 命令或脚本提取可执行文件中的可读字符串，快速了解程序功能 |
| **XOR 加密/解密** | XOR 的可逆性：`A ^ B = C` 则 `C ^ B = A`，是逆向中最常见的编码手法 |
| **RC4 流密码** | 识别 KSA + PRGA 的代码模式（256字节S盒初始化 + 交换 + XOR） |
| **密钥硬编码** | 程序把验证用的密文写死在了代码里，逆向推出密钥 |
| **对称加密的特性** | RC4 加密和解密是同一个操作，知道密钥就能直接还原 |

---

## 七、新手常见疑问

**Q：怎么知道这是 RC4 而不是其他加密？**

A：看到以下特征就大概率是 RC4：
- 有一个 256 字节的数组 `S`（初始化为 0~255）
- 有一个循环做 `j = (j + S[i] + key[i]) % 256` 然后交换
- 加密时逐字节 XOR
- 程序字符串里出现了 "sbox"

**Q：为什么密钥能从程序里直接还原？**

A：因为程序把密钥的验证逻辑（`key ^ 0x1F == 固定字符串`）写死在了程序里。这是一种非常脆弱的设计——只要逆向了程序，密钥就藏不住了。真正的勒索病毒会用更复杂的密钥管理（比如 RSA + AES 组合），密钥不会出现在程序本体中。

**Q：为什么 RC4 解密和加密是同一个操作？**

A：因为 RC4 的本质是**生成一串随机字节流，然后和数据 XOR**。XOR 的可逆性保证了：
```
明文 XOR 随机流 = 密文     （加密）
密文 XOR 随机流 = 明文     （解密）
```
只要密钥相同，生成的随机流就相同，所以加密一次就是加密，加密两次就变回原文。

---

## 八、Flag

```
flag{RC4&->ENc0d3F1le}
```

> 这个 flag 本身也是提示：RC4 + Encode File（RC4 编码文件）

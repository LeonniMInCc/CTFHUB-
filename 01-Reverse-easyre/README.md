# CTF Writeup: easyre

## 题目信息 (Challenge Info)
- **分类 (Category)**: Reverse Engineering (逆向工程)
- **题目名称 (Challenge)**: easyre
- **难度 (Difficulty)**: 入门级 (Beginner)

## 1. 初步分析 (Reconnaissance)
拿到题目后，我们首先面临的是一个名为 `easyre.exe` 的文件。

第一步，我们使用 `file` 命令来查看这个文件的基本属性：
```bash
$ file easyre.exe
easyre.exe: PE32+ executable for MS Windows 5.02 (console), x86-64, 18 sections
```
这告诉我们，这是一个 **64位的 Windows 可执行文件 (PE文件)**。

既然这是入门的第一道逆向题（通常称为签到题），程序的逻辑通常不会太复杂，甚至有可能没有进行任何加密或混淆（如加壳）。

## 2. 漏洞/解题思路 (Solution)
在逆向工程中，分析一个未知二进制文件的第一步，通常是提取该文件中所有可读的字符串（ASCII 或 Unicode）。程序员在编写代码时写下的提示语、报错信息、甚至是硬编码的密码或 Flag，在编译后往往会以明文形式存储在程序的只读数据段（如 `.rdata` 段）中。

在 Linux 环境下，我们可以使用强大的 `strings` 命令，它可以提取出二进制文件中所有连续的、可打印的字符序列。

我们将 `strings` 的结果通过管道符 `|` 传递给 `grep` 命令，来专门搜索包含 "flag" 关键字的字符串：

```bash
$ strings easyre.exe | grep -i flag
```

命令的执行结果立刻打印出了程序的内部逻辑字符串：
```text
flag{this_Is_a_EaSyRe}
sorry,you can't get flag
... (省略其他系统底层变量)
```

显然，程序的逻辑大概是判断用户的输入，如果正确则输出 `flag{this_Is_a_EaSyRe}`，否则输出 `sorry,you can't get flag`。由于明文存储，我们甚至不需要打开 IDA Pro 或 x64dbg 这样的高级反汇编/动态调试工具，直接通过静态字符串分析就拿到了 Flag。

## 3. Flag
`flag{this_Is_a_EaSyRe}`

## 4. 总结与延伸
这道题旨在向初学者介绍逆向工程中最基础但也最常用的一把“瑞士军刀”——**`strings` 命令**。
对于任何刚拿到的黑盒二进制文件，先跑一下 `strings` 看一看，往往能快速获得程序的报错提示、引用的库函数、调用的外部命令甚至硬编码的密钥，为后续在 IDA 中进行深入分析提供关键线索。

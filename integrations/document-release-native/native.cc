#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <algorithm>
#include <chrono>
#include <cmath>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/fs.h>
#include <linux/magic.h>
#include <linux/openat2.h>
#include <memory>
#include <node_api.h>
#include <poll.h>
#include <stdexcept>
#include <stdint.h>
#include <string.h>
#include <string>
#include <sys/file.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/statfs.h>
#include <sys/syscall.h>
#include <sys/un.h>
#include <sys/xattr.h>
#include <unistd.h>
#include <vector>

namespace {
constexpr size_t FRAME = 16384;
struct Failure : std::runtime_error {
  int number;
  bool uncertain;
  Failure(const std::string &m, int n = 0, bool u = false)
      : std::runtime_error(m), number(n), uncertain(u) {}
};
void need(bool ok, const char *m) {
  if (!ok)
    throw Failure(m);
}
void sysneed(bool ok, const char *m) {
  if (!ok)
    throw Failure(std::string(m) + ": " + strerror(errno), errno);
}
struct FD {
  int n = -1;
  explicit FD(int v = -1) : n(v) {}
  ~FD() {
    if (n >= 0)
      close(n);
  }
  FD(const FD &) = delete;
  FD &operator=(const FD &) = delete;
  FD(FD &&v) : n(v.n) { v.n = -1; }
  int release() {
    int v = n;
    n = -1;
    return v;
  }
};
void check(napi_status s) { need(s == napi_ok, "invalid native argument or N-API failure"); }
napi_value obj(napi_env e) {
  napi_value v;
  check(napi_create_object(e, &v));
  return v;
}
napi_value undef(napi_env e) {
  napi_value v;
  check(napi_get_undefined(e, &v));
  return v;
}
void set(napi_env e, napi_value o, const char *k, napi_value v) {
  check(napi_set_named_property(e, o, k, v));
}
napi_value num(napi_env e, double n) {
  napi_value v;
  check(napi_create_double(e, n, &v));
  return v;
}
napi_value boolean(napi_env e, bool b) {
  napi_value v;
  check(napi_get_boolean(e, b, &v));
  return v;
}
napi_value str(napi_env e, const std::string &s) {
  napi_value v;
  check(napi_create_string_utf8(e, s.data(), s.size(), &v));
  return v;
}
std::string string(napi_env e, napi_value v, size_t max = 4096) {
  napi_valuetype t;
  check(napi_typeof(e, v, &t));
  need(t == napi_string, "expected string");
  size_t n = 0;
  check(napi_get_value_string_utf8(e, v, nullptr, 0, &n));
  need(n <= max, "string too long");
  std::vector<char> b(n + 1);
  check(napi_get_value_string_utf8(e, v, b.data(), b.size(), &n));
  std::string s(b.data(), n);
  need(s.find('\0') == std::string::npos, "NUL forbidden");
  return s;
}
uint32_t integer(napi_env e, napi_value v, uint32_t maximum = UINT32_MAX) {
  double d;
  check(napi_get_value_double(e, v, &d));
  need(std::isfinite(d) && d >= 0 && d <= maximum && std::floor(d) == d,
       "expected bounded integer");
  return static_cast<uint32_t>(d);
}
napi_value get(napi_env e, napi_value o, const char *k) {
  napi_value v;
  check(napi_get_named_property(e, o, k, &v));
  return v;
}
uint32_t option(napi_env e, napi_value o, const char *k, uint32_t fallback, uint32_t maximum) {
  bool has;
  check(napi_has_named_property(e, o, k, &has));
  return has ? integer(e, get(e, o, k), maximum) : fallback;
}
std::vector<napi_value> args(napi_env e, napi_callback_info i, size_t min, size_t max) {
  size_t n = max + 1;
  std::vector<napi_value> a(n);
  check(napi_get_cb_info(e, i, &n, a.data(), nullptr, nullptr));
  need(n >= min && n <= max, "wrong argument count");
  a.resize(n);
  return a;
}
napi_value buffer(napi_env e, const std::vector<char> &b) {
  napi_value v;
  check(napi_create_buffer_copy(e, b.size(), b.data(), nullptr, &v));
  return v;
}
std::vector<char> bytes(napi_env e, napi_value v) {
  bool b;
  check(napi_is_buffer(e, v, &b));
  if (b) {
    void *p;
    size_t n;
    check(napi_get_buffer_info(e, v, &p, &n));
    need(n > 0 && n <= FRAME, "packet size out of range");
    return std::vector<char>(static_cast<char *>(p), static_cast<char *>(p) + n);
  }
  auto s = string(e, v, FRAME);
  need(!s.empty(), "empty packet");
  return std::vector<char>(s.begin(), s.end());
}
bool utf8(const char *s, size_t n) {
  size_t i = 0;
  while (i < n) {
    uint32_t c = static_cast<unsigned char>(s[i++]);
    if (c < 0x80)
      continue;
    int more;
    uint32_t min;
    if (c >= 0xc2 && c <= 0xdf) {
      more = 1;
      min = 0x80;
      c &= 31;
    } else if (c >= 0xe0 && c <= 0xef) {
      more = 2;
      min = 0x800;
      c &= 15;
    } else if (c >= 0xf0 && c <= 0xf4) {
      more = 3;
      min = 0x10000;
      c &= 7;
    } else
      return false;
    if (i + more > n)
      return false;
    while (more--) {
      uint32_t x = static_cast<unsigned char>(s[i++]);
      if ((x & 0xc0) != 0x80)
        return false;
      c = (c << 6) | (x & 63);
    }
    if (c < min || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff))
      return false;
  }
  return true;
}
void relative(const std::string &s, bool empty = false) {
  need((empty && s.empty()) || (!s.empty() && s[0] != '/' && s.back() != '/'),
       "invalid relative path");
  size_t p = 0;
  while (p < s.size()) {
    auto end = s.find('/', p);
    auto c = s.substr(p, end == std::string::npos ? end : end - p);
    need(!c.empty() && c != "." && c != "..", "unsafe path component");
    if (end == std::string::npos)
      break;
    p = end + 1;
  }
}
void basename(const std::string &s) {
  need(s.size() == 64 &&
           std::all_of(s.begin(), s.end(),
                       [](char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }),
       "publication name must be lowercase SHA-256-sized hex");
}
struct stat metadata(int fd) {
  struct stat s{};
  sysneed(fstat(fd, &s) == 0, "fstat");
  return s;
}
void noAcl(int fd) {
  for (const char *name : {"system.posix_acl_access", "system.posix_acl_default"}) {
    errno = 0;
    ssize_t n = fgetxattr(fd, name, nullptr, 0);
    need(n < 0 && (errno == ENODATA || errno == ENOTSUP), "ACL present or unreadable");
  }
}
void safeDirectory(int fd) {
  auto s = metadata(fd);
  need(S_ISDIR(s.st_mode) && (s.st_uid == 0 || s.st_uid == geteuid()) && (s.st_mode & 0022) == 0,
       "untrusted directory owner/mode");
  noAcl(fd);
}
FD root(const std::string &path) {
  need(path.size() > 1 && path[0] == '/' && path.back() != '/', "root must be absolute");
  relative(path.substr(1));
  FD fd(open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC));
  sysneed(fd.n >= 0, "open root");
  safeDirectory(fd.n);
  size_t p = 1;
  while (p < path.size()) {
    auto end = path.find('/', p);
    auto c = path.substr(p, end == std::string::npos ? end : end - p);
    FD next(openat(fd.n, c.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW));
    sysneed(next.n >= 0, "open root component");
    safeDirectory(next.n);
    fd.n = (close(fd.n), next.release());
    if (end == std::string::npos)
      break;
    p = end + 1;
  }
  return fd;
}
FD beneath(int fd, const std::string &path, int flags) {
  relative(path);
  open_how h{};
  h.flags = static_cast<uint64_t>(flags | O_CLOEXEC | O_NOFOLLOW);
  h.resolve = RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_XDEV;
  int out = static_cast<int>(syscall(SYS_openat2, fd, path.c_str(), &h, sizeof(h)));
  sysneed(out >= 0, "openat2");
  return FD(out);
}
void parents(int fd, const std::string &path) {
  size_t p = 0;
  while ((p = path.find('/', p)) != std::string::npos) {
    auto d = beneath(fd, path.substr(0, p), O_RDONLY | O_DIRECTORY);
    safeDirectory(d.n);
    ++p;
  }
}
std::vector<std::string> children(int fd) {
  int copy = fcntl(fd, F_DUPFD_CLOEXEC, 3);
  sysneed(copy >= 0, "dup directory");
  DIR *d = fdopendir(copy);
  if (!d) {
    close(copy);
    sysneed(false, "fdopendir");
  }
  std::vector<std::string> result;
  errno = 0;
  while (auto ent = readdir(d)) {
    std::string n = ent->d_name;
    if (n != "." && n != "..")
      result.push_back(n);
    if (result.size() > 128) {
      closedir(d);
      throw Failure("directory child bound exceeded");
    }
  }
  int error = errno;
  closedir(d);
  if (error)
    throw Failure("readdir", error);
  std::sort(result.begin(), result.end());
  return result;
}
napi_value statObject(napi_env e, const struct stat &s) {
  need(s.st_size >= 0 && static_cast<uint64_t>(s.st_size) <= 9007199254740991ULL, "file too large");
  napi_value o = obj(e);
  set(e, o, "uid", num(e, s.st_uid));
  set(e, o, "gid", num(e, s.st_gid));
  set(e, o, "mode", num(e, s.st_mode & 07777));
  set(e, o, "nlink", num(e, s.st_nlink));
  set(e, o, "size", num(e, s.st_size));
  set(e, o, "device", num(e, s.st_dev));
  set(e, o, "inode", num(e, s.st_ino));
  set(e, o, "type",
      str(e, S_ISDIR(s.st_mode)   ? "directory"
             : S_ISREG(s.st_mode) ? "file"
                                  : "other"));
  return o;
}
void exact(int fd, uid_t uid, gid_t gid, mode_t mode, bool directory, dev_t dev) {
  auto s = metadata(fd);
  need((directory ? S_ISDIR(s.st_mode) : S_ISREG(s.st_mode)) && s.st_uid == uid &&
           s.st_gid == gid && (s.st_mode & 07777) == mode && s.st_dev == dev &&
           (directory || s.st_nlink == 1),
       "unexpected publication metadata");
  noAcl(fd);
}
#define API(name)                                                                                  \
  napi_value name(napi_env e, napi_callback_info info) {                                           \
    try
#define END                                                                                        \
  catch (const Failure &f) {                                                                       \
    napi_value error;                                                                              \
    check(napi_create_error(e, nullptr, str(e, f.what()), &error));                                \
    set(e, error, "errno", num(e, f.number));                                                      \
    set(e, error, "code",                                                                          \
        str(e, f.number == ENOENT   ? "ENOENT"                                                     \
               : f.number == EEXIST ? "EEXIST"                                                     \
               : f.number == EACCES ? "EACCES"                                                     \
               : f.number == ELOOP  ? "ELOOP"                                                      \
               : f.number == EXDEV  ? "EXDEV"                                                      \
               : f.number == EAGAIN ? "EAGAIN"                                                     \
               : f.number == ENOSYS ? "ENOSYS"                                                     \
                                    : "NATIVE_BOUNDARY_ERROR"));                                   \
    set(e, error, "publicationUncertain", boolean(e, f.uncertain));                                \
    napi_throw(e, error);                                                                          \
    return nullptr;                                                                                \
  }                                                                                                \
  catch (const std::exception &f) {                                                                \
    napi_throw_error(e, nullptr, f.what());                                                        \
    return nullptr;                                                                                \
  }                                                                                                \
  }
API(readFile) {
  auto a = args(e, info, 3, 3);
  auto r = root(string(e, a[0]));
  auto p = string(e, a[1]);
  relative(p);
  parents(r.n, p);
  auto f = beneath(r.n, p, O_RDONLY | O_NONBLOCK);
  auto s = metadata(f.n);
  need(S_ISREG(s.st_mode) && s.st_nlink == 1, "regular singly-linked file required");
  noAcl(f.n);
  uint32_t max = integer(e, a[2], 4 * 1024 * 1024);
  need(s.st_size >= 0 && static_cast<uint64_t>(s.st_size) <= max, "file bound exceeded");
  std::vector<char> b(static_cast<size_t>(s.st_size));
  size_t pos = 0;
  while (pos < b.size()) {
    ssize_t n = read(f.n, b.data() + pos, b.size() - pos);
    if (n < 0 && errno == EINTR)
      continue;
    sysneed(n > 0, "short read");
    pos += static_cast<size_t>(n);
  }
  char extra;
  ssize_t n = read(f.n, &extra, 1);
  sysneed(n == 0, "file grew during read");
  auto after = metadata(f.n);
  need(after.st_size == s.st_size && after.st_mtim.tv_sec == s.st_mtim.tv_sec &&
           after.st_mtim.tv_nsec == s.st_mtim.tv_nsec && after.st_ctim.tv_sec == s.st_ctim.tv_sec &&
           after.st_ctim.tv_nsec == s.st_ctim.tv_nsec,
       "file changed during read");
  auto o = statObject(e, s);
  set(e, o, "data", buffer(e, b));
  return o;
}
END

API(inspectDirectory) {
  auto a = args(e, info, 2, 2);
  auto r = root(string(e, a[0]));
  auto p = string(e, a[1]);
  relative(p);
  parents(r.n, p);
  auto d = beneath(r.n, p, O_RDONLY | O_DIRECTORY);
  safeDirectory(d.n);
  auto o = statObject(e, metadata(d.n));
  napi_value list;
  check(napi_create_array(e, &list));
  uint32_t i = 0;
  for (auto &c : children(d.n))
    check(napi_set_element(e, list, i++, str(e, c)));
  set(e, o, "children", list);
  return o;
}
END

API(publishDirectory) {
  bool called = false;
  try {
    auto a = args(e, info, 1, 1);
    auto o = a[0];
    auto r = root(string(e, get(e, o, "rootDirectory")));
    std::string src = string(e, get(e, o, "stageName")),
                dst = string(e, get(e, o, "destinationName"));
    basename(src);
    basename(dst);
    uid_t uid = integer(e, get(e, o, "brokerUid"));
    gid_t gid = integer(e, get(e, o, "recipientGid"));
    need(uid == geteuid() && uid != 0, "publisher must be assigned non-root broker");
    struct statfs fs{};
    sysneed(fstatfs(r.n, &fs) == 0, "fstatfs");
    need(fs.f_type == EXT4_SUPER_MAGIC, "publication requires ext4");
    auto stage = beneath(r.n, "stage", O_RDONLY | O_DIRECTORY),
         inbox = beneath(r.n, "inbox", O_RDONLY | O_DIRECTORY);
    auto dev = metadata(r.n).st_dev;
    exact(stage.n, uid, getegid(), 0700, true, dev);
    exact(inbox.n, uid, gid, 0750, true, dev);
    auto d = beneath(stage.n, src, O_RDONLY | O_DIRECTORY);
    exact(d.n, uid, gid, 0750, true, dev);
    need(metadata(d.n).st_nlink == 2, "unexpected prepared directory links");
    need(children(d.n) == std::vector<std::string>({"document.bin", "publication.json"}),
         "unexpected prepared children");
    for (const char *child : {"document.bin", "publication.json"}) {
      auto f = beneath(d.n, child, O_RDONLY | O_NONBLOCK);
      exact(f.n, uid, gid, 0440, false, dev);
      auto s = metadata(f.n);
      need(s.st_size > 0 && s.st_size <= (strcmp(child, "document.bin") == 0 ? 65536 : 8192),
           "prepared file byte bound");
      sysneed(fsync(f.n) == 0, "fsync prepared file");
    }
    sysneed(fsync(d.n) == 0, "fsync prepared directory");
    sysneed(fsync(stage.n) == 0, "fsync stage before rename");
    called = true;
    sysneed(syscall(SYS_renameat2, stage.n, src.c_str(), inbox.n, dst.c_str(), RENAME_NOREPLACE) ==
                0,
            "renameat2 no-replace");
    sysneed(fsync(inbox.n) == 0, "fsync inbox after rename");
    sysneed(fsync(stage.n) == 0, "fsync stage after rename");
    auto out = obj(e);
    set(e, out, "published", boolean(e, true));
    set(e, out, "durable", boolean(e, true));
    return out;
  } catch (const Failure &f) {
    throw Failure(f.what(), f.number, called);
  } catch (const std::exception &f) {
    throw Failure(f.what(), 0, called);
  }
}
END

struct Lock {
  FD fd;
  explicit Lock(int n) : fd(n) {}
};
void lockFinal(napi_env, void *p, void *) { delete static_cast<Lock *>(p); }
API(acquireLock) {
  auto a = args(e, info, 1, 1);
  auto p = string(e, a[0]);
  auto slash = p.rfind('/');
  need(slash != std::string::npos && slash > 0 && slash + 1 < p.size(),
       "absolute lock path required");
  auto r = root(p.substr(0, slash));
  auto name = p.substr(slash + 1);
  relative(name);
  int fd = openat(r.n, name.c_str(), O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, 0600);
  sysneed(fd >= 0, "open lock");
  FD f(fd);
  auto s = metadata(fd);
  need(S_ISREG(s.st_mode) && s.st_nlink == 1 && s.st_uid == geteuid() &&
           (s.st_mode & 07777) == 0600,
       "unsafe lock file");
  noAcl(fd);
  sysneed(flock(fd, LOCK_EX | LOCK_NB) == 0, "case lock held");
  sysneed(fsync(fd) == 0, "fsync lock");
  sysneed(fsync(r.n) == 0, "fsync lock parent");
  napi_value v;
  auto l = new Lock(f.release());
  check(napi_create_external(e, l, lockFinal, nullptr, &v));
  return v;
}
END

API(releaseLock) {
  auto a = args(e, info, 1, 1);
  void *p;
  check(napi_get_value_external(e, a[0], &p));
  auto l = static_cast<Lock *>(p);
  need(l != nullptr, "invalid lock");
  if (l->fd.n >= 0) {
    close(l->fd.n);
    l->fd.n = -1;
  }
  return undef(e);
}
END

using Clock = std::chrono::steady_clock;
struct Connection {
  FD fd;
  Clock::time_point deadline;
  bool delivered = false;
  explicit Connection(int n, uint32_t ms)
      : fd(n), deadline(Clock::now() + std::chrono::milliseconds(ms)) {}
  void closeNow() {
    if (fd.n >= 0) {
      close(fd.n);
      fd.n = -1;
    }
  }
};
using Conn = std::shared_ptr<Connection>;
struct Listener {
  FD fd;
  uint32_t maxClients, timeout;
  std::vector<Conn> clients;
  Listener(int n, uint32_t m, uint32_t t) : fd(n), maxClients(m), timeout(t) {}
};
void connFinal(napi_env, void *p, void *) { delete static_cast<Conn *>(p); }
void listenerFinal(napi_env, void *p, void *) { delete static_cast<Listener *>(p); }
Conn connection(napi_env e, napi_value v) {
  void *p;
  check(napi_get_value_external(e, v, &p));
  need(p != nullptr, "invalid connection");
  return *static_cast<Conn *>(p);
}
napi_value connValue(napi_env e, Conn c) {
  napi_value v;
  auto ptr = new Conn(c);
  check(napi_create_external(e, ptr, connFinal, nullptr, &v));
  return v;
}
Listener *listener(napi_env e, napi_value v) {
  void *p;
  check(napi_get_value_external(e, v, &p));
  need(p != nullptr, "invalid listener");
  return static_cast<Listener *>(p);
}
sockaddr_un address(const std::string &p) {
  sockaddr_un a{};
  a.sun_family = AF_UNIX;
  need(!p.empty() && p[0] == '/' && p.size() < sizeof(a.sun_path),
       "absolute bounded pathname socket required");
  memcpy(a.sun_path, p.c_str(), p.size() + 1);
  return a;
}
API(listenSocket) {
  auto a = args(e, info, 1, 2);
  auto p = string(e, a[0]);
  auto addr = address(p);
  auto slash = p.rfind('/');
  auto parent = root(p.substr(0, slash));
  (void)parent;
  uint32_t backlog = 16, maxClients = 32, timeout = 2000;
  if (a.size() == 2) {
    backlog = option(e, a[1], "backlog", 16, 64);
    maxClients = option(e, a[1], "maxClients", 32, 128);
    timeout = option(e, a[1], "timeoutMs", 2000, 30000);
  }
  need(backlog && maxClients && timeout, "positive listener bounds required");
  FD s(socket(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0));
  sysneed(s.n >= 0, "socket");
  int yes = 1;
  sysneed(setsockopt(s.n, SOL_SOCKET, SO_PASSCRED, &yes, sizeof(yes)) == 0, "SO_PASSCRED");
  sysneed(bind(s.n, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) == 0,
          "bind (stale socket requires trusted offline cleanup)");
  sysneed(chmod(p.c_str(), 0666) == 0, "chmod socket");
  sysneed(listen(s.n, static_cast<int>(backlog)) == 0, "listen");
  napi_value v;
  auto l = new Listener(s.release(), maxClients, timeout);
  check(napi_create_external(e, l, listenerFinal, nullptr, &v));
  return v;
}
END
    // recvmsg owns and closes every delivered SCM_RIGHTS fd even when payload/control is invalid.
    struct Packet {
  std::vector<char> data;
  ucred cred{};
  bool ready = false, valid = false;
};
Packet receive(int fd, bool requireCredentials) {
  Packet out;
  out.data.resize(FRAME);
  alignas(cmsghdr) char control[CMSG_SPACE(sizeof(ucred)) + CMSG_SPACE(253 * sizeof(int))]{};
  iovec io{out.data.data(), out.data.size()};
  msghdr msg{};
  msg.msg_iov = &io;
  msg.msg_iovlen = 1;
  msg.msg_control = control;
  msg.msg_controllen = sizeof(control);
  ssize_t n = recvmsg(fd, &msg, MSG_DONTWAIT | MSG_CMSG_CLOEXEC);
  if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR))
    return out;
  out.ready = true;
  if (n < 0)
    return out;
  bool bad = n <= 0 || (msg.msg_flags & (MSG_TRUNC | MSG_CTRUNC));
  int credentials = 0;
  for (cmsghdr *c = CMSG_FIRSTHDR(&msg); c; c = CMSG_NXTHDR(&msg, c)) {
    if (c->cmsg_level == SOL_SOCKET && c->cmsg_type == SCM_RIGHTS) {
      bad = true;
      if (c->cmsg_len >= CMSG_LEN(0)) {
        size_t count = (c->cmsg_len - CMSG_LEN(0)) / sizeof(int);
        for (size_t i = 0; i < count; ++i) {
          int received;
          memcpy(&received, CMSG_DATA(c) + i * sizeof(int), sizeof(received));
          close(received);
        }
      }
    } else if (c->cmsg_level == SOL_SOCKET && c->cmsg_type == SCM_CREDENTIALS &&
               c->cmsg_len == CMSG_LEN(sizeof(ucred))) {
      memcpy(&out.cred, CMSG_DATA(c), sizeof(ucred));
      ++credentials;
    } else
      bad = true;
  }
  if (requireCredentials && credentials != 1)
    bad = true;
  if (credentials > 1)
    bad = true;
  if (n > static_cast<ssize_t>(FRAME))
    bad = true;
  if (n > 0 && n <= static_cast<ssize_t>(FRAME)) {
    out.data.resize(static_cast<size_t>(n));
    if (!utf8(out.data.data(), out.data.size()))
      bad = true;
  }
  out.valid = !bad;
  return out;
}
API(pollSocket) {
  auto a = args(e, info, 1, 1);
  auto l = listener(e, a[0]);
  need(l->fd.n >= 0, "listener closed");
  napi_value out;
  check(napi_create_array(e, &out));
  uint32_t index = 0;
  auto now = Clock::now();
  for (auto &c : l->clients)
    if (now >= c->deadline)
      c->closeNow();
  l->clients.erase(std::remove_if(l->clients.begin(), l->clients.end(),
                                  [](const Conn &c) { return c->fd.n < 0; }),
                   l->clients.end());
  for (uint32_t i = 0; i < l->maxClients && l->clients.size() < l->maxClients; ++i) {
    int fd = accept4(l->fd.n, nullptr, nullptr, SOCK_NONBLOCK | SOCK_CLOEXEC);
    if (fd < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)
        break;
      sysneed(false, "accept4");
    }
    FD s(fd);
    int yes = 1;
    sysneed(setsockopt(fd, SOL_SOCKET, SO_PASSCRED, &yes, sizeof(yes)) == 0,
            "accepted SO_PASSCRED");
    l->clients.push_back(std::make_shared<Connection>(s.release(), l->timeout));
  }
  for (auto &c : l->clients) {
    if (c->fd.n < 0 || c->delivered)
      continue;
    auto p = receive(c->fd.n, true);
    if (!p.ready)
      continue;
    if (!p.valid) {
      c->closeNow();
      continue;
    }
    // A ready second receive includes zero-length frames and closes any rights.
    // EOF also refuses dispatch: request clients must remain open for their reply.
    const auto extra = receive(c->fd.n, true);
    if (extra.ready) {
      c->closeNow();
      continue;
    }
    c->delivered = true;
    auto item = obj(e);
    set(e, item, "connection", connValue(e, c));
    set(e, item, "uid", num(e, p.cred.uid));
    set(e, item, "gid", num(e, p.cred.gid));
    set(e, item, "pid", num(e, p.cred.pid));
    set(e, item, "data", buffer(e, p.data));
    check(napi_set_element(e, out, index++, item));
  }
  return out;
}
END

void sendPacket(int fd, const std::vector<char> &b) {
  need(utf8(b.data(), b.size()), "invalid UTF-8 packet");
  ssize_t n = send(fd, b.data(), b.size(), MSG_DONTWAIT | MSG_NOSIGNAL);
  sysneed(n == static_cast<ssize_t>(b.size()), "send packet");
}
API(reply) {
  auto a = args(e, info, 2, 2);
  auto c = connection(e, a[0]);
  need(c->fd.n >= 0, "connection closed");
  try {
    sendPacket(c->fd.n, bytes(e, a[1]));
    c->closeNow();
  } catch (...) {
    c->closeNow();
    throw;
  }
  return undef(e);
}
END

API(closeConnection) {
  auto a = args(e, info, 1, 1);
  connection(e, a[0])->closeNow();
  return undef(e);
}
END

API(closeListener) {
  auto a = args(e, info, 1, 1);
  auto l = listener(e, a[0]);
  for (auto &c : l->clients)
    c->closeNow();
  l->clients.clear();
  if (l->fd.n >= 0) {
    close(l->fd.n);
    l->fd.n = -1;
  }
  return undef(e);
}
END

void waitFd(int fd, short events, uint32_t ms) {
  auto deadline = Clock::now() + std::chrono::milliseconds(ms);
  for (;;) {
    auto left =
        std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
    need(left > 0, "client timeout");
    pollfd p{fd, events, 0};
    int n = poll(&p, 1, static_cast<int>(left));
    if (n < 0 && errno == EINTR)
      continue;
    sysneed(n >= 0, "poll client");
    need(n > 0, "client timeout");
    need((p.revents & events) != 0, "client socket closed");
    return;
  }
}
Conn connectSocket(const std::string &path, uint32_t ms) {
  auto addr = address(path);
  FD fd(socket(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0));
  sysneed(fd.n >= 0, "client socket");
  int n = connect(fd.n, reinterpret_cast<sockaddr *>(&addr), sizeof(addr));
  if (n < 0) {
    need(errno == EINPROGRESS, "client connect failed");
    waitFd(fd.n, POLLOUT, ms);
    int err = 0;
    socklen_t len = sizeof(err);
    sysneed(getsockopt(fd.n, SOL_SOCKET, SO_ERROR, &err, &len) == 0, "connect SO_ERROR");
    need(err == 0, "client connect error");
  }
  return std::make_shared<Connection>(fd.release(), ms);
}
API(connectClient) {
  auto a = args(e, info, 1, 2);
  uint32_t ms = a.size() == 2 ? integer(e, a[1], 30000) : 2000;
  need(ms > 0, "positive timeout required");
  return connValue(e, connectSocket(string(e, a[0]), ms));
}
END

API(clientSend) {
  auto a = args(e, info, 2, 2);
  auto c = connection(e, a[0]);
  need(c->fd.n >= 0 && !c->delivered, "client request already sent or closed");
  sendPacket(c->fd.n, bytes(e, a[1]));
  c->delivered = true;
  return undef(e);
}
END

API(clientReceive) {
  auto a = args(e, info, 1, 2);
  auto c = connection(e, a[0]);
  need(c->fd.n >= 0, "connection closed");
  uint32_t ms = a.size() == 2 ? integer(e, a[1], 30000) : 2000;
  waitFd(c->fd.n, POLLIN, ms);
  auto p = receive(c->fd.n, false);
  c->closeNow();
  need(p.ready && p.valid, "invalid reply");
  return buffer(e, p.data);
}
END

API(sendRequest) {
  auto a = args(e, info, 2, 3);
  uint32_t ms = a.size() == 3 ? integer(e, a[2], 30000) : 2000;
  need(ms > 0, "positive timeout required");
  auto c = connectSocket(string(e, a[0]), ms);
  sendPacket(c->fd.n, bytes(e, a[1]));
  waitFd(c->fd.n, POLLIN, ms);
  auto p = receive(c->fd.n, false);
  need(p.ready && p.valid, "invalid reply");
  return buffer(e, p.data);
}
END

API(hardenProcess) {
  args(e, info, 0, 0);
  sysneed(prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) == 0, "PR_SET_NO_NEW_PRIVS");
  sysneed(prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) == 0, "PR_SET_DUMPABLE");
  need(prctl(PR_GET_DUMPABLE, 0, 0, 0, 0) == 0 && prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) == 1,
       "process hardening unavailable");
  return boolean(e, true);
}
END

napi_value init(napi_env e, napi_value exports) {
#define EXPORT(js, fn)                                                                             \
  {                                                                                                \
    napi_value v;                                                                                  \
    napi_create_function(e, js, NAPI_AUTO_LENGTH, fn, nullptr, &v);                                \
    napi_set_named_property(e, exports, js, v);                                                    \
  }
  EXPORT("readFile", readFile);
  EXPORT("inspectDirectory", inspectDirectory);
  EXPORT("publishDirectory", publishDirectory);
  EXPORT("acquireLock", acquireLock);
  EXPORT("releaseLock", releaseLock);
  EXPORT("listen", listenSocket);
  EXPORT("poll", pollSocket);
  EXPORT("reply", reply);
  EXPORT("closeConnection", closeConnection);
  EXPORT("closeListener", closeListener);
  EXPORT("connectClient", connectClient);
  EXPORT("clientSend", clientSend);
  EXPORT("clientReceive", clientReceive);
  EXPORT("sendRequest", sendRequest);
  EXPORT("hardenProcess", hardenProcess);
  return exports;
}
} // namespace
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

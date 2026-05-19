/**
 * 把 rebang 返回的桌面端 URL 转换成移动端友好的 URL。
 *
 * 设计原则：
 * 1. 已安装对应 App 的用户：移动域通常也在 App 的 applinks 范围内，
 *    点击仍会被 Universal Link / App Links 拦截，行为不变。
 * 2. 未安装 App 的用户：移动端站点排版可读，避免被桌面页 / 登录墙拦截。
 * 3. 未识别的域名原样返回，绝不破坏 URL。
 */
/**
 * 判断字符串是否是绝对的 http(s) URL（带 scheme）。
 * 用来避免把无协议的 URL（例如 "www.ithome.com/xxx"）传给 <a href>，
 * 那样浏览器会按相对路径解析成 "https://当前站点/www.ithome.com/xxx"，
 * 命中站点 404 / 兜底逻辑后跳回首页，引发"点了之后跳到首页"的怪现象。
 */
export function isAbsoluteHttpUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

/**
 * 标准化 rebang 接口返回的 URL：
 * - 空 / 非字符串：原样返回
 * - 缺少 scheme（例如 "www.ithome.com/xxx" 或 "//www.xxx.com/p"）：补全 https://
 * - 已是 http(s) 绝对 URL：原样返回
 */
export function normalizeRebangUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return "https:" + trimmed;
  // 非 http 的特殊 scheme（mailto: / tel: / app:// 等）原样返回
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  // 否则当作裸域名，补 https://
  return "https://" + trimmed;
}

export function toMobileUrl(url: string): string {
  if (!url) return url;
  const normalized = normalizeRebangUrl(url);
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return normalized;
  }

  const host = u.hostname.toLowerCase();

  // 微博：PC 搜索页 -> 移动端搜索页
  if (host === "s.weibo.com") {
    const q = u.searchParams.get("q") ?? "";
    if (q) {
      const containerid = `100103type=1&q=${q}`;
      return `https://m.weibo.cn/search?containerid=${encodeURIComponent(containerid)}`;
    }
    return `https://m.weibo.cn/`;
  }
  if (host === "weibo.com" || host === "www.weibo.com") {
    u.hostname = "m.weibo.cn";
    return u.toString();
  }

  // 虎扑论坛：bbs.hupu.com/<tid>.html -> m.hupu.com/bbs/<tid>.html
  if (host === "bbs.hupu.com") {
    const m = u.pathname.match(/^\/(\d+)\.html$/);
    if (m) return `https://m.hupu.com/bbs/${m[1]}.html${u.search}`;
    u.hostname = "m.hupu.com";
    if (!u.pathname.startsWith("/bbs")) u.pathname = "/bbs" + u.pathname;
    return u.toString();
  }
  if (host === "www.hupu.com" || host === "voice.hupu.com") {
    u.hostname = "m.hupu.com";
    return u.toString();
  }

  // 哔哩哔哩
  if (
    host === "www.bilibili.com" &&
    (u.pathname.startsWith("/video/") || u.pathname.startsWith("/opus/"))
  ) {
    u.hostname = "m.bilibili.com";
    return u.toString();
  }
  if (host === "t.bilibili.com") {
    return `https://m.bilibili.com/dynamic${u.pathname}${u.search}`;
  }

  // 抖音
  if (host === "www.douyin.com") {
    u.hostname = "m.douyin.com";
    return u.toString();
  }

  // 豆瓣
  if (host === "www.douban.com" || host === "douban.com") {
    u.hostname = "m.douban.com";
    return u.toString();
  }

  // 36 氪
  if (host === "36kr.com" || host === "www.36kr.com") {
    u.hostname = "m.36kr.com";
    return u.toString();
  }

  // 澎湃新闻
  if (host === "www.thepaper.cn" || host === "thepaper.cn") {
    u.hostname = "m.thepaper.cn";
    return u.toString();
  }

  // IT 之家
  // PC 文章: https://www.ithome.com/0/AAA/BBB.htm
  // 移动文章: https://m.ithome.com/html/AAABBB.htm
  // 直接换 host 不行(m.ithome.com 上 /0/AAA/BBB.htm 是 404,会触发"链接不对,5s 后跳回首页")。
  if (host === "www.ithome.com" || host === "ithome.com") {
    const m = u.pathname.match(/^\/0\/(\d+)\/(\d+)\.htm$/);
    if (m) {
      return `https://m.ithome.com/html/${m[1]}${m[2]}.htm${u.search}`;
    }
    // 未识别的路径(如频道页 /xxx/),退回桌面 URL 让 IT 之家自己做 UA 适配
    return url;
  }

  // 网易新闻
  if (host === "news.163.com" || host === "www.163.com") {
    u.hostname = "3g.163.com";
    return u.toString();
  }

  // 雪球
  if (host === "xueqiu.com" || host === "www.xueqiu.com") {
    u.hostname = "xueqiu.com";
    // 雪球的 PC 与移动域相同，浏览器会按 UA 自适应；保持原样
    return u.toString();
  }

  // 少数派：自适应良好，原样返回
  if (host === "sspai.com" || host === "www.sspai.com") {
    return u.toString();
  }

  // 虎嗅：响应式站点，原样返回
  if (host === "www.huxiu.com" || host === "huxiu.com") {
    return u.toString();
  }

  // 掘金：响应式站点，原样返回
  if (host === "juejin.cn" || host === "www.juejin.cn") {
    return u.toString();
  }

  // 吾爱破解：响应式 BBS，原样返回
  if (host === "www.52pojie.cn" || host === "52pojie.cn") {
    return u.toString();
  }

  // 小众软件：响应式站点
  if (host === "www.appinn.com" || host === "appinn.com") {
    return u.toString();
  }

  // 反斗限免：响应式站点
  if (host === "www.kawaiifree.com" || host === "kawaiifree.com") {
    return u.toString();
  }

  // 腾讯新闻
  if (host === "news.qq.com") {
    u.hostname = "view.inews.qq.com";
    return u.toString();
  }

  // 知乎：保留 www 域，知乎 m. 站点会强制弹 App 引导，未安装时反而打不开
  // 已安装 App：www.zhihu.com 命中 Universal Link，依然能开 App
  // 未安装 App：www.zhihu.com 在移动浏览器会自动跳转到 m.zhihu.com 的可读页
  if (host === "www.zhihu.com" || host === "zhihu.com") {
    return u.toString();
  }

  return u.toString();
}

/**
 * 判断当前是否处于"移动端"环境（含触屏笔记本会被识别为 coarse pointer）。
 * 必须在浏览器侧调用。
 */
export function isMobileEnv(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
  } catch {
    /* noop */
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

/**
 * 判断当前是否运行在 PWA standalone 模式（已"添加到主屏幕"）。
 */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* noop */
  }
  // iOS Safari 专有
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

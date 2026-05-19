/**
 * rebang 接口对每个平台返回的字段结构差别很大，URL 字段不统一：
 * - 知乎 / 虎扑 / 微博 / 蓝点新闻：www_url
 * - IT 之家 / 吾爱破解 / 小众软件：url
 * - 36 氪 / B 站 / 掘金 / 少数派 / 虎嗅 / 抖音：需要按 ID 字段手工拼接
 *
 * 这个函数收敛 URL 解析逻辑，根据 tabKey + 任意属性容器解析出真正
 * 可点击的链接。无法解析时返回 ""，调用方需自行处理（不渲染 <a>）。
 */
export type RebangAnyItem = Record<string, unknown>;

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return "";
}

export function extractItemUrl(
  tabKey: string,
  item: RebangAnyItem
): string {
  // 通用回退优先级：www_url > url > share_url > link
  const generic =
    str(item.www_url) ||
    str(item.url) ||
    str(item.share_url) ||
    str(item.link);

  // 平台特化拼接（仅当通用字段缺失时使用）。
  // 注意：对于 ID 类字段，不要忽略 generic，已经有就直接用更可靠。
  if (generic) return generic;

  switch (tabKey) {
    case "36kr": {
      const id = str(item.item_id) || str(item.id);
      if (id) return `https://www.36kr.com/p/${id}`;
      return "";
    }
    case "bilibili": {
      const bvid = str(item.bvid);
      if (bvid) return `https://www.bilibili.com/video/${bvid}`;
      const aid = str(item.aid);
      if (aid) return `https://www.bilibili.com/video/av${aid}`;
      return "";
    }
    case "juejin": {
      const id = str(item.id) || str(item.article_id);
      if (id) return `https://juejin.cn/post/${id}`;
      return "";
    }
    case "sspai": {
      const id = str(item.id) || str(item.slug);
      if (id) return `https://sspai.com/post/${id}`;
      return "";
    }
    case "huxiu": {
      const aid = str(item.aid) || str(item.article_id) || str(item.id);
      if (aid) return `https://www.huxiu.com/article/${aid}.html`;
      return "";
    }
    case "douyin": {
      const aid = str(item.aweme_id) || str(item.id);
      if (aid) return `https://www.douyin.com/video/${aid}`;
      return "";
    }
    case "weibo": {
      // 微博热搜：用 word 关键词查搜索页（无 www_url 时兜底）
      const word = str(item.word) || str(item.title);
      if (word) {
        return `https://s.weibo.com/weibo?q=${encodeURIComponent(word)}`;
      }
      return "";
    }
    case "baidu":
    case "baidu-tieba": {
      const word = str(item.word) || str(item.title);
      if (word) {
        return `https://www.baidu.com/s?wd=${encodeURIComponent(word)}`;
      }
      return "";
    }
    default:
      return "";
  }
}

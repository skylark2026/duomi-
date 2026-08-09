// ====== Service Worker v3.6：网络优先策略，彻底修复缓存问题 ======
// v2.2: 数学练习关闭面板时自动保存进度
// v3.0: 趣味乐园旅行青蛙游戏
// v3.1: 写作业分科目、家长自定义任务、非家长模式全播报、宝石累计进化阈值提高
// v3.2: 史蒂夫/爱丽克丝/瑞恩/斯特拉使用图片代替 emoji；新增 images/steve.png 等
// v3.3: L5 泽菲尔(zephyr) / L6 赛瑞斯(sirius) 使用图片；L7 改为末影龙(dragon)
// v3.5: 收下礼物按钮多事件兜底 + 清理动画元素 + 防抖锁
// v3.6: JS/CSS/HTML 改为网络优先策略，修复 SW 缓存导致按钮点击不生效
const CACHE_NAME = 'duomi-v3.6';
const CACHE_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/supabase.js',
  './manifest.json',
  './icon-512.png',
  './images/steve.png',
  './images/alex.png',
  './images/rain.png',
  './images/stella.png',
  './images/zephyr.png',
  './images/sirius.png',
  './images/dragon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 安装时预缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting())
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：JS/CSS/HTML 网络优先，图片缓存优先
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // JS/CSS/HTML → 网络优先（确保拿到最新代码）
  if (isSameOrigin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '')) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他资源（图片等）→ 缓存优先
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(res => {
        if (isSameOrigin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});

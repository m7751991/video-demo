// Service Worker for video-demo
const CACHE_NAME = "video-demo-cache-v2";
// const urlsToCache = ["/", "/index.html", "/favicon.ico"];

// 安装事件 - 预缓存资源
self.addEventListener("install", (event) => {
  console.log("Service Worker installing");
  // event.waitUntil(
  //   caches.open(CACHE_NAME).then((cache) => {
  //     console.log("Service Worker: Caching files");
  //     return cache.addAll(urlsToCache);
  //   })
  // );
});

// 激活事件 - 清理旧缓存
self.addEventListener("activate", (event) => {
  console.log("Service Worker activating");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Service Worker: Clearing old cache");
            return caches.delete(cache);
          }
          return Promise.resolve(); // 确保始终返回一个Promise
        })
      );
    })
  );
});

// 拦截请求
self.addEventListener("fetch", (event) => {
  console.log("Service Worker: Fetching", event.request.url);
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 如果在缓存中找到响应，则返回缓存的版本
      if (cachedResponse) {
        console.log("从缓存返回:", event.request.url);
        return cachedResponse;
      }

      // 否则从网络获取
      return fetch(event.request)
        .then((response) => {
          // 如果是无效响应，直接返回
          if (!response || response.status !== 200) {
            return response;
          }

          // 只缓存.ts文件或其他特定资源
          if (event.request.url.includes(".ts") || event.request.url.includes(".m3u8")) {
            // 克隆响应，因为响应是流，只能使用一次
            const responseToCache = response.clone();

            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
                console.log("缓存文件:", event.request.url);
              })
              .catch((error) => console.error("缓存错误:", error));
          }

          return response;
        })
        .catch((error) => {
          console.error("Fetch失败:", error);
          // 确保即使fetch失败也返回一个Response对象
          return new Response("Network error", {
            status: 408,
            headers: new Headers({
              "Content-Type": "text/plain",
            }),
          });
        });
    })
  );
});

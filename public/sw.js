const CACHE_NAME = 'video-demo-cache-v3';
// 替换原有的固定500MB配置
const getCacheQuota = async () => {
  // 基础配置
  const BASE_QUOTA = 300 * 1024 * 1024; // 300MB保底
  const MAX_QUOTA = 800 * 1024 * 1024; // 800MB上限
  try {
    // 1. 获取存储配额
    const { quota, usage } = await navigator.storage.estimate();
    const remaining = quota - usage;
    // 计算动态配额
    let dynamicQuota = Math.min(
      remaining * 0.5, // 使用剩余配额
      MAX_QUOTA
    );

    return Math.max(BASE_QUOTA, dynamicQuota);
  } catch (error) {
    console.error('配额检测失败，使用默认值:', error);
    return BASE_QUOTA;
  }
};

const MAX_CACHE_SIZE = getCacheQuota();

// 安装事件 - 预缓存资源
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  // event.waitUntil(
  //   caches.open(CACHE_NAME).then((cache) => {
  //     console.log("Service Worker: Caching files");
  //     return cache.addAll(urlsToCache);
  //   })
  // );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const [currentRequests, cacheNames] = await Promise.all([cache.keys(), caches.keys()]);
        // 并行执行两个清理任务
        await Promise.all([
          // 任务1：清理过期缓存
          (async () => {
            for (const request of currentRequests) {
              try {
                const response = await cache.match(request);
                if (!response) continue;

                const expire = response.headers.get('X-Expire-Time');
                if (expire && Date.now() > parseInt(expire)) {
                  await cache.delete(request);
                }
              } catch (error) {
                console.error(`清理缓存失败 ${request.url}:`, error);
              }
            }
          })(),

          // 任务2：清理旧版本缓存
          (async () => {
            for (const name of cacheNames) {
              if (name !== CACHE_NAME) {
                console.log('删除旧缓存:', name);
                await caches.delete(name);
              }
            }
          })(),
        ]);

        console.log('缓存清理完成');
      } catch (error) {
        console.error('激活事件处理失败:', error);
        throw error;
      }
    })()
  );
});

// 拦截请求
self.addEventListener('fetch', (event) => {
  event.respondWith(handlerFetch(event));
});

async function handlerFetch(event) {
  try {
    const url = new URL(event.request.url);
    if (url.pathname.endsWith('.m3u8')) {
      console.log('Service Worker: Fetching', event.request.url);
      return await networkFirst(event);
    } else if (url.pathname.endsWith('.ts')) {
      console.log('Service Worker: Fetching', event.request.url);
      return await cacheFirst(event);
    } else {
      return await fetch(event.request);
    }
  } catch (error) {
    console.error('Fetch失败:', error);
    return new Response('Network error', {
      status: 408,
      headers: new Headers({
        'Content-Type': 'text/plain',
      }),
    });
  }
}

async function networkFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(event.request);
  try {
    const networkResponse = await fetch(event.request);
    // 创建两个克隆：一个用于缓存，一个用于返回
    const cacheClone = networkResponse.clone();
    await cache.put(event.request, cacheClone);
    return networkResponse;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.log('超出配额');
      deleteOldData();
    }
    console.error('Network error:', error);
    return (
      cachedResponse ||
      new Response('Network error', {
        status: 408,
        headers: new Headers({
          'Content-Type': 'text/plain',
        }),
      })
    );
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(event.request);
  if (cachedResponse) {
    console.log('从缓存返回:', event.request.url);
    // 更新访问记录
    await updateAccessTime(event.request);
    return cachedResponse;
  }

  console.log('从网络获取:', event.request.url);

  try {
    const response = await fetch(event.request, {
      cache: 'default',
    });
    // 如果是无效响应，直接返回
    if (!response || response.status !== 200) {
      return response;
    }
    // 添加缓存前检查容量
    await maintainCacheSize(cache);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Last-Used', Date.now());
    newHeaders.set('X-Expire-Time', Date.now() + 5 * 86400 * 1000); // 5天
    const cacheClone = response.clone();
    await cache.put(
      event.request,
      new Response(cacheClone.body, {
        status: cacheClone.status,
        headers: newHeaders,
      })
    );
    console.log('缓存文件:', event.request.url);
    return response;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.log('超出配额');
      deleteOldData();
    }
    console.error('Fetch失败了:', error);
    // 确保即使fetch失败也返回一个Response对象
    return new Response('Network error', {
      status: 408,
      headers: new Headers({
        'Content-Type': 'text/plain',
      }),
    });
  }
}

// 新增容量维护函数
async function maintainCacheSize(cache) {
  const allRequests = await cache.keys();
  let totalSize = 0;
  const items = [];

  // 计算当前缓存总量
  for (const request of allRequests) {
    const response = await cache.match(request);
    const size = response.headers.get('Content-Length') || 0;
    const lastUsed = response.headers.get('X-Last-Used') || 0;
    const expire = parseInt(response.headers.get('X-Expire-Time') || 0);

    totalSize += parseInt(size);
    items.push({
      request,
      size: parseInt(size),
      lastUsed: parseInt(lastUsed),
      expire,
    });
  }
  const quota = await getCacheQuota();

  // 如果总大小超过配额的80%，主动清理
  if (totalSize > quota * 0.8) {
    console.log('缓存接近配额上限，开始清理');
    const freedSpace = await deleteOldData();

    // 如果删除过期内容后仍然超出配额
    if (totalSize - freedSpace > quota * 0.8) {
      // 按最后使用时间排序
      items.sort((a, b) => a.lastUsed - b.lastUsed);

      // 继续删除直到低于配额的70%
      while (totalSize > quota * 0.7 && items.length > 0) {
        const item = items.shift();
        await cache.delete(item.request);
        totalSize -= item.size;
        console.log('LRU淘汰:', item.request.url, '大小:', item.size);
      }
    }
  }
}

async function updateAccessTime(request) {
  const cache = await caches.open(CACHE_NAME);
  const originalResponse = await cache.match(request);
  try {
    // 一次性克隆并读取响应内容
    const responseClone = originalResponse.clone();
    const buffer = await responseClone.arrayBuffer();

    // 创建新headers
    const newHeaders = new Headers(originalResponse.headers);
    newHeaders.set('X-Last-Used', Date.now());
    newHeaders.set('X-Expire-Time', Date.now() + 5 * 86400 * 1000);

    // 创建全新Response对象
    const newResponse = new Response(buffer, {
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: newHeaders,
    });

    await cache.put(request, newResponse);
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      deleteOldData();
    }
    console.error('更新访问记录失败:', error);
  }
}

// 优化删除策略，返回释放的空间大小
async function deleteOldData() {
  const cache = await caches.open(CACHE_NAME);
  const allRequests = await cache.keys();
  let freedSpace = 0;

  // 获取所有缓存项的信息
  const cacheItems = await Promise.all(
    allRequests.map(async (request) => {
      const response = await cache.match(request);
      return {
        request,
        response,
        size: parseInt(response.headers.get('Content-Length') || 0),
        expire: parseInt(response.headers.get('X-Expire-Time') || 0),
        lastUsed: parseInt(response.headers.get('X-Last-Used') || 0),
      };
    })
  );

  // 1. 首先删除过期内容
  for (const item of cacheItems) {
    if (item.expire && Date.now() > item.expire) {
      await cache.delete(item.request);
      freedSpace += item.size;
      console.log('删除过期内容:', item.request.url, '大小:', item.size);
    }
  }

  // 2. 如果空间仍然不足，按最后访问时间删除
  if (freedSpace === 0) {
    const sortedItems = cacheItems
      .filter((item) => !item.expire || Date.now() <= item.expire) // 排除已删除的过期内容
      .sort((a, b) => a.lastUsed - b.lastUsed); // 按最后访问时间排序

    // 删除最早访问的25%的内容
    const itemsToDelete = sortedItems.slice(0, Math.ceil(sortedItems.length * 0.25));
    for (const item of itemsToDelete) {
      await cache.delete(item.request);
      freedSpace += item.size;
      console.log('删除最早访问内容:', item.request.url, '大小:', item.size);
    }
  }

  return freedSpace;
}

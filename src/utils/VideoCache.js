class VideoCache {
  constructor(options = {}) {
    this.options = {
      cacheName: 'hls-video-cache',
      maxCacheSize: 500 * 1024 * 1024, // 500MB
      maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7天
      ...options
    };
    
    this.detector = new PlatformDetector();
    this.db = null;
    
    this.init();
  }
  
  async init() {
    // 根据平台能力选择缓存策略
    if (this.detector.capabilities.hasIndexedDB) {
      await this.initIndexedDB();
    }
  }
  
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.cacheName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 存储视频元数据
        if (!db.objectStoreNames.contains('metadata')) {
          const store = db.createObjectStore('metadata', { keyPath: 'videoId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // 存储视频分片
        if (!db.objectStoreNames.contains('segments')) {
          const store = db.createObjectStore('segments', { keyPath: 'id' });
          store.createIndex('videoId', 'videoId', { unique: false });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };
      
      request.onerror = (error) => {
        console.error('初始化IndexedDB失败:', error);
        reject(error);
      };
    });
  }
  
  // 缓存整个HLS视频
  async cacheHLSVideo(videoId, hlsUrl) {
    if (!this.db) {
      return false;
    }
    
    try {
      // 检查是否已缓存
      const isCached = await this.isVideoCached(videoId);
      if (isCached) {
        return true;
      }
      
      // 获取HLS清单
      const manifestResponse = await fetch(hlsUrl);
      const manifest = await manifestResponse.text();
      
      // 解析清单获取分片URL
      const segmentUrls = this.parseHLSManifest(hlsUrl, manifest);
      
      // 储存元数据
      await this.saveMetadata(videoId, hlsUrl, {
        timestamp: Date.now(),
        manifest: manifest,
        segmentCount: segmentUrls.length
      });
      
      // 缓存所有分片
      for (let i = 0; i < segmentUrls.length; i++) {
        await this.cacheSegment(videoId, i, segmentUrls[i]);
      }
      
      return true;
    } catch (error) {
      console.error('缓存HLS视频失败:', error);
      return false;
    }
  }
  
  // 解析HLS清单
  parseHLSManifest(hlsUrl, manifest) {
    const lines = manifest.split('\n');
    const segmentUrls = [];
    
    let baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].endsWith('.ts')) {
        let segmentUrl = lines[i];
        if (!segmentUrl.startsWith('http')) {
          segmentUrl = baseUrl + segmentUrl;
        }
        segmentUrls.push(segmentUrl);
      }
    }
    
    return segmentUrls;
  }
  
  // 保存视频元数据
  async saveMetadata(videoId, url, metadata) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      
      const request = store.put({
        videoId,
        url,
        ...metadata
      });
      
      request.onsuccess = () => resolve();
      request.onerror = (error) => reject(error);
    });
  }
  
  // 缓存单个分片
  async cacheSegment(videoId, index, url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['segments'], 'readwrite');
        const store = transaction.objectStore('segments');
        
        const request = store.put({
          id: `${videoId}-${index}`,
          videoId,
          index,
          url,
          data: blob,
          timestamp: Date.now()
        });
        
        request.onsuccess = () => resolve();
        request.onerror = (error) => reject(error);
      });
    } catch (error) {
      console.error('缓存分片失败:', url, error);
      throw error;
    }
  }
  
  // 检查视频是否已缓存
  async isVideoCached(videoId) {
    try {
      const metadata = await this.getMetadata(videoId);
      return !!metadata;
    } catch (error) {
      return false;
    }
  }
  
  // 获取元数据
  async getMetadata(videoId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }
      
      const transaction = this.db.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      
      const request = store.get(videoId);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = (error) => {
        reject(error);
      };
    });
  }
  
  // 创建代理HLS清单
  async createProxyManifest(videoId) {
    try {
      const metadata = await this.getMetadata(videoId);
      if (!metadata) {
        throw new Error('视频未缓存');
      }
      
      // 生成基于缓存的清单
      let manifest = metadata.manifest;
      
      // 可以在这里修改清单，例如添加本地URL等
      
      return new Blob([manifest], { type: 'application/vnd.apple.mpegurl' });
    } catch (error) {
      console.error('创建代理清单失败:', error);
      throw error;
    }
  }
  
  // 获取缓存的分片
  async getSegment(videoId, index) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }
      
      const transaction = this.db.transaction(['segments'], 'readonly');
      const store = transaction.objectStore('segments');
      
      const request = store.get(`${videoId}-${index}`);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = (error) => {
        reject(error);
      };
    });
  }
  
  // 自动清理过期缓存
  async cleanupCache() {
    if (!this.db) return;
    
    try {
      // 获取所有元数据
      const allMetadata = await this.getAllMetadata();
      
      // 计算当前缓存大小
      let totalSize = 0;
      let videoSizes = {};
      
      for (const metadata of allMetadata) {
        const segments = await this.getSegmentsByVideoId(metadata.videoId);
        let videoSize = 0;
        
        for (const segment of segments) {
          videoSize += segment.data ? segment.data.size : 0;
        }
        
        videoSizes[metadata.videoId] = videoSize;
        totalSize += videoSize;
      }
      
      // 按最近访问时间排序
      allMetadata.sort((a, b) => a.timestamp - b.timestamp);
      
      // 清理过期视频
      const now = Date.now();
      for (const metadata of allMetadata) {
        // 过期的视频
        if (now - metadata.timestamp > this.options.maxCacheAge) {
          await this.removeVideo(metadata.videoId);
          totalSize -= videoSizes[metadata.videoId] || 0;
        }
      }
      
      // 如果仍然超过最大缓存大小，继续清理较旧的视频
      if (totalSize > this.options.maxCacheSize) {
        for (const metadata of allMetadata) {
          if (totalSize <= this.options.maxCacheSize) {
            break;
          }
          
          await this.removeVideo(metadata.videoId);
          totalSize -= videoSizes[metadata.videoId] || 0;
        }
      }
    } catch (error) {
      console.error('清理缓存失败:', error);
    }
  }
  
  // 获取所有元数据
  async getAllMetadata() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }
      
      const transaction = this.db.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const index = store.index('timestamp');
      
      const request = index.openCursor();
      const items = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      
      request.onerror = (error) => {
        reject(error);
      };
    });
  }
  
  // 获取视频的所有分片
  async getSegmentsByVideoId(videoId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }
      
      const transaction = this.db.transaction(['segments'], 'readonly');
      const store = transaction.objectStore('segments');
      const index = store.index('videoId');
      
      const request = index.openCursor(IDBKeyRange.only(videoId));
      const items = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      
      request.onerror = (error) => {
        reject(error);
      };
    });
  }
  
  // 移除视频
  async removeVideo(videoId) {
    try {
      // 移除元数据
      await this.removeMetadata(videoId);
      
      // 移除所有分片
      await this.removeSegments(videoId);
      
      return true;
    } catch (error) {
      console.error('移除视频失败:', videoId, error);
      return false;
    }
  }
  
  // 移除元数据
  async removeMetadata(videoId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }
      
      const transaction = this.db.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      
      const request = store.delete(videoId);
      
      request.onsuccess = () => resolve();
      request.onerror = (error) => reject(error);
    });
  }
  
  // 移除分片
  async removeSegments(videoId) {
    try {
      const segments = await this.getSegmentsByVideoId(videoId);
      
      for (const segment of segments) {
        await new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['segments'], 'readwrite');
          const store = transaction.objectStore('segments');
          
          const request = store.delete(segment.id);
          
          request.onsuccess = () => resolve();
          request.onerror = (error) => reject(error);
        });
      }
      
      return true;
    } catch (error) {
      console.error('移除分片失败:', videoId, error);
      throw error;
    }
  }
}

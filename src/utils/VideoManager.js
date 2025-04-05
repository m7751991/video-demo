class VideoManager {
  constructor(options = {}) {
    this.options = {
      preloadCount: 2,       // 预加载多少个视频
      autoplay: true,        // 自动播放
      loop: true,            // 循环播放
      enableCache: true,     // 启用缓存
      cacheSize: 500 * 1024 * 1024,  // 缓存大小限制
      debug: false,
      ...options
    };
    
    this.player = new HLSVideoPlayer({
      preloadSegments: 3,
      maxBufferLength: 30,
      lowLatencyMode: false,
      debug: this.options.debug
    });
    
    this.cache = null;
    if (this.options.enableCache) {
      this.cache = new VideoCache({
        maxCacheSize: this.options.cacheSize,
        debug: this.options.debug
      });
    }
    
    this.activeVideos = new Map();  // 当前活跃的视频元素
    this.preloadQueue = [];         // 预加载队列
    this.currentIndex = -1;         // 当前播放的视频索引
    
    // 性能监控数据
    this.performanceData = {
      loadTimes: {},         // 加载时间
      playbackEvents: {},    // 播放事件
      errors: {},            // 错误记录
      bufferingEvents: {}    // 缓冲事件
    };
    
    // 定期清理缓存
    if (this.cache) {
      this._startCacheCleanupTimer();
    }
  }
  
  // 设置视频列表
  setVideoList(videos) {
    this.videoList = videos;
    this._updatePreloadQueue();
    return this;
  }
  
  // 加载指定索引的视频
  async loadVideo(index, videoElement) {
    if (!this.videoList || !this.videoList[index]) {
      throw new Error(`视频索引 ${index} 不存在`);
    }
    
    const videoData = this.videoList[index];
    const startTime = performance.now();
    
    try {
      // 记录此视频元素
      this.activeVideos.set(videoElement, {
        index,
        data: videoData,
        state: 'loading'
      });
      
      // 设置视频属性
      videoElement.loop = this.options.loop;
      videoElement.muted = false; // 默认不静音，但可能需要根据平台调整
      
      // 添加监听器来收集性能数据
      this._attachPerformanceMonitors(videoElement, index);
      
      // 检查缓存
      let useCache = false;
      if (this.cache) {
        useCache = await this.cache.isVideoCached(videoData.id);
      }
      
      if (this.options.debug) {
        console.log(`加载视频 ${index}, ID: ${videoData.id}, 使用缓存: ${useCache}`);
      }
      
      // 更新当前索引
      this.currentIndex = index;
      
      // 设置HLS源
      await this.player.setupVideoSource(
        videoElement, 
        videoData.hlsUrl, 
        this.options.autoplay
      );
      
      // 更新预加载队列
      this._updatePreloadQueue();
      
      // 更新视频状态
      this.activeVideos.get(videoElement).state = 'loaded';
      
      // 记录加载时间
      this.performanceData.loadTimes[videoData.id] = performance.now() - startTime;
      
      return true;
    } catch (error) {
      console.error(`加载视频失败 (索引 ${index}):`, error);
      
      this.performanceData.errors[videoData.id] = {
        time: new Date().toISOString(),
        error: error.message,
        phase: 'load'
      };
      
      // 更新视频状态
      if (this.activeVideos.has(videoElement)) {
        this.activeVideos.get(videoElement).state = 'error';
      }
      
      return false;
    }
  }
  
  // 播放当前视频
  playCurrentVideo() {
    for (const [videoElement, info] of this.activeVideos.entries()) {
      if (info.index === this.currentIndex) {
        videoElement.play().catch(error => {
          console.warn('播放失败, 可能需要用户交互:', error);
          
          this.performanceData.errors[info.data.id] = {
            time: new Date().toISOString(),
            error: error.message,
            phase: 'play'
          };
        });
        break;
      }
    }
  }
  
  // 暂停当前视频
  pauseCurrentVideo() {
    for (const [videoElement, info] of this.activeVideos.entries()) {
      if (info.index === this.currentIndex) {
        videoElement.pause();
        break;
      }
    }
  }
  
  // 移动到下一个视频
  async nextVideo() {
    if (!this.videoList || this.videoList.length === 0) return false;
    
    const nextIndex = (this.currentIndex + 1) % this.videoList.length;
    
    // 找到当前视频的元素
    let currentElement = null;
    for (const [element, info] of this.activeVideos.entries()) {
      if (info.index === this.currentIndex) {
        currentElement = element;
        break;
      }
    }
    
    if (currentElement) {
      return this.loadVideo(nextIndex, currentElement);
    }
    
    return false;
  }
  
  // 移动到上一个视频
  async prevVideo() {
    if (!this.videoList || this.videoList.length === 0) return false;
    
    const prevIndex = (this.currentIndex - 1 + this.videoList.length) % this.videoList.length;
    
    // 找到当前视频的元素
    let currentElement = null;
    for (const [element, info] of this.activeVideos.entries()) {
      if (info.index === this.currentIndex) {
        currentElement = element;
        break;
      }
    }
    
    if (currentElement) {
      return this.loadVideo(prevIndex, currentElement);
    }
    
    return false;
  }
  
  // 销毁/释放资源
  destroy() {
    // 清理所有播放器
    this.player.destroyAllPlayers();
    
    // 清理事件监听器
    for (const videoElement of this.activeVideos.keys()) {
      this._detachPerformanceMonitors(videoElement);
    }
    
    // 清理缓存定时器
    if (this._cacheCleanupTimer) {
      clearInterval(this._cacheCleanupTimer);
    }
    
    this.activeVideos.clear();
    this.preloadQueue = [];
  }
  
  // 预加载视频
  async preloadVideos() {
    if (!this.videoList || this.preloadQueue.length === 0) return;
    
    // 限制同时预加载的数量
    const maxConcurrent = 2;
    const toPreload = this.preloadQueue.slice(0, maxConcurrent);
    
    // 使用Promise.all并行预加载
    await Promise.all(toPreload.map(async (index) => {
      const videoData = this.videoList[index];
      
      if (this.options.debug) {
        console.log(`预加载视频 ${index}, ID: ${videoData.id}`);
      }
      
      // 如果已经缓存，跳过
      if (this.cache && await this.cache.isVideoCached(videoData.id)) {
        return;
      }
      
      // 预加载HLS流
      this.player.preloadHLSStream(videoData.hlsUrl);
      
      // 如果启用了缓存，缓存此视频
      if (this.cache) {
        // 使用requestIdleCallback或setTimeout在空闲时缓存
        const cacheFunc = async () => {
          try {
            await this.cache.cacheHLSVideo(videoData.id, videoData.hlsUrl);
            if (this.options.debug) {
              console.log(`缓存完成: 视频 ${videoData.id}`);
            }
          } catch (error) {
            console.error(`缓存视频失败 ${videoData.id}:`, error);
          }
        };
        
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => cacheFunc());
        } else {
          setTimeout(cacheFunc, 500);
        }
      }
    }));
  }
  
  // 获取性能数据
  getPerformanceData() {
    return this.performanceData;
  }
  
  // 添加性能监控
  _attachPerformanceMonitors(videoElement, index) {
    if (!videoElement) return;
    
    const videoData = this.videoList[index];
    const videoId = videoData.id;
    
    // 清理可能存在的旧监听器
    this._detachPerformanceMonitors(videoElement);
    
    // 监控对象
    const monitors = {
      loadstart: () => this._recordEvent(videoId, 'loadstart'),
      loadedmetadata: () => this._recordEvent(videoId, 'loadedmetadata'),
      loadeddata: () => this._recordEvent(videoId, 'loadeddata'),
      canplay: () => this._recordEvent(videoId, 'canplay'),
      canplaythrough: () => this._recordEvent(videoId, 'canplaythrough'),
      playing: () => this._recordEvent(videoId, 'playing'),
      waiting: () => {
        this._recordEvent(videoId, 'waiting');
        
        // 记录缓冲事件
        if (!this.performanceData.bufferingEvents[videoId]) {
          this.performanceData.bufferingEvents[videoId] = [];
        }
        
        this.performanceData.bufferingEvents[videoId].push({
          start: performance.now(),
          end: null
        });
      },
      progress: () => {
        // 检查是否有未结束的缓冲事件
        const bufferEvents = this.performanceData.bufferingEvents[videoId];
        if (bufferEvents && bufferEvents.length > 0) {
          const lastEvent = bufferEvents[bufferEvents.length - 1];
          if (lastEvent && lastEvent.end === null) {
            // 检查缓冲区是否已填充
            let isBuffered = false;
            for (let i = 0; i < videoElement.buffered.length; i++) {
              if (videoElement.buffered.start(i) <= videoElement.currentTime && 
                  videoElement.currentTime <= videoElement.buffered.end(i)) {
                isBuffered = true;
                break;
              }
            }
            
            if (isBuffered) {
              // 结束缓冲事件
              lastEvent.end = performance.now();
              lastEvent.duration = lastEvent.end - lastEvent.start;
            }
          }
        }
      },
      error: () => {
        const error = videoElement.error;
        
        this.performanceData.errors[videoId] = {
          time: new Date().toISOString(),
          code: error ? error.code : 'unknown',
          message: error ? error.message : 'unknown error',
          phase: 'playback'
        };
      }
    };
    
    // 添加所有监听器
    for (const [event, handler] of Object.entries(monitors)) {
      videoElement.addEventListener(event, handler);
    }
    
    // 保存监听器引用以便后续移除
    videoElement._performanceMonitors = monitors;
  }
  
  // 移除性能监控
  _detachPerformanceMonitors(videoElement) {
    if (!videoElement || !videoElement._performanceMonitors) return;
    
    // 移除所有监听器
    for (const [event, handler] of Object.entries(videoElement._performanceMonitors)) {
      videoElement.removeEventListener(event, handler);
    }
    
    delete videoElement._performanceMonitors;
  }
  
  // 记录事件
  _recordEvent(videoId, event) {
    if (!this.performanceData.playbackEvents[videoId]) {
      this.performanceData.playbackEvents[videoId] = [];
    }
    
    this.performanceData.playbackEvents[videoId].push({
      event,
      time: performance.now()
    });
  }
  
  // 更新预加载队列
  _updatePreloadQueue() {
    if (!this.videoList || this.videoList.length === 0) return;
    
    this.preloadQueue = [];
    
    // 预加载当前视频之后的几个视频
    for (let i = 1; i <= this.options.preloadCount; i++) {
      const nextIndex = (this.currentIndex + i) % this.videoList.length;
      this.preloadQueue.push(nextIndex);
    }
    
    // 预加载前面的一个视频
    const prevIndex = (this.currentIndex - 1 + this.videoList.length) % this.videoList.length;
    this.preloadQueue.push(prevIndex);
    
    // 开始预加载
    this.preloadVideos();
  }
  
  // 启动缓存清理定时器
  _startCacheCleanupTimer() {
    // 每小时清理一次缓存
    this._cacheCleanupTimer = setInterval(() => {
      if (this.cache) {
        this.cache.cleanupCache().catch(error => {
          console.error('缓存清理失败:', error);
        });
      }
    }, 60 * 60 * 1000); // 1小时
  }
}

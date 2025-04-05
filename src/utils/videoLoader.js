import axios from 'axios';
/**
 * 视频分段加载工具类
 */
class VideoLoader {
  /**
   * 创建视频加载器实例
   * @param {Object} options - 配置选项
   * @param {number} options.initialChunkSize - 初始块大小（包含文件头，默认1MB）
   * @param {number} options.chunkSize - 后续块大小（默认512KB）
   * @param {number} options.bufferAhead - 预缓冲秒数（默认30秒）
   * @param {boolean} options.debug - 是否开启调试日志
   */
  constructor(options = {}) {
    this.options = {
      initialChunkSize: 1 * 1024 * 1024, // 1MB
      chunkSize: 512 * 1024, // 512KB
      bufferAhead: 30,
      debug: false,
      ...options,
    };

    this.activeVideos = new Map(); // 跟踪加载中的视频
    this.videoInfo = new Map(); // 存储视频元数据
    this.abortControllers = new Map(); // 用于取消请求
  }

  /**
   * 获取视频信息
   * @param {string} url - 视频URL
   * @returns {Promise<Object>} - 视频信息对象
   */
  async getVideoInfo(url) {
    // 检查缓存
    if (this.videoInfo.has(url)) {
      return this.videoInfo.get(url);
    }

    try {
      const controller = new AbortController();
      this.abortControllers.set(url, controller);

      const response = await axios({
        method: 'HEAD',
        url,
        signal: controller.signal,
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      this.abortControllers.delete(url);

      const info = {
        size: parseInt(response.headers['content-length'] || '0'),
        contentType: response.headers['content-type'] || 'video/mp4',
        acceptRanges: response.headers['accept-ranges'] === 'bytes',
        lastModified: response.headers['last-modified'],
        etag: response.headers['etag'],
      };

      if (this.options.debug) {
        console.log('视频信息:', info);
      }

      // 缓存信息
      this.videoInfo.set(url, info);
      return info;
    } catch (error) {
      if (this.options.debug) {
        console.error('获取视频信息失败:', error);
      }
      throw error;
    }
  }

  /**
   * 加载视频块
   * @param {string} url - 视频URL
   * @param {number} start - 起始字节
   * @param {number} end - 结束字节
   * @returns {Promise<Blob>} - 视频数据块
   */
  async loadChunk(url, start, end) {
    try {
      const controller = new AbortController();
      const key = `${url}-${start}-${end}`;
      this.abortControllers.set(key, controller);

      const response = await axios({
        method: 'GET',
        url,
        headers: {
          Range: `bytes=${start}-${end}`,
          'Cache-Control': 'no-cache',
        },
        responseType: 'blob',
        signal: controller.signal,
        timeout: 30000,
      });

      this.abortControllers.delete(key);

      if (this.options.debug) {
        console.log(`已加载块: ${start}-${end}, 大小: ${response.data.size} 字节`);
      }

      return response.data;
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log(`请求已取消: ${start}-${end}`);
        return new Blob([], { type: 'video/mp4' });
      }

      if (this.options.debug) {
        console.error(`加载块失败 (${start}-${end}):`, error);
      }
      throw error;
    }
  }

  /**
   * 开始加载视频
   * @param {string} url - 视频URL
   * @param {HTMLVideoElement|object} videoElement - 视频元素或VideoJS播放器
   * @returns {Promise<string>} - Blob URL
   */
  async loadVideo(url, videoElement) {
    try {
      // 获取播放器实例或原生视频元素
      const player = videoElement.tagName ? null : videoElement;
      const videoEl = player ? player.el().querySelector('video') : videoElement;
      // 获取视频信息前先进行简单测试
      // 尝试加载小片段检查格式兼容性
      try {
        const testChunk = await this.loadChunk(url, 0, 16383); // 16KB测试
        // 创建一个临时的Blob并测试
        const testBlob = new Blob([testChunk], { type: 'video/mp4' });
        const testUrl = URL.createObjectURL(testBlob);
        // 创建测试视频元素
        const testVideo = document.createElement('video');
        testVideo.style.display = 'none';
        testVideo.muted = true;
        document.body.appendChild(testVideo);
        // 进行兼容性测试
        const canPlay = await new Promise((resolve) => {
          const errorHandler = () => {
            resolve(false);
          };

          const canPlayHandler = () => {
            resolve(true);
          };

          testVideo.addEventListener('error', errorHandler, { once: true });
          testVideo.addEventListener('canplay', canPlayHandler, { once: true });

          // 设置超时
          setTimeout(() => resolve(false), 3000);

          testVideo.src = testUrl;
          testVideo.load();
        });

        // 清理测试资源
        URL.revokeObjectURL(testUrl);
        document.body.removeChild(testVideo);

        // 如果测试显示不兼容，直接使用原始URL
        if (!canPlay) {
          if (this.options.debug) {
            console.warn('视频格式测试失败，将使用直接播放模式');
          }

          if (player) {
            player.src({ src: url, type: 'video/mp4' });
          } else {
            videoEl.src = url;
          }
          return url;
        }
      } catch (testError) {
        if (this.options.debug) {
          console.warn('视频格式测试出错，将尝试继续:', testError);
        }
      }

      // 先获取视频信息
      const info = await this.getVideoInfo(url);

      if (!info.acceptRanges) {
        if (this.options.debug) {
          console.warn('服务器不支持范围请求，回退到直接加载');
        }
        if (player) {
          player.src({ src: url, type: 'video/mp4' });
        } else {
          videoEl.src = url;
        }
        return url;
      }

      // 加载初始块（包含文件头）
      const initialChunkSize = Math.min(this.options.initialChunkSize, info.size);
      const initialChunk = await this.loadChunk(url, 0, initialChunkSize - 1);

      // 创建Blob URL
      const blob = new Blob([initialChunk], { type: info.contentType });
      const blobUrl = URL.createObjectURL(blob);

      // 设置视频源
      if (player) {
        player.src({ src: blobUrl, type: info.contentType });
      } else {
        videoEl.src = blobUrl;
      }

      // 跟踪此视频
      this.activeVideos.set(videoEl, {
        url,
        player,
        blobUrl,
        loadedRanges: [{ start: 0, end: initialChunkSize - 1 }],
        totalSize: info.size,
        loading: false,
        contentType: info.contentType,
      });

      // 设置进度监听
      this.setupProgressMonitoring(videoEl);

      return blobUrl;
    } catch (error) {
      if (this.options.debug) {
        console.error('加载视频失败:', error);
      }
      throw error;
    }
  }

  /**
   * 设置进度监控
   * @param {HTMLVideoElement} videoEl - 视频元素
   */
  setupProgressMonitoring(videoEl) {
    if (!videoEl || !this.activeVideos.has(videoEl)) return;

    // 清除现有监听器
    if (videoEl._progressHandler) {
      videoEl.removeEventListener('timeupdate', videoEl._progressHandler);
      delete videoEl._progressHandler;
    }

    if (videoEl._seekingHandler) {
      videoEl.removeEventListener('seeking', videoEl._seekingHandler);
      delete videoEl._seekingHandler;
    }

    // 创建新监听器
    const timeUpdateHandler = () => this.onTimeUpdate(videoEl);
    const seekingHandler = () => this.onSeeking(videoEl);

    videoEl._progressHandler = timeUpdateHandler;
    videoEl._seekingHandler = seekingHandler;

    videoEl.addEventListener('timeupdate', timeUpdateHandler);
    videoEl.addEventListener('seeking', seekingHandler);
  }

  /**
   * 时间更新事件处理
   * @param {HTMLVideoElement} videoEl - 视频元素
   */
  async onTimeUpdate(videoEl) {
    const videoData = this.activeVideos.get(videoEl);
    if (!videoData || videoData.loading) return;

    // 如果已加载完整个文件，不做任何事
    if (this.hasLoadedEntireFile(videoData)) return;

    // 计算当前播放位置和已加载到的时间
    const currentTime = videoEl.currentTime;
    const duration = videoEl.duration || 0;

    if (!isFinite(duration) || duration <= 0) return;

    // 计算当前缓冲区末尾
    let bufferedEnd = 0;
    for (let i = 0; i < videoEl.buffered.length; i++) {
      if (videoEl.buffered.start(i) <= currentTime && currentTime < videoEl.buffered.end(i)) {
        bufferedEnd = videoEl.buffered.end(i);
        break;
      }
    }

    // 计算缓冲了多少秒
    const bufferedAhead = bufferedEnd - currentTime;

    // 如果缓冲不足，加载更多数据
    if (bufferedAhead < this.options.bufferAhead) {
      this.loadNextChunk(videoEl);
    }
  }

  /**
   * seek事件处理
   * @param {HTMLVideoElement} videoEl - 视频元素
   */
  async onSeeking(videoEl) {
    const videoData = this.activeVideos.get(videoEl);
    if (!videoData) return;

    const currentTime = videoEl.currentTime;
    const duration = videoEl.duration || 0;

    if (!isFinite(duration) || duration <= 0) return;

    // 检查当前时间是否在已缓冲区域内
    let isTimeBuffered = false;
    for (let i = 0; i < videoEl.buffered.length; i++) {
      if (videoEl.buffered.start(i) <= currentTime && currentTime < videoEl.buffered.end(i)) {
        isTimeBuffered = true;
        break;
      }
    }

    // 如果不在已缓冲区域内，加载相应位置的数据
    if (!isTimeBuffered) {
      // 估算要跳转到的字节位置
      const targetPosition = Math.floor((currentTime / duration) * videoData.totalSize);
      await this.loadChunkAtPosition(videoEl, targetPosition);
    }
  }

  /**
   * 在特定位置加载数据块
   * @param {HTMLVideoElement} videoEl - 视频元素
   * @param {number} position - 目标字节位置
   */
  async loadChunkAtPosition(videoEl, position) {
    const videoData = this.activeVideos.get(videoEl);
    if (!videoData || videoData.loading) return;

    // 将位置对齐到块边界
    const alignedPosition = Math.max(0, position - (position % this.options.chunkSize));

    // 检查这个范围是否已经加载
    if (this.isRangeLoaded(videoData, alignedPosition, alignedPosition + this.options.chunkSize - 1)) {
      return;
    }

    videoData.loading = true;

    try {
      const start = alignedPosition;
      const end = Math.min(start + this.options.chunkSize - 1, videoData.totalSize - 1);

      const chunk = await this.loadChunk(videoData.url, start, end);

      // 更新已加载范围
      this.addLoadedRange(videoData, start, end);

      // 更新视频源
      await this.updateVideoSource(videoEl);
    } catch (error) {
      if (this.options.debug) {
        console.error('加载特定位置数据失败:', error);
      }
    } finally {
      videoData.loading = false;
    }
  }

  /**
   * 加载下一个数据块
   * @param {HTMLVideoElement} videoEl - 视频元素
   */
  async loadNextChunk(videoEl) {
    const videoData = this.activeVideos.get(videoEl);
    if (!videoData || videoData.loading) return;

    // 计算下一个需要加载的范围
    const nextRange = this.getNextRangeToLoad(videoData);
    if (!nextRange) return;

    videoData.loading = true;

    try {
      const chunk = await this.loadChunk(videoData.url, nextRange.start, nextRange.end);

      // 更新已加载范围
      this.addLoadedRange(videoData, nextRange.start, nextRange.end);

      // 更新视频源
      await this.updateVideoSource(videoEl);
    } catch (error) {
      if (this.options.debug) {
        console.error('加载下一块数据失败:', error);
      }
    } finally {
      videoData.loading = false;
    }
  }

  /**
   * 更新视频源
   * @param {HTMLVideoElement} videoEl - 视频元素
   */
  async updateVideoSource(videoEl) {
    const videoData = this.activeVideos.get(videoEl);
    if (!videoData) return;

    // 保存当前状态
    const currentTime = videoEl.currentTime;
    const wasPlaying = !videoEl.paused;

    try {
      // 排序加载范围，确保按顺序合并
      videoData.loadedRanges.sort((a, b) => a.start - b.start);

      // 检查是否有连续的范围
      const ranges = this.normalizeRanges(videoData.loadedRanges);

      // 如果范围不连续，可能会导致播放问题
      if (ranges.length > 1 && this.options.debug) {
        console.warn('警告: 视频数据范围不连续，可能导致播放问题');
      }

      // 获取所有已加载的块
      const blobParts = [];
      let lastEnd = -1;

      for (const range of ranges) {
        // 确保范围是连续的
        if (lastEnd !== -1 && range.start > lastEnd + 1) {
          // 尝试加载中间缺失的部分
          const gapChunk = await this.loadChunk(videoData.url, lastEnd + 1, range.start - 1);
          blobParts.push(gapChunk);
        }

        const chunk = await this.loadChunk(videoData.url, range.start, range.end);
        blobParts.push(chunk);
        lastEnd = range.end;
      }

      // 创建新的Blob URL
      const blob = new Blob(blobParts, { type: videoData.contentType });
      const newBlobUrl = URL.createObjectURL(blob);

      // 移除旧的URL
      URL.revokeObjectURL(videoData.blobUrl);

      // 设置新的URL
      if (videoData.player) {
        const oldCurrentTime = currentTime;
        videoData.player.src({ src: newBlobUrl, type: videoData.contentType });

        // 使用事件监听确保元数据加载后再设置currentTime
        videoData.player.one('loadedmetadata', () => {
          try {
            videoData.player.currentTime(oldCurrentTime);
            if (wasPlaying) {
              videoData.player.play();
            }
          } catch (e) {
            if (this.options.debug) {
              console.warn('恢复播放位置失败:', e);
            }
          }
        });
      } else {
        videoEl.src = newBlobUrl;

        // 等待元数据加载
        await new Promise((resolve) => {
          const metadataHandler = () => {
            videoEl.removeEventListener('loadedmetadata', metadataHandler);
            resolve();
          };
          videoEl.addEventListener('loadedmetadata', metadataHandler);

          // 设置超时以防止无限等待
          setTimeout(resolve, 2000);
        });

        // 恢复播放位置和状态
        try {
          videoEl.currentTime = currentTime;
          if (wasPlaying) {
            await videoEl.play();
          }
        } catch (e) {
          if (this.options.debug) {
            console.warn('恢复播放状态失败:', e);
          }
        }
      }

      // 更新状态
      videoData.blobUrl = newBlobUrl;
    } catch (error) {
      if (this.options.debug) {
        console.error('更新视频源失败:', error);
      }

      // 如果更新失败，尝试直接使用原始URL
      this.fallbackToDirectPlay(videoEl, videoData.url);
    }
  }

  // 添加这个新方法来规范化范围
  normalizeRanges(ranges) {
    if (ranges.length <= 1) return [...ranges];

    // 复制一份以避免修改原始数据
    const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
    const result = [sortedRanges[0]];

    for (let i = 1; i < sortedRanges.length; i++) {
      const current = sortedRanges[i];
      const last = result[result.length - 1];

      // 如果与上一个范围重叠或相邻
      if (current.start <= last.end + 1) {
        // 合并范围
        last.end = Math.max(last.end, current.end);
      } else {
        // 否则添加为新范围
        result.push({ ...current });
      }
    }

    return result;
  }

  // 添加降级方法
  fallbackToDirectPlay(videoEl, originalUrl) {
    if (this.options.debug) {
      console.warn('分段加载失败，降级到直接播放:', originalUrl);
    }

    const videoData = this.activeVideos.get(videoEl);
    if (!videoData) return;

    // 保存状态
    const currentTime = videoEl.currentTime;
    const wasPlaying = !videoEl.paused;

    // 使用原始URL
    if (videoData.player) {
      videoData.player.src({ src: originalUrl, type: videoData.contentType });

      videoData.player.one('loadeddata', () => {
        try {
          if (currentTime > 0) {
            videoData.player.currentTime(currentTime);
          }
          if (wasPlaying) {
            videoData.player.play();
          }
        } catch (e) {
          console.warn('恢复播放状态失败:', e);
        }
      });
    } else {
      videoEl.src = originalUrl;

      videoEl.addEventListener(
        'loadeddata',
        () => {
          try {
            if (currentTime > 0) {
              videoEl.currentTime = currentTime;
            }
            if (wasPlaying) {
              videoEl.play();
            }
          } catch (e) {
            console.warn('恢复播放状态失败:', e);
          }
        },
        { once: true }
      );
    }

    // 标记此视频为直接播放模式
    videoData.directPlayMode = true;
  }

  /**
   * 添加已加载的范围
   * @param {Object} videoData - 视频数据
   * @param {number} start - 起始字节
   * @param {number} end - 结束字节
   */
  addLoadedRange(videoData, start, end) {
    const ranges = videoData.loadedRanges;

    // 按起始位置排序
    ranges.sort((a, b) => a.start - b.start);

    // 检查是否可以合并到现有范围
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];

      // 如果新范围在现有范围内，不需要添加
      if (start >= range.start && end <= range.end) {
        return;
      }

      // 如果新范围与现有范围相邻或重叠
      if ((start <= range.end + 1 && end >= range.start - 1) || (end >= range.start - 1 && start <= range.end + 1)) {
        // 合并范围
        range.start = Math.min(range.start, start);
        range.end = Math.max(range.end, end);

        // 检查是否可以合并相邻范围
        let merged = true;
        while (merged && ranges.length > 1) {
          merged = false;
          for (let j = 0; j < ranges.length - 1; j++) {
            if (ranges[j].end + 1 >= ranges[j + 1].start) {
              ranges[j].end = Math.max(ranges[j].end, ranges[j + 1].end);
              ranges.splice(j + 1, 1);
              merged = true;
              break;
            }
          }
        }

        return;
      }
    }

    // 如果无法合并，添加新范围
    ranges.push({ start, end });

    // 再次排序
    ranges.sort((a, b) => a.start - b.start);
  }

  /**
   * 获取下一个需要加载的范围
   * @param {Object} videoData - 视频数据
   * @returns {Object|null} - 下一个范围 {start, end}
   */
  getNextRangeToLoad(videoData) {
    const ranges = videoData.loadedRanges;

    // 如果没有已加载范围，从头开始加载
    if (ranges.length === 0) {
      const end = Math.min(this.options.chunkSize - 1, videoData.totalSize - 1);
      return { start: 0, end };
    }

    // 按起始位置排序
    ranges.sort((a, b) => a.start - b.start);

    // 找到最后一个范围的结束位置
    const lastRange = ranges[ranges.length - 1];

    // 如果已经加载到文件末尾，返回null
    if (lastRange.end >= videoData.totalSize - 1) {
      return null;
    }

    // 计算下一个范围
    const nextStart = lastRange.end + 1;
    const nextEnd = Math.min(nextStart + this.options.chunkSize - 1, videoData.totalSize - 1);

    return { start: nextStart, end: nextEnd };
  }

  /**
   * 检查是否已加载整个文件
   * @param {Object} videoData - 视频数据
   * @returns {boolean} - 是否已加载整个文件
   */
  hasLoadedEntireFile(videoData) {
    if (videoData.loadedRanges.length === 0) return false;

    // 只需检查是否有一个范围覆盖了整个文件
    for (const range of videoData.loadedRanges) {
      if (range.start === 0 && range.end >= videoData.totalSize - 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查范围是否已加载
   * @param {Object} videoData - 视频数据
   * @param {number} start - 起始字节
   * @param {number} end - 结束字节
   * @returns {boolean} - 范围是否已加载
   */
  isRangeLoaded(videoData, start, end) {
    for (const range of videoData.loadedRanges) {
      if (start >= range.start && end <= range.end) {
        return true;
      }
    }
    return false;
  }

  /**
   * 取消加载视频
   * @param {HTMLVideoElement|object} videoElement - 视频元素或VideoJS播放器
   */
  cancelLoad(videoElement) {
    // 获取播放器实例或原生视频元素
    const player = videoElement.tagName ? null : videoElement;
    const videoEl = player ? player.el().querySelector('video') : videoElement;

    const videoData = this.activeVideos.get(videoEl);
    if (!videoData) return;

    // 移除事件监听器
    if (videoEl._progressHandler) {
      videoEl.removeEventListener('timeupdate', videoEl._progressHandler);
      delete videoEl._progressHandler;
    }

    if (videoEl._seekingHandler) {
      videoEl.removeEventListener('seeking', videoEl._seekingHandler);
      delete videoEl._seekingHandler;
    }

    // 释放Blob URL
    URL.revokeObjectURL(videoData.blobUrl);

    // 取消正在进行的请求
    for (const [key, controller] of this.abortControllers.entries()) {
      if (key.startsWith(videoData.url)) {
        controller.abort();
        this.abortControllers.delete(key);
      }
    }

    // 移除视频数据
    this.activeVideos.delete(videoEl);
  }

  /**
   * 清理所有资源
   */
  dispose() {
    // 取消所有请求
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();

    // 清理所有视频
    for (const videoEl of this.activeVideos.keys()) {
      this.cancelLoad(videoEl);
    }

    this.activeVideos.clear();
    this.videoInfo.clear();
  }
}

// 创建单例实例
const videoLoader = new VideoLoader();

export default videoLoader;

import PlatformDetector from "./PlatformDetector";
import Hls from "hls.js";

class HLSVideoPlayer {
  constructor(options = {}) {
    this.options = {
      // preloadSegments: 3,
      maxBufferLength: 6,
      maxMaxBufferLength: 30,
      maxBufferSize: 10 * 1000 * 1000,
      startLevel: -1,
      capLevelToPlayerSize: true, // 根据屏幕大小调整质量
      maxLevelCappingMode: "downscale", // 下调质量模式
      enableWorker: true,
      levelLoadingMaxRetry: 4,
      lowLatencyMode: true, //低延迟模式
      // 预加载相关
      startFragPrefetch: true,
      fragLoadingMaxRetry: 4, //分片加载重试次数
      manifestLoadingMaxRetry: 4, //清单加载重试次数
      debug: false,
      ...options,
    };

    this.detector = new PlatformDetector();
    this.players = new Map();
    this.videoJsInstance = null;

    this.Hls = Hls;

    if (this.options.debug) {
      console.log("平台信息:", this.detector.platform);
      console.log("功能支持:", this.detector.capabilities);
    }
  }

  adjustHlsBufferConfig(hls) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const deviceMemory = navigator.deviceMemory || 4; // 默认假设为4GB

    const updateBufferConfig = () => {
      let maxBufferLength;
      let maxBufferSize;

      // 根据网络速度调整缓冲配置
      if (connection) {
        const speed = connection.downlink; // 网络速度，单位为 Mbps
        if (speed < 1) {
          maxBufferLength = 6; // 网络慢时，减少缓冲长度
          maxBufferSize = 5 * 1024 * 1024; // 5MB
        } else if (speed < 3) {
          maxBufferLength = 20; // 中等速度
          maxBufferSize = 10 * 1024 * 1024; // 10MB
        } else {
          maxBufferLength = 30; // 网络快时，增加缓冲长度
          maxBufferSize = 20 * 1024 * 1024; // 20MB
        }
      }

      // 根据设备内存调整缓冲配置
      if (deviceMemory < 2) {
        maxBufferLength = Math.min(maxBufferLength, 6); // 低内存设备，限制缓冲长度
        maxBufferSize = Math.min(maxBufferSize, 5 * 1024 * 1024); // 5MB
      } else if (deviceMemory < 4) {
        maxBufferLength = Math.min(maxBufferLength, 20); // 中等内存设备
        maxBufferSize = Math.min(maxBufferSize, 10 * 1024 * 1024); // 10MB
      }

      // 更新 HLS.js 配置
      hls.config.maxBufferLength = maxBufferLength;
      hls.config.maxBufferSize = maxBufferSize;

      console.log(`Buffer config updated: maxBufferLength=${maxBufferLength}, maxBufferSize=${maxBufferSize}`);
    };

    updateBufferConfig();

    // 监听网络变化
    if (connection) {
      connection.addEventListener("change", updateBufferConfig);
    }
  }

  // 为视频元素设置HLS源
  setupVideoSource(videoJsInstance, hlsUrl) {
    const videoElement = videoJsInstance.tech_.el_;

    if (!videoElement || !hlsUrl) {
      throw new Error("需要提供视频元素和HLS URL");
    }
    try {
      // 清理可能存在的旧播放器
      this.destroyPlayer(videoElement);

      let player = null;
      let hls = null;
      // 根据平台和能力选择最佳播放方式
      if (this.detector.capabilities.hasNativeHLS) {
        try {
          // 使用原生HLS支持
          videoJsInstance.src(hlsUrl);
          player = { type: "native", instance: null };
        } catch (error) {
          console.log("原生HLS支持失败", error);
        }
      } else if (this.detector.capabilities.hasMSE && this.Hls && this.Hls.isSupported()) {
        hls = new this.Hls(this.options);
        this.adjustHlsBufferConfig(hls);
        hls.attachMedia(videoElement);
        // 监听媒体附加事件
        hls.loadSource(hlsUrl);
        hls.on(this.Hls.Events.MEDIA_ATTACHED, function (event, data) {
          console.log("媒体元素已附加，加载源");
        });
        hls.on(this.Hls.Events.BUFFER_APPENDING, function (event, data) {
          // console.log("BUFFER_APPENDING", data);
        });
        hls.on(this.Hls.Events.BUFFER_FLUSHING, function (event, data) {
          // console.log("BUFFER_FLUSHING", data);
        });

        player = { type: "hlsjs", instance: hls };
        // 设置事件处理
        hls.on(this.Hls.Events.MANIFEST_PARSED, () => {
          console.log("HLS 清单解析完成");
          // if (autoplay) {
          //   this.playWithRetry(videoElement);
          // }
        });

        hls.on(this.Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case this.Hls.ErrorTypes.NETWORK_ERROR:
                // 网络错误，尝试恢复
                hls.startLoad();
                break;
              case this.Hls.ErrorTypes.MEDIA_ERROR:
                // 媒体错误，尝试恢复
                hls.recoverMediaError();
                break;
              default:
                // 无法恢复的错误
                // this.destroyPlayer(videoElement);
                break;
            }
          }
        });
      } else {
        // 降级：直接使用视频URL
        // 这可能不会播放HLS，但至少可以尝试
        videoJsInstance.src({ src: hlsUrl.replace(".m3u8", ".mp4"), type: "video/mp4" });
        player = { type: "fallback", instance: null };
      }
      // 注册播放器
      this.players.set(videoElement, player);
      return hls;
    } catch (error) {
      console.log("setupVideoSource", error);
    }
  }

  updateVideoSource(videoElement, hlsUrl, videoJsInstance) {
    console.log(hlsUrl, "更新视频源");
    const hlsInstance = this.players.get(videoElement).instance;
    if (hlsInstance) {
      hlsInstance.loadSource(hlsUrl); // 加载新源，避免缓存
    } else {
      console.log("非hlsjs播放");
      videoJsInstance.src(hlsUrl);
    }
  }

  // 销毁播放器实例
  destroyPlayer(videoElement) {
    if (!this.players.has(videoElement)) {
      return;
    }

    const player = this.players.get(videoElement);

    if (player.type === "hlsjs" && player.instance) {
      player.instance.destroy();
    }
    this.players.delete(videoElement);
  }

  // 批量清理资源
  destroyAllPlayers() {
    for (const videoElement of this.players.keys()) {
      this.destroyPlayer(videoElement);
    }
  }
}

export default HLSVideoPlayer;

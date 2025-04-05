import { VIDEO_CONSTANTS } from "../constants/video";

// 防抖函数
export const debounce = (fn, delay) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

// RAF 包装器
export const rafWrapper = (callback) => {
  let ticking = false;
  return (...args) => {
    if (!ticking) {
      requestAnimationFrame(() => {
        callback(...args);
        ticking = false;
      });
      ticking = true;
    }
  };
};

// 错误处理工具
export const handleVideoError = (error) => {
  const { MESSAGES } = VIDEO_CONSTANTS.ERROR;

  if (error.name === "NotAllowedError") {
    return MESSAGES.NOT_ALLOWED;
  } else if (error.name === "NotSupportedError") {
    return MESSAGES.NOT_SUPPORTED;
  }
  return MESSAGES.GENERIC_ERROR;
};

// 视频位置计算工具
export const calculateVideoPosition = (currentIndex, height) => {
  return -(currentIndex * height);
};

// 检查滑动是否有效
export const isValidSwipe = (deltaY, minDistance) => {
  return Math.abs(deltaY) >= minDistance;
};

// 添加预加载管理器
export const PreloadManager = {
  preloadedUrls: new Set(),

  preload(url) {
    if (this.preloadedUrls.has(url)) return;
    console.log("preload", url);
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "video";
    link.href = url;
    document.head.appendChild(link);
    this.preloadedUrls.add(url);
  },

  // 预加载指定范围的视频
  preloadRange(urls) {
    console.log("preloadRange", urls);
    urls.forEach((url) => {
      this.preload(url);
    });
  },
};

// 添加 iOS 检测函数
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

const loadVideo = () => {
  const isHlsStream = props.src.indexOf(".m3u8") > -1;

  if (isHlsStream) {
    console.log("HLS 流:", props.src);

    // 清理旧的 hls 实例
    if (hlsInstance.value) {
      hlsInstance.value.destroy();
      hlsInstance.value = null;
    }

    // iOS 设备使用原生 HLS 支持
    if (isIOS()) {
      console.log("iOS 设备，使用原生 HLS 支持");
      player.value.src({
        src: props.src,
        type: "application/x-mpegURL",
      });
      return;
    }

    // 检查非iOS设备是否支持 hls.js
    if (Hls.isSupported()) {
      console.log("使用 hls.js 播放视频");
      // 获取原始视频元素
      const videoElement = player.value.tech_.el_;
      // 创建新的 hls 实例
      const hls = new Hls({
        debug: true,
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        backBufferLength: 30,
      });

      // 错误处理
      hls.on(Hls.Events.ERROR, function (event, data) {
        console.log("HLS 错误:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("网络错误，尝试恢复...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("媒体错误，尝试恢复...");
              hls.recoverMediaError();
              break;
            default:
              console.log("无法恢复的错误:", data);
              break;
          }
        }
      });

      // 监听清单解析完成事件
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        console.log("HLS 清单解析完成，开始播放");
        player.value.play().catch((e) => {
          console.warn("自动播放失败:", e);
        });
      });

      // 监听媒体附加事件
      hls.on(Hls.Events.MEDIA_ATTACHED, function () {
        console.log("111111");
        hls.loadSource(props.src);
      });

      // 附加媒体元素
      hls.attachMedia(videoElement);

      // 保存实例以便后续清理
      hlsInstance.value = hls;
    } else if (videoEl.value.canPlayType("application/vnd.apple.mpegurl")) {
      // 如果浏览器原生支持 HLS (Safari/iOS)
      console.log("使用浏览器原生支持播放 HLS");
      player.value.src({
        src: props.src,
        type: "application/x-mpegURL",
      });
    } else {
      console.error("您的浏览器不支持 HLS 播放");
      errorMessage.value = "您的浏览器不支持此视频格式";
    }
  } else {
    console.log("非 HLS 流");
    // 非 HLS 流使用之前的 videoLoader
    videoLoader.loadVideo(props.src, player.value).catch((err) => {
      console.error("视频加载失败，回退到直接播放:", err);
      // 出错时回退到直接播放方式
      player.value.src({ src: props.src, type: "video/mp4" });
    });
  }
};

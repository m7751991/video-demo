export default class PlatformDetector {
  constructor() {
    this.platform = this.detectPlatform();
    this.capabilities = this.detectCapabilities();
  }

  detectPlatform() {
    const ua = navigator.userAgent;
    // 检测小程序环境
    const isWeChatMiniProgram = /miniProgram/i.test(ua) || window.__wxjs_environment === "miniprogram";
    // 检测iOS
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    // 检测Android
    const isAndroid = /Android/i.test(ua);
    return {
      isWeChatMiniProgram,
      isIOS,
      isAndroid,
      // 详细的WebView信息
      webView: this.detectWebViewDetails(ua, isIOS, isAndroid),
    };
  }

  detectWebViewDetails(ua, isIOS, isAndroid) {
    if (isIOS) {
      const matches = ua.match(/OS (\d+)_(\d+)_?(\d+)?/);
      const version = matches ? parseInt(matches[1], 10) : null;
      return {
        type: "WKWebView",
        version: version,
        isModern: version >= 11, // iOS 11+视为现代WebView
      };
    }

    if (isAndroid) {
      const chromeVersion = this.getChromeVersion(ua);
      return {
        type: "Android WebView",
        chromeVersion: chromeVersion,
        isModern: chromeVersion >= 68, // Chrome 68+视为现代WebView
      };
    }

    return { type: "unknown", isModern: true };
  }

  getChromeVersion(ua) {
    const match = ua.match(/Chrome\/(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
  }

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  supportsNativeHLS() {
    if (this.isIOS()) {
      const video = document.createElement("video");
      return video.canPlayType("application/vnd.apple.mpegurl") !== "";
    }
    return false;
  }
  detectCapabilities() {
    const video = document.createElement("video");

    return {
      // 检测原生HLS支持
      hasNativeHLS: this.supportsNativeHLS(),
      // 检测MSE支持（用于hls.js降级）
      hasMSE: "MediaSource" in window,
      // 检测video元素基本支持
      hasVideoSupport: "canPlayType" in video,
      // 检测IndexedDB（用于缓存）
      hasIndexedDB: "indexedDB" in window,
      // 检测ServiceWorker（用于高级缓存）
      hasServiceWorker: "serviceWorker" in navigator,
      // 检测网络信息API
      hasNetworkInfo: "connection" in navigator,
      // 检测WebAssembly支持（用于hls.js高级功能）
      hasWasm: typeof WebAssembly === "object",
    };
  }
}

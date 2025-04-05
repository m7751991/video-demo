// 视频播放器相关常量
export const VIDEO_CONSTANTS = {
  // 播放器配置
  PLAYER_OPTIONS: {
    controls: true,
    autoplay: false,
    // preload: 'auto',
    fluid: true,
    loadingSpinner: true,
    timeout: 10000,
    controlBar: {
      children: ["playToggle", "progressControl", "currentTimeDisplay", "timeDivider", "durationDisplay", "volumePanel"],
    },
  },

  // 手势相关
  GESTURE: {
    THRESHOLD_DISTANCE: 80,
    MIN_SWIPE_DISTANCE: 50,
    SWITCH_THROTTLE: 300,
    TRANSITION_DURATION: "0.3s",
  },

  // 错误重试
  ERROR: {
    MAX_RETRIES: 3,
    MESSAGES: {
      INIT_FAILED: "播放器初始化失败",
      NOT_ALLOWED: "自动播放被阻止，请点击播放",
      NOT_SUPPORTED: "视频格式不支持",
      GENERIC_ERROR: "播放出错，请重试",
      MAX_RETRIES_REACHED: "视频加载失败，请刷新页面重试",
    },
  },
};

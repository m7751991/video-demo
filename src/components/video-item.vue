<template>
  <div class="video-wrapper">
    <video ref="videoEl" class="video-js video-item" controls playsinline x5-video-player-type="h5">
      <p class="vjs-no-js">请升级浏览器以支持 HTML5 视频播放</p>
    </video>
    <!-- 错误提示遮罩 -->
    <div v-if="errorMessage" class="error-mask">
      <p>{{ errorMessage }}</p>
      <button @click="retryPlay">重试</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import videojs from "video.js/dist/video.min.js";
import "video.js/dist/video-js.min.css";
import { VIDEO_CONSTANTS } from "../constants/video";
import { useVideoEvents } from "../hooks/useVideoEvents";
import videoLoader from "../utils/videoLoader";
import Hls from "hls.js";
import HLSVideoPlayer from "../utils/HLSVideoPlayer";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
  globMuted: {
    type: Boolean,
    default: true,
  },
});

watch(
  () => props.globMuted,
  (newVal) => {
    console.log("newVal", newVal);
    player.value.muted(newVal);
  }
);
watch(
  () => props.src,
  () => {
    console.log("props.src", props.src);

    hlsPlayer.updateVideoSource(player.value.tech_.el_, props.src, player.value);
  }
);
const videoEl = ref(null);
const player = ref(null);
const hlsInstance = ref(null);

const hlsPlayer = new HLSVideoPlayer();

const emit = defineEmits(["cancelMuted", "error", "play", "pause", "ended", "loadedData"]);

// 状态管理
const { playStatus, errorMessage, onPlay, onPause, onError, onEnd, retryPlay, onLoadStart, onWaiting, onLoadedData, onAbort, handlePlayError } = useVideoEvents(emit);

// 初始化 video.js
const initializePlayer = () => {
  try {
    player.value = videojs(videoEl.value, {
      ...VIDEO_CONSTANTS.PLAYER_OPTIONS,
      muted: props.globMuted,
      html5: {
        nativeVideoTracks: false,
        nativeAudioTracks: false,
      },
      fullscreen: { enabled: false },
      pip: false,
    });

    hlsPlayer.setupVideoSource(player.value, props.src);
    // 事件监听
    player.value.on("play", onPlay);
    player.value.on("pause", onPause);
    player.value.on("error", onError);
    player.value.on("ended", onEnd);
    player.value.on("loadstart", onLoadStart);
    player.value.on("waiting", onWaiting);
    player.value.on("loadeddata", onLoadedData);
    player.value.on("abort", onAbort);
  } catch (error) {
    console.error("播放器初始化失败:", error);
    errorMessage.value = VIDEO_CONSTANTS.ERROR.MESSAGES.INIT_FAILED;
  }
};
// 播放控制
const play = async () => {
  try {
    await player.value.play();
    playStatus.value = true;
    emit("play");
  } catch (error) {
    handlePlayError(error);
  }
};

const pause = async () => {
  try {
    await player.value?.pause();
    playStatus.value = false;
    emit("pause");
  } catch (error) {
    console.error("暂停失败:", error);
  }
};

// 生命周期
onMounted(() => {
  initializePlayer();
});

onUnmounted(() => {
  // 清理 hls 实例
  hlsPlayer.destroyAllPlayers();
  // 清理 videojs 实例
  if (player.value) {
    player.value.dispose();
  }
});

// 修改 retryPlay 方法，支持 hls.js 重试
// const originalRetryPlay = retryPlay;
// retryPlay = () => {
//   errorMessage.value = "";

//   const isHls = props.src.indexOf(".m3u8") > -1;
//   if (isHls && Hls.isSupported()) {
//     loadVideo(); // 重新加载视频
//   } else {
//     originalRetryPlay(); // 使用原始重试方法
//   }
// };

// 暴露方法给父组件
defineExpose({
  play,
  pause,
});
</script>

<style scoped>
.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.video-item {
  width: 100%;
  height: 100% !important;
  object-fit: cover;
}

.error-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
}

.error-mask button {
  margin-top: 10px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #3b82f6;
  color: white;
  cursor: pointer;
}

/* 去掉点击时的焦点边框 */
:deep(.video-js .vjs-control:focus) {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

/* 自定义 video.js 控制栏样式 */
:deep(.vjs-control-bar) {
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
}

:deep(.video-js .vjs-control:focus, .video-js .vjs-control:focus:before, .video-js .vjs-control:hover:before) {
  text-shadow: none;
}

:deep(.vjs-has-started.vjs-user-inactive.vjs-playing .vjs-control-bar) {
  opacity: 1;
}

:deep(.vjs-progress-control) {
  height: 5px;
}

:deep(.vjs-progress-holder) {
  height: 100%;
}

:deep(.vjs-play-progress) {
  background-color: #3b82f6;
}

:deep(.video-js.vjs-playing .vjs-tech) {
  pointer-events: auto !important;
}

:deep(.video-js .vjs-big-play-button) {
  font-size: 2.5em;
  line-height: 2.3em;
  height: 2.5em;
  width: 2.5em;
  -webkit-border-radius: 2.5em;
  -moz-border-radius: 2.5em;
  border-radius: 2.5em;
  background-color: #73859f;
  background-color: rgba(115, 133, 159, 0.5);
  border-width: 0.15em;
  margin-top: -1.25em;
  margin-left: -1.75em;
}
/* 中间的播放箭头 */
:deep(.video-js .vjs-big-play-button .vjs-icon-placeholder) {
  font-size: 1.63em;
}
/* 加载圆圈 */
:deep(.video-js .vjs-loading-spinner) {
  font-size: 2.5em;
  width: 2em;
  height: 2em;
  border-radius: 1em;
  margin-top: -1em;
  margin-left: -1.5em;
}
</style>

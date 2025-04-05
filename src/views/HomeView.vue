<template>
  <div class="videoListWrap" ref="videoListWrap">
    <div class="container" ref="container">
      <div class="video-item-wrap" v-for="(item, index) in videoPool" :key="index" :style="item.style">
        <VideoItem @cancelMuted="cancelMuted" :globMuted="globMuted" ref="videoPlayer" :src="item.src" @ended="handleEnded" :key="index" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onUnmounted } from "vue";
import VideoItem from "../components/video-item.vue";
import { useGestureControl } from "../hooks/useGestureControl";
// 将常量提取出来
const POOL_SIZE = 3;
const realData = ref([
  "http://www.goldbeancat.com/video/hls_output/o-1/o-1.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-1/op-1.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-2/op-2.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-3/op-3.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-4/op-4.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-5/op-5.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-6/op-6.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-7/op-7.m3u8",
  "http://www.goldbeancat.com/video/hls_output/op-8/op-8.m3u8",
]);
const videoListWrap = ref(null);
const videoPlayer = ref(null);
const globMuted = ref(true);
const cancelMuted = () => {
  globMuted.value = false;
};
const { videoPool, container, tauch, videoHeight, handleMouseStart, handleMouseMove, handleMouseEnd, getStyleByPosition } = useGestureControl(realData);
// 添加首次渲染标记
const isFirstRender = ref(true);
const mountedTime = ref(0);
const observer = ref(null);
// 创建 IntersectionObserver
const createVideoObserver = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector("video");
        if (!video) return;
        if (entry.isIntersecting) {
          // 首次渲染不播放
          // 同时判断首次渲染标记和时间戳
          if (isFirstRender.value || Date.now() - mountedTime.value < 100) {
            isFirstRender.value = false;
            return;
          }
          // 视频进入视口
          video.play().catch((err) => {
            console.log("自动播放失败111:", video.src, err);
          });
        } else {
          // 视频离开视口
          video.pause();
        }
      });
    },
    {
      threshold: 0.5, // 当视频元素可见度超过 50% 时触发
      root: videoListWrap.value,
    }
  );

  return observer;
};

onMounted(() => {
  nextTick(() => {
    const playElement = videoListWrap.value;
    if (!playElement) return;
    videoHeight.value = parseInt(getComputedStyle(playElement).height);
    // 初始化视频池
    videoPool.value = Array.from({ length: POOL_SIZE }, (_, index) => ({
      position: index,
      style: getStyleByPosition(index),
      index,
      src: realData.value[index % realData.value.length],
    }));

    nextTick(() => {
      // 创建并应用观察者
      observer.value = createVideoObserver();
      const videoItems = document.querySelectorAll(".video-item-wrap");
      videoItems.forEach((item) => observer.value.observe(item));
    });
    // 事件监听
    playElement.addEventListener("touchmove", handleMouseMove, { passive: true });
    playElement.addEventListener("touchstart", handleMouseStart, { passive: true });
    playElement.addEventListener("touchend", handleMouseEnd);
  });
});
// 组件卸载时清理观察者
onUnmounted(() => {
  // 移除事件监听，清理所有资源
  observer.value?.disconnect();
  const playElement = videoListWrap.value;
  if (playElement) {
    playElement.removeEventListener("touchmove", handleMouseMove);
    playElement.removeEventListener("touchstart", handleMouseStart);
    playElement.removeEventListener("touchend", handleMouseEnd);
  }
});

const handleEnded = () => {
  // 模拟滑动
  tauch.value.endY = 100;
  tauch.value.startY = 400;
  handleMouseEnd();
};
</script>

<style scoped>
.muted-blok {
  position: absolute;
  z-index: 10;
  top: 10px;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.3;
  pointer-events: none;
  background: red;
  color: white;
  border: 1px solid rgb(255, 60, 0);
}

.videoListWrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  background-color: black;
}

.video-item-wrap {
  position: absolute;
  inset: 0;
  will-change: transform;
}

.container {
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000;
  position: relative;
  height: 100%;
  will-change: transform;
}
</style>

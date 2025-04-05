<template>
  <div class="container" @touchstart="handleTouchStart" @touchmove="handleTouchMove" @touchend="handleTouchEnd">
    <div class="video-wrapper" :style="wrapperStyle">
      <div v-for="(item, index) in videoPool" :key="item.key" class="video-item" :style="getVideoStyle(index)">
        <!-- <video :src="item.src" autoplay muted playsinline class="video-element" @loadeddata="handleVideoLoaded(index)" /> -->
        <VideoItem :globMuted="globMuted" ref="videoPlayer" :src="item.src" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue';
import VideoItem from '../components/video-item.vue';

// 视频数据源（示例）
const videoSources = [
  'http://vjs.zencdn.net/v/oceans.mp4',
  'http://www.w3school.com.cn/i/movie.mp4',
  'https://videos.pexels.com/video-files/30420150/13035867_1440_2560_30fps.mp4',
  'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/xgplayer_doc_video/mp4/xgplayer-demo-360p.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'src/video/SampleVideo_1280x720_1mb.mp4',
  'src/video/SampleVideo_1280x720_2mb.mp4',
  'src/video/SampleVideo_1280x720_5mb.mp4',
  'src/video/SampleVideo_360x240_10mb.mp4',
  'src/video/SampleVideo_360x240_20mb.mp4',
  'src/video/SampleVideo_360x240_30mb.mp4',
  'src/video/SampleVideo_720x480_10mb.mp4',
  'src/video/SampleVideo_720x480_30mb.mp4',
];

// 响应式状态
const currentIndex = ref(2); // 当前中心视频索引
const offsetY = ref(0); // 当前偏移量
const isAnimating = ref(false);
const touchStartY = ref(0);
const videoLoadStates = reactive([false, false, false, false, false]); // 视频加载状态
const globMuted = ref(true);
const cancelMuted = () => {
  globMuted.value = false;
};

// 视频池配置（始终5个）
const videoPool = reactive([
  { key: 0, src: null, index: 0 },
  { key: 1, src: null, index: 1 },
  { key: 2, src: null, index: 2 },
  { key: 3, src: null, index: 3 },
  { key: 4, src: null, index: 4 },
]);

// 计算视频实际索引（循环处理）
const getRealIndex = (i) => {
  const len = videoSources.length;
  return (currentIndex.value - 2 + i + len) % len;
};

// 更新视频池数据
const updateVideoPool = () => {
  videoPool.forEach((item, i) => {
    const realIndex = getRealIndex(i);
    item.src = videoSources[realIndex];
    item.index = realIndex;
  });
};

// 容器样式
const wrapperStyle = computed(() => ({
  transform: `translateY(calc(-50% + ${offsetY.value}px))`,
  transition: isAnimating.value ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
}));

// 单个视频样式
const getVideoStyle = (index) => ({
  transform: `translateY(${index * 100}%)`,
});

// 触摸处理逻辑
const handleTouchStart = (e) => {
  if (isAnimating.value) return;
  touchStartY.value = e.touches[0].clientY;
};

const handleTouchMove = (e) => {
  if (isAnimating.value) return;
  const deltaY = e.touches[0].clientY - touchStartY.value;
  offsetY.value = deltaY;
};

const handleTouchEnd = (e) => {
  if (isAnimating.value) return;
  const deltaY = e.changedTouches[0].clientY - touchStartY.value;

  if (Math.abs(deltaY) < 50) {
    offsetY.value = 0;
    return;
  }

  isAnimating.value = true;
  offsetY.value = deltaY > 0 ? -window.innerHeight : window.innerHeight;

  setTimeout(() => {
    currentIndex.value += deltaY > 0 ? -1 : 1;
    offsetY.value = 0;
    updateVideoPool();
    isAnimating.value = false;
  }, 500);
};

// 初始化视频数据
updateVideoPool();
</script>

<style scoped>
.container {
  position: fixed;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
}

.video-wrapper {
  position: absolute;
  width: 100%;
  height: 500%; /* 5屏高度 */
  will-change: transform;
}

.video-item {
  position: absolute;
  width: 100%;
  height: 20%; /* 每个占1/5高度 */
  transition: transform 0.5s;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #333;
}
</style>

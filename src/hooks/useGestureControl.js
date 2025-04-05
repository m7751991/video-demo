import { ref, watch } from "vue";
import { VIDEO_CONSTANTS } from "../constants/video";
import { rafWrapper, isValidSwipe } from "../utils/videoUtils";
const THRESHOLD_DISTANCE = 80;
const TRANSITION_DURATION = "0.3s";

export function useGestureControl(realData) {
  const videoPool = ref([]);
  const container = ref(null);
  const lastSwitchTime = ref(Date.now());
  const videoHeight = ref(0);
  const currentIndex = ref(0);
  const translateValue = ref(0);
  const sourceData = ref(realData);

  const tauch = ref({
    startY: 0,
    endY: 0,
  });

  watch(realData, (newVal) => {
    sourceData.value = newVal;
  });

  const animate = () => {
    requestAnimationFrame(() => {
      container.value.style.transform = `translateY(${translateValue.value}px)`;
      container.value.style.transition = `transform ${TRANSITION_DURATION}`;
    });
    resetTouchValues();
  };

  const handleMouseMove = (event) => {
    tauch.value.endY = event.touches[0].clientY;
    const deltaY = tauch.value.endY - tauch.value.startY;
    requestAnimationFrame(() => {
      container.value.style.transform = `translateY(${translateValue.value + deltaY}px)`;
    });
  };

  const handleMouseStart = (event) => {
    tauch.value.startY = event.touches[0].clientY;
  };

  // 修改 handleMouseEnd
  const handleMouseEnd = () => {
    const { endY, startY } = tauch.value;
    if (endY === 0 || startY === 0) return;
    const now = Date.now();
    const deltaY = endY - startY;
    // 检查是否可以切换视频
    if (!canSwitchVideo()) {
      // 如果切换太频繁，恢复到当前位置
      animate();
      return;
    }
    // 正常的视频切换逻辑
    if (deltaY > THRESHOLD_DISTANCE && currentIndex.value > 0) {
      calculatePosition(false);
    } else if (deltaY < 0) {
      calculatePosition(true);
    }
    // 更新最后切换时间
    lastSwitchTime.value = now;
    translateValue.value = -(currentIndex.value * videoHeight.value);
    animate();
  };

  const canSwitchVideo = () => {
    const now = Date.now();
    const minSwipeDistance = 50;
    return now - lastSwitchTime.value >= VIDEO_CONSTANTS.GESTURE.SWITCH_THROTTLE || Math.abs(deltaY) > minSwipeDistance;
  };

  const resetTouchValues = () => {
    tauch.value.startY = 0;
    tauch.value.endY = 0;
  };

  const calculatePosition = (isUp) => {
    // 更新 currentIndex
    currentIndex.value = currentIndex.value + (isUp ? 1 : -1);
    // 向上滑动时候
    videoPool.value.forEach((video, index) => {
      const n = isUp ? currentIndex.value - 2 + videoPool.value.length : currentIndex.value + 2 - videoPool.value.length;
      video.position += isUp ? -1 : 1;

      if (isUp) {
        // 如果小于 -2，则加上数组长度
        if (video.position < -1) {
          video.style = `${getStyleByPosition(n)}`;
          video.position += videoPool.value.length;
          // 依赖position
          const realIndex = (currentIndex.value + video.position + realData.value.length) % realData.value.length;
          video.src = realData.value[realIndex];
        }
      } else {
        // 如果超过上限 2，则减去数组长度，使其循环到最前面
        if (video.position > 1) {
          // 兼容场景，当向下滑一个，再向上滑的时候，默认索引0,1,2
          if (currentIndex.value == 0) {
            video.style = `${getStyleByPosition(2)}`;
            video.position = 2;
          } else {
            video.style = `${getStyleByPosition(n)}`;
            video.position -= videoPool.value.length;
          }
          // 依赖position
          const realIndex = (currentIndex.value + video.position + realData.value.length) % realData.value.length;
          video.src = realData.value[realIndex];
        }
      }
    });
    console.log("videoPool.value", videoPool.value, currentIndex.value);
  };

  // 使用 computed 优化样式计算
  const getStyleByPosition = (position) => {
    return `transform: translateY(${position * videoHeight.value}px); transition: none;`;
  };
  return {
    videoPool,
    container,
    tauch,
    lastSwitchTime,
    videoHeight,
    currentIndex,
    translateValue,
    handleMouseEnd,
    handleMouseMove,
    handleMouseStart,
    canSwitchVideo,
    resetTouchValues,
    getStyleByPosition,
  };
}

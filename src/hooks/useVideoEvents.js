import { ref } from 'vue';
import { VIDEO_CONSTANTS } from '../constants/video';
import { handleVideoError } from '../utils/videoUtils';

export function useVideoEvents(emit) {
  const playStatus = ref(false);
  const errorMessage = ref('');
  const retryCount = ref(0);

  const onPlay = () => {
    playStatus.value = true;
    emit('play');
    emit('cancelMuted');
  };

  const onPause = () => {
    playStatus.value = false;
    emit('pause');
  };

  const onError = (error) => {
    errorMessage.value = handleVideoError(error);
    emit('error', { error, message: errorMessage.value });
  };

  // 播放结束
  const onEnd = () => {
    emit('ended');
  };

  // 事件处理
  const onLoadStart = () => {
    // Implementation of onLoadStart
  };

  const onWaiting = () => {
    // Implementation of onWaiting
  };

  const onLoadedData = () => {
    emit('loadedData');
    // Implementation of onLoadedData
  };

  const onAbort = () => {
    // Implementation of onAbort
  };

  // 错误处理
  const handlePlayError = (error) => {
    console.error('播放错误:', error);
    if (error.name === 'NotAllowedError') {
      errorMessage.value = VIDEO_CONSTANTS.ERROR.MESSAGES.NOT_ALLOWED;
    } else if (error.name === 'NotSupportedError') {
      errorMessage.value = VIDEO_CONSTANTS.ERROR.MESSAGES.NOT_SUPPORTED;
    } else {
      errorMessage.value = VIDEO_CONSTANTS.ERROR.MESSAGES.GENERIC_ERROR;
    }
    emit('error', { error, src: props.src });
  };

  const retryPlay = async (playFn) => {
    if (retryCount.value >= VIDEO_CONSTANTS.ERROR.MAX_RETRIES) {
      errorMessage.value = VIDEO_CONSTANTS.ERROR.MESSAGES.MAX_RETRIES_REACHED;
      return;
    }
    retryCount.value++;
    errorMessage.value = '';
    await playFn();
  };

  return {
    playStatus,
    errorMessage,
    retryCount,
    onPlay,
    onPause,
    onError,
    onEnd,
    onLoadStart,
    onWaiting,
    onLoadedData,
    onAbort,
    retryPlay,
    handlePlayError,
  };
}

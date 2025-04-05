import axios from 'axios';

/**
 * 通过范围请求获取视频资源
 * @param {string} url - 视频资源的URL
 * @param {number} start - 范围开始位置（字节）
 * @param {number} end - 范围结束位置（字节）
 * @returns {Promise} - 返回包含视频数据的Promise
 */
export const fetchVideoRange = async (url, start, end) => {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      headers: {
        Range: `bytes=${start}-${end}`,
        Accept: 'video/*',
      },
      responseType: 'blob',
    });
    console.log(response, 'response');

    return response.data;
  } catch (error) {
    console.error('获取视频范围数据失败:', error);
    throw error;
  }
};

/**
 * 获取视频的总大小（字节数）
 * @param {string} url - 视频资源的URL
 * @returns {Promise<number>} - 返回视频总大小的Promise
 */
/**
 * 获取视频的总大小（字节数）
 * @param {string} url - 视频资源的URL
 * @returns {Promise<number>} - 返回视频总大小的Promise
 */
export const getVideoSize = async (url) => {
  try {
    const response = await axios({
      method: 'HEAD',
      url: url,
      timeout: 10000, // 添加超时设置
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    const contentLength = response.headers['content-length'];
    // 检查content-length是否存在且为有效值
    if (contentLength === undefined || contentLength === null) {
      console.warn('服务器响应没有提供content-length头信息');
      return 0; // 或者返回一个默认大小
    }

    // 确保contentLength是字符串
    const lengthStr = String(contentLength).trim();
    const size = parseInt(lengthStr);

    if (isNaN(size)) {
      console.error('无法解析content-length:', lengthStr);
      return 0; // 或者返回一个默认大小
    }

    return size;
  } catch (error) {
    console.error('获取视频大小失败:', error);

    // 添加更多的错误信息以便调试
    if (error.response) {
      // 服务器返回了错误状态码
      console.error('服务器响应状态:', error.response.status);
      console.error('服务器响应头:', error.response.headers);
    } else if (error.request) {
      // 请求已发送但没有收到响应
      console.error('未收到服务器响应，请检查网络连接或CORS策略');
    }

    // 返回一个默认大小而不是抛出错误，这样可以避免整个加载过程失败
    return 0;
  }
};

export const loadVideo = async (videoUrl) => {
  try {
    // 首先获取视频的总大小
    const totalSize = await getVideoSize(videoUrl);
    console.log(`视频总大小: ${totalSize} 字节`);
    // 定义要获取的片段大小，例如每次获取1MB
    const chunkSize = 1024 * 1024; // 1MB

    // 获取前1MB的视频数据
    const videoChunk = await fetchVideoRange(videoUrl, 0, chunkSize - 1);

    // 在这里处理视频数据
    // 例如，创建URL对象并将其分配给video元素
    const videoBlob = new Blob([videoChunk], { type: 'video/mp4' });
    const videoObjectUrl = URL.createObjectURL(videoBlob);

    // 将视频设置到video元素中（假设有一个id为'videoPlayer'的video元素）
    const videoElement = document.getElementById('videoPlayer');
    videoElement.src = videoObjectUrl;
  } catch (error) {
    console.error('加载视频失败:', error);
  }
};

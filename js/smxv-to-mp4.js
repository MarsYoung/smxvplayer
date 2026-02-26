/**
 * SMXV/FLV to MP4 converter using ffmpeg.wasm
 * Converts decoded FLV (ArrayBuffer) to MP4 and returns Blob for download
 */

const FFMPEG_CORE_VERSION = '0.12.10';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

let ffmpegInstance = null;
let loadPromise = null;

/**
 * Load ffmpeg.wasm (lazy, once)
 * @returns {Promise<import('@ffmpeg/ffmpeg').FFmpeg>}
 */
async function loadFFmpeg() {
    if (ffmpegInstance) return ffmpegInstance;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
            // 从本仓库托管的 js/ffmpeg/index.js 加载，避免跨域 Worker 限制
            import('./ffmpeg/index.js'),
            import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js')
        ]);

        const ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));

        // Worker 内用 import(coreURL) 需要 ESM 且同源才有 default；wasm 继续用 blob 从 CDN 拉
        const coreURL = new URL('./ffmpeg/core/ffmpeg-core.js', import.meta.url).href;
        const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');

        await ffmpeg.load({ coreURL, wasmURL });
        ffmpegInstance = ffmpeg;
        return ffmpeg;
    })();

    return loadPromise;
}

/**
 * Convert FLV (ArrayBuffer) to MP4
 * @param {ArrayBuffer} flvArrayBuffer - Decoded FLV data
 * @returns {Promise<Blob>} - MP4 file as Blob
 */
export async function convertFlvToMp4(flvArrayBuffer) {
    const ffmpeg = await loadFFmpeg();

    const inputName = 'input.flv';
    const outputName = 'output.mp4';

    await ffmpeg.writeFile(inputName, new Uint8Array(flvArrayBuffer));
    // 重新封装 + 转码为常见的 H.264/AAC MP4，保证兼容主流播放器
    await ffmpeg.exec([
        '-fflags', '+genpts',
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', 'faststart',
        outputName
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: 'video/mp4' });

    try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
    } catch (_) {}

    return blob;
}

// Expose for non-module scripts
if (typeof window !== 'undefined') {
    window.convertFlvToMp4 = convertFlvToMp4;
    window.loadFFmpegForMp4 = loadFFmpeg;
}

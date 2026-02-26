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
            import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'),
            import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js')
        ]);

        const ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));

        const [coreURL, wasmURL] = await Promise.all([
            toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
            toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm')
        ]);

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
    await ffmpeg.exec(['-i', inputName, '-c', 'copy', outputName]);

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

/**
 * SMXV Player
 * Main player logic for loading JSON data and playing SMXV files
 */

class SMXVPlayer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.videoData = [];
        this.localFiles = [];
        this.currentVideo = null;
        this.flvPlayer = null;
        this.decoder = null;
    }

    /**
     * Load video data from JSON
     */
    async loadVideoData(jsonUrl) {
        try {
            const response = await fetch(jsonUrl);
            let data = await response.json();
            
            // Handle {"data": [...]} format
            if (data && typeof data === 'object' && 'data' in data) {
                data = data.data;
            }
            
            // Ensure it's an array
            if (!Array.isArray(data)) {
                data = [data];
            }
            
            this.videoData = data;
            // If we have local files, re-render the list
            if (this.localFiles && this.localFiles.length > 0) {
                this.renderLocalFileList(this.localFiles);
            } else {
                this.renderVideoList();
            }
            return data;
        } catch (error) {
            console.error('Error loading video data:', error);
            throw error;
        }
    }

    /**
     * Find video by filename
     */
    findVideoByFilename(filename) {
        // Extract base filename without extension and path
        const baseName = filename.split('/').pop().replace(/\.(smxv|flv|mp4)$/i, '');
        
        // Try to match by sdownload_url or download_url
        return this.videoData.find(video => {
            const sdownloadUrl = video.sdownload_url || '';
            const downloadUrl = video.download_url || '';
            // Extract filename from URL
            const urlFilename1 = sdownloadUrl.split('/').pop()?.replace(/\.smxv$/i, '') || '';
            const urlFilename2 = downloadUrl.split('/').pop()?.replace(/\.(mxv|flv|mp4)$/i, '') || '';
            return urlFilename1 === baseName || urlFilename2 === baseName || 
                   sdownloadUrl.includes(baseName) || downloadUrl.includes(baseName);
        });
    }

    /**
     * Scan local directory for SMXV files
     */
    async scanLocalFiles() {
        // Use file input to select directory (or files)
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.smxv';
            input.style.display = 'none';
            
            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                resolve(files);
            });
            
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });
    }

    /**
     * Play local SMXV file
     */
    async playLocalSMXV(file) {
        if (!file) {
            throw new Error('No file selected');
        }

        const filename = file.name;
        console.log(`Playing local file: ${filename}`);

        // Find matching video data from JSON
        const video = this.findVideoByFilename(filename);
        if (!video) {
            throw new Error(`未找到匹配的解密参数。请确保 JSON 数据中包含文件名: ${filename}`);
        }

        // Get decryption parameters from matched video
        const keyLength = video.data_length || 128;
        const encKey = video.enc_key || '';
        const marsKey = video.mars_key || '';

        if (keyLength > 0 && !encKey) {
            throw new Error('JSON 中缺少 enc_key（当 data_length > 0 时必需）');
        }

        if (!marsKey) {
            throw new Error('JSON 中缺少 mars_key');
        }

        this.currentVideo = { ...video, localFile: file };

        // Show loading
        this.showLoading('正在读取本地文件...');

        try {
            // Create decoder
            this.decoder = new SMXVDecoder(keyLength, encKey, marsKey);

            // Read local file
            this.showLoading('正在读取文件...');
            const arrayBuffer = await file.arrayBuffer();
            console.log(`Read local file: ${arrayBuffer.byteLength} bytes`);

            // Decode SMXV to FLV
            this.showLoading('正在解码 SMXV...');
            const flvData = await this.decoder.decode(arrayBuffer);
            console.log(`Decoded FLV: ${flvData.byteLength} bytes`);

            // Create blob URL for FLV
            const flvBlob = new Blob([flvData], { type: 'video/x-flv' });
            const flvUrl = URL.createObjectURL(flvBlob);

            // Play FLV using flv.js
            this.playFLV(flvUrl);

        } catch (error) {
            console.error('Error playing local SMXV:', error);
            this.showError(error.message);
            throw error;
        }
    }

    /**
     * 解密本地 SMXV 并直接下载为 FLV
     */
    async downloadLocalAsFLV(file) {
        if (!file) {
            throw new Error('未选择文件');
        }

        const video = this.findVideoByFilename(file.name);
        if (!video) {
            throw new Error(`未找到匹配的解密参数: ${file.name}`);
        }

        const keyLength = video.data_length || 128;
        const encKey = video.enc_key || '';
        const marsKey = video.mars_key || '';

        if (keyLength > 0 && !encKey) {
            throw new Error('JSON 中缺少 enc_key');
        }
        if (!marsKey) {
            throw new Error('JSON 中缺少 mars_key');
        }

        this.showLoading('正在读取并解码 SMXV...');

        try {
            this.decoder = new SMXVDecoder(keyLength, encKey, marsKey);
            const arrayBuffer = await file.arrayBuffer();
            const flvData = await this.decoder.decode(arrayBuffer);

            const flvBlob = new Blob([flvData], { type: 'video/x-flv' });
            const baseName = file.name.replace(/\.smxv$/i, '');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(flvBlob);
            a.download = baseName + '.flv';
            a.click();
            URL.revokeObjectURL(a.href);

            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            throw error;
        }
    }

    /**
     * Play SMXV video
     */
    async playSMXV(video) {
        if (!video) {
            throw new Error('Video data not found');
        }

        this.currentVideo = video;

        // Get SMXV URL
        const smxvUrl = video.sdownload_url;
        if (!smxvUrl) {
            throw new Error('Missing sdownload_url');
        }

        // Get decryption parameters
        const keyLength = video.data_length || 128;
        const encKey = video.enc_key || '';
        const marsKey = video.mars_key || '';

        if (keyLength > 0 && !encKey) {
            throw new Error('Missing enc_key (required when data_length > 0)');
        }

        if (!marsKey) {
            throw new Error('Missing mars_key');
        }

        // Show loading
        this.showLoading('正在解码 SMXV 文件...');

        try {
            // Create decoder
            this.decoder = new SMXVDecoder(keyLength, encKey, marsKey);

            // Download SMXV file
            const smxvResponse = await fetch(smxvUrl);
            if (!smxvResponse.ok) {
                throw new Error(`Failed to download SMXV: ${smxvResponse.statusText}`);
            }

            const smxvData = await smxvResponse.arrayBuffer();
            console.log(`Downloaded SMXV: ${smxvData.byteLength} bytes`);

            // Decode SMXV to FLV
            this.showLoading('正在解码...');
            const flvData = await this.decoder.decode(smxvData);
            console.log(`Decoded FLV: ${flvData.byteLength} bytes`);

            // Create blob URL for FLV
            const flvBlob = new Blob([flvData], { type: 'video/x-flv' });
            const flvUrl = URL.createObjectURL(flvBlob);

            // Play FLV using flv.js
            this.playFLV(flvUrl);

        } catch (error) {
            console.error('Error playing SMXV:', error);
            this.showError(error.message);
            throw error;
        }
    }

    /**
     * Play FLV video using flv.js
     */
    playFLV(flvUrl) {
        // Clean up previous player
        if (this.flvPlayer) {
            this.flvPlayer.destroy();
            this.flvPlayer = null;
        }

        // Create video element if not exists
        let videoElement = this.container.querySelector('video');
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.controls = true;
            videoElement.style.width = '100%';
            videoElement.style.maxHeight = '80vh';
            this.container.appendChild(videoElement);
        }

        // Check if flv.js is available
        if (typeof flvjs === 'undefined') {
            throw new Error('flv.js is not loaded. Please include flv.js library.');
        }

        // Check if browser supports flv.js
        if (!flvjs.isSupported()) {
            throw new Error('Your browser does not support flv.js');
        }

        // Create flv player
        this.flvPlayer = flvjs.createPlayer({
            type: 'flv',
            url: flvUrl
        });

        this.flvPlayer.attachMediaElement(videoElement);
        this.flvPlayer.load();

        // Handle events
        this.flvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => {
            console.log('FLV loading complete');
            this.hideLoading();
        });

        videoElement.addEventListener('loadedmetadata', () => {
            console.log('Video metadata loaded');
            this.hideLoading();
        });

        videoElement.addEventListener('error', (e) => {
            console.error('Video error:', e);
            this.showError('视频播放错误');
        });

        // Play
        videoElement.play().catch(err => {
            console.error('Play error:', err);
            this.showError('无法自动播放，请手动点击播放按钮');
        });
    }

    /**
     * Render video list from local files
     */
    renderLocalFileList(files) {
        const listContainer = document.getElementById('video-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (!files || files.length === 0) {
            listContainer.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">暂无本地文件</p>';
            return;
        }

        files.forEach((file) => {
            const video = this.findVideoByFilename(file.name);
            const hasMatch = !!video;
            
            const item = document.createElement('div');
            item.className = 'video-item';
            if (!hasMatch) {
                item.style.opacity = '0.6';
            }
            
            const videoInfo = document.createElement('div');
            videoInfo.className = 'video-info';
            videoInfo.innerHTML = `
                <h4>${file.name}</h4>
                <p>大小: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                ${hasMatch ? `
                    <p style="color: green;">✓ 已匹配解密参数</p>
                    <p>视频ID: ${video.video_id || video.id || 'N/A'}</p>
                ` : `
                    <p style="color: red;">✗ 未找到匹配参数</p>
                `}
            `;
            
            const btnGroup = document.createElement('div');
            btnGroup.className = 'video-item-btns';
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '8px';
            btnGroup.style.flexWrap = 'wrap';

            const playBtn = document.createElement('button');
            playBtn.className = 'play-btn';
            playBtn.textContent = hasMatch ? '播放' : '无法播放';
            playBtn.disabled = !hasMatch;
            if (hasMatch) {
                playBtn.addEventListener('click', () => {
                    this.playLocalSMXV(file).catch(err => {
                        console.error('Play error:', err);
                        this.showError('播放失败: ' + err.message);
                    });
                });
            }
            btnGroup.appendChild(playBtn);

            const downloadFlvBtn = document.createElement('button');
            downloadFlvBtn.className = 'download-flv-btn';
            downloadFlvBtn.textContent = '下载 FLV';
            downloadFlvBtn.disabled = !hasMatch;
            if (hasMatch) {
                downloadFlvBtn.addEventListener('click', () => {
                    this.downloadLocalAsFLV(file).catch(err => {
                        console.error('Download FLV error:', err);
                        this.showError('下载 FLV 失败: ' + err.message);
                    });
                });
            }
            btnGroup.appendChild(downloadFlvBtn);

            item.appendChild(videoInfo);
            item.appendChild(btnGroup);
            listContainer.appendChild(item);
        });
    }

    /**
     * Render video list from JSON data (for reference)
     */
    renderVideoList() {
        const listContainer = document.getElementById('video-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (!this.videoData || this.videoData.length === 0) {
            listContainer.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">请先加载 JSON 数据</p>';
            return;
        }

        this.videoData.forEach((video, index) => {
            const item = document.createElement('div');
            item.className = 'video-item';
            
            const videoInfo = document.createElement('div');
            videoInfo.className = 'video-info';
            
            // Extract filename from URL
            const sdownloadUrl = video.sdownload_url || '';
            const filename = sdownloadUrl.split('/').pop() || `video_${video.video_id || index + 1}.smxv`;
            
            videoInfo.innerHTML = `
                <h4>${filename}</h4>
                <p>视频ID: ${video.video_id || video.id || index + 1}</p>
                <p>时长: ${video.duration || 'N/A'} 秒</p>
                <p>分辨率: ${video.vwidth || 'N/A'}x${video.vheight || 'N/A'}</p>
                <p style="font-size: 11px; color: #999;">（仅用于匹配，不下载）</p>
            `;
            
            item.appendChild(videoInfo);
            listContainer.appendChild(item);
        });
    }

    /**
     * Show loading message
     */
    showLoading(message) {
        let loadingDiv = document.getElementById('loading');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.id = 'loading';
            loadingDiv.className = 'loading';
            this.container.appendChild(loadingDiv);
        }
        loadingDiv.textContent = message;
        loadingDiv.style.display = 'block';
    }

    /**
     * Hide loading
     */
    hideLoading() {
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.hideLoading();
        let errorDiv = document.getElementById('error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'error';
            errorDiv.className = 'error';
            this.container.appendChild(errorDiv);
        }
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';

        // Auto hide after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }


    /**
     * Cleanup
     */
    destroy() {
        if (this.flvPlayer) {
            this.flvPlayer.destroy();
            this.flvPlayer = null;
        }
    }
}


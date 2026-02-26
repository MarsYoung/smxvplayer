# SMXV 网页播放器

一个基于浏览器的 SMXV 视频播放器，支持直接解码和播放 SMXV（加密 FLV）文件。

## 功能特性

- ✅ **SMXV 解码**：在浏览器中直接解码 SMXV 文件（AES 解密 + Mars 操作反向）
- ✅ **FLV 播放**：使用 flv.js 播放解码后的 FLV 视频
- ✅ **JSON 数据加载**：支持从 JSON 文件加载视频数据
- ✅ **文件名匹配**：通过文件名自动匹配并播放对应的视频
- ✅ **视频列表**：显示所有可用的视频，支持点击播放
- ✅ **响应式设计**：支持桌面和移动设备

## 文件结构

```
smxv-player/
├── index.html          # 主页面
├── css/
│   └── style.css      # 样式文件
├── js/
│   ├── smxv-decoder.js  # SMXV 解码器（AES + Mars 反向操作）
│   └── player.js        # 播放器主逻辑
└── README.md           # 本文件
```

## 使用方法

### 1. 直接打开

**重要**：由于浏览器安全限制，需要启动本地服务器才能使用文件选择功能。

```bash
# 使用 Python 简单服务器
cd smxv-player
python3 -m http.server 8000

# 然后在浏览器中访问
# http://localhost:8000
```

### 2. 使用流程

#### 步骤 1：加载 JSON 数据（用于匹配解密参数）
1. 点击"加载 JSON 数据（用于匹配）"按钮
2. 选择包含视频数据的 JSON 文件
3. JSON 文件用于匹配文件名和获取解密参数（`enc_key`、`mars_key`、`data_length`）

#### 步骤 2：选择本地 SMXV 文件
1. 点击"选择本地 SMXV 文件"按钮
2. 在文件选择器中选择一个或多个 `.smxv` 文件
3. 系统会根据文件名在 JSON 数据中匹配，获取解密参数

#### 步骤 3：播放视频
- 右侧会显示本地文件列表
- 已匹配到解密参数的文件会显示绿色 ✓ 标记，可以点击"播放"
- 未匹配的文件会显示红色 ✗ 标记，无法播放

### 工作原理

1. **JSON 数据**：只用于匹配文件名和获取解密参数，**不用于下载文件**
2. **本地文件**：从本地选择 SMXV 文件进行播放
3. **文件名匹配**：根据 SMXV 文件名在 JSON 的 `sdownload_url` 或 `download_url` 中匹配
4. **解密播放**：使用匹配到的参数解密本地文件并播放

## JSON 数据格式

支持两种 JSON 格式：

### 格式 1：直接数组
```json
[
    {
        "video_id": 489228,
        "url": "http://vod.mixiong.tv/merged/1_2_104732/1735104267040.mp4",
        "sdownload_url": "http://vod.mixiong.tv/smxv/5a64cacfc2011539.smxv",
        "data_length": 128,
        "enc_key": "$*!HC)f%KD!@IOKr",
        "mars_key": "1=5=0&2=1=14358",
        "duration": 875,
        "vwidth": 1280,
        "vheight": 720
    }
]
```

### 格式 2：嵌套格式
```json
{
    "data": [
        {
            "video_id": 489228,
            "sdownload_url": "http://vod.mixiong.tv/smxv/5a64cacfc2011539.smxv",
            "data_length": 128,
            "enc_key": "$*!HC)f%KD!@IOKr",
            "mars_key": "1=5=0&2=1=14358"
        }
    ]
}
```

## 必需字段

每个视频对象必须包含以下字段：

- `sdownload_url`：SMXV 文件的下载 URL（必需）
- `data_length`：AES 加密长度（通常为 128，如果为 0 则无加密）
- `enc_key`：AES 加密密钥（16 字节，当 data_length > 0 时必需）
- `mars_key`：Mars key 字符串（格式：`"1=5=0&2=1=<number>"`，必需）

可选字段：
- `video_id` 或 `id`：视频 ID（用于显示）
- `duration`：视频时长（秒）
- `vwidth`、`vheight`：视频分辨率

## 技术实现

### SMXV 解码流程

1. **下载 SMXV 文件**：从 `sdownload_url` 下载加密的 SMXV 文件
2. **AES 解密**：使用 Web Crypto API 解密前 `data_length` 字节
3. **Mars 操作反向**：
   - 恢复 FLV tag header 中的 type（交换 0x8 ↔ 0x9）
   - 恢复 dataLength（减去随机数）
   - 修复 previousTagSize
   - 修复 FLV header flags
4. **生成 FLV**：得到可播放的 FLV 文件
5. **播放**：使用 flv.js 播放 FLV 视频

### 浏览器兼容性

- ✅ Chrome/Edge（推荐）
- ✅ Firefox
- ✅ Safari（需要启用 Web Crypto API）
- ❌ IE（不支持）

### 依赖库

- **flv.js**：通过 CDN 加载（https://cdn.jsdelivr.net/npm/flv.js@1.6.2/dist/flv.min.js）
- **Web Crypto API**：用于 AES 解密（现代浏览器内置）

## 注意事项

1. **本地服务器**：由于浏览器安全限制，需要通过 HTTP 服务器访问（不能直接用 `file://` 协议）
2. **文件大小**：大文件（>100MB）可能需要较长时间解码
3. **内存使用**：整个文件会加载到内存中，注意浏览器内存限制
4. **性能**：解码过程在浏览器主线程执行，大文件可能造成页面卡顿
5. **文件名匹配**：确保 JSON 中的 `sdownload_url` 或 `download_url` 包含与本地文件名匹配的部分

## 故障排除

### 问题：无法加载 JSON 文件
- 检查 JSON 文件格式是否正确
- 确保文件路径正确
- 查看浏览器控制台的错误信息

### 问题：无法播放视频
- 检查网络连接，确保可以访问 SMXV URL
- 检查 `enc_key` 和 `mars_key` 是否正确
- 查看浏览器控制台的错误信息

### 问题：解码失败
- 检查 `data_length`、`enc_key`、`mars_key` 是否正确
- 确保 SMXV 文件完整下载
- 查看浏览器控制台的详细错误

### 问题：视频播放卡顿
- 可能是文件太大，解码需要时间
- 检查网络速度
- 尝试使用更快的网络环境

## 开发

### 本地开发

```bash
# 启动本地服务器
cd smxv-player
python3 -m http.server 8000

# 或使用 Node.js
npx http-server -p 8000
```

### 修改代码

- `js/smxv-decoder.js`：SMXV 解码逻辑
- `js/player.js`：播放器主逻辑
- `css/style.css`：样式文件
- `index.html`：页面结构

## 部署到 GitHub（给用户用）

把本目录部署成网页后，用户用浏览器打开链接即可使用（加载 JSON + 选本地 SMXV → 播放/转 MP4）。

**步骤概要**：新建 GitHub 仓库 → 只提交本目录下的 `index.html`、`css/`、`js/`、`README.md` 等 → 仓库 **Settings → Pages** → Source 选 **Deploy from a branch**，Branch 选 `main`，Folder 选 **/ (root)** → 保存后访问 `https://你的用户名.github.io/仓库名/`。

详细说明（单独仓库 / 大仓库子目录 / 不提交大 JSON）见 **[DEPLOY.md](DEPLOY.md)**。

## 许可证

本项目为 mx-vod 项目的子项目，遵循相同的许可证。


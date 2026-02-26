# 部署到 GitHub Pages

把本播放器打包成网页给用户用，可免费部署到 GitHub Pages，用户通过浏览器打开链接即可使用。

## 一、准备仓库

### 方式 A：单独仓库（推荐，链接最短）

1. 在 GitHub 新建一个空仓库，例如 `smxv-player`。
2. 在本地只保留要部署的文件（不要提交 `node_modules`、大 JSON 等无关文件）：

```bash
cd /path/to/mx-vod/smxv-player

# 可选：若不想把 newprogram.json 等大文件放上去，可先移走或加入 .gitignore
# echo "newprogram.json" >> .gitignore
```

3. 初始化并推送到 GitHub：

```bash
git init
git add index.html css/ js/ README.md DEPLOY.md example.json example_video_data.json
# 若要包含示例数据可加：newprogram.json
git commit -m "SMXV 播放器"
git branch -M main
git remote add origin https://github.com/你的用户名/smxv-player.git
git push -u origin main
```

### 方式 B：作为大仓库里的子目录

若整个 `mixiong` 或 `mx-vod` 已在 GitHub，可只把 `smxv-player` 作为子目录推送，然后用 **GitHub Actions** 把该子目录发布到 Pages（见下文「用 GitHub Actions 发布子目录」）。

---

## 二、在 GitHub 开启 Pages

1. 打开仓库 → **Settings** → 左侧 **Pages**。
2. **Source** 选 **Deploy from a branch**。
3. **Branch** 选 `main`（或你用的主分支），**Folder** 选 **/ (root)**。
4. 点 **Save**。

若你是「方式 A」单独仓库，且站点放在仓库根目录，则 Folder 就是 **/ (root)**。  
若你是「方式 B」且用 Actions 部署，则 Source 选 **GitHub Actions**，不需要选 branch。

几分钟后访问：

- 方式 A：**https://你的用户名.github.io/smxv-player/**  
  （若仓库名就是 `用户名.github.io`，则为 **https://你的用户名.github.io/**）

---

## 三、用户怎么用

把上面的链接发给用户即可。用户需要：

1. 用浏览器打开链接（建议 Chrome / Edge）。
2. 点击「加载 JSON 数据」选择你们下发的 JSON（含解密参数）。
3. 点击「选择本地 SMXV 文件」选本地的 `.smxv` 文件。
4. 在列表里点「播放」或「转 MP4 下载」。

**注意**：转 MP4 会从 CDN 加载约 30MB 的 ffmpeg.wasm，首次使用会稍慢。

---

## 四、可选：不提交大 JSON

若 `newprogram.json` 等很大，可不放进仓库：

- 在仓库根目录建 `.gitignore`，加入：
  ```
  newprogram.json
  ```
- 用户使用时自行「加载 JSON 数据」选择本地 JSON 即可。

---

## 五、若播放器在子目录（如 mx-vod 仓库里的 smxv-player）

希望访问地址是 `https://用户名.github.io/mixiong/smxv-player/` 这类子路径时：

1. 用 **GitHub Actions** 把 `smxv-player` 目录单独发布到 Pages。
2. 在仓库根目录新建 `.github/workflows/deploy-pages.yml`，内容如下（路径按需改）：

```yaml
name: Deploy SMXV Player to Pages

on:
  push:
    branches: [main]
    paths:
      - 'mx-vod/smxv-player/**'   # 仅该目录变更时部署
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Copy smxv-player to root for Pages
        run: |
          cp -r mx-vod/smxv-player/* .
          cp mx-vod/smxv-player/.nojekyll . 2>/dev/null || touch .nojekyll
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - name: Deploy to GitHub Pages
        id: deploy
        uses: actions/deploy-pages@v4
```

3. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**。
4. 推送后等流水线跑完，访问 **https://用户名.github.io/仓库名/** 即可。

---

## 六、本目录里的 .nojekyll

仓库里已包含空文件 **`.nojekyll`**。  
GitHub Pages 默认用 Jekyll；加上 `.nojekyll` 可关闭 Jekyll，避免某些静态资源被忽略或 404。对纯前端播放器建议保留。

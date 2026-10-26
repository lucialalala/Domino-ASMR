# 多米诺ASMR

一个离线运行的三维多米诺小游戏：手指滑动画路，摆放低饱和彩虹骨牌；点击推倒，听碰撞声按音阶往返循环。

## GitHub Pages

在线体验：[多米诺ASMR](https://lucialalala.github.io/Domino-ASMR/) · [GitHub 仓库](https://github.com/lucialalala/Domino-ASMR)。

`.github/workflows/pages.yml` 在每次推送到 `main` 时先执行回归检查和静态审计，通过后自动发布 `src/`；也可以在仓库 Actions 页面手动运行 **Deploy GitHub Pages**。无需安装依赖或构建，仅游戏静态文件会发布到网站。

此仓库已启用 **GitHub Actions** 作为 Pages 发布来源。部署结果可在 Actions 与 `github-pages` 环境中查看；复制到其他仓库时，需要先在 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

## 运行

直接用浏览器打开 `src/index.html`，或使用 Node.js 18+ 启动本地预览：

```sh
npm start
```

打开终端显示的 `http://127.0.0.1:4173`。没有第三方依赖，无需 `npm install`。

## 玩法

- 在空白处按住并滑动摆放，松手结束一笔；从绿色尾点继续画。
- 至少两张时点击「推倒彩虹」，镜头自动回到队首并跟随倒塌；结束后可重播。
- 「撤销」删除上一笔，「清空」重新开始；右上角切换声音。
- 音阶按 `1→2→…→8→7→…→1` 往返，最低 C4、最高 C5，转折点不重复。
- 最多 400 张。急转弯、回折、交叉及过近路径会被限制；放缓转弯即可继续。
- 切到后台自动暂停，回来点击「继续」。作品只保留在本次页面会话中。

## 开发与检查

原生 HTML/CSS/ES2017，WebGL 1 批量渲染、相邻骨牌接触传播、Web Audio 合成音效；WebGL 不可用时切换 Canvas 投影。

```sh
npm test           # 几何、路径、连锁、音效资源等回归检查
npm run audit      # minitool 静态体积审计
npm run test:browser # 本地浏览器交互检查及截图
```

浏览器检查需要 Node.js 22+ 和已安装的 Edge/Chrome；其他路径通过 `DOMINO_BROWSER` 指定，结果保存在 `.preview/`。开发工具不属于小工具运行代码。

`src/assets/` 按路径、模拟、渲染、镜头、音效和容器适配拆分；参数集中在 `config.js`。实现依据见 [DEVELOPMENT.md](./DEVELOPMENT.md)，检查范围见 [VALIDATION.md](./VALIDATION.md)。

顶部区域在平台安全区之外额外下移 22px；需要微调时修改 `style.css` 的 `--header-offset`。

## minitool 打包

```sh
python tools/package-minitool.py
```

生成项目根目录的 `Domino-ASMR-minitool.zip`，仅包含 `src/` 内文件，`index.html` 直接位于 ZIP 根目录；脚本会审计目录与最终 ZIP，并校验包内文件和源码一致。GitHub Pages 仍直接托管 `src/`。

上传 ZIP 后，请先在创服平台模拟器验证，再用 Android 和 iOS 真机扫码验证同一个包。普通浏览器通过不代表 minitool 验收；实际音质、音画同步和真机性能仍待验证。

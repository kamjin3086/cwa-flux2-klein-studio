# Flux 2 Klein 图像工作室

用于 Flux 2 Klein 文生图工作流的本地 ComfyUI 网页应用。

## 运行

安装依赖：

```bash
npm install
```

复制 `.env.example` 为 `.env`，并按需修改配置：

```bash
cp .env.example .env
# 然后在 .env 中设置你的 ComfyUI 地址：
#   COMFY_URL=http://YOUR_COMFYUI_HOST:8000
```

启动：

```bash
npm start
```

在本机打开 `http://127.0.0.1:17000`，或使用主机的局域网地址加 `17000` 端口访问。

## 仓库说明

不要提交 `.env`、`node_modules/` 或 `dist/`。已提交的 `.env.example` 只保留占位值，方便共享应用时不泄露私有 ComfyUI 地址。

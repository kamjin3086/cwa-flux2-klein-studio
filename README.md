# Flux 2 Klein Studio

Reusable ComfyUI workflow app for a Flux 2 Klein text-to-image workflow.

## Run

Install dependencies:

```bash
npm install
```

Set the ComfyUI address without committing it:

```powershell
$env:COMFY_URL="http://YOUR_COMFYUI_HOST:8000"
$env:APP_HOST="0.0.0.0"
$env:APP_PORT="17000"
npm start
```

Open `http://127.0.0.1:17000` on this machine, or use the host machine's LAN address with port `17000`.

## Repository Notes

Do not commit `.env`, `node_modules/`, or `dist/`. The committed `.env.example` is intentionally a placeholder so the app can be shared without exposing a private ComfyUI address.

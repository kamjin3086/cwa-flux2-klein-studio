import { useEffect, useMemo, useState } from "react";

const API_BASE = "";
const STORAGE_KEY = "cwa-flux2-klein-studio.state.v2";

function defaultValue(field) {
  if (field.default !== undefined) return field.default;
  if (field.type === "toggle") return false;
  if (field.type === "select") return field.options?.[0] ?? "";
  if (field.type === "number" || field.type === "slider") return field.min ?? 0;
  return "";
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function buildDownloadUrl(output, jobId, values, appName) {
  const original = output.filename || "output.bin";
  const extension = original.includes(".") ? original.slice(original.lastIndexOf(".")) : ".bin";
  const promptHint = slug(values?.prompt) || "render";
  const appHint = slug(appName) || "comfyui";
  const unique = String(jobId || Date.now().toString(36)).slice(0, 8);
  const downloadName = `${appHint}_${promptHint}_${unique}${extension}`;
  const params = new URLSearchParams({
    filename: output.filename,
    subfolder: output.subfolder || "",
    type: output.type || "output",
    downloadName
  });
  return `/api/download?${params.toString()}`;
}

function jobStatusLabel(status) {
  const labels = {
    queued: "排队中",
    running: "生成中",
    complete: "已完成",
    error: "出错",
    canceled: "已停止",
    unknown: "状态未知"
  };
  return labels[status] || status;
}

function isTerminalStatus(status) {
  return ["complete", "error", "unknown", "canceled"].includes(status);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} 秒`;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

function jobDuration(job, now) {
  if (!job?.startedAt) return "";
  return formatDuration((job.endedAt || now) - job.startedAt);
}

function ResultPreview({ outputs, jobId, values, appName }) {
  if (!outputs?.length) {
    return (
      <div className="empty-result">
        <span>等待第一张图像</span>
        <p>生成完成后，Flux 图像会显示在这里。</p>
      </div>
    );
  }

  const first = outputs[0];
  const lower = first.filename.toLowerCase();
  const downloadUrl = buildDownloadUrl(first, jobId, values, appName);

  return (
    <div className="result-stack">
      {lower.match(/\.(mp4|webm|mov|gif)$/) ? (
        <video className="preview-media" src={`${API_BASE}${first.url}`} controls />
      ) : lower.match(/\.(png|jpg|jpeg|webp)$/) ? (
        <img className="preview-media" src={`${API_BASE}${first.url}`} alt={first.filename} />
      ) : lower.match(/\.(wav|mp3|ogg|flac)$/) ? (
        <audio src={`${API_BASE}${first.url}`} controls />
      ) : (
        <a className="download-link" href={`${API_BASE}${first.url}`} target="_blank" rel="noreferrer">
          打开 {first.filename}
        </a>
      )}
      <a className="download-button" href={`${API_BASE}${downloadUrl}`}>
        下载结果
      </a>
      <p className="file-note">{first.filename}</p>
    </div>
  );
}

function loadSavedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveState(patch) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSavedState(), ...patch, savedAt: Date.now() }));
  } catch {
    // Ignore storage failures; generation still works without persistence.
  }
}

function FieldDescription({ field }) {
  if (!field.description) return null;
  return <small className="field-description">{field.description}</small>;
}

function FieldControl({ field, value, onChange }) {
  const id = `field-${field.name}`;

  if (field.type === "textarea") {
    return (
      <label className="field" htmlFor={id}>
        <span>{field.label || field.name}</span>
        <textarea
          id={id}
          value={value}
          required={field.required}
          placeholder={field.placeholder}
          rows={5}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
        <FieldDescription field={field} />
      </label>
    );
  }

  if (field.type === "slider") {
    return (
      <label className="field" htmlFor={id}>
        <span>{field.label || field.name}: {value}</span>
        <input
          id={id}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step || 1}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
        <FieldDescription field={field} />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="field" htmlFor={id}>
        <span>{field.label || field.name}</span>
        <select
          id={id}
          value={value}
          required={field.required}
          onChange={(event) => onChange(field.name, event.target.value)}
        >
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <FieldDescription field={field} />
      </label>
    );
  }

  if (field.type === "toggle") {
    return (
      <label className="toggle-field" htmlFor={id}>
        <span>{field.label || field.name}</span>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.name, event.target.checked)}
        />
        <FieldDescription field={field} />
      </label>
    );
  }

  return (
    <label className="field" htmlFor={id}>
      <span>{field.label || field.name}</span>
      <input
        id={id}
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        required={field.required}
        placeholder={field.placeholder}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
      <FieldDescription field={field} />
    </label>
  );
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [status, setStatus] = useState({ ok: false, checking: true });
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    async function load() {
      const configResponse = await fetch(`${API_BASE}/api/config`);
      const nextConfig = await configResponse.json();
      setConfig(nextConfig);
      const defaults = Object.fromEntries((nextConfig.fields || []).map((field) => [field.name, defaultValue(field)]));
      const saved = loadSavedState();
      setValues({ ...defaults, ...(saved.values || {}) });
      if (saved.job?.jobId || saved.job?.promptId) {
        setJob(saved.job);
      }

      const statusResponse = await fetch(`${API_BASE}/api/status`);
      setStatus({ ...(await statusResponse.json()), checking: false });
    }
    load().catch((loadError) => {
      setStatus({ ok: false, checking: false, error: loadError.message });
    });
  }, []);

  useEffect(() => {
    if (!job?.jobId || isTerminalStatus(job.status)) return;
    const timer = setInterval(async () => {
      const response = await fetch(`${API_BASE}/api/jobs/${job.jobId}`);
      if (response.ok) {
        const nextJob = await response.json();
        setJob(nextJob);
        saveState({ job: nextJob });
        return;
      }
      if (job.promptId) {
        const recoveryResponse = await fetch(`${API_BASE}/api/prompts/${job.promptId}`);
        if (recoveryResponse.ok) {
          const recoveredJob = await recoveryResponse.json();
          setJob(recoveredJob);
          saveState({ job: recoveredJob });
        }
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!job || isTerminalStatus(job.status)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!job || restored) return;
    const shouldRecover = job.promptId && !isTerminalStatus(job.status);
    if (!shouldRecover) return;
    setRestored(true);
    async function recover() {
      const response = await fetch(`${API_BASE}/api/jobs/${job.jobId}`);
      if (response.ok) {
        const nextJob = await response.json();
        setJob(nextJob);
        saveState({ job: nextJob });
        return;
      }
      const recoveryResponse = await fetch(`${API_BASE}/api/prompts/${job.promptId}`);
      if (recoveryResponse.ok) {
        const recoveredJob = await recoveryResponse.json();
        setJob(recoveredJob);
        saveState({ job: recoveredJob });
      }
    }
    recover().catch(() => {});
  }, [job, restored]);

  const busy = job && !isTerminalStatus(job.status);
  const progressPercent = Math.round((job?.progress || 0) * 100);
  const durationLabel = jobDuration(job, now);

  const primaryFields = useMemo(() => (config?.fields || []).filter((field) => !field.advanced), [config]);
  const advancedFields = useMemo(() => (config?.fields || []).filter((field) => field.advanced), [config]);

  function updateValue(name, value) {
    setValues((current) => {
      const nextValues = { ...current, [name]: value };
      saveState({ values: nextValues });
      return nextValues;
    });
  }

  async function generate(event) {
    event.preventDefault();
    setError("");
    setJob(null);
    try {
      const response = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败。");
      const nextJob = {
        jobId: data.jobId,
        promptId: data.promptId,
        status: "queued",
        progress: 0.05,
        startedAt: data.startedAt || Date.now(),
        endedAt: null,
        outputs: []
      };
      setJob(nextJob);
      saveState({ values, job: nextJob });
    } catch (generateError) {
      setError(generateError.message);
    }
  }

  async function stopJob() {
    if (!job?.jobId || !busy) return;
    setError("");
    try {
      let response = await fetch(`${API_BASE}/api/jobs/${job.jobId}/cancel`, { method: "POST" });
      if (response.status === 404 && job.promptId) {
        response = await fetch(`${API_BASE}/api/prompts/${job.promptId}/cancel`, { method: "POST" });
      }
      const nextJob = await response.json();
      if (!response.ok) throw new Error(nextJob.error || "停止失败。");
      setJob(nextJob);
      saveState({ job: nextJob });
    } catch (stopError) {
      setError(stopError.message);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <form className="control-panel" onSubmit={generate}>
          <div className="title-row">
            <div>
              <p className="eyebrow">ComfyUI 工作流</p>
              <h1>{config?.appName || "工作流应用"}</h1>
              {config?.tagline && <p className="tagline">{config.tagline}</p>}
            </div>
            <span className={`status-pill ${status.ok ? "online" : "offline"}`}>
              {status.checking ? "检查中" : status.ok ? "已连接" : "离线"}
            </span>
          </div>

          {primaryFields.map((field) => (
            <FieldControl key={field.name} field={field} value={values[field.name] ?? ""} onChange={updateValue} />
          ))}

          {advancedFields.length > 0 && (
            <details className="advanced-panel">
              <summary>高级参数</summary>
              {advancedFields.map((field) => (
                <FieldControl key={field.name} field={field} value={values[field.name] ?? ""} onChange={updateValue} />
              ))}
            </details>
          )}

          {job && (busy || job.endedAt) && durationLabel && (
            <div className="job-timing">
              <span>{busy ? "已用时间" : "总用时"}：{durationLabel}</span>
              {busy && (
                <button className="stop-button" type="button" onClick={stopJob}>
                  停止
                </button>
              )}
            </div>
          )}

          <button className="generate-button" disabled={busy || status.checking} type="submit">
            {busy ? "生成中..." : "生成图像"}
          </button>
          {busy && <p className="wait-note">很快就好，请保持页面打开，不要刷新。</p>}

          {!status.ok && !status.checking && (
            <p className="message error" role="alert">
              {status.error || "无法连接 ComfyUI。请启动 ComfyUI 后刷新此页面。"}
            </p>
          )}
          {error && <p className="message error" role="alert">{error}</p>}
        </form>

        <section className="output-panel" aria-live="polite">
          <div className="output-header">
            <div>
              <p className="eyebrow">输出</p>
              <h2>{job?.status ? jobStatusLabel(job.status) : "准备生成"}</h2>
            </div>
            {busy && <span className="progress-label">{progressPercent}%</span>}
          </div>
          {busy && (
            <div className="progress-track" aria-label="生成进度">
              <div style={{ width: `${progressPercent}%` }} />
            </div>
          )}
          {!busy && job?.endedAt && durationLabel && <p className="duration-note">总用时：{durationLabel}</p>}
          {job?.error && <p className="message error" role="alert">{job.error}</p>}
          <ResultPreview outputs={job?.outputs} jobId={job?.jobId} values={values} appName={config?.appName} />
        </section>
      </section>
    </main>
  );
}

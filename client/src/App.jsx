import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Pause, Pencil, Play, RefreshCcw, RotateCcw, Trash2, X } from 'lucide-react';
import {
  createBatch,
  deleteBatch,
  getBatch,
  getOutputUrl,
  getZipUrl,
  listBatches,
  listImageModels,
  postBatchAction,
  updateBatchMetadata
} from './api.js';
import { parseBatchJson } from './validation.js';

const sampleJson = JSON.stringify(
  [
    { screen: 'home', prompt: 'Create a polished home screen for a productivity app' },
    { screen: 'checkout', prompt: 'Create a clean checkout screen with payment summary' }
  ],
  null,
  2
);

const defaultSettings = {
  routerUrl: 'http://localhost:20128',
  apiKey: '',
  model: '',
  size: '1024x1024',
  quality: 'standard',
  concurrency: 3,
  autoRetries: 2,
  timeoutMs: 300000,
  promptPrefix: '',
  promptSuffix: '',
  negativePrompt: ''
};

const settingsStorageKey = 'batchImageSettings';

const presets = [
  {
    name: 'Fast',
    settings: { quality: 'standard', concurrency: 5, autoRetries: 1, size: '1024x1024' }
  },
  {
    name: 'Quality',
    settings: { quality: 'hd', concurrency: 2, autoRetries: 2, size: '1024x1024' }
  },
  {
    name: 'UI Mockup',
    settings: {
      quality: 'hd',
      concurrency: 3,
      autoRetries: 2,
      size: '1024x1024',
      promptPrefix: 'High quality UI screen mockup, clean layout, sharp details',
      promptSuffix: 'No distorted text, no watermark, no blurry elements'
    }
  }
];

function loadSavedSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(settingsStorageKey));
    return saved && typeof saved === 'object' ? { ...defaultSettings, ...saved } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function selectedVersion(item) {
  return item.versions?.find((version) => version.id === item.selectedVersionId);
}

function formatDuration(durationMs) {
  const totalSeconds = Math.round(Number(durationMs || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function latestAttempt(item) {
  const history = item.attemptHistory || [];
  return history.length > 0 ? history[history.length - 1] : null;
}

export function App() {
  const [jsonText, setJsonText] = useState(sampleJson);
  const [settings, setSettings] = useState(loadSavedSettings);
  const [errors, setErrors] = useState([]);
  const [batch, setBatch] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [models, setModels] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');

  const parsed = useMemo(() => parseBatchJson(jsonText), [jsonText]);
  const counts = useMemo(() => {
    const items = batch?.items || [];
    return {
      total: items.length,
      done: items.filter((item) => item.status === 'done').length,
      failed: items.filter((item) => item.status === 'failed').length,
      running: items.filter((item) => ['queued', 'generating', 'regenerating'].includes(item.status)).length
    };
  }, [batch]);
  const filteredHistory = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    return history.filter((entry) => {
      const matchesStatus = historyStatus === 'all' || entry.status === historyStatus;
      const searchable = [entry.name, entry.id, entry.model, entry.note].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [history, historySearch, historyStatus]);

  useEffect(() => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  }, [settings]);

  async function loadBatch(batchId) {
    const loaded = await getBatch(batchId);
    setBatch(loaded);
    window.localStorage.setItem('lastBatchId', loaded.id);
    return loaded;
  }

  async function refreshHistory() {
    const batches = await listBatches();
    setHistory(batches);
    return batches;
  }

  useEffect(() => {
    let alive = true;

    async function restore() {
      try {
        const batches = await listBatches();
        if (!alive) return;
        setHistory(batches);
        const lastBatchId = window.localStorage.getItem('lastBatchId');
        const batchId = lastBatchId || batches[0]?.id;
        if (batchId) {
          const restored = await getBatch(batchId);
          if (!alive) return;
          setBatch(restored);
          window.localStorage.setItem('lastBatchId', restored.id);
        }
      } catch (error) {
        if (alive) {
          setMessage(error.message);
        }
      }
    }

    restore();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!batch?.id || ['done', 'failed', 'canceled'].includes(batch.status)) {
      return undefined;
    }

    const interval = setInterval(async () => {
      try {
        setBatch(await getBatch(batch.id));
      } catch (error) {
        setMessage(error.message);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [batch?.id, batch?.status]);

  function updateSetting(name, value) {
    setSettings((current) => ({
      ...current,
      [name]: ['concurrency', 'autoRetries', 'timeoutMs'].includes(name) ? Number(value) : value
    }));
  }

  function applyPreset(preset) {
    setSettings((current) => ({ ...current, ...preset.settings }));
  }

  async function handleGenerate() {
    const result = parseBatchJson(jsonText);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!settings.model.trim()) {
      setErrors(['Model is required.']);
      return;
    }

    setErrors([]);
    setBusy(true);
    setMessage('');
    try {
      const created = await createBatch({ settings, items: result.items });
      setBatch(created);
      window.localStorage.setItem('lastBatchId', created.id);
      await refreshHistory();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshBatch() {
    if (!batch?.id) return;
    await loadBatch(batch.id);
  }

  async function handleLoadModels() {
    setBusy(true);
    setMessage('');
    try {
      const loadedModels = await listImageModels({
        routerUrl: settings.routerUrl,
        apiKey: settings.apiKey
      });
      setModels(loadedModels);
      if (!settings.model && loadedModels[0]?.id) {
        updateSetting('model', loadedModels[0].id);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(path, body) {
    if (!batch?.id) return;
    setBusy(true);
    try {
      setBatch(await postBatchAction(path, body));
      await refreshBatch();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function retryAllFailed() {
    const failed = batch?.items?.filter((item) => item.status === 'failed') || [];
    for (const item of failed) {
      await runAction(`/api/batches/${batch.id}/items/${item.id}/retry`);
    }
  }

  async function handleDeleteBatch() {
    if (!batch?.id) return;
    const confirmed = window.confirm(`Delete batch ${batch.id}? This removes saved files from outputs.`);
    if (!confirmed) return;

    setBusy(true);
    setMessage('');
    try {
      const deletedBatchId = batch.id;
      await deleteBatch(deletedBatchId);
      if (window.localStorage.getItem('lastBatchId') === deletedBatchId) {
        window.localStorage.removeItem('lastBatchId');
      }
      setBatch(null);
      const batches = await refreshHistory();
      const nextBatch = batches.find((entry) => entry.id !== deletedBatchId);
      if (nextBatch?.id) {
        await loadBatch(nextBatch.id);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEditBatchDetails() {
    if (!batch?.id) return;
    const name = window.prompt('Batch name', batch.name || '');
    if (name === null) return;
    const note = window.prompt('Batch note', batch.note || '');
    if (note === null) return;

    setBusy(true);
    setMessage('');
    try {
      setBatch(await updateBatchMetadata(batch.id, { name, note }));
      await refreshHistory();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function handleDuplicateBatch() {
    if (!batch?.items) return;
    const duplicatedItems = batch.items.map((item) => ({
      screen: item.screen,
      prompt: item.prompt
    }));
    setJsonText(JSON.stringify(duplicatedItems, null, 2));
    if (batch.settings) {
      setSettings((current) => ({ ...current, ...batch.settings }));
    }
    setErrors([]);
    setMessage('Batch copied to input. Review settings, then generate.');
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Batch Image Generator</h1>
            <p>Generate, preview, retry, regenerate, and export 9Router image batches.</p>
          </div>
          {batch?.id ? (
            <a className="primary-link" href={getZipUrl(batch.id)}>
              <Download size={18} />
              Download ZIP
            </a>
          ) : null}
        </header>

        <section className="setup-grid">
          <div className="panel editor-panel">
            <div className="panel-heading">
              <h2>Input</h2>
              <span>{parsed.ok ? `${parsed.items.length} items` : 'Invalid JSON'}</span>
            </div>
            <label htmlFor="batch-json">Batch JSON</label>
            <textarea
              id="batch-json"
              aria-label="Batch JSON"
              value={jsonText}
              spellCheck="false"
              onChange={(event) => setJsonText(event.target.value)}
            />
            {errors.length > 0 ? (
              <div className="error-list">
                {errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="panel settings-panel">
            <div className="panel-heading">
              <h2>Settings</h2>
            </div>
            <div className="preset-row" aria-label="Settings presets">
              {presets.map((preset) => (
                <button type="button" key={preset.name} onClick={() => applyPreset(preset)}>
                  {preset.name}
                </button>
              ))}
            </div>
            <label>
              9Router URL
              <input value={settings.routerUrl} onChange={(event) => updateSetting('routerUrl', event.target.value)} />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={settings.apiKey}
                onChange={(event) => updateSetting('apiKey', event.target.value)}
              />
            </label>
            <div className="model-row">
              <label>
                Model
                {models.length > 0 ? (
                  <select
                    aria-label="Model"
                    value={settings.model}
                    onChange={(event) => updateSetting('model', event.target.value)}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Model"
                    value={settings.model}
                    onChange={(event) => updateSetting('model', event.target.value)}
                    placeholder="provider/model-id"
                  />
                )}
              </label>
              <button type="button" onClick={handleLoadModels} disabled={busy}>
                Load Models
              </button>
            </div>
            <div className="compact-grid">
              <label>
                Size
                <input value={settings.size} onChange={(event) => updateSetting('size', event.target.value)} />
              </label>
              <label>
                Quality
                <input value={settings.quality} onChange={(event) => updateSetting('quality', event.target.value)} />
              </label>
              <label>
                Concurrency
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.concurrency}
                  onChange={(event) => updateSetting('concurrency', event.target.value)}
                />
              </label>
              <label>
                Auto retries
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={settings.autoRetries}
                  onChange={(event) => updateSetting('autoRetries', event.target.value)}
                />
              </label>
            </div>
            <label>
              Prompt prefix
              <textarea
                className="small-textarea"
                value={settings.promptPrefix}
                onChange={(event) => updateSetting('promptPrefix', event.target.value)}
              />
            </label>
            <label>
              Prompt suffix
              <textarea
                className="small-textarea"
                value={settings.promptSuffix}
                onChange={(event) => updateSetting('promptSuffix', event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy} onClick={handleGenerate}>
              <Play size={18} />
              Generate Batch
            </button>
            {message ? <p className="message">{message}</p> : null}
          </div>
        </section>

        {history.length > 0 ? (
          <section className="history-strip" aria-label="Batch history">
            <div className="history-heading">
              <h2>History</h2>
              <button onClick={refreshHistory}>Refresh</button>
            </div>
            <div className="history-filters">
              <label>
                Search history
                <input
                  aria-label="Search history"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Name, ID, model, note"
                />
              </label>
              <label>
                History status
                <select
                  aria-label="History status"
                  value={historyStatus}
                  onChange={(event) => setHistoryStatus(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="running">running</option>
                  <option value="done">done</option>
                  <option value="failed">failed</option>
                  <option value="canceled">canceled</option>
                </select>
              </label>
            </div>
            <div className="history-list">
              {filteredHistory.map((entry) => (
                <button
                  key={entry.id}
                  className={batch?.id === entry.id ? 'history-item active-history' : 'history-item'}
                  onClick={() => loadBatch(entry.id)}
                >
                  <span>{entry.id}</span>
                  <small>
                    {entry.model || 'No model'} - {entry.done}/{entry.total} done - {entry.failed} failed
                  </small>
                  {entry.name ? <strong>{entry.name}</strong> : null}
                </button>
              ))}
            </div>
            {filteredHistory.length === 0 ? <p className="empty-state">No matching batches.</p> : null}
          </section>
        ) : null}

        {batch ? (
          <section className="batch-area">
            <div className="batch-toolbar">
              <div>
                <h2>{batch.name || `Batch ${batch.id}`}</h2>
                {batch.name ? <p>Batch {batch.id}</p> : null}
                {batch.note ? <p>{batch.note}</p> : null}
                <p>
                  {counts.done}/{counts.total} done, {counts.running} running, {counts.failed} failed
                </p>
              </div>
              <div className="button-row">
                <button onClick={handleEditBatchDetails} disabled={busy}>
                  <Pencil size={16} />
                  Edit details
                </button>
                <button onClick={handleDuplicateBatch} disabled={busy}>
                  <Copy size={16} />
                  Duplicate
                </button>
                <button onClick={() => runAction(`/api/batches/${batch.id}/pause`)} disabled={busy}>
                  <Pause size={16} />
                  Pause
                </button>
                <button onClick={() => runAction(`/api/batches/${batch.id}/resume`)} disabled={busy}>
                  <Play size={16} />
                  Resume
                </button>
                <button onClick={retryAllFailed} disabled={busy || counts.failed === 0}>
                  <RefreshCcw size={16} />
                  Retry failed
                </button>
                <button onClick={() => runAction(`/api/batches/${batch.id}/cancel`)} disabled={busy}>
                  <X size={16} />
                  Cancel
                </button>
                <button onClick={handleDeleteBatch} disabled={busy}>
                  <Trash2 size={16} />
                  Delete Batch
                </button>
              </div>
            </div>

            <div className="item-grid">
              {batch.items.map((item) => {
                const version = selectedVersion(item);
                return (
                  <article className="item-card" key={item.id}>
                    <div className="item-header">
                      <h3>{item.screen}</h3>
                      <span className={`status status-${item.status}`}>{item.status}</span>
                    </div>
                    <p>{item.prompt}</p>
                    <div className="attempt-summary">
                      <span>Attempts: {item.attempts || 0}</span>
                      {latestAttempt(item) ? (
                        <>
                          <span>Last duration: {formatDuration(latestAttempt(item).durationMs)}</span>
                          <span>Last result: {latestAttempt(item).status}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="thumb">
                      {version ? (
                        <button
                          className="thumb-button"
                          onClick={() =>
                            setPreview({
                              title: `${item.screen} / ${version.id}`,
                              src: getOutputUrl(batch.id, version.filename)
                            })
                          }
                        >
                          <img src={getOutputUrl(batch.id, version.filename)} alt={`${item.screen} preview`} />
                        </button>
                      ) : (
                        <span>{item.status}</span>
                      )}
                    </div>
                    {item.lastError ? <p className="item-error">{item.lastError}</p> : null}
                    <div className="version-row">
                      {(item.versions || []).map((candidate) => (
                        <button
                          key={candidate.id}
                          className={candidate.id === item.selectedVersionId ? 'selected-version' : ''}
                          onClick={() =>
                            runAction(`/api/batches/${batch.id}/items/${item.id}/select-version`, {
                              versionId: candidate.id
                            })
                          }
                        >
                          {candidate.id}
                        </button>
                      ))}
                    </div>
                    <div className="button-row">
                      <button
                        onClick={() => runAction(`/api/batches/${batch.id}/items/${item.id}/retry`)}
                        disabled={busy || item.status !== 'failed'}
                      >
                        <RefreshCcw size={16} />
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          const prompt = window.prompt('Regenerate prompt', item.prompt);
                          if (prompt) {
                            runAction(`/api/batches/${batch.id}/items/${item.id}/regenerate`, { prompt });
                          }
                        }}
                        disabled={busy || item.status !== 'done'}
                      >
                        <RotateCcw size={16} />
                        Regenerate
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {preview ? (
          <div className="modal" role="dialog" aria-label="Image preview">
            <div className="modal-body">
              <button className="modal-close" onClick={() => setPreview(null)}>
                <X size={18} />
              </button>
              <h2>{preview.title}</h2>
              <img src={preview.src} alt={preview.title} />
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

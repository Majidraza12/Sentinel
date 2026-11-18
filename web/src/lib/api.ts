// Typed client for the FastAPI backend (server/main.py).

export type Label = 'Violent' | 'Non-Violent'

export interface ModelInfo {
  id: string
  name: string
  short: string
  description: string
  timeline_kind: 'running' | 'per_frame'
  default: boolean
}

export interface TestVerdict {
  predicted: Label
  p_violent: number
  correct: boolean
}

export interface Sample {
  id: string
  label: Label
  camera: string
  event: string
  file: string
  test_predictions: Record<string, TestVerdict>
}

export interface FrameScore {
  index: number
  frame_index: number
  time_sec: number | null
  thumbnail: string | null
  missing: boolean
  p_violent: number
}

export interface Prediction {
  model: { id: string; name: string; timeline_kind: 'running' | 'per_frame' }
  label: Label
  label_index: number
  confidence: number
  p_violent: number
  frames: FrameScore[]
  video: {
    total_frames: number
    fps: number
    duration_sec: number | null
    width: number
    height: number
  }
  timing_ms: { decode: number; inference: number; total: number }
  device: string
  source: {
    kind: 'sample' | 'upload'
    id: string
    name: string | null
    ground_truth: Label | null
    preview_url: string
  }
}

export type MetricRow = Record<string, number | string>

export interface Metrics {
  ablation: MetricRow[]
  runs: MetricRow[]
  histories: Record<string, MetricRow[]>
  headline: {
    model: string
    report: Record<string, { precision: number; recall: number; f1: number; support: number }> & {
      accuracy: number
      support: number
    }
    training: MetricRow[]
    confusion: number[][] | null
  }
  frame_mean_confusion: number[][] | null
  dataset: { splits: Record<string, Record<Label, number>> }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the inference server. Is the backend running?')
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  models: () => request<ModelInfo[]>('/api/models'),
  samples: () => request<Sample[]>('/api/samples'),
  metrics: () => request<Metrics>('/api/metrics'),
  thumbnailUrl: (sampleId: string) => `/api/samples/${encodeURIComponent(sampleId)}/thumbnail.jpg`,

  predictSample: (sampleId: string, model: string) =>
    request<Prediction>(
      `/api/samples/${encodeURIComponent(sampleId)}/predict?model=${encodeURIComponent(model)}`,
      { method: 'POST' },
    ),

  predictUpload: (file: File, model: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('model', model)
    return request<Prediction>('/api/predict', { method: 'POST', body: form })
  },

  repredictUpload: (uploadId: string, model: string) =>
    request<Prediction>(
      `/api/uploads/${encodeURIComponent(uploadId)}/predict?model=${encodeURIComponent(model)}`,
      { method: 'POST' },
    ),
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`

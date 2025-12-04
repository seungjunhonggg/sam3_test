import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Types
export interface ClassConfig {
  id: number
  name: string
  color: string
}

export interface Project {
  id: number
  name: string
  description: string | null
  annotation_type: string
  classes: ClassConfig[]
  image_count: number
  annotation_count: number
  created_at: string
  updated_at: string
}

export interface Image {
  id: number
  project_id: number
  filename: string
  original_filename: string
  width: number
  height: number
  file_size: number
  status: string
  annotation_count: number
  url: string
  created_at: string
  updated_at: string
}

export interface Annotation {
  id: number
  image_id: number
  class_name: string
  class_id: number
  annotation_type: string
  polygon: number[][] | null
  bbox: number[] | null
  mask_rle: string | null
  points: number[][] | null
  area: number | null
  confidence: number | null
  is_auto_generated: boolean
  created_at: string
  updated_at: string
}

export interface SegmentationResult {
  id: number
  polygon: number[][]
  bbox: number[]
  score: number
  area: number
  rle?: string
}

export interface SegmentationResponse {
  masks: SegmentationResult[]
  count: number
  mode?: string
}

export interface TrainingRun {
  id: number
  project_id: number
  name: string
  status: string
  batch_size: number
  learning_rate: number
  num_epochs: number
  config: Record<string, unknown>
  checkpoint_path: string | null
  metrics: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// Project API
export const projectApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (id: number) => api.get<Project>(`/projects/${id}`),
  create: (data: { name: string; description?: string; annotation_type?: string; classes?: ClassConfig[] }) =>
    api.post<Project>('/projects', data),
  update: (id: number, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  getStats: (id: number) => api.get(`/projects/${id}/stats`)
}

// Image API
export const imageApi = {
  list: (projectId: number, status?: string) =>
    api.get<Image[]>(`/images/project/${projectId}`, { params: { status } }),
  get: (id: number) => api.get<Image>(`/images/${id}`),
  upload: (projectId: number, files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    return api.post<Image[]>(`/images/upload/${projectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  delete: (id: number) => api.delete(`/images/${id}`),
  navigate: (id: number) => api.get<{ current_id: number; previous_id: number | null; next_id: number | null }>(`/images/${id}/navigate`)
}

// Annotation API
export const annotationApi = {
  list: (imageId: number) => api.get<Annotation[]>(`/annotations/image/${imageId}`),
  get: (id: number) => api.get<Annotation>(`/annotations/${id}`),
  create: (data: Omit<Annotation, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Annotation>('/annotations', data),
  createBulk: (imageId: number, annotations: Omit<Annotation, 'id' | 'created_at' | 'updated_at'>[]) =>
    api.post<Annotation[]>('/annotations/bulk', { image_id: imageId, annotations }),
  update: (id: number, data: Partial<Annotation>) => api.put<Annotation>(`/annotations/${id}`, data),
  delete: (id: number) => api.delete(`/annotations/${id}`),
  deleteAll: (imageId: number) => api.delete(`/annotations/image/${imageId}`)
}

// Segmentation API
export const segmentationApi = {
  setImage: (imageId: number) => api.post(`/segmentation/set-image/${imageId}`),
  segmentWithText: (prompt: string, imageId?: number) =>
    api.post<SegmentationResponse>('/segmentation/text', { prompt, image_id: imageId }),
  segmentWithPoints: (points: { x: number; y: number; label: number }[], imageId?: number) =>
    api.post<SegmentationResponse>('/segmentation/points', { points, image_id: imageId }),
  segmentWithBox: (box: { x1: number; y1: number; x2: number; y2: number }, imageId?: number) =>
    api.post<SegmentationResponse>('/segmentation/box', { box, image_id: imageId }),
  segmentAuto: (imageId: number) =>
    api.post<SegmentationResponse>('/segmentation/auto', { image_id: imageId }),
  getStatus: () => api.get('/segmentation/status')
}

// Training API
export const trainingApi = {
  list: (projectId: number) => api.get<TrainingRun[]>(`/training/project/${projectId}`),
  get: (id: number) => api.get<TrainingRun>(`/training/${id}`),
  create: (data: { project_id: number; name: string; config?: Record<string, unknown> }) =>
    api.post<TrainingRun>('/training', data),
  getLogs: (id: number) => api.get<{ logs: string[]; status: string }>(`/training/${id}/logs`),
  cancel: (id: number) => api.post(`/training/${id}/cancel`),
  applyModel: (id: number) => api.post(`/training/${id}/apply`)
}

// Export API
export const exportApi = {
  getFormats: () => api.get('/export/formats'),
  exportProject: (projectId: number, format: string, includeImages: boolean) =>
    api.post(`/export/project/${projectId}`, { format, include_images: includeImages }, { responseType: 'blob' })
}

export default api

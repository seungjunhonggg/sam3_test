import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface ClassConfig {
  id: number;
  name: string;
  color: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  annotation_type: 'instance' | 'semantic' | 'bbox';
  classes: ClassConfig[];
  created_at: string;
  updated_at: string;
  image_count?: number;
  annotated_count?: number;
}

export interface Image {
  id: number;
  project_id: number;
  filename: string;
  original_filename: string;
  width: number;
  height: number;
  status: 'pending' | 'annotated' | 'reviewed';
  created_at: string;
  url?: string;
}

export interface Annotation {
  id: number;
  image_id: number;
  class_id: number;
  polygon: number[][];
  bbox: number[];
  mask_rle?: string;
  created_at: string;
}

export interface SegmentationResult {
  id: number;
  polygon: number[][];
  bbox: number[];
  rle?: string;
  score: number;
  area: number;
}

export interface TrainingRun {
  id: number;
  project_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: {
    batch_size: number;
    learning_rate: number;
    num_epochs: number;
    use_lora: boolean;
  };
  metrics?: {
    loss?: number;
    epoch?: number;
    progress?: number;
  };
  checkpoint_path?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

// Projects API
export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (id: number) => api.get<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),
  update: (id: number, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
};

// Images API
export const imagesApi = {
  listByProject: (projectId: number) => api.get<Image[]>(`/images/project/${projectId}`),
  get: (id: number) => api.get<Image>(`/images/${id}`),
  upload: (projectId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return api.post<Image[]>(`/images/upload/${projectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (id: number) => api.delete(`/images/${id}`),
  updateStatus: (id: number, status: Image['status']) => api.patch(`/images/${id}/status`, { status }),
};

// Annotations API
export const annotationsApi = {
  listByImage: (imageId: number) => api.get<Annotation[]>(`/annotations/image/${imageId}`),
  create: (data: Partial<Annotation>) => api.post<Annotation>('/annotations', data),
  createBulk: (annotations: Partial<Annotation>[]) => api.post<Annotation[]>('/annotations/bulk', annotations),
  update: (id: number, data: Partial<Annotation>) => api.put<Annotation>(`/annotations/${id}`, data),
  delete: (id: number) => api.delete(`/annotations/${id}`),
};

// Segmentation API (SAM3)
export const segmentationApi = {
  setImage: (imageId: number) => api.post(`/segmentation/set-image/${imageId}`),
  segmentText: (prompt: string) => api.post<{ masks: SegmentationResult[]; count: number }>('/segmentation/text', { prompt }),
  segmentPoints: (points: number[][], labels: number[]) =>
    api.post<{ masks: SegmentationResult[]; count: number }>('/segmentation/points', { points, labels }),
  segmentBox: (box: number[]) => api.post<{ masks: SegmentationResult[]; count: number }>('/segmentation/box', { box }),
  segmentAuto: () => api.post<{ masks: SegmentationResult[]; count: number }>('/segmentation/auto'),
};

// Training API
export const trainingApi = {
  listByProject: (projectId: number) => api.get<TrainingRun[]>(`/training/project/${projectId}`),
  get: (id: number) => api.get<TrainingRun>(`/training/${id}`),
  create: (projectId: number, config: TrainingRun['config']) =>
    api.post<TrainingRun>('/training', { project_id: projectId, config }),
  getLogs: (id: number) => api.get<string[]>(`/training/${id}/logs`),
  cancel: (id: number) => api.post(`/training/${id}/cancel`),
  apply: (id: number) => api.post(`/training/${id}/apply`),
};

// Export API
export const exportApi = {
  getFormats: () => api.get<string[]>('/export/formats'),
  export: (projectId: number, format: string, includeImages: boolean) =>
    api.post(`/export/project/${projectId}`, { format, include_images: includeImages }, { responseType: 'blob' }),
};

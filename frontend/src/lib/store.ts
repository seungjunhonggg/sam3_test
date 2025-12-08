'use client';

import { create } from 'zustand';
import type { Project, Image, Annotation, SegmentationResult, ClassConfig } from './api';

export type Tool = 'select' | 'polygon' | 'bbox' | 'brush' | 'sam_point' | 'sam_box' | 'sam_text' | 'mask_paint' | 'mask_erase';

// 클래스별 마스크 데이터
export interface ClassMask {
  classId: number;
  className: string;
  color: string;
  imageData: ImageData | null;  // 바이너리 마스크 데이터
  visible: boolean;
  opacity: number;
}

interface AnnotationState {
  // Current state
  currentProject: Project | null;
  currentImage: Image | null;
  annotations: Annotation[];
  selectedAnnotationId: number | null;
  selectedClassId: number | null;

  // Tool state
  activeTool: Tool;
  isDrawing: boolean;
  currentPoints: number[][];

  // SAM3 state
  samPendingMasks: SegmentationResult[];
  samTextPrompt: string;

  // Mask painting state (Paint.NET style)
  classMasks: Map<number, ClassMask>;  // classId -> ClassMask
  brushSize: number;
  maskEditMode: boolean;  // 마스크 편집 모드 활성화 여부

  // Canvas state
  zoom: number;
  panOffset: { x: number; y: number };

  // History for undo/redo
  history: Annotation[][];
  historyIndex: number;

  // Actions
  setCurrentProject: (project: Project | null) => void;
  setCurrentImage: (image: Image | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: number, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: number) => void;
  selectAnnotation: (id: number | null) => void;
  selectClass: (id: number | null) => void;

  setActiveTool: (tool: Tool) => void;
  setIsDrawing: (isDrawing: boolean) => void;
  setCurrentPoints: (points: number[][]) => void;
  addPoint: (point: number[]) => void;
  clearCurrentPoints: () => void;

  setSamPendingMasks: (masks: SegmentationResult[]) => void;
  setSamTextPrompt: (prompt: string) => void;
  clearSamPending: () => void;

  // Mask painting actions
  initClassMasks: (classes: { id: number; name: string; color: string }[], width: number, height: number) => void;
  setClassMask: (classId: number, imageData: ImageData) => void;
  setClassMaskVisibility: (classId: number, visible: boolean) => void;
  setClassMaskOpacity: (classId: number, opacity: number) => void;
  setBrushSize: (size: number) => void;
  setMaskEditMode: (enabled: boolean) => void;
  clearClassMask: (classId: number) => void;
  clearAllMasks: () => void;

  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  resetView: () => void;

  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  // Initial state
  currentProject: null,
  currentImage: null,
  annotations: [],
  selectedAnnotationId: null,
  selectedClassId: null,

  activeTool: 'select',
  isDrawing: false,
  currentPoints: [],

  samPendingMasks: [],
  samTextPrompt: '',

  // Mask painting state
  classMasks: new Map<number, ClassMask>(),
  brushSize: 20,
  maskEditMode: false,

  zoom: 1,
  panOffset: { x: 0, y: 0 },

  history: [],
  historyIndex: -1,

  // Actions
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentImage: (image) => set({ currentImage: image, annotations: [], samPendingMasks: [] }),
  setAnnotations: (annotations) => set({ annotations }),

  addAnnotation: (annotation) => {
    const state = get();
    state.pushHistory();
    set({ annotations: [...state.annotations, annotation] });
  },

  updateAnnotation: (id, updates) => {
    const state = get();
    state.pushHistory();
    set({
      annotations: state.annotations.map((ann) =>
        ann.id === id ? { ...ann, ...updates } : ann
      ),
    });
  },

  removeAnnotation: (id) => {
    const state = get();
    state.pushHistory();
    set({
      annotations: state.annotations.filter((ann) => ann.id !== id),
      selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
    });
  },

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),
  selectClass: (id) => set({ selectedClassId: id }),

  setActiveTool: (tool) => set({ activeTool: tool, currentPoints: [], isDrawing: false }),
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  setCurrentPoints: (points) => set({ currentPoints: points }),
  addPoint: (point) => set({ currentPoints: [...get().currentPoints, point] }),
  clearCurrentPoints: () => set({ currentPoints: [], isDrawing: false }),

  setSamPendingMasks: (masks) => set({ samPendingMasks: masks }),
  setSamTextPrompt: (prompt) => set({ samTextPrompt: prompt }),
  clearSamPending: () => set({ samPendingMasks: [], samTextPrompt: '' }),

  // Mask painting actions
  initClassMasks: (classes, width, height) => {
    const newMasks = new Map<number, ClassMask>();
    classes.forEach((cls) => {
      newMasks.set(cls.id, {
        classId: cls.id,
        className: cls.name,
        color: cls.color,
        imageData: null,  // 처음에는 null, 필요할 때 생성
        visible: true,
        opacity: 0.5,
      });
    });
    set({ classMasks: newMasks });
  },

  setClassMask: (classId, imageData) => {
    const masks = new Map(get().classMasks);
    const existing = masks.get(classId);
    if (existing) {
      masks.set(classId, { ...existing, imageData });
      set({ classMasks: masks });
    }
  },

  setClassMaskVisibility: (classId, visible) => {
    const masks = new Map(get().classMasks);
    const existing = masks.get(classId);
    if (existing) {
      masks.set(classId, { ...existing, visible });
      set({ classMasks: masks });
    }
  },

  setClassMaskOpacity: (classId, opacity) => {
    const masks = new Map(get().classMasks);
    const existing = masks.get(classId);
    if (existing) {
      masks.set(classId, { ...existing, opacity: Math.max(0, Math.min(1, opacity)) });
      set({ classMasks: masks });
    }
  },

  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(200, size)) }),

  setMaskEditMode: (enabled) => set({ maskEditMode: enabled }),

  clearClassMask: (classId) => {
    const masks = new Map(get().classMasks);
    const existing = masks.get(classId);
    if (existing) {
      masks.set(classId, { ...existing, imageData: null });
      set({ classMasks: masks });
    }
  },

  clearAllMasks: () => {
    const masks = new Map(get().classMasks);
    masks.forEach((mask, classId) => {
      masks.set(classId, { ...mask, imageData: null });
    });
    set({ classMasks: masks });
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPanOffset: (offset) => set({ panOffset: offset }),
  resetView: () => set({ zoom: 1, panOffset: { x: 0, y: 0 } }),

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      set({
        annotations: history[historyIndex - 1],
        historyIndex: historyIndex - 1,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      set({
        annotations: history[historyIndex + 1],
        historyIndex: historyIndex + 1,
      });
    }
  },

  pushHistory: () => {
    const { history, historyIndex, annotations } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...annotations]);
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
}));

interface UIState {
  sidebarCollapsed: boolean;
  rightPanelTab: 'annotations' | 'classes' | 'settings';
  isLoading: boolean;
  loadingMessage: string;

  toggleSidebar: () => void;
  setRightPanelTab: (tab: UIState['rightPanelTab']) => void;
  setLoading: (loading: boolean, message?: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  rightPanelTab: 'annotations',
  isLoading: false,
  loadingMessage: '',

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setLoading: (loading, message = '') => set({ isLoading: loading, loadingMessage: message }),
}));

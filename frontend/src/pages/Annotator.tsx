import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CursorArrowRaysIcon,
  Square2StackIcon,
  StopIcon,
  PaintBrushIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useAnnotationStore } from '../store'
import {
  projectApi,
  imageApi,
  annotationApi,
  segmentationApi,
  type Annotation,
  type SegmentationResult
} from '../utils/api'

type Tool = 'select' | 'polygon' | 'bbox' | 'point' | 'brush' | 'sam_point' | 'sam_box' | 'sam_text'

const tools = [
  { id: 'select' as Tool, icon: CursorArrowRaysIcon, name: 'Select', shortcut: 'V' },
  { id: 'polygon' as Tool, icon: Square2StackIcon, name: 'Polygon', shortcut: 'P' },
  { id: 'bbox' as Tool, icon: StopIcon, name: 'Bounding Box', shortcut: 'B' },
  { id: 'brush' as Tool, icon: PaintBrushIcon, name: 'Brush', shortcut: 'R' },
  { id: 'sam_point' as Tool, icon: SparklesIcon, name: 'SAM3 Point', shortcut: 'S' },
  { id: 'sam_box' as Tool, icon: SparklesIcon, name: 'SAM3 Box', shortcut: 'X' },
  { id: 'sam_text' as Tool, icon: ChatBubbleLeftRightIcon, name: 'SAM3 Text', shortcut: 'T' }
]

export default function Annotator() {
  const { projectId, imageId } = useParams<{ projectId: string; imageId: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    currentProject, currentImage, annotations, selectedAnnotationId, selectedClassId,
    activeTool, isDrawing, currentPoints, samPendingMasks, samTextPrompt, zoom, panOffset,
    setCurrentProject, setCurrentImage, setAnnotations, addAnnotation, removeAnnotation,
    selectAnnotation, selectClass, setActiveTool, setIsDrawing, addPoint, clearCurrentPoints,
    setSamPendingMasks, setSamTextPrompt, clearSamPending, setZoom, setPanOffset, resetView,
    undo, redo
  } = useAnnotationStore()

  const [navigation, setNavigation] = useState<{ previous_id: number | null; next_id: number | null }>({
    previous_id: null,
    next_id: null
  })
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSamLoading, setIsSamLoading] = useState(false)
  const [tempBox, setTempBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  // Load project, image, and annotations
  useEffect(() => {
    const loadData = async () => {
      if (!projectId || !imageId) return
      try {
        setIsLoading(true)
        const [projectRes, imageRes, annotationsRes, navRes] = await Promise.all([
          projectApi.get(Number(projectId)),
          imageApi.get(Number(imageId)),
          annotationApi.list(Number(imageId)),
          imageApi.navigate(Number(imageId))
        ])

        setCurrentProject(projectRes.data)
        setCurrentImage(imageRes.data)
        setAnnotations(annotationsRes.data)
        setNavigation(navRes.data)

        // Set initial image for SAM3
        await segmentationApi.setImage(Number(imageId))

        // Load image for canvas
        const img = new Image()
        img.onload = () => setImageElement(img)
        img.src = imageRes.data.url
      } catch (error) {
        toast.error('Failed to load image')
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [projectId, imageId])

  // Draw canvas
  useEffect(() => {
    if (!canvasRef.current || !imageElement || !currentImage) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const container = containerRef.current
    if (!container) return

    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    // Clear canvas
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply zoom and pan
    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    // Calculate image position (centered)
    const scale = Math.min(
      (canvas.width / zoom) / imageElement.width,
      (canvas.height / zoom) / imageElement.height
    ) * 0.9

    const imgWidth = imageElement.width * scale
    const imgHeight = imageElement.height * scale
    const imgX = ((canvas.width / zoom) - imgWidth) / 2
    const imgY = ((canvas.height / zoom) - imgHeight) / 2

    // Draw image
    ctx.drawImage(imageElement, imgX, imgY, imgWidth, imgHeight)

    // Draw annotations
    annotations.forEach((ann) => {
      const classConfig = currentProject?.classes.find(c => c.id === ann.class_id)
      const color = classConfig?.color || '#FF6B6B'
      const isSelected = ann.id === selectedAnnotationId

      ctx.strokeStyle = color
      ctx.fillStyle = color + '40'
      ctx.lineWidth = isSelected ? 3 : 2

      if (ann.polygon && ann.polygon.length > 0) {
        ctx.beginPath()
        ann.polygon.forEach((point, i) => {
          const x = imgX + (point[0] / currentImage.width) * imgWidth
          const y = imgY + (point[1] / currentImage.height) * imgHeight
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      if (ann.bbox) {
        const [bx, by, bw, bh] = ann.bbox
        const x = imgX + (bx / currentImage.width) * imgWidth
        const y = imgY + (by / currentImage.height) * imgHeight
        const w = (bw / currentImage.width) * imgWidth
        const h = (bh / currentImage.height) * imgHeight
        ctx.strokeRect(x, y, w, h)
        ctx.fillRect(x, y, w, h)
      }
    })

    // Draw pending SAM masks
    samPendingMasks.forEach((mask, i) => {
      ctx.strokeStyle = '#00FF00'
      ctx.fillStyle = '#00FF0040'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])

      if (mask.polygon && mask.polygon.length > 0) {
        ctx.beginPath()
        mask.polygon.forEach((point, j) => {
          const x = imgX + (point[0] / currentImage.width) * imgWidth
          const y = imgY + (point[1] / currentImage.height) * imgHeight
          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      ctx.setLineDash([])
    })

    // Draw current drawing
    if (currentPoints.length > 0) {
      const classConfig = currentProject?.classes.find(c => c.id === selectedClassId)
      ctx.strokeStyle = classConfig?.color || '#FFFFFF'
      ctx.lineWidth = 2

      ctx.beginPath()
      currentPoints.forEach((point, i) => {
        const x = imgX + (point[0] / currentImage.width) * imgWidth
        const y = imgY + (point[1] / currentImage.height) * imgHeight
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)

        // Draw point
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(x - 3, y - 3, 6, 6)
      })
      ctx.stroke()
    }

    // Draw temp box
    if (tempBox) {
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])

      const x1 = imgX + (tempBox.x1 / currentImage.width) * imgWidth
      const y1 = imgY + (tempBox.y1 / currentImage.height) * imgHeight
      const x2 = imgX + (tempBox.x2 / currentImage.width) * imgWidth
      const y2 = imgY + (tempBox.y2 / currentImage.height) * imgHeight

      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.setLineDash([])
    }

    ctx.restore()
  }, [imageElement, currentImage, annotations, selectedAnnotationId, currentPoints, samPendingMasks, zoom, panOffset, tempBox, selectedClassId, currentProject])

  // Get image coordinates from canvas coordinates
  const getImageCoords = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    if (!canvasRef.current || !imageElement || !currentImage) return null

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - rect.left
    const canvasY = e.clientY - rect.top

    // Reverse zoom and pan
    const x = (canvasX - panOffset.x) / zoom
    const y = (canvasY - panOffset.y) / zoom

    // Calculate image bounds
    const scale = Math.min(
      (canvas.width / zoom) / imageElement.width,
      (canvas.height / zoom) / imageElement.height
    ) * 0.9

    const imgWidth = imageElement.width * scale
    const imgHeight = imageElement.height * scale
    const imgX = ((canvas.width / zoom) - imgWidth) / 2
    const imgY = ((canvas.height / zoom) - imgHeight) / 2

    // Convert to image coordinates
    const imageCoordX = ((x - imgX) / imgWidth) * currentImage.width
    const imageCoordY = ((y - imgY) / imgHeight) * currentImage.height

    if (imageCoordX < 0 || imageCoordX > currentImage.width ||
        imageCoordY < 0 || imageCoordY > currentImage.height) {
      return null
    }

    return { x: Math.round(imageCoordX), y: Math.round(imageCoordY) }
  }, [imageElement, currentImage, zoom, panOffset])

  // Handle canvas click
  const handleCanvasClick = async (e: React.MouseEvent) => {
    const coords = getImageCoords(e)
    if (!coords) return

    switch (activeTool) {
      case 'polygon':
        addPoint([coords.x, coords.y])
        break

      case 'sam_point':
        if (selectedClassId === null) {
          toast.error('Please select a class first')
          return
        }
        setIsSamLoading(true)
        try {
          const response = await segmentationApi.segmentWithPoints([
            { x: coords.x, y: coords.y, label: 1 }
          ])
          setSamPendingMasks(response.data.masks)
          toast.success(`Found ${response.data.count} segments`)
        } catch (error) {
          toast.error('Segmentation failed')
        } finally {
          setIsSamLoading(false)
        }
        break

      case 'select':
        // Find clicked annotation
        for (const ann of annotations) {
          if (ann.polygon) {
            // Point in polygon test (simplified)
            const inside = isPointInPolygon(coords.x, coords.y, ann.polygon)
            if (inside) {
              selectAnnotation(ann.id)
              return
            }
          }
        }
        selectAnnotation(null)
        break
    }
  }

  // Handle canvas mouse down/move/up for box drawing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'bbox' || activeTool === 'sam_box') {
      const coords = getImageCoords(e)
      if (coords) {
        setTempBox({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y })
        setIsDrawing(true)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing && tempBox) {
      const coords = getImageCoords(e)
      if (coords) {
        setTempBox({ ...tempBox, x2: coords.x, y2: coords.y })
      }
    }
  }

  const handleMouseUp = async () => {
    if (isDrawing && tempBox) {
      setIsDrawing(false)

      const box = {
        x1: Math.min(tempBox.x1, tempBox.x2),
        y1: Math.min(tempBox.y1, tempBox.y2),
        x2: Math.max(tempBox.x1, tempBox.x2),
        y2: Math.max(tempBox.y1, tempBox.y2)
      }

      if (activeTool === 'sam_box') {
        if (selectedClassId === null) {
          toast.error('Please select a class first')
          setTempBox(null)
          return
        }
        setIsSamLoading(true)
        try {
          const response = await segmentationApi.segmentWithBox(box)
          setSamPendingMasks(response.data.masks)
          toast.success(`Found ${response.data.count} segments`)
        } catch (error) {
          toast.error('Segmentation failed')
        } finally {
          setIsSamLoading(false)
        }
      } else if (activeTool === 'bbox' && selectedClassId !== null) {
        await saveAnnotation({
          bbox: [box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1],
          polygon: null,
          annotation_type: 'bbox'
        })
      }

      setTempBox(null)
    }
  }

  // Save annotation
  const saveAnnotation = async (data: Partial<Annotation>) => {
    if (!imageId || selectedClassId === null) return

    const classConfig = currentProject?.classes.find(c => c.id === selectedClassId)
    if (!classConfig) return

    try {
      const response = await annotationApi.create({
        image_id: Number(imageId),
        class_name: classConfig.name,
        class_id: classConfig.id,
        annotation_type: data.annotation_type || 'polygon',
        polygon: data.polygon || null,
        bbox: data.bbox || null,
        mask_rle: null,
        points: null,
        area: null,
        confidence: null,
        is_auto_generated: data.is_auto_generated || false
      })
      addAnnotation(response.data)
      clearCurrentPoints()
      toast.success('Annotation saved')
    } catch (error) {
      toast.error('Failed to save annotation')
    }
  }

  // Complete polygon
  const completePolygon = async () => {
    if (currentPoints.length < 3) {
      toast.error('Polygon needs at least 3 points')
      return
    }
    await saveAnnotation({
      polygon: currentPoints,
      annotation_type: 'polygon'
    })
  }

  // Accept SAM masks
  const acceptSamMasks = async () => {
    if (selectedClassId === null) {
      toast.error('Please select a class first')
      return
    }

    const classConfig = currentProject?.classes.find(c => c.id === selectedClassId)
    if (!classConfig) return

    try {
      const annotationsToCreate = samPendingMasks.map(mask => ({
        image_id: Number(imageId),
        class_name: classConfig.name,
        class_id: classConfig.id,
        annotation_type: 'polygon' as const,
        polygon: mask.polygon,
        bbox: mask.bbox,
        mask_rle: mask.rle || null,
        points: null,
        area: mask.area,
        confidence: mask.score,
        is_auto_generated: true
      }))

      const response = await annotationApi.createBulk(Number(imageId), annotationsToCreate)
      response.data.forEach(ann => addAnnotation(ann))
      clearSamPending()
      toast.success(`Added ${response.data.length} annotations`)
    } catch (error) {
      toast.error('Failed to save annotations')
    }
  }

  // Text prompt segmentation
  const handleTextSegment = async () => {
    if (!samTextPrompt.trim()) {
      toast.error('Please enter a text prompt')
      return
    }

    setIsSamLoading(true)
    try {
      const response = await segmentationApi.segmentWithText(samTextPrompt)
      setSamPendingMasks(response.data.masks)
      toast.success(`Found ${response.data.count} segments for "${samTextPrompt}"`)
    } catch (error) {
      toast.error('Segmentation failed')
    } finally {
      setIsSamLoading(false)
    }
  }

  // Delete selected annotation
  const handleDeleteAnnotation = async () => {
    if (selectedAnnotationId === null) return
    try {
      await annotationApi.delete(selectedAnnotationId)
      removeAnnotation(selectedAnnotationId)
      toast.success('Annotation deleted')
    } catch (error) {
      toast.error('Failed to delete annotation')
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case 'v': setActiveTool('select'); break
        case 'p': setActiveTool('polygon'); break
        case 'b': setActiveTool('bbox'); break
        case 'r': setActiveTool('brush'); break
        case 's': setActiveTool('sam_point'); break
        case 'x': setActiveTool('sam_box'); break
        case 't': setActiveTool('sam_text'); break
        case 'enter':
          if (activeTool === 'polygon' && currentPoints.length >= 3) completePolygon()
          break
        case 'escape':
          clearCurrentPoints()
          clearSamPending()
          setTempBox(null)
          break
        case 'delete':
        case 'backspace':
          if (selectedAnnotationId !== null) handleDeleteAnnotation()
          break
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            if (e.shiftKey) redo()
            else undo()
          }
          break
        case 'arrowleft':
          if (navigation.previous_id) navigate(`/projects/${projectId}/annotate/${navigation.previous_id}`)
          break
        case 'arrowright':
          if (navigation.next_id) navigate(`/projects/${projectId}/annotate/${navigation.next_id}`)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, currentPoints, selectedAnnotationId, navigation])

  // Handle wheel for zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(zoom * delta)
  }

  // Simple point in polygon test
  const isPointInPolygon = (x: number, y: number, polygon: number[][]): boolean => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1]
      const xj = polygon[j][0], yj = polygon[j][1]

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside
      }
    }
    return inside
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner w-8 h-8"></div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 border-b border-dark-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/projects/${projectId}`} className="text-dark-400 hover:text-white">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <span className="text-sm text-dark-400">{currentImage?.original_filename}</span>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigation.previous_id && navigate(`/projects/${projectId}/annotate/${navigation.previous_id}`)}
            disabled={!navigation.previous_id}
            className="p-2 rounded hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <span className="text-sm text-dark-400">
            {currentImage?.id}
          </span>
          <button
            onClick={() => navigation.next_id && navigate(`/projects/${projectId}/annotate/${navigation.next_id}`)}
            disabled={!navigation.next_id}
            className="p-2 rounded hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={undo} className="toolbar-btn" title="Undo (Ctrl+Z)">
            <ArrowUturnLeftIcon className="w-5 h-5" />
          </button>
          <button onClick={redo} className="toolbar-btn" title="Redo (Ctrl+Shift+Z)">
            <ArrowUturnRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left toolbar */}
        <div className="w-14 bg-dark-850 border-r border-dark-800 flex flex-col items-center py-2 gap-1">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
              title={`${tool.name} (${tool.shortcut})`}
            >
              <tool.icon className="w-5 h-5" />
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative canvas-container">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full"
          />

          {/* Loading overlay */}
          {isSamLoading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="flex items-center gap-2 text-white">
                <div className="spinner w-5 h-5"></div>
                <span>Running SAM3...</span>
              </div>
            </div>
          )}

          {/* Zoom controls */}
          <div className="zoom-controls">
            <button onClick={() => setZoom(zoom * 1.2)} className="p-1 hover:bg-dark-700 rounded">
              <MagnifyingGlassPlusIcon className="w-5 h-5" />
            </button>
            <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(zoom * 0.8)} className="p-1 hover:bg-dark-700 rounded">
              <MagnifyingGlassMinusIcon className="w-5 h-5" />
            </button>
            <button onClick={resetView} className="p-1 hover:bg-dark-700 rounded">
              <ArrowsPointingOutIcon className="w-5 h-5" />
            </button>
          </div>

          {/* SAM text prompt */}
          {activeTool === 'sam_text' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-dark-800 rounded-lg shadow-lg p-3 flex gap-2">
              <input
                type="text"
                value={samTextPrompt}
                onChange={(e) => setSamTextPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTextSegment()}
                placeholder="Describe what to segment..."
                className="form-input w-64"
              />
              <button onClick={handleTextSegment} className="btn btn-primary">
                Segment
              </button>
            </div>
          )}

          {/* SAM pending masks actions */}
          {samPendingMasks.length > 0 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-dark-800 rounded-lg shadow-lg p-3 flex gap-2">
              <span className="text-sm text-dark-400 mr-2">
                {samPendingMasks.length} segments found
              </span>
              <button onClick={acceptSamMasks} className="btn btn-success flex items-center gap-1">
                <CheckIcon className="w-4 h-4" />
                Accept
              </button>
              <button onClick={clearSamPending} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          )}

          {/* Polygon complete button */}
          {activeTool === 'polygon' && currentPoints.length >= 3 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-dark-800 rounded-lg shadow-lg p-3">
              <button onClick={completePolygon} className="btn btn-primary">
                Complete Polygon (Enter)
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 bg-dark-850 border-l border-dark-800 flex flex-col">
          {/* Classes */}
          <div className="border-b border-dark-700">
            <div className="panel-header">Classes</div>
            <div className="p-2 max-h-48 overflow-auto">
              {currentProject?.classes.map((cls) => (
                <div
                  key={cls.id}
                  onClick={() => selectClass(cls.id)}
                  className={`class-item ${selectedClassId === cls.id ? 'selected' : ''}`}
                >
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: cls.color }}
                  />
                  <span className="text-sm">{cls.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Annotations */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="panel-header flex items-center justify-between">
              <span>Annotations ({annotations.length})</span>
              <button
                onClick={handleDeleteAnnotation}
                disabled={selectedAnnotationId === null}
                className="p-1 text-dark-400 hover:text-red-500 disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {annotations.map((ann) => {
                const classConfig = currentProject?.classes.find(c => c.id === ann.class_id)
                return (
                  <div
                    key={ann.id}
                    onClick={() => selectAnnotation(ann.id)}
                    className={`annotation-item ${selectedAnnotationId === ann.id ? 'selected' : ''}`}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: classConfig?.color }}
                    />
                    <span className="text-sm flex-1">{classConfig?.name}</span>
                    <span className="text-xs text-dark-500">{ann.annotation_type}</span>
                  </div>
                )
              })}
              {annotations.length === 0 && (
                <p className="text-dark-500 text-sm text-center py-4">
                  No annotations yet
                </p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="border-t border-dark-700 p-3">
            <p className="text-xs text-dark-500">
              {activeTool === 'polygon' && 'Click to add points. Press Enter to complete.'}
              {activeTool === 'bbox' && 'Click and drag to draw a box.'}
              {activeTool === 'sam_point' && 'Click on an object to segment it with SAM3.'}
              {activeTool === 'sam_box' && 'Draw a box around an object to segment it.'}
              {activeTool === 'sam_text' && 'Describe the object you want to segment.'}
              {activeTool === 'select' && 'Click on an annotation to select it.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  ArrowLeftIcon,
  PhotoIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  AcademicCapIcon,
  CloudArrowUpIcon,
  PencilSquareIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { projectApi, imageApi, exportApi, type Project, type Image, type ClassConfig } from '../utils/api'

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [images, setImages] = useState<Image[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showClassesModal, setShowClassesModal] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState('coco')
  const [includeImages, setIncludeImages] = useState(false)
  const [editingClasses, setEditingClasses] = useState<ClassConfig[]>([])

  useEffect(() => {
    if (projectId) {
      loadProject()
      loadImages()
    }
  }, [projectId])

  const loadProject = async () => {
    try {
      const response = await projectApi.get(Number(projectId))
      setProject(response.data)
      setEditingClasses(response.data.classes || [])
    } catch (error) {
      toast.error('프로젝트를 불러오는데 실패했습니다')
    }
  }

  const loadImages = async () => {
    try {
      setIsLoading(true)
      const response = await imageApi.list(Number(projectId))
      setImages(response.data)
    } catch (error) {
      toast.error('이미지를 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!projectId) return
    try {
      setIsUploading(true)
      await imageApi.upload(Number(projectId), acceptedFiles)
      toast.success(`${acceptedFiles.length}개 이미지가 업로드되었습니다`)
      loadImages()
      loadProject()
    } catch (error) {
      toast.error('이미지 업로드에 실패했습니다')
    } finally {
      setIsUploading(false)
    }
  }, [projectId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp']
    }
  })

  const handleDeleteImage = async (imageId: number) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return
    try {
      await imageApi.delete(imageId)
      toast.success('이미지가 삭제되었습니다')
      loadImages()
      loadProject()
    } catch (error) {
      toast.error('이미지 삭제에 실패했습니다')
    }
  }

  const handleExport = async () => {
    if (!projectId) return
    try {
      const response = await exportApi.exportProject(Number(projectId), selectedFormat, includeImages)
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project?.name || 'export'}_${selectedFormat}.${includeImages ? 'zip' : selectedFormat === 'coco' ? 'json' : 'zip'}`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success('내보내기가 완료되었습니다')
      setShowExportModal(false)
    } catch (error) {
      toast.error('내보내기에 실패했습니다')
    }
  }

  const handleSaveClasses = async () => {
    if (!projectId) return
    try {
      await projectApi.update(Number(projectId), { classes: editingClasses })
      toast.success('클래스가 업데이트되었습니다')
      loadProject()
      setShowClassesModal(false)
    } catch (error) {
      toast.error('클래스 업데이트에 실패했습니다')
    }
  }

  const addClass = () => {
    const newId = Math.max(0, ...editingClasses.map(c => c.id)) + 1
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
    setEditingClasses([
      ...editingClasses,
      { id: newId, name: `클래스_${newId}`, color: colors[newId % colors.length] }
    ])
  }

  const removeClass = (id: number) => {
    setEditingClasses(editingClasses.filter(c => c.id !== id))
  }

  const updateClass = (id: number, updates: Partial<ClassConfig>) => {
    setEditingClasses(editingClasses.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '대기중'
      case 'annotated': return '완료'
      case 'reviewed': return '검토됨'
      default: return status
    }
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner w-8 h-8"></div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-dark-800">
        <div className="flex items-center gap-4 mb-2">
          <Link to="/projects" className="text-dark-400 hover:text-white">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-dark-400 text-sm">{project.description || '설명 없음'}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowClassesModal(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Cog6ToothIcon className="w-4 h-4" />
              클래스 ({project.classes.length})
            </button>
            <Link
              to={`/projects/${projectId}/training`}
              className="btn btn-secondary flex items-center gap-2"
            >
              <AcademicCapIcon className="w-4 h-4" />
              학습
            </Link>
            <button
              onClick={() => setShowExportModal(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              내보내기
            </button>
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="px-6 py-3 border-b border-dark-800 bg-dark-850 flex gap-6">
        <div>
          <span className="text-dark-400 text-sm">이미지</span>
          <span className="ml-2 font-medium">{project.image_count}개</span>
        </div>
        <div>
          <span className="text-dark-400 text-sm">어노테이션</span>
          <span className="ml-2 font-medium">{project.annotation_count}개</span>
        </div>
        <div>
          <span className="text-dark-400 text-sm">유형</span>
          <span className="ml-2 font-medium">
            {project.annotation_type === 'instance_segmentation' ? '인스턴스 세그멘테이션' :
             project.annotation_type === 'semantic' ? '시맨틱 세그멘테이션' : '바운딩 박스'}
          </span>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-auto p-6">
        {/* 업로드 영역 */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 mb-6 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-dark-700 hover:border-dark-500'
          }`}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="spinner w-5 h-5"></div>
              <span>업로드 중...</span>
            </div>
          ) : (
            <>
              <CloudArrowUpIcon className="w-12 h-12 mx-auto text-dark-500 mb-2" />
              <p className="text-dark-400">
                이미지를 여기에 드래그하거나 클릭하여 파일을 선택하세요
              </p>
              <p className="text-dark-500 text-sm mt-1">
                PNG, JPG, JPEG, WebP, BMP 지원
              </p>
            </>
          )}
        </div>

        {/* 이미지 그리드 */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-dark-400">
            <PhotoIcon className="w-16 h-16 mb-4" />
            <p className="text-lg">아직 이미지가 없습니다</p>
            <p className="text-sm">이미지를 업로드하여 라벨링을 시작하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {images.map((image) => (
              <div key={image.id} className="image-thumbnail group">
                <img
                  src={image.url}
                  alt={image.original_filename}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => navigate(`/projects/${projectId}/annotate/${image.id}`)}
                    className="p-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                    title="어노테이션"
                  >
                    <PencilSquareIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteImage(image.id)}
                    className="p-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                    title="삭제"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-xs text-white truncate">{image.original_filename}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge ${
                      image.status === 'annotated' ? 'badge-annotated' :
                      image.status === 'reviewed' ? 'badge-reviewed' : 'badge-pending'
                    }`}>
                      {getStatusText(image.status)}
                    </span>
                    {image.annotation_count > 0 && (
                      <span className="text-xs text-dark-300">
                        {image.annotation_count}개 어노테이션
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 내보내기 모달 */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700">
              <h2 className="text-xl font-bold">어노테이션 내보내기</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">형식</label>
                <select
                  className="form-input"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                >
                  <option value="coco">COCO JSON</option>
                  <option value="yolo">YOLO</option>
                  <option value="yolo_seg">YOLO 세그멘테이션</option>
                  <option value="pascal_voc">Pascal VOC</option>
                  <option value="mask">마스크 이미지</option>
                  <option value="sam3_training">SAM3 학습용</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includeImages"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  className="rounded border-dark-600 bg-dark-700 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="includeImages" className="text-sm">
                  이미지 포함하여 내보내기
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={handleExport} className="btn btn-primary flex-1">
                  다운로드
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="btn btn-secondary"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 클래스 모달 */}
      {showClassesModal && (
        <div className="modal-overlay" onClick={() => setShowClassesModal(false)}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700">
              <h2 className="text-xl font-bold">클래스 관리</h2>
            </div>
            <div className="p-6 space-y-4 max-h-96 overflow-auto">
              {editingClasses.map((cls) => (
                <div key={cls.id} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={cls.color}
                    onChange={(e) => updateClass(cls.id, { color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={cls.name}
                    onChange={(e) => updateClass(cls.id, { name: e.target.value })}
                    className="form-input flex-1"
                  />
                  <span className="text-dark-500 text-sm w-16">ID: {cls.id}</span>
                  <button
                    onClick={() => removeClass(cls.id)}
                    className="p-2 text-dark-400 hover:text-red-500"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addClass}
                className="w-full py-2 border-2 border-dashed border-dark-600 rounded-lg text-dark-400 hover:border-dark-500 hover:text-dark-300"
              >
                + 클래스 추가
              </button>
            </div>
            <div className="p-6 border-t border-dark-700 flex gap-3">
              <button onClick={handleSaveClasses} className="btn btn-primary flex-1">
                변경사항 저장
              </button>
              <button
                onClick={() => setShowClassesModal(false)}
                className="btn btn-secondary"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

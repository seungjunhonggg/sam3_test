import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PlusIcon, TrashIcon, PhotoIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { projectApi, type Project, type ClassConfig } from '../utils/api'

const DEFAULT_CLASSES: ClassConfig[] = [
  { id: 0, name: '객체', color: '#FF6B6B' },
  { id: 1, name: '사람', color: '#4ECDC4' },
  { id: 2, name: '차량', color: '#45B7D1' },
  { id: 3, name: '동물', color: '#96CEB4' }
]

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    annotation_type: 'instance_segmentation'
  })

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setIsLoading(true)
      const response = await projectApi.list()
      setProjects(response.data)
    } catch (error) {
      toast.error('프로젝트를 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await projectApi.create({
        ...newProject,
        classes: DEFAULT_CLASSES
      })
      toast.success('프로젝트가 생성되었습니다')
      setShowCreateModal(false)
      setNewProject({ name: '', description: '', annotation_type: 'instance_segmentation' })
      loadProjects()
    } catch (error) {
      toast.error('프로젝트 생성에 실패했습니다')
    }
  }

  const handleDeleteProject = async (id: number) => {
    if (!confirm('정말로 이 프로젝트를 삭제하시겠습니까?')) return
    try {
      await projectApi.delete(id)
      toast.success('프로젝트가 삭제되었습니다')
      loadProjects()
    } catch (error) {
      toast.error('프로젝트 삭제에 실패했습니다')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-dark-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">프로젝트</h1>
          <p className="text-dark-400 text-sm mt-1">라벨링 프로젝트를 관리하세요</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          새 프로젝트
        </button>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-dark-400">
            <PhotoIcon className="w-16 h-16 mb-4" />
            <p className="text-lg">아직 프로젝트가 없습니다</p>
            <p className="text-sm">새 프로젝트를 만들어 시작하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="panel hover:border-primary-500 transition-colors group"
              >
                <div className="aspect-video bg-dark-700 rounded-t-lg flex items-center justify-center">
                  <PhotoIcon className="w-12 h-12 text-dark-500" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium group-hover:text-primary-400 transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-sm text-dark-400 mt-1 line-clamp-2">
                        {project.description || '설명 없음'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleDeleteProject(project.id)
                      }}
                      className="p-1 text-dark-500 hover:text-red-500 transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm text-dark-400">
                    <span>{project.image_count}개 이미지</span>
                    <span>{project.annotation_count}개 어노테이션</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {project.classes.slice(0, 5).map((cls) => (
                      <div
                        key={cls.id}
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: cls.color }}
                        title={cls.name}
                      />
                    ))}
                    {project.classes.length > 5 && (
                      <span className="text-xs text-dark-500">+{project.classes.length - 5}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 생성 모달 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700">
              <h2 className="text-xl font-bold">새 프로젝트 만들기</h2>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div>
                <label className="form-label">프로젝트 이름</label>
                <input
                  type="text"
                  className="form-input"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="프로젝트 이름을 입력하세요"
                  required
                />
              </div>
              <div>
                <label className="form-label">설명</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="프로젝트 설명을 입력하세요"
                />
              </div>
              <div>
                <label className="form-label">어노테이션 유형</label>
                <select
                  className="form-input"
                  value={newProject.annotation_type}
                  onChange={(e) => setNewProject({ ...newProject, annotation_type: e.target.value })}
                >
                  <option value="instance_segmentation">인스턴스 세그멘테이션</option>
                  <option value="semantic">시맨틱 세그멘테이션</option>
                  <option value="bbox">바운딩 박스</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn btn-primary flex-1">
                  프로젝트 생성
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

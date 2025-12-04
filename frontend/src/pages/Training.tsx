import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeftIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { projectApi, trainingApi, type Project, type TrainingRun } from '../utils/api'

export default function Training() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [trainingRuns, setTrainingRuns] = useState<TrainingRun[]>([])
  const [selectedRun, setSelectedRun] = useState<TrainingRun | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewRunModal, setShowNewRunModal] = useState(false)
  const [newRunConfig, setNewRunConfig] = useState({
    name: '',
    batch_size: 4,
    learning_rate: 0.00001,
    num_epochs: 10,
    use_lora: true,
    lora_rank: 8
  })

  useEffect(() => {
    if (projectId) {
      loadData()
    }
  }, [projectId])

  useEffect(() => {
    if (selectedRun?.status === 'running') {
      const interval = setInterval(() => {
        loadLogs(selectedRun.id)
        loadTrainingRuns()
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [selectedRun])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [projectRes, runsRes] = await Promise.all([
        projectApi.get(Number(projectId)),
        trainingApi.list(Number(projectId))
      ])
      setProject(projectRes.data)
      setTrainingRuns(runsRes.data)

      if (runsRes.data.length > 0) {
        setSelectedRun(runsRes.data[0])
        loadLogs(runsRes.data[0].id)
      }
    } catch (error) {
      toast.error('학습 데이터를 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const loadTrainingRuns = async () => {
    try {
      const response = await trainingApi.list(Number(projectId))
      setTrainingRuns(response.data)

      if (selectedRun) {
        const updatedRun = response.data.find(r => r.id === selectedRun.id)
        if (updatedRun) {
          setSelectedRun(updatedRun)
        }
      }
    } catch (error) {
      console.error('학습 실행 목록 새로고침 실패')
    }
  }

  const loadLogs = async (runId: number) => {
    try {
      const response = await trainingApi.getLogs(runId)
      setLogs(response.data.logs)
    } catch (error) {
      console.error('로그 로딩 실패')
    }
  }

  const handleStartTraining = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return

    try {
      const response = await trainingApi.create({
        project_id: Number(projectId),
        name: newRunConfig.name,
        config: {
          batch_size: newRunConfig.batch_size,
          learning_rate: newRunConfig.learning_rate,
          num_epochs: newRunConfig.num_epochs,
          use_lora: newRunConfig.use_lora,
          lora_rank: newRunConfig.lora_rank
        }
      })
      toast.success('학습이 시작되었습니다')
      setShowNewRunModal(false)
      setSelectedRun(response.data)
      loadTrainingRuns()
      setNewRunConfig({
        name: '',
        batch_size: 4,
        learning_rate: 0.00001,
        num_epochs: 10,
        use_lora: true,
        lora_rank: 8
      })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || '학습 시작에 실패했습니다')
    }
  }

  const handleCancelTraining = async (runId: number) => {
    try {
      await trainingApi.cancel(runId)
      toast.success('학습이 취소되었습니다')
      loadTrainingRuns()
    } catch (error) {
      toast.error('학습 취소에 실패했습니다')
    }
  }

  const handleApplyModel = async (runId: number) => {
    try {
      await trainingApi.applyModel(runId)
      toast.success('모델이 적용되었습니다')
    } catch (error) {
      toast.error('모델 적용에 실패했습니다')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircleIcon className="w-5 h-5 text-red-500" />
      case 'running':
        return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />
      default:
        return <ClockIcon className="w-5 h-5 text-yellow-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '완료'
      case 'failed': return '실패'
      case 'running': return '진행중'
      case 'pending': return '대기중'
      default: return status
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('ko-KR')
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
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-dark-800">
        <div className="flex items-center gap-4 mb-2">
          <Link to={`/projects/${projectId}`} className="text-dark-400 hover:text-white">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">학습 - {project?.name}</h1>
        </div>
        <p className="text-dark-400 text-sm">
          라벨링한 데이터로 SAM3를 파인튜닝하세요
        </p>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽 패널 - 학습 실행 목록 */}
        <div className="w-80 border-r border-dark-800 flex flex-col">
          <div className="p-4 border-b border-dark-800 flex items-center justify-between">
            <h2 className="font-medium">학습 실행</h2>
            <button
              onClick={() => setShowNewRunModal(true)}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <PlayIcon className="w-4 h-4" />
              새 학습
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {trainingRuns.length === 0 ? (
              <div className="p-4 text-center text-dark-500">
                <p>아직 학습 실행이 없습니다</p>
                <p className="text-sm mt-1">새 학습을 시작하여 SAM3를 파인튜닝하세요</p>
              </div>
            ) : (
              trainingRuns.map((run) => (
                <div
                  key={run.id}
                  onClick={() => {
                    setSelectedRun(run)
                    loadLogs(run.id)
                  }}
                  className={`p-4 border-b border-dark-800 cursor-pointer hover:bg-dark-800 ${
                    selectedRun?.id === run.id ? 'bg-dark-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(run.status)}
                    <span className="font-medium">{run.name}</span>
                  </div>
                  <div className="text-sm text-dark-500 mt-1">
                    {run.num_epochs} 에폭 | 학습률: {run.learning_rate}
                  </div>
                  <div className="text-xs text-dark-600 mt-1">
                    {formatDate(run.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 오른쪽 패널 - 실행 상세 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedRun ? (
            <>
              {/* 실행 헤더 */}
              <div className="p-4 border-b border-dark-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(selectedRun.status)}
                    <h2 className="text-xl font-bold">{selectedRun.name}</h2>
                    <span className={`badge ${
                      selectedRun.status === 'completed' ? 'bg-green-900/50 text-green-400' :
                      selectedRun.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                      selectedRun.status === 'running' ? 'bg-blue-900/50 text-blue-400' :
                      'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {getStatusText(selectedRun.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedRun.status === 'running' && (
                      <button
                        onClick={() => handleCancelTraining(selectedRun.id)}
                        className="btn btn-danger flex items-center gap-1"
                      >
                        <StopIcon className="w-4 h-4" />
                        취소
                      </button>
                    )}
                    {selectedRun.status === 'completed' && selectedRun.checkpoint_path && (
                      <button
                        onClick={() => handleApplyModel(selectedRun.id)}
                        className="btn btn-success"
                      >
                        모델 적용
                      </button>
                    )}
                  </div>
                </div>

                {/* 설정 */}
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="bg-dark-800 p-3 rounded-lg">
                    <div className="text-xs text-dark-500">배치 사이즈</div>
                    <div className="text-lg font-medium">{selectedRun.batch_size}</div>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg">
                    <div className="text-xs text-dark-500">학습률</div>
                    <div className="text-lg font-medium">{selectedRun.learning_rate}</div>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg">
                    <div className="text-xs text-dark-500">에폭</div>
                    <div className="text-lg font-medium">{selectedRun.num_epochs}</div>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg">
                    <div className="text-xs text-dark-500">시작 시간</div>
                    <div className="text-sm font-medium">{formatDate(selectedRun.started_at)}</div>
                  </div>
                </div>
              </div>

              {/* 로그 */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-dark-800 flex items-center justify-between">
                  <h3 className="font-medium">학습 로그</h3>
                  <button
                    onClick={() => loadLogs(selectedRun.id)}
                    className="text-dark-400 hover:text-white"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-dark-950 font-mono text-sm">
                  {logs.length === 0 ? (
                    <div className="text-dark-500">로그가 없습니다</div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="text-dark-300 py-0.5">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-dark-500">
              학습 실행을 선택하여 상세 정보를 확인하세요
            </div>
          )}
        </div>
      </div>

      {/* 새 학습 모달 */}
      {showNewRunModal && (
        <div className="modal-overlay" onClick={() => setShowNewRunModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700">
              <h2 className="text-xl font-bold">새 학습 시작</h2>
            </div>
            <form onSubmit={handleStartTraining} className="p-6 space-y-4">
              <div>
                <label className="form-label">실행 이름</label>
                <input
                  type="text"
                  className="form-input"
                  value={newRunConfig.name}
                  onChange={(e) => setNewRunConfig({ ...newRunConfig, name: e.target.value })}
                  placeholder="예: training_run_1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">배치 사이즈</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newRunConfig.batch_size}
                    onChange={(e) => setNewRunConfig({ ...newRunConfig, batch_size: Number(e.target.value) })}
                    min={1}
                    max={32}
                  />
                </div>
                <div>
                  <label className="form-label">에폭 수</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newRunConfig.num_epochs}
                    onChange={(e) => setNewRunConfig({ ...newRunConfig, num_epochs: Number(e.target.value) })}
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">학습률</label>
                <input
                  type="number"
                  className="form-input"
                  value={newRunConfig.learning_rate}
                  onChange={(e) => setNewRunConfig({ ...newRunConfig, learning_rate: Number(e.target.value) })}
                  step={0.000001}
                  min={0.0000001}
                  max={0.01}
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useLora"
                    checked={newRunConfig.use_lora}
                    onChange={(e) => setNewRunConfig({ ...newRunConfig, use_lora: e.target.checked })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-600"
                  />
                  <label htmlFor="useLora" className="text-sm">LoRA 사용</label>
                </div>
                {newRunConfig.use_lora && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-dark-400">LoRA 랭크:</label>
                    <input
                      type="number"
                      className="form-input w-20"
                      value={newRunConfig.lora_rank}
                      onChange={(e) => setNewRunConfig({ ...newRunConfig, lora_rank: Number(e.target.value) })}
                      min={1}
                      max={64}
                    />
                  </div>
                )}
              </div>

              <div className="bg-dark-700 p-3 rounded-lg text-sm text-dark-400">
                <p>요구사항:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>최소 5개의 어노테이션된 이미지 필요</li>
                  <li>빠른 학습을 위해 GPU 권장</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn btn-primary flex-1 flex items-center justify-center gap-2">
                  <PlayIcon className="w-4 h-4" />
                  학습 시작
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewRunModal(false)}
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

import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProjectList from './pages/ProjectList'
import ProjectDetail from './pages/ProjectDetail'
import Annotator from './pages/Annotator'
import Training from './pages/Training'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/:projectId" element={<ProjectDetail />} />
        <Route path="projects/:projectId/annotate/:imageId" element={<Annotator />} />
        <Route path="projects/:projectId/training" element={<Training />} />
      </Route>
    </Routes>
  )
}

export default App

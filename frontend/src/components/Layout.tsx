import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  FolderIcon,
  Cog6ToothIcon,
  Squares2X2Icon
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Projects', href: '/projects', icon: FolderIcon }
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-screen bg-dark-900">
      {/* Sidebar */}
      <div className="w-16 bg-dark-950 flex flex-col items-center py-4 border-r border-dark-800">
        {/* Logo */}
        <Link to="/" className="mb-8">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <Squares2X2Icon className="w-6 h-6 text-white" />
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col items-center gap-2">
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:bg-dark-800 hover:text-white'
                }`}
                title={item.name}
              >
                <item.icon className="w-5 h-5" />
              </Link>
            )
          })}
        </nav>

        {/* Settings */}
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-dark-400 hover:bg-dark-800 hover:text-white transition-colors"
          title="Settings"
        >
          <Cog6ToothIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

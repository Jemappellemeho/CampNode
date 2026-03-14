import logoSmall from '../assets/logo_small.png';
import logoFull from '../assets/logo_full.png';
import { useTheme } from '../ThemeContext';
import Layout from '../components/Layout';

function Profile() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <img 
            src={logoSmall} 
            alt="CampNode" 
            className="h-8 md:hidden" 
          />
          <img 
            src={logoFull} 
            alt="CampNode" 
            className="hidden md:block h-10 lg:h-12" 
          />
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <button 
            onClick={toggleTheme}
            className="px-3 py-2 sm:px-4 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="text-gray-600 dark:text-gray-300 hover:text-red-500 font-medium text-sm sm:text-base">
            Logout
          </button>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl md:rounded-2xl shadow-lg p-4 sm:p-6 md:p-8 mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
          {/* Profile Picture */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold shrink-0">
            MS
          </div>

          {/* Profile Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-2 break-words">
              Maria Schmidt
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mb-2 break-all">
              maria.schmidt@example.com
            </p>
            <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs sm:text-sm font-medium">
              Student
            </span>
          </div>

          <button className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm sm:text-base self-start sm:self-auto">
            Edit Profile
          </button>
        </div>
      </div>

      {/* Courses Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl md:rounded-2xl shadow-lg p-4 sm:p-6 md:p-8 mb-4 md:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-4">My Courses</h2>
        
        <div className="space-y-3 sm:space-y-4">
          {/* Course 1 */}
          <div className="border-l-4 border-green-500 pl-3 sm:pl-4 py-2">
            <h3 className="font-semibold text-sm sm:text-base text-gray-800 dark:text-gray-200">
              CS 101: Data Structures
            </h3>
            <div className="flex items-center gap-3 sm:gap-4 mt-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{width: '65%'}}></div>
              </div>
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                65%
              </span>
            </div>
          </div>

          {/* Course 2 */}
          <div className="border-l-4 border-blue-500 pl-3 sm:pl-4 py-2">
            <h3 className="font-semibold text-sm sm:text-base text-gray-800 dark:text-gray-200">
              Web Development
            </h3>
            <div className="flex items-center gap-3 sm:gap-4 mt-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{width: '30%'}}></div>
              </div>
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                30%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl md:rounded-2xl shadow-lg p-4 sm:p-6 md:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-4">Settings</h2>
        
        <div className="space-y-2 sm:space-y-3">
          <button className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 rounded-lg transition-colors text-sm sm:text-base">
            Change Password
          </button>
          <button className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 rounded-lg transition-colors text-sm sm:text-base">
            Notification Preferences
          </button>
          <button className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 rounded-lg transition-colors text-sm sm:text-base">
            Privacy Settings
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default Profile;
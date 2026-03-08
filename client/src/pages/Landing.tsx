import logoFull from '../assets/logo_full.png';

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-300 via-green-400 to-blue-500 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
        {/* Logo */}
        <div className="mb-8">
          <img 
            src={logoFull} 
            alt="CampNode Logo" 
            className="w-full max-w-sm mx-auto"
          />
        </div>

        <p className="text-gray-600 text-lg mb-8">
          Your learning playground awaits
        </p>

        <div className="space-y-4">
          <button className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg">
            Join with Course Code
          </button>

          <button className="w-full bg-white border-2 border-gray-300 hover:border-green-500 text-gray-700 font-semibold py-4 px-6 rounded-xl transition-all shadow-md">
            Browse Public Courses
          </button>
        </div>
      </div>
    </div>
  );
}

export default Landing;
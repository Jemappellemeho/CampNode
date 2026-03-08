import Layout from '../components/Layout';

function Playground() {
  // Fake data - later this comes from backend
  const nodes = [
    { id: 1, name: "Variables", color: "green", status: "completed" },
    { id: 2, name: "Loops", color: "blue", status: "current" },
    { id: 3, name: "Binary Trees", color: "gray", status: "locked" }
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-8">
          CS 101: Data Structures
        </h1>

        {/* Vertical path with nodes */}
        <div className="relative flex flex-col items-center gap-8">
          {nodes.map((node, index) => (
            <div key={node.id} className="relative">
              {/* Connecting line (except for last node) */}
              {index < nodes.length - 1 && (
                <div className="absolute left-1/2 top-full w-1 h-8 bg-gray-300 dark:bg-gray-600 -translate-x-1/2"></div>
              )}

              {/* Node */}
              <div 
                className={`
                  w-32 h-32 rounded-2xl flex flex-col items-center justify-center
                  cursor-pointer transition-all hover:scale-105 shadow-lg
                  ${node.color === 'green' ? 'bg-green-500' : ''}
                  ${node.color === 'blue' ? 'bg-blue-500' : ''}
                  ${node.color === 'gray' ? 'bg-gray-400 opacity-50' : ''}
                `}
                onClick={() => alert(`Clicked: ${node.name}`)}
              >
                {/* Status icon */}
                <div className="text-3xl mb-2">
                  {node.status === 'completed' && '✓'}
                  {node.status === 'current' && '🌟'}
                  {node.status === 'locked' && '🔒'}
                </div>

                {/* Node name */}
                <p className="text-white font-semibold text-center text-sm px-2">
                  {node.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default Playground;
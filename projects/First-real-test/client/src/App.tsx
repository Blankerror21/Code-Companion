import React from 'react';
import CarDiagnostics from './components/car-diagnostics';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <CarDiagnostics />
    </div>
  );
};

export default App;

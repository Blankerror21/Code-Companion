import React, { useState } from 'react';

const App = () => {
  const [location, setLocation] = useState('');

  return (
    <div className='App'>
      <h1>Weather App</h1>
      <Sidebar location={location} setLocation={setLocation} />
      <ContentArea location={location} />
    </div>
  );
};

export default App;

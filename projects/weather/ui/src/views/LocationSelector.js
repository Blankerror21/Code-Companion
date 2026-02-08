// LocationSelector.js
import React, { useState } from 'react';

const LocationSelector = ({ onSelect }) => {
  const [location, setLocation] = useState('');

  const handleSelect = () => {
    if (onSelect) {
      onSelect(location);
    }
  };

  return (
    <div>
      <input
        type='text'
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder='Enter location'
      />
      <button onClick={handleSelect}>Select</button>
    </div>
  );
};

export default LocationSelector;
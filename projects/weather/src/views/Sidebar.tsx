import React from 'react';

const Sidebar = ({ location, setLocation }) => {
  return (
    <div className='Sidebar'>
      <h2>Location: {location}</h2>
      <input type='text' value={location} onChange={(e) => setLocation(e.target.value)} />
    </div>
  );
};

export default Sidebar;

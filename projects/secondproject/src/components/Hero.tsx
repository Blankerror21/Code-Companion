import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="h-64 flex items-center justify-center bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
      <div className="text-center">
        <h2 className="text-4xl font-bold">Hi, I'm Your Name</h2>
        <p className="mt-4 text-lg">A passionate developer building amazing projects.</p>
      </div>
    </section>
  );
};

export default Hero;

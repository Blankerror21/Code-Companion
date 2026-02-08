import React from 'react';

const About: React.FC = () => {
  return (
    <section className="p-8 bg-gray-100 dark:bg-gray-800">
      <h2 className="text-3xl font-bold mb-4">About Me</h2>
      <p className="mb-2">
        I am a software engineer with experience in web development, mobile apps, and data science.
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>JavaScript / TypeScript</li>
        <li>React / Vite</li>
        <li>Node.js / Express</li>
        <li>Python &amp; Data Analysis</li>
      </ul>
    </section>
  );
};

export default About;

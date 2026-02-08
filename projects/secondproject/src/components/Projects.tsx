import React from 'react';

const Projects: React.FC = () => {
  const projects = [
    { title: "Project A", description: "A cool web app built with React." },
    { title: "Project B", description: "An API service using Node & Express." },
    { title: "Project C", description: "Data analysis tool in Python." }
  ];

  return (
    <section className="p-8 bg-white dark:bg-gray-900">
      <h2 className="text-3xl font-bold mb-4">Projects</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {projects.map((proj, idx) => (
          <article key={idx} className="p-4 border rounded shadow bg-gray-200 dark:bg-gray-700">
            <h3 className="text-xl font-semibold">{proj.title}</h3>
            <p>{proj.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default Projects;

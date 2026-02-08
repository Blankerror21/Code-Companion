import React, { useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import About from './components/About';
import Projects from './components/Projects';
import ContactForm from './components/ContactForm';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <div className={theme}>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Hero />
      <About />
      <Projects />
      <ContactForm />
    </div>
  );
};

export default App;

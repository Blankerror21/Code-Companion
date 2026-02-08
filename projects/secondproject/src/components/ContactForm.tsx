import React, { useState } from 'react';

const ContactForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStatus('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      setStatus('error');
    }
  };

  return (
    <section className="p-8 bg-gray-100 dark:bg-gray-800">
      <h2 className="text-3xl font-bold mb-4">Contact Me</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
        />
        <input
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
        />
        <textarea
          placeholder="Message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          required
          className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
        />
        <button type="submit" disabled={status === 'sending'} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">
          {status === 'sending' ? 'Sending...' : 'Send Message'}
        </button>
      </form>
      {status === 'sent' && <p className="mt-4 text-green-500">Your message has been sent!</p>}
      {status === 'error' && <p className="mt-4 text-red-500">Something went wrong. Please try again.</p>}
    </section>
  );
};

export default ContactForm;

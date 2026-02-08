import React, { useState } from 'react';
import axios from 'axios';

interface Diagnostic {
  make: string;
  model: string;
  year: number;
  issues: string[];
}

const CarDiagnostics: React.FC = () => {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.get<Diagnostic>('/api/diagnose', {
        params: { make, model, year },
      });
      setDiagnostic(res.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? err.message);
      } else {
        setError('Unknown error');
      }
    }
  };

  return (
    <div className="p-4 max-w-md w-full bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Car Diagnostics</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Make (e.g., Toyota)"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          required
          className="w-full border rounded p-2"
        />
        <input
          type="text"
          placeholder="Model (e.g., Corolla)"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
          className="w-full border rounded p-2"
        />
        <input
          type="number"
          placeholder="Year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          required
          className="w-full border rounded p-2"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
        >Diagnose</button>
      </form>
      {error && <p className="text-red-600 mt-3">{error}</p>}
      {diagnostic && (
        <div className="mt-4">
          <h3 className="font-semibold">Results:</h3>
          <p><strong>Make:</strong> {diagnostic.make}</p>
          <p><strong>Model:</strong> {diagnostic.model}</p>
          <p><strong>Year:</strong> {diagnostic.year}</p>
          <ul className="list-disc pl-4">
            {diagnostic.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CarDiagnostics;

import express, { Request, Response } from 'express';

const router = express.Router();

interface Diagnostic {
  make: string;
  model: string;
  year: number;
  issues: string[];
}

// Mock diagnostic data generator
function generateDiagnostic(make: string, model: string, year: number): Diagnostic {
  const issues = [];
  if (year < 2000) {
    issues.push('Old engine may need replacement');
  }
  if (make.toLowerCase() === 'toyota') {
    issues.push('Check Toyota-specific recalls');
  }
  if (model.toLowerCase().includes('corolla')) {
    issues.push('Corolla fuel efficiency check');
  }
  return { make, model, year, issues };
}

router.get('/api/diagnose', (req: Request, res: Response) => {
  const { make, model, year } = req.query as Record<string, string>;
  if (!make || !model || !year) {
    return res.status(400).json({ error: 'Missing query parameters' });
  }

  const parsedYear = parseInt(year);
  if (isNaN(parsedYear)) {
    return res.status(400).json({ error: 'Invalid year value' });
  }

  const diagnostic = generateDiagnostic(make, model, parsedYear);
  res.json(diagnostic);
});

export default router;

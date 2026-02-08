import { useState } from "react";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function CarDiagnostics() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!make || !model || !year) return;
    setLoading(true);
    try {
      const res = await axios.get("/api/diagnose", {
        params: { make, model, year },
      });
      setDiagnostics(res.data);
    } catch (err) {
      console.error(err);
      alert("Error fetching diagnostics");
    }
    setLoading(false);
  };

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>Car Diagnostics</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            required
          />
          <Input
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
          <Input
            placeholder="Year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Loading…" : "Get Diagnostics"}
          </Button>
        </form>
        {diagnostics && (
          <div className="mt-4">
            <h3 className="font-semibold">Results:</h3>
            <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

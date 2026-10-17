import { useState } from "react";
import { localInput, period, type Period } from "./model";
export function PeriodForm({
  value,
  maxDays,
  apply,
}: {
  value: Period;
  maxDays: number;
  apply: (value: Period) => void;
}) {
  const [de, setDe] = useState(localInput(Date.parse(value.de)));
  const [ate, setAte] = useState(localInput(Date.parse(value.ate)));
  const [error, setError] = useState("");
  return (
    <form
      className="panel-filters"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const next = period(de, ate, maxDays);
          setError("");
          apply(next);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <div className="form-field">
        <label htmlFor="period-start">Início (Bahia)</label>
        <input
          id="period-start"
          type="datetime-local"
          required
          value={de}
          onChange={(e) => setDe(e.target.value)}
          aria-describedby="period-help"
        />
      </div>
      <div className="form-field">
        <label htmlFor="period-end">Fim exclusivo (Bahia)</label>
        <input
          id="period-end"
          type="datetime-local"
          required
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          aria-describedby="period-help"
        />
      </div>
      <button className="primary-button">Aplicar período</button>
      <p id="period-help" className="period-help">
        Até {maxDays} dias. Inclui o início e exclui o fim. Horário UTC−03
        (America/Bahia).{" "}
        {maxDays > 31 && "Antes de 90 dias, use minutos 00 nas duas datas."}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

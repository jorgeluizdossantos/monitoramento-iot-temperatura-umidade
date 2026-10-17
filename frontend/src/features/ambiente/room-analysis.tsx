import { useState } from "react";
import { Link } from "react-router-dom";
import type { Reading } from "../painel/model";
import AlertsPage from "../alertas/alerts-page";
import Trend from "./trend";
import { recentPeriod } from "./model";
export default function RoomAnalysis({ row }: { row: Reading }) {
  const [range] = useState(recentPeriod);
  const id = String(row.ambiente_id);
  return (
    <>
      <Link className="primary-button" to={`/ambientes/${id}/historico`}>
        Histórico e exportação CSV →
      </Link>
      <h2>Últimas 24 horas</h2>
      <Trend id={id} range={range} limits={row} />
      <AlertsPage key={id} roomId={id} />
    </>
  );
}

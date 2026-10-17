import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, downloadCsv, request } from "../../shared/api/client";
import { Pagination } from "../../shared/ui/pagination";
import { AccessDenied } from "../auth/session-boundary";
import { useAuth } from "../auth/auth";
import { date, number, panelSchema } from "../painel/model";
import { day, historySchema, recentPeriod } from "./model";
import { PeriodForm } from "./period-form";
const Trend = lazy(() => import("./trend"));
export default function HistoryPage() {
  const { id = "" } = useParams();
  return <History key={id} id={id} />;
}
function History({ id }: { id: string }) {
  const user = useAuth((s) => s.user)!;
  const [range, setRange] = useState(recentPeriod);
  const [mode, setMode] = useState("leituras");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  const params = new URLSearchParams({
    ...range,
    pagina: String(page),
    tamanho: "20",
  });
  const query = useQuery({
    queryKey: ["historico", user.id, id, range, page],
    enabled: mode === "leituras",
    queryFn: ({ signal }) =>
      request(`/ambientes/${id}/leituras?${params}`, historySchema, { signal }),
  });
  const panel = useQuery({
    queryKey: ["painel", user.empresa_id, user.id],
    queryFn: ({ signal }) => request("/painel", panelSchema, { signal }),
  });
  const room = panel.data?.dados.find((r) => String(r.ambiente_id) === id);
  async function download() {
    controller.current = new AbortController();
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await downloadCsv(
        `/ambientes/${id}/leituras.csv?${new URLSearchParams(range)}`,
        controller.current.signal,
      );
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ambiente-${id}-leituras.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.current.signal.aborted)
        setDownloadError(
          error instanceof Error ? error.message : "Falha no download.",
        );
    } finally {
      setDownloading(false);
    }
  }
  if (
    query.error instanceof ApiError &&
    [403, 404].includes(query.error.status)
  )
    return <AccessDenied />;
  const csvAllowed = Date.parse(range.ate) - Date.parse(range.de) <= 31 * day;
  return (
    <>
      <div className="eyebrow">ANÁLISE DO AMBIENTE</div>
      <h1>Histórico · {room?.ambiente ?? `Ambiente ${id}`}</h1>
      <Link className="text-button" to={`/ambientes/${id}`}>
        ← Voltar ao ambiente
      </Link>
      <div className="panel-filters">
        <div className="form-field">
          <label htmlFor="history-mode">Visualização</label>
          <select
            id="history-mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPage(1);
              setRange(recentPeriod());
            }}
          >
            <option value="leituras">Leituras e gráfico · até 31 dias</option>
            <option value="serie">Série por hora · até 366 dias</option>
          </select>
        </div>
      </div>
      <PeriodForm
        key={mode}
        value={range}
        maxDays={mode === "serie" ? 366 : 31}
        apply={(value) => {
          setRange(value);
          setPage(1);
          setDownloadError("");
        }}
      />
      <div className="row-actions">
        <button
          className="primary-button"
          disabled={downloading || !csvAllowed}
          onClick={() => void download()}
        >
          {downloading ? "Preparando CSV…" : "Exportar CSV"}
        </button>
        {downloading && (
          <button
            className="secondary-button"
            onClick={() => controller.current?.abort()}
          >
            Cancelar download
          </button>
        )}
      </div>
      <p className="phase-note">
        CSV: período aplicado completo, datas UTC e decimais com ponto. Limite
        de 31 dias.{" "}
        {!csvAllowed && "Reduza o período para habilitar a exportação."}
      </p>
      {downloadError && (
        <p role="alert" className="form-error">
          {downloadError}
        </p>
      )}
      <Suspense fallback={<p role="status">Carregando gráficos…</p>}>
        <Trend
          key={`${id}-${range.de}-${range.ate}`}
          id={id}
          range={range}
          limits={room}
        />
      </Suspense>
      {mode === "leituras" && (
        <section className="surface records">
          <h2>Leituras do período</h2>
          {query.isPending && <p role="status">Carregando leituras…</p>}
          {query.isError && (
            <p role="alert" className="form-error">
              {query.error.message}{" "}
              <button
                className="text-button"
                onClick={() => void query.refetch()}
              >
                Tentar novamente
              </button>
            </p>
          )}
          {query.data && (
            <>
              {!query.data.dados.length ? (
                <p>Nenhuma leitura nesta página.</p>
              ) : (
                <table className="records-table">
                  <thead>
                    <tr>
                      <th>Data/hora (Bahia)</th>
                      <th>Temperatura °C</th>
                      <th>Umidade %</th>
                      <th>Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.dados.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Data/hora (Bahia)">
                          {date(row.medido_em)}
                          <small>Leitura #{row.id}</small>
                        </td>
                        <td data-label="Temperatura °C">
                          {number(row.temperatura_c)}
                        </td>
                        <td data-label="Umidade %">
                          {number(row.umidade_pct)}
                        </td>
                        <td data-label="Dispositivo">#{row.dispositivo_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Pagination
                page={page}
                total={query.data.total}
                busy={query.isFetching}
                change={setPage}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}

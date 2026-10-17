import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { ApiError, request } from "../../shared/api/client";
import { Pagination } from "../../shared/ui/pagination";
import { useAuth } from "../auth/auth";
import { AccessDenied } from "../auth/session-boundary";
import { bigId, decimal } from "../ambiente/model";
import { date, number } from "../painel/model";
export const alertSchema = z.object({
  id: bigId,
  ambiente_id: z.number(),
  ambiente: z.string().optional(),
  dispositivo_id: z.number(),
  tipo: z.enum(["temperatura", "umidade"]),
  sentido: z.enum(["acima", "abaixo"]),
  severidade: z.enum(["atencao", "critico"]),
  valor: decimal,
  valor_extremo: decimal,
  limite_violado: decimal,
  ocorrido_em: z.string().datetime(),
  encerrado_em: z.string().datetime().nullable(),
  reconhecido_por: z.number().nullable(),
  reconhecido_em: z.string().datetime().nullable(),
});
const alertsSchema = z.object({
  dados: z.array(alertSchema),
  total: z.number(),
  pagina: z.number(),
  tamanho: z.number(),
});
export function duration(start: string, end: string | null, now: number) {
  const seconds = Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min ${seconds % 60} s`;
}
export default function AlertsPage({ roomId }: { roomId?: string }) {
  const user = useAuth((s) => s.user)!,
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("aberto");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const params = new URLSearchParams({
    pagina: String(page),
    tamanho: "20",
    situacao: status,
    ...(roomId ? { ambiente_id: roomId } : {}),
  });
  const query = useQuery({
    queryKey: ["alertas", user.id, roomId, status, page],
    queryFn: ({ signal }) =>
      request(`/alertas?${params}`, alertsSchema, { signal }),
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: (id: string) =>
      request(`/alertas/${id}/reconhecer`, z.object({ dados: alertSchema }), {
        method: "POST",
        body: "{}",
      }),
    onSuccess: async () => {
      setConfirmation(null);
      setNotice(
        "Reconhecimento registrado. O episódio permanece aberto até a normalização.",
      );
      await cache.invalidateQueries({ queryKey: ["alertas"] });
    },
  });
  if (
    query.error instanceof ApiError &&
    [403, 404].includes(query.error.status)
  )
    return <AccessDenied />;
  return (
    <section className="alerts-section">
      <div className="eyebrow">ACOMPANHAMENTO DE INCIDENTES</div>
      {roomId ? <h2>Alertas do ambiente</h2> : <h1>Central de alertas</h1>}
      <p>
        Episódios de temperatura e umidade. Reconhecer registra a ciência do
        operador; não encerra o alerta.
      </p>
      <div className="panel-filters">
        <div className="form-field">
          <label htmlFor={`alert-status-${roomId ?? "all"}`}>Situação</label>
          <select
            id={`alert-status-${roomId ?? "all"}`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="aberto">Em aberto</option>
            <option value="encerrado">Encerrados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <button
          className="secondary-button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Atualizar alertas
        </button>
      </div>
      <p className="phase-note">
        Consulta a cada 30 s enquanto a tela está ativa. Durações calculadas na
        última consulta:{" "}
        {query.dataUpdatedAt
          ? date(new Date(query.dataUpdatedAt).toISOString())
          : "aguardando"}
        .
      </p>
      {notice && <p role="status">{notice}</p>}
      {query.isPending && <p role="status">Carregando alertas…</p>}
      {query.isError && (
        <p role="alert" className="form-error">
          {query.error.message}{" "}
          {query.data && "Os dados anteriores podem estar desatualizados."}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="form-error">
          {mutation.error.message}
        </p>
      )}
      {query.data && (
        <>
          {!query.data.dados.length && <p>Nenhum alerta encontrado.</p>}
          <div className="alert-list">
            {query.data.dados.map((alert) => (
              <article
                className={`surface alert-card alert-${alert.severidade}`}
                key={alert.id}
              >
                <header>
                  <span className={`room-state state-${alert.severidade}`}>
                    <AlertTriangle size={16} />
                    {alert.severidade === "critico"
                      ? "Crítico"
                      : "Atenção"} · {alert.tipo} {alert.sentido} do limite
                  </span>
                  <small>Alerta #{alert.id}</small>
                </header>
                <h3>
                  <Link to={`/ambientes/${alert.ambiente_id}`}>
                    {alert.ambiente ?? `Ambiente ${alert.ambiente_id}`}
                  </Link>
                </h3>
                <p>
                  Dispositivo #{alert.dispositivo_id} ·{" "}
                  {alert.encerrado_em ? "Encerrado" : "Aberto"} · Duração:{" "}
                  {duration(
                    alert.ocorrido_em,
                    alert.encerrado_em,
                    query.dataUpdatedAt,
                  )}
                </p>
                <div className="alert-metrics">
                  {[
                    ["Valor inicial", alert.valor],
                    ["Valor extremo", alert.valor_extremo],
                    ["Limite violado", alert.limite_violado],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>
                        {number(Number(value))}{" "}
                        {alert.tipo === "temperatura" ? "°C" : "%"}
                      </strong>
                    </div>
                  ))}
                </div>
                <p>
                  Início: {date(alert.ocorrido_em)}
                  {alert.encerrado_em && (
                    <> · Fim: {date(alert.encerrado_em)}</>
                  )}
                </p>
                {alert.reconhecido_em ? (
                  <p>
                    Reconhecido em {date(alert.reconhecido_em)} · usuário #
                    {alert.reconhecido_por}
                  </p>
                ) : (
                  ["administrador", "operador"].includes(user.perfil) && (
                    <>
                      {confirmation === alert.id ? (
                        <div className="ack-confirm">
                          <p>Confirmar ciência do alerta #{alert.id}?</p>
                          <button
                            className="primary-button"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate(alert.id)}
                          >
                            Confirmar reconhecimento
                          </button>
                          <button
                            className="secondary-button"
                            disabled={mutation.isPending}
                            onClick={() => setConfirmation(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          className="primary-button"
                          disabled={mutation.isPending}
                          onClick={() => {
                            mutation.reset();
                            setConfirmation(alert.id);
                          }}
                        >
                          Reconhecer alerta
                        </button>
                      )}
                    </>
                  )
                )}
              </article>
            ))}
          </div>
          <Pagination
            page={page}
            total={query.data.total}
            busy={query.isFetching}
            change={setPage}
          />
        </>
      )}
    </section>
  );
}

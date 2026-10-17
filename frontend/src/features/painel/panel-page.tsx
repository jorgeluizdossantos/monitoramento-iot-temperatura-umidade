import { memo, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Droplets,
  Thermometer,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import { request, ApiError } from "../../shared/api/client";
import { useAuth } from "../auth/auth";
import { AccessDenied } from "../auth/session-boundary";
import { connectPanel, type Connection } from "./realtime";
import {
  current,
  date,
  groupRooms,
  labels,
  number,
  panelSchema,
  roomState,
  type Reading,
  type State,
} from "./model";
const icons = {
  normal: CheckCircle2,
  atencao: AlertTriangle,
  critico: AlertTriangle,
  sem_dados: CircleHelp,
};
const connectionLabels: Record<Connection, string> = {
  connecting: "Conectando ao tempo real…",
  live: "Tempo real conectado",
  reconnecting: "Reconectando · consulta a cada 30 s",
  offline: "Sem rede · aguardando reconexão",
};
export default function Panel() {
  const user = useAuth((s) => s.user)!;
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const [connection, setConnection] = useState<Connection>("connecting");
  const query = useQuery({
    queryKey: ["painel", user.empresa_id, user.id],
    queryFn: ({ signal }) => request("/painel", panelSchema, { signal }),
    staleTime: 0,
  });
  const { refetch } = query;
  useEffect(
    () => connectPanel(() => refetch({ cancelRefetch: false }), setConnection),
    [refetch, user.id, user.empresa_id],
  );
  const rooms = useMemo(
    () => groupRooms(query.data?.dados ?? []),
    [query.data],
  );
  const unit = search.get("unidade") ?? "",
    sector = search.get("setor") ?? "",
    status = search.get("estado") ?? "";
  const units = [
    ...new Map(rooms.map((r) => [r[0].unidade_id, r[0].unidade])).entries(),
  ];
  const sectors = [
    ...new Map(
      rooms
        .filter((r) => !unit || String(r[0].unidade_id) === unit)
        .map((r) => [r[0].setor_id, r[0].setor]),
    ).entries(),
  ];
  const filtered = rooms.filter(
    (r) =>
      (!unit || String(r[0].unidade_id) === unit) &&
      (!sector || String(r[0].setor_id) === sector) &&
      (!status || roomState(r) === status),
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "unidade") next.delete("setor");
    setSearch(next);
  }
  if (
    query.error instanceof ApiError &&
    [403, 404].includes(query.error.status)
  )
    return <AccessDenied />;
  const selected = id
    ? rooms.filter((r) => String(r[0].ambiente_id) === id)
    : filtered;
  return (
    <>
      <div className="eyebrow">MONITORAMENTO OPERACIONAL</div>
      <div className="list-toolbar">
        <div>
          <h1>
            {id ? (selected[0]?.[0].ambiente ?? "Ambiente") : "Painel geral"}
          </h1>
          <p>
            Temperatura e umidade dos ambientes · horário de Brasília
            (America/Bahia)
          </p>
        </div>
        <button
          className="primary-button"
          disabled={query.isFetching}
          onClick={() => void refetch()}
        >
          Atualizar dados
        </button>
      </div>
      <div
        className={`stream-status ${connection === "live" ? "stream-live" : ""}`}
        role="status"
      >
        {connection === "live" ? <Wifi size={18} /> : <WifiOff size={18} />}
        <span>
          {connectionLabels[connection]}
          <small>
            Última consulta:{" "}
            {query.dataUpdatedAt
              ? date(new Date(query.dataUpdatedAt).toISOString())
              : "aguardando"}
          </small>
        </span>
        {query.isFetching && <span>Consultando…</span>}
      </div>
      {query.isError && (
        <p className="form-error" role="alert">
          {query.error.message}{" "}
          {query.data
            ? "Dados abaixo são da última consulta bem-sucedida e podem estar desatualizados."
            : ""}{" "}
          <button className="text-button" onClick={() => void refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {id ? (
        <Link className="text-button" to="/painel">
          ← Voltar ao painel
        </Link>
      ) : (
        <>
          <div className="panel-filters">
            <div className="form-field">
              <label htmlFor="unit-filter">Unidade</label>
              <select
                id="unit-filter"
                value={unit}
                onChange={(e) => filter("unidade", e.target.value)}
              >
                <option value="">Todas as unidades</option>
                {units.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="sector-filter">Setor</label>
              <select
                id="sector-filter"
                value={sector}
                onChange={(e) => filter("setor", e.target.value)}
              >
                <option value="">Todos os setores</option>
                {sectors.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="state-filter">Estado</label>
              <select
                id="state-filter"
                value={status}
                onChange={(e) => filter("estado", e.target.value)}
              >
                <option value="">Todos os estados</option>
                {Object.entries(labels).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button className="secondary-button" onClick={() => setSearch({})}>
              Limpar filtros
            </button>
          </div>
          <div className="panel-summary">
            <div className="surface">
              <span>Ambientes exibidos</span>
              <strong>{filtered.length}</strong>
            </div>
            {(["normal", "atencao", "critico", "sem_dados"] as State[]).map(
              (state) => (
                <div className={`surface summary-${state}`} key={state}>
                  <span>{labels[state]}</span>
                  <strong>
                    {filtered.filter((r) => roomState(r) === state).length}
                  </strong>
                </div>
              ),
            )}
          </div>
        </>
      )}
      {query.isPending ? (
        <p role="status">Carregando ambientes…</p>
      ) : query.data && !selected.length ? (
        <section className="surface editor">
          <h2>{id ? "Ambiente indisponível" : "Nenhum ambiente encontrado"}</h2>
          <p>
            {id
              ? "O ambiente pode estar inativo ou fora do seu acesso."
              : "Cadastre uma hierarquia ativa ou ajuste os filtros."}
          </p>
        </section>
      ) : (
        <div className="room-grid">
          {selected.map((rows) => (
            <RoomCard
              key={rows[0].ambiente_id}
              rows={rows}
              detail={!!id}
              stale={query.isError || connection !== "live"}
            />
          ))}
        </div>
      )}
      {id && (
        <p className="phase-note">
          Histórico, gráficos e episódios de alerta serão disponibilizados na
          Fase 5.
        </p>
      )}
    </>
  );
}
const RoomCard = memo(
  function RoomCard({
    rows,
    detail,
    stale,
  }: {
    rows: Reading[];
    detail: boolean;
    stale: boolean;
  }) {
    const row = rows[0];
    const state = roomState(rows);
    const Icon = icons[state];
    return (
      <article
        className={`surface room-card room-${state}`}
        aria-label={`Ambiente ${row.ambiente}`}
      >
        <header>
          <div>
            <p>
              {row.unidade} / {row.setor}
            </p>
            <h2>{row.ambiente}</h2>
          </div>
          <span className={`room-state state-${state}`}>
            <Icon size={16} />
            {labels[state]}
          </span>
        </header>
        {stale && (
          <p className="stale-note">
            Atualização em tempo real indisponível; confira a data da leitura.
          </p>
        )}
        {rows.map((reading) => (
          <DeviceReading key={reading.dispositivo_id ?? "none"} row={reading} />
        ))}
        {!detail && (
          <footer>
            <Link to={`/ambientes/${row.ambiente_id}`}>
              Detalhes do ambiente →
            </Link>
          </footer>
        )}
      </article>
    );
  },
  (a, b) =>
    a.detail === b.detail &&
    a.stale === b.stale &&
    a.rows.length === b.rows.length &&
    a.rows.every((row, index) => row === b.rows[index]),
);
function DeviceReading({ row }: { row: Reading }) {
  const live = current(row);
  return (
    <section
      className="device-reading"
      aria-label={row.device_id ?? "Sem dispositivo"}
    >
      <div className="device-status">
        <span>{row.device_id ?? "Sem dispositivo vinculado"}</span>
        <span>
          {row.em_manutencao ? (
            <>
              <Wrench size={14} />
              Em manutenção
            </>
          ) : row.status_conexao === "online" ? (
            <>
              <Wifi size={14} />
              Online
            </>
          ) : (
            <>
              <WifiOff size={14} />
              {row.status_conexao === "offline"
                ? "Offline"
                : "Sem conexão confirmada"}
            </>
          )}
        </span>
      </div>
      {live ? (
        <div className="metrics">
          <div>
            <span>
              <Thermometer size={16} />
              Temperatura
            </span>
            <strong>
              {number(row.temperatura_c)}
              <small> °C</small>
            </strong>
            <small>
              Ideal: {number(row.temp_min_ideal)} a {number(row.temp_max_ideal)}{" "}
              °C
            </small>
          </div>
          <div>
            <span>
              <Droplets size={16} />
              Umidade
            </span>
            <strong>
              {number(row.umidade_pct)}
              <small> %</small>
            </strong>
            <small>
              Ideal: {number(row.umid_min_ideal)} a {number(row.umid_max_ideal)}{" "}
              %
            </small>
          </div>
        </div>
      ) : (
        <p className="no-live-reading">Sem leitura atual confirmada.</p>
      )}
      <p className="reading-time">
        Última leitura:{" "}
        <time dateTime={row.ultima_leitura_em ?? undefined}>
          {date(row.ultima_leitura_em)}
        </time>
      </p>
    </section>
  );
}

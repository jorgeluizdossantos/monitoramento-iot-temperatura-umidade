import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { ApiError, request } from "../../shared/api/client";
import { AccessDenied } from "../auth/session-boundary";
import { Pagination } from "../../shared/ui/pagination";
import { useAuth } from "../auth/auth";
import { date, number, type Reading } from "../painel/model";
import { chartBuckets, seriesSchema, type Period } from "./model";
export default function Trend({
  id,
  range,
  limits,
}: {
  id: string;
  range: Period;
  limits?: Reading;
}) {
  const user = useAuth((s) => s.user)!;
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["serie", user.id, id, range],
    queryFn: ({ signal }) =>
      request(
        `/ambientes/${id}/serie?${new URLSearchParams(range)}`,
        seriesSchema,
        { signal },
      ),
  });
  const buckets = useMemo(
    () => chartBuckets(query.data?.dados ?? [], range),
    [query.data, range],
  );
  if (
    query.error instanceof ApiError &&
    [403, 404].includes(query.error.status)
  )
    return <AccessDenied />;
  return (
    <section className="surface editor trend">
      <h2>Tendência de temperatura e umidade</h2>
      <p>
        Médias, mínimas e máximas por intervalo de {buckets.width / 3600000}{" "}
        hora(s), reunindo os dispositivos do ambiente. Faixa ideal atual; não
        representa configurações antigas. Lacunas indicam ausência de leituras
        no intervalo. Nas horas inicial e final, considera somente o período
        solicitado.
      </p>
      {query.isPending && <p role="status">Carregando série…</p>}
      {query.isError && (
        <p role="alert" className="form-error">
          {query.error.message}{" "}
          <button className="text-button" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {query.data && !query.data.dados.length && (
        <p>Nenhuma leitura no período.</p>
      )}
      {!!query.data?.dados.length && (
        <>
          {(["temp", "umid"] as const).map((kind) => {
            const temperature = kind === "temp",
              unit = temperature ? "°C" : "%",
              title = temperature ? "Temperatura" : "Umidade";
            const min = temperature
                ? limits?.temp_min_ideal
                : limits?.umid_min_ideal,
              max = temperature
                ? limits?.temp_max_ideal
                : limits?.umid_max_ideal;
            return (
              <div key={kind}>
                <h3>
                  {title} ({unit})
                </h3>
                <p className="phase-note">
                  Faixa ideal atual: {number(min ?? null)} a{" "}
                  {number(max ?? null)} {unit}
                </p>
                <div
                  className="chart"
                  role="img"
                  aria-label={`${title}: gráfico de médias e extremos; valores disponíveis na tabela de agregações abaixo.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={buckets.dados}
                      margin={{ top: 10, right: 12, bottom: 10, left: 0 }}
                      accessibilityLayer
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        scale="time"
                        tickFormatter={(v) =>
                          new Intl.DateTimeFormat("pt-BR", {
                            timeZone: "America/Bahia",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                          }).format(v)
                        }
                        minTickGap={40}
                      />
                      <YAxis width={45} domain={["auto", "auto"]} />
                      <Tooltip
                        labelFormatter={(v) =>
                          date(new Date(Number(v)).toISOString())
                        }
                        formatter={(v) =>
                          typeof v === "number"
                            ? `${number(v)} ${unit}`
                            : "Sem dados"
                        }
                      />
                      <Legend />
                      {min != null && max != null && (
                        <ReferenceArea
                          y1={min}
                          y2={max}
                          fill="#b3e5ce"
                          fillOpacity={0.35}
                          ifOverflow="extendDomain"
                        />
                      )}
                      <Line
                        name="Média"
                        dataKey={`${kind}_media`}
                        stroke="#00507d"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        name="Mínima"
                        dataKey={`${kind}_min`}
                        stroke="#61708a"
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        name="Máxima"
                        dataKey={`${kind}_max`}
                        stroke="#a33b16"
                        strokeDasharray="2 2"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
          <details>
            <summary>
              Tabela de agregações por hora ({query.data.dados.length})
            </summary>
            <p>
              Dados originais da série; o gráfico agrupa períodos longos em até
              240 intervalos com médias ponderadas.
            </p>
            <table className="records-table">
              <thead>
                <tr>
                  <th>Hora (Bahia)</th>
                  <th>Leituras</th>
                  <th>Temperatura mín. / média / máx. °C</th>
                  <th>Umidade mín. / média / máx. %</th>
                </tr>
              </thead>
              <tbody>
                {query.data.dados
                  .slice((page - 1) * 20, page * 20)
                  .map((row) => (
                    <tr key={row.hora_ref}>
                      <td data-label="Hora (Bahia)">{date(row.hora_ref)}</td>
                      <td data-label="Leituras">{row.qtd_leituras}</td>
                      <td data-label="Temperatura mín. / média / máx. °C">
                        {[row.temp_min, row.temp_media, row.temp_max]
                          .map(number)
                          .join(" / ")}
                      </td>
                      <td data-label="Umidade mín. / média / máx. %">
                        {[row.umid_min, row.umid_media, row.umid_max]
                          .map(number)
                          .join(" / ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              total={query.data.dados.length}
              change={setPage}
            />
          </details>
        </>
      )}
    </section>
  );
}

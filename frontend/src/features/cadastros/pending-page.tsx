import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, request } from "../../shared/api/client";
import { AccessDenied } from "../auth/session-boundary";
import { resultSchema } from "./model";
import { DestinationSelect, ReferenceSelect } from "./reference-select";
import { Confirmation } from "./confirmation";
const pendingSchema = z.object({
  dados: z.array(
    z.object({
      id: z.number(),
      device_id: z.string(),
      primeiro_contato_em: z.string(),
      ultimo_contato_em: z.string(),
      qtd_mensagens: z.number(),
      ultimo_payload: z.unknown(),
      situacao: z.string(),
    }),
  ),
  total: z.number(),
  pagina: z.number(),
  tamanho: z.number(),
});
type Pending = z.infer<typeof pendingSchema>["dados"][number];
const date = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia",
  }).format(new Date(s));
export default function PendingPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Pending | null>(null);
  const [company, setCompany] = useState("");
  const [destination, setDestination] = useState("");
  const [sensor, setSensor] = useState("DHT11");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ["pendentes", page],
    queryFn: ({ signal }) =>
      request(
        `/dispositivos-pendentes?pagina=${page}&tamanho=20`,
        pendingSchema,
        { signal },
      ),
  });
  const adopt = useMutation({
    mutationFn: () =>
      request(`/dispositivos-pendentes/${selected!.id}/adotar`, resultSchema, {
        method: "POST",
        body: JSON.stringify({
          ambiente_id: Number(destination),
          sensor,
          ...(name.trim() ? { nome: name.trim() } : {}),
        }),
      }),
    onSuccess: async () => {
      setConfirm(false);
      setSelected(null);
      setNotice(
        "Placa adotada. As próximas leituras serão associadas ao ambiente.",
      );
      await cache.invalidateQueries({ queryKey: ["pendentes"] });
      await cache.invalidateQueries({
        queryKey: ["cadastros", "dispositivos"],
      });
    },
  });
  if (list.error instanceof ApiError && [403, 404].includes(list.error.status))
    return <AccessDenied />;
  return (
    <>
      <section className="surface editor">
        <h2>Comissionamento de placas</h2>
        <p>
          Confira o identificador e o último payload antes de vincular a placa.
          A adoção é exclusiva do superadmin e exige empresa, unidade, setor e
          ambiente ativos.
        </p>
        <p>
          O administrador da empresa poderá ajustar intervalo de leitura e
          manutenção em Dispositivos após a adoção.
        </p>
      </section>
      <div className="list-toolbar">
        <h2>Placas pendentes ({list.data?.total ?? "—"})</h2>
        <button
          className="secondary-button"
          disabled={list.isFetching}
          onClick={() => void list.refetch()}
        >
          Atualizar fila
        </button>
      </div>
      {notice && (
        <p role="status" className="session-notice">
          {notice}
        </p>
      )}
      {list.isPending ? (
        <p role="status">Carregando fila…</p>
      ) : list.isError ? (
        <p role="alert">{list.error.message}</p>
      ) : !list.data.dados.length ? (
        <p className="surface editor">Nenhuma placa aguardando adoção.</p>
      ) : (
        <div className="pending-grid">
          {list.data.dados.map((row) => (
            <article key={row.id} className="surface pending-card">
              <h3>{row.device_id}</h3>
              <span className="badge">Pendente de vínculo</span>
              <dl>
                <dt>Primeiro contato</dt>
                <dd>{date(row.primeiro_contato_em)}</dd>
                <dt>Último contato</dt>
                <dd>{date(row.ultimo_contato_em)}</dd>
                <dt>Mensagens recebidas</dt>
                <dd>{row.qtd_mensagens}</dd>
              </dl>
              <h4>Último payload recebido</h4>
              <pre>
                {typeof row.ultimo_payload === "string"
                  ? row.ultimo_payload
                  : JSON.stringify(row.ultimo_payload, null, 2)}
              </pre>
              <button
                className="primary-button"
                onClick={() => {
                  adopt.reset();
                  setSelected(row);
                  setDestination("");
                  setCompany("");
                  setName("");
                  setSensor("DHT11");
                }}
              >
                Adotar {row.device_id}
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button
          disabled={page === 1 || list.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={
            !list.data || page * 20 >= list.data.total || list.isFetching
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
      {selected && (
        <section className="surface editor">
          <h2>Adotar {selected.device_id}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              adopt.reset();
              setConfirm(true);
            }}
          >
            <fieldset disabled={adopt.isPending}>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="company">Empresa de destino</label>
                  <ReferenceSelect
                    entity="empresas"
                    id="company"
                    value={company}
                    onChange={(v) => {
                      setCompany(v);
                      setDestination("");
                    }}
                  />
                </div>
                <div className="form-field">
                  <DestinationSelect
                    key={company}
                    company={company}
                    value={destination}
                    onChange={setDestination}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="adopt-name">Nome da placa (opcional)</label>
                  <input
                    id="adopt-name"
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="adopt-sensor">Sensor conectado</label>
                  <select
                    id="adopt-sensor"
                    value={sensor}
                    onChange={(e) => setSensor(e.target.value)}
                  >
                    {["DHT11", "DHT22", "SHT31", "OUTRO"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelected(null)}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  disabled={!company || !destination}
                >
                  Revisar adoção
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {confirm && selected && (
        <Confirmation
          title="Confirmar adoção da placa?"
          description={`${selected.device_id} será vinculado ao ambiente #${destination} da empresa #${company}, com sensor ${sensor}. Confira a hierarquia selecionada no formulário.`}
          pending={adopt.isPending}
          error={adopt.error?.message}
          onCancel={() => setConfirm(false)}
          onConfirm={() => adopt.mutate()}
        />
      )}
    </>
  );
}

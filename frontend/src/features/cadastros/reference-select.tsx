import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "../../shared/api/client";
import { pageSchema, resultSchema, type Entity, type Row } from "./model";

// Listas paginadas: não truncar vínculos silenciosamente quando houver mais de 500 registros.
export function ReferenceSelect({
  entity,
  value,
  onChange,
  id,
  invalid,
  describedBy,
}: {
  entity: Entity;
  value: unknown;
  onChange: (v: string) => void;
  id: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<Row[]>([]);
  const query = useQuery({
    queryKey: ["cadastros", entity, "options", page],
    queryFn: ({ signal }) =>
      request(`/${entity}?pagina=${page}&tamanho=50`, pageSchema, { signal }),
  });
  const selected = useQuery({
    queryKey: ["cadastros", entity, "detail", value],
    enabled:
      !!value && !options.some((row) => String(row.id) === String(value)),
    queryFn: ({ signal }) =>
      request(`/${entity}/${value}`, resultSchema, { signal }),
  });
  useEffect(() => {
    if (query.data)
      setOptions((old) => [
        ...old.filter((r) => !query.data.dados.some((n) => n.id === r.id)),
        ...query.data.dados,
      ]);
  }, [query.data]);
  const rows =
    selected.data && !options.some((r) => r.id === selected.data.dados.id)
      ? [selected.data.dados, ...options]
      : options;
  return (
    <div>
      <select
        id={id}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <option value="">Selecione…</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.nome || (row.device_id as string) || "Sem nome"} · #{row.id}
            {!row.ativo ? " (inativo)" : ""}
          </option>
        ))}
      </select>
      {query.isPending && <small role="status">Carregando opções…</small>}
      {(query.isError || selected.isError) && (
        <p role="alert">
          Não foi possível carregar o vínculo.{" "}
          <button
            type="button"
            onClick={() => {
              void query.refetch();
              void selected.refetch();
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {query.data && page * query.data.tamanho < query.data.total && (
        <button
          type="button"
          className="text-button"
          disabled={query.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          Carregar mais opções
        </button>
      )}
    </div>
  );
}
const destinationSchema = z.object({
  dados: z.array(
    z.object({
      id: z.number(),
      nome: z.string(),
      empresa_nome: z.string(),
      unidade_nome: z.string(),
      setor_nome: z.string(),
    }),
  ),
  pagina: z.number(),
  tamanho: z.number(),
  total: z.number(),
});
export function DestinationSelect({
  company,
  value,
  onChange,
}: {
  company: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["destinos", company, page],
    enabled: !!company,
    queryFn: ({ signal }) =>
      request(
        `/dispositivos-pendentes/destinos?empresa_id=${company}&pagina=${page}&tamanho=50`,
        destinationSchema,
        { signal },
      ),
  });
  return (
    <>
      <label htmlFor="destination">Ambiente de destino</label>
      <select
        id="destination"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!company || query.isPending}
      >
        <option value="">Selecione…</option>
        {query.data?.dados.map((r) => (
          <option key={r.id} value={r.id}>
            {r.unidade_nome} / {r.setor_nome} / {r.nome} · #{r.id}
          </option>
        ))}
      </select>
      {query.isError && (
        <p role="alert">
          Não foi possível obter os destinos.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {query.data?.total === 0 && (
        <p>
          Nenhum ambiente ativo nesta empresa. O administrador deve cadastrar a
          hierarquia primeiro.
        </p>
      )}
      {!!company && (
        <div className="pagination">
          <button
            type="button"
            disabled={page === 1 || query.isFetching}
            onClick={() => {
              onChange("");
              setPage((p) => p - 1);
            }}
          >
            Anteriores
          </button>
          <span>Página {page}</span>
          <button
            type="button"
            disabled={
              !query.data || page * 50 >= query.data.total || query.isFetching
            }
            onClick={() => {
              onChange("");
              setPage((p) => p + 1);
            }}
          >
            Próximos
          </button>
        </div>
      )}
    </>
  );
}

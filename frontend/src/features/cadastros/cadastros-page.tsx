import { useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Power, RefreshCw } from "lucide-react";
import { ApiError, request } from "../../shared/api/client";
import { useAuth, refreshSession } from "../auth/auth";
import { AccessDenied } from "../auth/session-boundary";
import {
  config,
  entities,
  pageSchema,
  resultSchema,
  type Entity,
  type Row,
} from "./model";
import { CadastroForm } from "./cadastro-form";
import { Confirmation } from "./confirmation";
import PendingPage from "./pending-page";
export default function Cadastros() {
  const { entidade } = useParams();
  const user = useAuth((s) => s.user)!;
  const available = entities.filter((e) =>
    user.perfil === "superadmin" ? e === "empresas" : e !== "empresas",
  );
  return (
    <>
      <div className="eyebrow">CONFIGURAÇÕES DO SISTEMA / COMISSIONAMENTO</div>
      <h1>Cadastros e configuração IoT</h1>
      <p className="intro">
        Organize a estrutura de monitoramento e os responsáveis pelo acesso.
      </p>
      <nav className="entity-tabs" aria-label="Tipos de cadastro">
        {available.map((e) => (
          <NavLink key={e} to={`/cadastros/${e}`}>
            {config[e].title}
          </NavLink>
        ))}
        {user.perfil === "superadmin" && (
          <NavLink to="/cadastros/pendentes">Placas pendentes</NavLink>
        )}
      </nav>
      {!entidade ? (
        <section className="surface editor">
          <h2>Estrutura de monitoramento</h2>
          <p>
            Cadastre unidades, depois setores, ambientes e dispositivos. Os
            usuários recebem acesso à empresa da sua sessão.
          </p>
          <Link className="primary-button" to={`/cadastros/${available[0]}`}>
            Começar pelos cadastros
          </Link>
        </section>
      ) : entidade === "pendentes" ? (
        <PendingPage />
      ) : available.includes(entidade as Entity) ? (
        <EntityPage key={entidade} entity={entidade as Entity} />
      ) : (
        <AccessDenied />
      )}
    </>
  );
}
function EntityPage({ entity }: { entity: Entity }) {
  const [page, setPage] = useState(1);
  const [inactive, setInactive] = useState(false);
  const [editor, setEditor] = useState<number | "new" | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ["cadastros", entity, page, inactive],
    queryFn: ({ signal }) =>
      request(
        `/${entity}?pagina=${page}&tamanho=20&incluir_inativos=${inactive}`,
        pageSchema,
        { signal },
      ),
  });
  const detail = useQuery({
    queryKey: ["cadastros", entity, "detail", editor],
    enabled: typeof editor === "number",
    staleTime: 0,
    queryFn: ({ signal }) =>
      request(`/${entity}/${editor}`, resultSchema, { signal }),
  });
  const change = useMutation({
    mutationFn: (row: Row) =>
      request(`/${entity}/${row.id}`, resultSchema, {
        method: row.ativo ? "DELETE" : "PATCH",
        body: JSON.stringify(row.ativo ? {} : { ativo: true }),
      }),
    onSuccess: async () => {
      setTarget(null);
      setNotice("Situação do cadastro atualizada.");
      await cache.invalidateQueries({ queryKey: ["cadastros"] });
      if (entity === "usuarios") await refreshSession();
    },
  });
  const denied = [list.error, detail.error].some(
    (e) => e instanceof ApiError && [403, 404].includes(e.status),
  );
  if (denied) return <AccessDenied />;
  return (
    <>
      <div className="list-toolbar">
        <div>
          <h2>{config[entity].title}</h2>
          <span>{list.data?.total ?? "—"} registros</span>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setEditor("new");
            setNotice("");
          }}
        >
          <Plus size={18} />
          Cadastrar {config[entity].singular}
        </button>
      </div>
      {notice && (
        <p role="status" className="session-notice">
          {notice}
        </p>
      )}
      {editor === "new" ? (
        <CadastroForm
          key="new"
          entity={entity}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice("Cadastro criado.");
            setPage(1);
          }}
        />
      ) : typeof editor === "number" ? (
        detail.isPending ? (
          <p role="status">Carregando cadastro…</p>
        ) : detail.isError ? (
          <p role="alert">
            Falha ao abrir cadastro.{" "}
            <button onClick={() => void detail.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : (
          <CadastroForm
            key={editor}
            entity={entity}
            row={detail.data.dados}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              setNotice("Cadastro atualizado.");
            }}
          />
        )
      ) : null}
      <section className="surface records">
        <div className="list-toolbar">
          <label className="check-label">
            <input
              type="checkbox"
              checked={inactive}
              onChange={(e) => {
                setInactive(e.target.checked);
                setPage(1);
              }}
            />
            Incluir inativos
          </label>
          <button
            className="secondary-button"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <RefreshCw size={16} />
            Atualizar lista
          </button>
        </div>
        {list.isPending ? (
          <p role="status">Carregando registros…</p>
        ) : list.isError ? (
          <p role="alert">
            {list.error.message}{" "}
            <button onClick={() => void list.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !list.data.dados.length ? (
          <p>Nenhum cadastro encontrado.</p>
        ) : (
          <table className="records-table">
            <caption className="sr-only">
              Lista de {config[entity].title.toLowerCase()}
            </caption>
            <thead>
              <tr>
                <th>Cadastro</th>
                <th>Informações</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.data.dados.map((row) => (
                <tr key={row.id}>
                  <td data-label="Cadastro">
                    <strong>
                      {row.nome || (row.device_id as string) || "Sem nome"}
                    </strong>
                    <small>#{row.id}</small>
                  </td>
                  <td data-label="Informações">
                    <RowInfo entity={entity} row={row} />
                  </td>
                  <td data-label="Situação">
                    <span className="badge">
                      {row.ativo ? "Ativo" : "Inativo"}
                    </span>
                    {row.em_manutencao === true && <small>Em manutenção</small>}
                  </td>
                  <td data-label="Ações">
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        aria-label={`Editar cadastro ${row.id}`}
                        onClick={() => {
                          setEditor(row.id);
                          setNotice("");
                        }}
                      >
                        <Pencil size={16} />
                        Editar
                      </button>
                      <button
                        className="secondary-button"
                        aria-label={`${row.ativo ? "Desativar" : "Reativar"} cadastro ${row.id}`}
                        onClick={() => {
                          change.reset();
                          setTarget(row);
                        }}
                      >
                        <Power size={16} />
                        {row.ativo ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pagination">
          <button
            disabled={page === 1 || list.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>
            Página {page} de{" "}
            {Math.max(1, Math.ceil((list.data?.total ?? 0) / 20))}
          </span>
          <button
            disabled={
              !list.data || page * 20 >= list.data.total || list.isFetching
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
      {target && (
        <Confirmation
          title={`${target.ativo ? "Desativar" : "Reativar"} ${target.nome || target.device_id || `#${target.id}`}?`}
          description={
            target.ativo
              ? "O registro será desativado, sem apagar seu histórico. Vínculos dependentes podem deixar de operar."
              : "A reativação depende de a hierarquia vinculada estar ativa."
          }
          pending={change.isPending}
          error={change.error?.message}
          onCancel={() => setTarget(null)}
          onConfirm={() => change.mutate(target)}
        />
      )}
    </>
  );
}
function RowInfo({ entity, row }: { entity: Entity; row: Row }) {
  const keys: Record<Entity, string[]> = {
    empresas: ["cnpj"],
    unidades: ["endereco", "fuso_horario"],
    setores: ["unidade_id", "descricao"],
    ambientes: [
      "setor_id",
      "temp_min_ideal",
      "temp_max_ideal",
      "umid_min_ideal",
      "umid_max_ideal",
    ],
    dispositivos: ["device_id", "ambiente_id", "sensor"],
    usuarios: ["email", "perfil"],
  };
  return (
    <>
      {keys[entity].map((key) => (
        <small key={key}>
          {config[entity].fields.find((f) => f.key === key)?.label}:{" "}
          {row[key] == null ? "Não definido" : String(row[key])}
        </small>
      ))}
    </>
  );
}

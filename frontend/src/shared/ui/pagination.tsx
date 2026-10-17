export function Pagination({
  page,
  total,
  size = 20,
  busy = false,
  change,
}: {
  page: number;
  total: number;
  size?: number;
  busy?: boolean;
  change: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="pagination" aria-label="Paginação">
      <button
        className="secondary-button"
        disabled={busy || page <= 1}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages} · {total.toLocaleString("pt-BR")} registros
      </span>
      <button
        className="secondary-button"
        disabled={busy || page >= pages}
        onClick={() => change(page + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}

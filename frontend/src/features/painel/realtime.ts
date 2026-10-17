export type Connection = "connecting" | "live" | "reconnecting" | "offline";
type Source = {
  addEventListener: (type: string, listener: () => void) => void;
  close: () => void;
  readyState?: number;
};
export function connectPanel(
  refresh: () => Promise<unknown>,
  state: (s: Connection) => void,
  createSource: () => Source = () => new EventSource("/api/v1/stream"),
  events: Pick<Window, "addEventListener" | "removeEventListener"> = window,
) {
  let disposed = false,
    busy = false,
    dirty = false,
    networkOffline = false;
  let source: Source;
  let debounce: ReturnType<typeof setTimeout> | undefined,
    polling: ReturnType<typeof setInterval> | undefined,
    initial: ReturnType<typeof setTimeout> | undefined,
    restart: ReturnType<typeof setTimeout> | undefined;
  async function flush() {
    debounce = undefined;
    if (disposed || busy) return;
    busy = true;
    dirty = false;
    try {
      await refresh();
    } catch {
      /* A consulta exibe o erro. */
    } finally {
      busy = false;
      if (dirty && !disposed) schedule();
    }
  }
  function schedule() {
    dirty = true;
    if (!debounce && !busy && !disposed)
      debounce = setTimeout(() => void flush(), 150);
  }
  function fallback() {
    if (!polling) polling = setInterval(schedule, 30000);
  }
  function opened() {
    clearTimeout(initial);
    clearTimeout(restart);
    restart = undefined;
    clearInterval(polling);
    polling = undefined;
    state("live");
    schedule();
  }
  function failed() {
    state(networkOffline ? "offline" : "reconnecting");
    fallback();
    schedule();
    // Erros transitórios usam a reconexão nativa. CLOSED exige nova instância.
    if (source.readyState === 2 && !networkOffline && !restart)
      restart = setTimeout(() => {
        restart = undefined;
        if (!disposed) replace();
      }, 3000);
  }
  function replace() {
    source?.close();
    clearTimeout(initial);
    clearTimeout(restart);
    restart = undefined;
    source = createSource();
    const owned = source;
    const active = (fn: () => void) => () => {
      if (!disposed && source === owned) fn();
    };
    source.addEventListener("open", active(opened));
    source.addEventListener("error", active(failed));
    source.addEventListener("atualizar", active(schedule));
    initial = setTimeout(active(failed), 10000);
  }
  const offline = () => {
    if (disposed) return;
    networkOffline = true;
    state("offline");
    fallback();
  };
  const online = () => {
    if (disposed) return;
    networkOffline = false;
    state("reconnecting");
    fallback();
    replace();
    schedule();
  };
  state("connecting");
  replace();
  events.addEventListener("offline", offline);
  events.addEventListener("online", online);
  return () => {
    disposed = true;
    clearTimeout(initial);
    clearTimeout(restart);
    clearTimeout(debounce);
    clearInterval(polling);
    source.close();
    events.removeEventListener("offline", offline);
    events.removeEventListener("online", online);
  };
}

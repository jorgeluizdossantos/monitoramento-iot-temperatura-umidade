export interface DemoRoom {
  empresa: string;
  unidade: string;
  setor: string;
  ambiente: string;
  estado: string;
  status_conexao: string | null;
  ultima_leitura_em: Date | null;
  temperatura_c: string | null;
  umidade_pct: string | null;
}
export interface DemoRepository { panel(): Promise<DemoRoom[]> }

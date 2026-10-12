-- =====================================================================
-- STMA: schema definitivo do banco de monitoramento IoT (temperatura e umidade)
-- Alvo: MySQL 8.0.16 ou superior (CHECK só é aplicado a partir da 8.0.16).
--
-- Convenções
--   * Tabelas em português, no singular, com os nomes do requisitos.md.
--   * Todo horário é gravado em UTC, em DATETIME(3). A aplicação deve abrir a
--     conexão com SET time_zone = '+00:00', porque os DEFAULT CURRENT_TIMESTAMP(3)
--     usam o fuso da sessão.
--   * Exclusão lógica pela coluna ativo (RN004). Nenhuma chave estrangeira de
--     negócio usa ON DELETE CASCADE: nada é apagado em cascata.
--   * empresa_id é repetido nas tabelas de cadastro e protegido por chaves
--     estrangeiras compostas, então o banco recusa vínculos entre empresas (RN001).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS stma_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE stma_db;

-- ---------------------------------------------------------------------
-- 1. CADASTRO: empresa > unidade > setor > ambiente > dispositivo
-- ---------------------------------------------------------------------

CREATE TABLE empresa (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(120) NOT NULL,
  cnpj          CHAR(14) NULL COMMENT 'Sem pontuação, em maiúsculas; aceita o CNPJ alfanumérico',
  eh_demo       BOOLEAN NOT NULL DEFAULT 0 COMMENT 'RF017: empresa de demonstração pública',
  ativo         BOOLEAN NOT NULL DEFAULT 1 COMMENT 'RN004: exclusão lógica',
  criado_em     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresa_nome (nome),
  UNIQUE KEY uq_empresa_cnpj (cnpj),
  CONSTRAINT ck_empresa_cnpj
    CHECK (cnpj IS NULL OR REGEXP_LIKE(cnpj, '^[0-9A-Z]{12}[0-9]{2}$', 'c'))
) ENGINE=InnoDB;

CREATE TABLE unidade (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id    INT UNSIGNED NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  endereco      VARCHAR(255) NULL,
  fuso_horario  VARCHAR(40) NOT NULL DEFAULT 'America/Sao_Paulo' COMMENT 'Só para exibição; o banco guarda UTC',
  ativo         BOOLEAN NOT NULL DEFAULT 1,
  criado_em     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_unidade_empresa_id (empresa_id, id),   -- alvo da chave composta de setor
  UNIQUE KEY uq_unidade_nome (empresa_id, nome),
  CONSTRAINT fk_unidade_empresa FOREIGN KEY (empresa_id) REFERENCES empresa (id)
) ENGINE=InnoDB;

CREATE TABLE setor (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id    INT UNSIGNED NOT NULL,
  unidade_id    INT UNSIGNED NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  descricao     VARCHAR(255) NULL,
  ativo         BOOLEAN NOT NULL DEFAULT 1,
  criado_em     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_setor_empresa_id (empresa_id, id),     -- alvo da chave composta de ambiente
  UNIQUE KEY uq_setor_nome (unidade_id, nome),
  CONSTRAINT fk_setor_unidade FOREIGN KEY (empresa_id, unidade_id)
    REFERENCES unidade (empresa_id, id)
) ENGINE=InnoDB;

CREATE TABLE ambiente (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id      INT UNSIGNED NOT NULL,
  setor_id        INT UNSIGNED NOT NULL,
  nome            VARCHAR(120) NOT NULL,
  descricao       VARCHAR(255) NULL,
  temp_min_ideal  DECIMAL(4,1) NULL COMMENT 'Faixa ideal (RF005); NULL = sem limite',
  temp_max_ideal  DECIMAL(4,1) NULL,
  umid_min_ideal  DECIMAL(4,1) NULL,
  umid_max_ideal  DECIMAL(4,1) NULL,
  temp_tolerancia DECIMAL(3,1) NULL COMMENT 'Até esta distância fora da faixa = atenção; além = crítico. NULL = tudo fora da faixa é crítico',
  umid_tolerancia DECIMAL(3,1) NULL,
  ativo           BOOLEAN NOT NULL DEFAULT 1,
  criado_em       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ambiente_empresa_id (empresa_id, id),  -- alvo da chave composta de dispositivo
  UNIQUE KEY uq_ambiente_nome (setor_id, nome),
  CONSTRAINT fk_ambiente_setor FOREIGN KEY (empresa_id, setor_id)
    REFERENCES setor (empresa_id, id),
  CONSTRAINT ck_ambiente_temp CHECK (temp_min_ideal <= temp_max_ideal AND temp_min_ideal >= -50 AND temp_max_ideal <= 100),
  CONSTRAINT ck_ambiente_umid CHECK (umid_min_ideal <= umid_max_ideal AND umid_min_ideal >= 0 AND umid_max_ideal <= 100),
  CONSTRAINT ck_ambiente_tolerancia CHECK (temp_tolerancia >= 0 AND umid_tolerancia >= 0)
) ENGINE=InnoDB;

CREATE TABLE dispositivo (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id            INT UNSIGNED NOT NULL,
  ambiente_id           INT UNSIGNED NOT NULL COMMENT 'RN003: um ambiente por vez',
  device_id             VARCHAR(64) NOT NULL COMMENT 'ID que o firmware publica e usa como client ID MQTT, ex.: esp32-a8032a1e7214',
  nome                  VARCHAR(120) NULL,
  modelo_placa          VARCHAR(30) NOT NULL DEFAULT 'ESP32',
  sensor                ENUM('DHT11','DHT22','SHT31','OUTRO') NOT NULL,
  intervalo_leitura_seg SMALLINT UNSIGNED NOT NULL DEFAULT 30 COMMENT 'RN006',
  offline_apos_seg      INT UNSIGNED NOT NULL DEFAULT 120 COMMENT 'RF014: sem contato por este tempo = offline',
  status_conexao        ENUM('online','offline','desconhecido') NOT NULL DEFAULT 'desconhecido',
  ultimo_contato_em     DATETIME(3) NULL,
  ultima_leitura_em     DATETIME(3) NULL COMMENT 'Cópia da última leitura, para o painel em tempo real (RF009)',
  ultima_temperatura_c  DECIMAL(4,1) NULL,
  ultima_umidade_pct    DECIMAL(4,1) NULL,
  em_manutencao         BOOLEAN NOT NULL DEFAULT 0,
  ativo                 BOOLEAN NOT NULL DEFAULT 1,
  criado_em             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_dispositivo_device_id (device_id),
  KEY idx_dispositivo_ambiente (empresa_id, ambiente_id),
  KEY idx_dispositivo_contato (status_conexao, ultimo_contato_em),
  CONSTRAINT fk_dispositivo_ambiente FOREIGN KEY (empresa_id, ambiente_id)
    REFERENCES ambiente (empresa_id, id),
  CONSTRAINT ck_dispositivo_device_id CHECK (REGEXP_LIKE(device_id, '^[a-z0-9_-]{3,64}$', 'c')),
  CONSTRAINT ck_dispositivo_intervalo CHECK (intervalo_leitura_seg BETWEEN 2 AND 3600),
  CONSTRAINT ck_dispositivo_offline CHECK (offline_apos_seg BETWEEN 10 AND 86400)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. ACESSO: usuario e sessao
-- ---------------------------------------------------------------------

CREATE TABLE usuario (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id      INT UNSIGNED NULL COMMENT 'NULL apenas para o superadmin da plataforma',
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  senha_hash      VARCHAR(255) NOT NULL COMMENT 'Hash bcrypt ou argon2; nunca a senha',
  perfil          ENUM('superadmin','administrador','operador','leitor') NOT NULL DEFAULT 'leitor',
  ativo           BOOLEAN NOT NULL DEFAULT 1,
  ultimo_login_em DATETIME(3) NULL,
  criado_em       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuario_email (email),
  KEY idx_usuario_empresa (empresa_id),
  CONSTRAINT fk_usuario_empresa FOREIGN KEY (empresa_id) REFERENCES empresa (id),
  CONSTRAINT ck_usuario_escopo CHECK (
    (perfil = 'superadmin' AND empresa_id IS NULL) OR
    (perfil <> 'superadmin' AND empresa_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE sessao (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL COMMENT 'SHA-256 em hexadecimal do token; o token nunca é gravado',
  criada_em   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira_em   DATETIME(3) NOT NULL,
  revogada_em DATETIME(3) NULL COMMENT 'Preenchida no logout (RF001)',
  ip          VARCHAR(45) NULL,
  user_agent  VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessao_token (token_hash),
  KEY idx_sessao_usuario (usuario_id, expira_em),
  CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. TELEMETRIA: leitura, alerta, resumo por hora e porta
-- ---------------------------------------------------------------------

CREATE TABLE leitura_telemetria (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dispositivo_id INT UNSIGNED NOT NULL,
  ambiente_id    INT UNSIGNED NOT NULL COMMENT 'Ambiente do dispositivo NA HORA da medição (cópia): o histórico não muda se o dispositivo for movido',
  temperatura_c  DECIMAL(4,1) NOT NULL,
  umidade_pct    DECIMAL(4,1) NOT NULL,
  medido_em      DATETIME(3) NOT NULL COMMENT 'UTC. Do payload, ou igual a recebido_em se o dispositivo não enviar a hora',
  recebido_em    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_leitura_disp_tempo (dispositivo_id, medido_em),  -- evita duplicata de reenvio
  KEY idx_leitura_amb_tempo (ambiente_id, medido_em),            -- RF011 e RNF007
  CONSTRAINT fk_leitura_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo (id),
  CONSTRAINT fk_leitura_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente (id),
  CONSTRAINT ck_leitura_temperatura CHECK (temperatura_c BETWEEN -50 AND 100),
  CONSTRAINT ck_leitura_umidade CHECK (umidade_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE alerta (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ambiente_id     INT UNSIGNED NOT NULL,
  dispositivo_id  INT UNSIGNED NOT NULL,
  leitura_id      BIGINT UNSIGNED NULL COMMENT 'Primeira leitura fora da faixa; NULL depois do expurgo da leitura',
  tipo            ENUM('temperatura','umidade') NOT NULL,
  sentido         ENUM('acima','abaixo') NOT NULL,
  severidade      ENUM('atencao','critico') NOT NULL COMMENT 'A maior atingida durante o episódio',
  valor           DECIMAL(4,1) NOT NULL COMMENT 'Valor da leitura que abriu o alerta',
  valor_extremo   DECIMAL(4,1) NOT NULL COMMENT 'Pior valor durante o episódio',
  limite_violado  DECIMAL(4,1) NOT NULL COMMENT 'Limite da faixa ideal que foi ultrapassado',
  ocorrido_em     DATETIME(3) NOT NULL,
  encerrado_em    DATETIME(3) NULL COMMENT 'NULL = alerta em aberto',
  reconhecido_por INT UNSIGNED NULL,
  reconhecido_em  DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_alerta_amb_tempo (ambiente_id, ocorrido_em),
  KEY idx_alerta_abertos (ambiente_id, encerrado_em),
  KEY idx_alerta_dispositivo (dispositivo_id),
  CONSTRAINT fk_alerta_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente (id),
  CONSTRAINT fk_alerta_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo (id),
  CONSTRAINT fk_alerta_leitura FOREIGN KEY (leitura_id) REFERENCES leitura_telemetria (id) ON DELETE SET NULL,
  CONSTRAINT fk_alerta_usuario FOREIGN KEY (reconhecido_por) REFERENCES usuario (id),
  CONSTRAINT ck_alerta_periodo CHECK (encerrado_em >= ocorrido_em)
) ENGINE=InnoDB;

CREATE TABLE leitura_hora (
  ambiente_id  INT UNSIGNED NOT NULL,
  hora_ref     DATETIME NOT NULL COMMENT 'Início da hora, em UTC',
  qtd_leituras SMALLINT UNSIGNED NOT NULL,
  temp_media   DECIMAL(4,1) NOT NULL,
  temp_min     DECIMAL(4,1) NOT NULL,
  temp_max     DECIMAL(4,1) NOT NULL,
  umid_media   DECIMAL(4,1) NOT NULL,
  umid_min     DECIMAL(4,1) NOT NULL,
  umid_max     DECIMAL(4,1) NOT NULL,
  PRIMARY KEY (ambiente_id, hora_ref),
  CONSTRAINT fk_leitura_hora_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente (id)
) ENGINE=InnoDB COMMENT='Resumo por hora, para gráficos longos (RF012) e para permitir o expurgo das leituras brutas';

CREATE TABLE evento_porta (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dispositivo_id INT UNSIGNED NOT NULL,
  ambiente_id    INT UNSIGNED NOT NULL,
  aberta         BOOLEAN NOT NULL COMMENT '1 = aberta, 0 = fechada',
  ocorrido_em    DATETIME(3) NOT NULL,
  recebido_em    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_porta_amb_tempo (ambiente_id, ocorrido_em),
  KEY idx_porta_disp_tempo (dispositivo_id, ocorrido_em),
  CONSTRAINT fk_porta_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo (id),
  CONSTRAINT fk_porta_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente (id)
) ENGINE=InnoDB COMMENT='Extensão do firmware atual (sensor de porta); gravar só quando o estado muda';

-- ---------------------------------------------------------------------
-- 4. APOIO (sem chaves estrangeiras, de propósito)
-- ---------------------------------------------------------------------

CREATE TABLE dispositivo_pendente (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id           VARCHAR(64) NOT NULL,
  primeiro_contato_em DATETIME(3) NOT NULL,
  ultimo_contato_em   DATETIME(3) NOT NULL,
  qtd_mensagens       INT UNSIGNED NOT NULL DEFAULT 1,
  ultimo_payload      JSON NULL COMMENT 'Para o administrador conferir se é a placa certa antes de cadastrar',
  situacao            ENUM('pendente','adotado','ignorado') NOT NULL DEFAULT 'pendente',
  PRIMARY KEY (id),
  UNIQUE KEY uq_pendente_device_id (device_id),
  KEY idx_pendente_situacao (situacao, ultimo_contato_em)
) ENGINE=InnoDB COMMENT='IDs que publicaram mas ainda não estão em dispositivo; as leituras deles não são gravadas';

CREATE TABLE auditoria (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id  INT UNSIGNED NULL,
  usuario_id  INT UNSIGNED NULL,
  acao        VARCHAR(40) NOT NULL COMMENT 'criar, editar, desativar, login, ...',
  entidade    VARCHAR(40) NOT NULL,
  entidade_id BIGINT UNSIGNED NULL,
  antes       JSON NULL,
  depois      JSON NULL,
  ip          VARCHAR(45) NULL,
  ocorrido_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auditoria_empresa (empresa_id, ocorrido_em),
  KEY idx_auditoria_entidade (entidade, entidade_id)
) ENGINE=InnoDB COMMENT='RN007: quem alterou o cadastro. Sem chaves estrangeiras, para sobreviver a qualquer mudança';

-- ---------------------------------------------------------------------
-- 5. VISÃO: estado atual de cada ambiente (painel em tempo real)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_ambiente_estado AS
SELECT
  a.id AS ambiente_id, a.empresa_id, a.setor_id, a.nome AS ambiente,
  d.id AS dispositivo_id, d.device_id, d.status_conexao, d.em_manutencao,
  d.ultima_leitura_em,
  d.ultima_temperatura_c AS temperatura_c,
  d.ultima_umidade_pct   AS umidade_pct,
  CASE
    WHEN d.ultima_leitura_em IS NULL THEN 'sem_dados'
    WHEN d.ultima_temperatura_c > a.temp_max_ideal + COALESCE(a.temp_tolerancia, 0)
      OR d.ultima_temperatura_c < a.temp_min_ideal - COALESCE(a.temp_tolerancia, 0)
      OR d.ultima_umidade_pct   > a.umid_max_ideal + COALESCE(a.umid_tolerancia, 0)
      OR d.ultima_umidade_pct   < a.umid_min_ideal - COALESCE(a.umid_tolerancia, 0) THEN 'critico'
    WHEN d.ultima_temperatura_c > a.temp_max_ideal
      OR d.ultima_temperatura_c < a.temp_min_ideal
      OR d.ultima_umidade_pct   > a.umid_max_ideal
      OR d.ultima_umidade_pct   < a.umid_min_ideal THEN 'atencao'
    ELSE 'normal'
  END AS estado
FROM ambiente a
LEFT JOIN dispositivo d ON d.ambiente_id = a.id AND d.ativo = 1
WHERE a.ativo = 1;

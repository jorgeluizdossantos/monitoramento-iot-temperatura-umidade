-- ============================================================
-- SISTEMA WEB DE MONITORAMENTO IoT DE TEMPERATURA E UMIDADE
-- Script de criação do esquema — MySQL 8.0+
-- Arquivo: scripts/schema.sql
-- Versão: 1.0 — 04/10/2026
-- ============================================================

CREATE DATABASE IF NOT EXISTS monitoramento_iot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE monitoramento_iot;

-- ============================================================
-- TABELA: empresa
-- Entidades corporativas clientes do sistema
-- ============================================================
CREATE TABLE empresa (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome        VARCHAR(150) NOT NULL,
  cnpj        VARCHAR(18)  NULL COMMENT 'Cadastro fiscal [A CONFIRMAR obrigatoriedade]',
  status      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Exclusão lógica: 1=Ativo, 0=Inativo',
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_empresa_cnpj (cnpj),
  UNIQUE KEY uk_empresa_nome (nome)
) ENGINE=InnoDB COMMENT='Empresas clientes do sistema de monitoramento';

-- ============================================================
-- TABELA: unidade
-- Complexos físicos ou filiais de cada empresa
-- ============================================================
CREATE TABLE unidade (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id  INT UNSIGNED NOT NULL,
  nome        VARCHAR(100) NOT NULL,
  endereco    VARCHAR(255) NULL,
  status      TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_unidade_empresa_nome (empresa_id, nome),
  CONSTRAINT fk_unidade_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresa (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Unidades/filiais vinculadas a uma empresa';

-- ============================================================
-- TABELA: setor
-- Divisões funcionais dentro de cada unidade
-- ============================================================
CREATE TABLE setor (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  unidade_id  INT UNSIGNED NOT NULL,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT         NULL,
  status      TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_setor_unidade_nome (unidade_id, nome),
  CONSTRAINT fk_setor_unidade
    FOREIGN KEY (unidade_id) REFERENCES unidade (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Setores vinculados a uma unidade';

-- ============================================================
-- TABELA: ambiente
-- Recintos físicos monitorados, com faixas ideais de operação
-- ============================================================
CREATE TABLE ambiente (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setor_id INT UNSIGNED NOT NULL,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT NULL,
  temp_min_ideal DECIMAL(4,1) NULL,
  temp_max_ideal DECIMAL(4,1) NULL,
  umid_min_ideal DECIMAL(4,1) NULL,
  umid_max_ideal DECIMAL(4,1) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ambiente_setor_nome (setor_id, nome),
  CONSTRAINT fk_ambiente_setor FOREIGN KEY (setor_id) REFERENCES setor(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_ambiente_temperatura CHECK (temp_min_ideal <= temp_max_ideal),
  CONSTRAINT ck_ambiente_umidade CHECK (umid_min_ideal <= umid_max_ideal),
  CONSTRAINT ck_ambiente_umid_min CHECK (umid_min_ideal BETWEEN 0 AND 100),
  CONSTRAINT ck_ambiente_umid_max CHECK (umid_max_ideal BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE dispositivo (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ambiente_id INT UNSIGNED NOT NULL,
  identificador_unico VARCHAR(100) NOT NULL,
  descricao TEXT NULL,
  intervalo_leitura_seg INT UNSIGNED NOT NULL DEFAULT 30,
  status ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
  -- Estado de conexão separado da desativação administrativa (RN004).
  status_conexao ENUM('online','offline') NOT NULL DEFAULT 'offline',
  ultima_leitura_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dispositivo_identificador (identificador_unico),
  CONSTRAINT fk_dispositivo_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_dispositivo_intervalo CHECK (intervalo_leitura_seg > 0)
) ENGINE=InnoDB;

CREATE TABLE usuario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT UNSIGNED NOT NULL,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil ENUM('administrador','operador','leitor') NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuario_email (email),
  CONSTRAINT fk_usuario_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE leitura_telemetria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id INT UNSIGNED NOT NULL,
  ambiente_id INT UNSIGNED NOT NULL,
  temperatura_c DECIMAL(4,1) NOT NULL,
  umidade_pct DECIMAL(4,1) NOT NULL,
  lida_em DATETIME NOT NULL COMMENT 'UTC',
  INDEX idx_amb_tempo (ambiente_id, lida_em),
  UNIQUE KEY uk_leitura_dispositivo_tempo (dispositivo_id, lida_em),
  CONSTRAINT fk_leitura_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_leitura_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_leitura_temperatura CHECK (temperatura_c BETWEEN -40 AND 80),
  CONSTRAINT ck_leitura_umidade CHECK (umidade_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE alerta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ambiente_id INT UNSIGNED NOT NULL,
  leitura_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('temperatura','umidade') NOT NULL,
  valor DECIMAL(4,1) NOT NULL,
  limite_violado DECIMAL(4,1) NOT NULL,
  ocorrido_em DATETIME NOT NULL COMMENT 'UTC',
  UNIQUE KEY uk_alerta_leitura_tipo (leitura_id, tipo),
  CONSTRAINT fk_alerta_ambiente FOREIGN KEY (ambiente_id) REFERENCES ambiente(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_alerta_leitura FOREIGN KEY (leitura_id) REFERENCES leitura_telemetria(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

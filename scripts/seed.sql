-- ============================================================
-- SISTEMA WEB DE MONITORAMENTO IoT DE TEMPERATURA E UMIDADE
-- Massa de dados de demonstração — MySQL 8.0+
-- Arquivo: scripts/seed.sql
-- Versão: 1.0 — 04/10/2026
-- Executar APÓS scripts/schema.sql
-- ============================================================

USE monitoramento_iot;

-- ============================================================
-- 1. EMPRESA
-- ============================================================
INSERT INTO empresa (nome, cnpj, status) VALUES
  ('Indústria Metalúrgica Horizonte Ltda.', '12.345.678/0001-90', 1),
  ('Frigorífico Vale Frio S.A.',            '98.765.432/0001-10', 1);

-- ============================================================
-- 2. UNIDADES
-- ============================================================
INSERT INTO unidade (empresa_id, nome, endereco, status) VALUES
  (1, 'Matriz — São Bernardo do Campo', 'Av. Industrial, 1500 — São Bernardo do Campo/SP', 1),
  (1, 'Filial — Campinas',              'Rod. Dom Pedro I, km 85 — Campinas/SP',           1),
  (2, 'Planta — Rio Verde',             'Rod. GO-174, km 12 — Rio Verde/GO',               1);

-- ============================================================
-- 3. SETORES
-- ============================================================
INSERT INTO setor (unidade_id, nome, descricao, status) VALUES
  (1, 'Sala Elétrica Principal', 'Quadros de distribuição e inversores de frequência', 1),
  (1, 'Galpão de Usinagem',      'Linha de tornos CNC e centros de usinagem',          1),
  (2, 'Almoxarifado Climatizado','Estoque de componentes eletrônicos sensíveis',       1),
  (3, 'Câmara Fria 01',          'Câmara de resfriamento de matéria-prima',            1);

-- ============================================================
-- 4. AMBIENTES (com faixas ideais — RN005)
-- ============================================================
INSERT INTO ambiente (setor_id, nome, descricao, temp_min_ideal, temp_max_ideal, umid_min_ideal, umid_max_ideal, status) VALUES
  (1, 'Quadro Geral BT',       'Sala elétrica — quadro geral de baixa tensão', 15.0, 35.0, 30.0, 70.0, 1),
  (2, 'Linha CNC 1',           'Ambiente junto às células de usinagem',        18.0, 30.0, 40.0, 65.0, 1),
  (3, 'Estoque Eletrônica',    'Almoxarifado climatizado de componentes',      18.0, 25.0, 45.0, 55.0, 1),
  (4, 'Câmara Fria — Zona A',  'Zona de estocagem refrigerada',                -2.0,  4.0, 70.0, 95.0, 1);

-- ============================================================
-- 5. DISPOSITIVOS ESP32 (identificador = MAC/Client ID MQTT)
-- ============================================================
INSERT INTO dispositivo (ambiente_id, identificador_unico, descricao, intervalo_leitura_seg, status) VALUES
  (1, 'ESP32-A1B2C3', 'ESP32 nº 01 — Sala Elétrica Matriz',    30, 'ativo'),
  (2, 'ESP32-D4E5F6', 'ESP32 nº 02 — Linha CNC 1',             30, 'ativo'),
  (3, 'ESP32-G7H8I9', 'ESP32 nº 03 — Almoxarifado Climatizado',30, 'ativo'),
  (4, 'ESP32-J0K1L2', 'ESP32 nº 04 — Câmara Fria Zona A',      30, 'ativo');

-- ============================================================
-- 6. USUÁRIOS (senha_hash = bcrypt — ver nota abaixo)
-- ============================================================
-- Senha pública de desenvolvimento: demo123. Hashes bcrypt reais.
INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil, status) VALUES
  (1, 'Ana Souza',   'admin@horizonte.com.br',  '$2b$10$SGYz4vyQJWnaaQ8M9ev42.avH/B3sia18hRUInWZwe9DHkIBF7uWS', 'administrador', 1),
  (1, 'Bruno Lima',  'operador@horizonte.com.br','$2b$10$dMhy5sv0DDa/8ZExx.72OecymJ6PyJknyEjhwrDTrcx96HUCXL/Bi', 'operador',      1),
  (1, 'Carla Dias',  'leitor@horizonte.com.br',  '$2b$10$EzRXORuEQH0/VD.ymrUrbO5Tn.8y11ytAygkt4viVKQVZS0L.A5La', 'leitor',        1),
  (2, 'Diego Rocha', 'admin@valefrio.com.br',    '$2b$10$6midII64mugWw8Brrnh/huM7G38cpi6YSqY1gvY9c.L2yCYVKRvJ2', 'administrador', 1);

-- ============================================================
-- 7. LEITURAS DE TELEMETRIA (amostra — timestamps em UTC)
--    Em produção, estas linhas vêm do serviço de ingestão MQTT.
--    O simulador (scripts/simulador-mqtt.js) gera dados contínuos.
-- ============================================================
INSERT INTO leitura_telemetria (dispositivo_id, ambiente_id, temperatura_c, umidade_pct, lida_em) VALUES
  -- Ambiente 1 — Quadro Geral BT (faixa: 15–35 °C / 30–70 %)
  (1, 1, 24.6, 58.2, '2026-10-03 14:32:00'),
  (1, 1, 24.9, 57.8, '2026-10-03 14:32:30'),
  (1, 1, 25.3, 57.1, '2026-10-03 14:33:00'),
  -- Ambiente 2 — Linha CNC 1 (faixa: 18–30 °C / 40–65 %)
  (2, 2, 27.1, 52.0, '2026-10-03 14:32:00'),
  (2, 2, 27.4, 51.6, '2026-10-03 14:32:30'),
  -- Ambiente 3 — Estoque Eletrônica (faixa: 18–25 °C / 45–55 %)
  (3, 3, 23.8, 50.4, '2026-10-03 14:32:00'),
  (3, 3, 26.2, 50.9, '2026-10-03 14:32:30'),  -- temperatura acima do máximo → alerta
  -- Ambiente 4 — Câmara Fria Zona A (faixa: -2–4 °C / 70–95 %)
  (4, 4,  3.1, 88.0, '2026-10-03 14:32:00'),
  (4, 4,  5.8, 87.2, '2026-10-03 14:32:30');  -- temperatura acima do máximo → alerta

-- ============================================================
-- 8. ALERTAS (derivados das leituras fora da faixa — RN005)
-- ============================================================
INSERT INTO alerta (ambiente_id, leitura_id, tipo, valor, limite_violado, ocorrido_em) VALUES
  (3, 7, 'temperatura', 26.2, 25.0, '2026-10-03 14:32:30'),
  (4, 9, 'temperatura',  5.8,  4.0, '2026-10-03 14:32:30');
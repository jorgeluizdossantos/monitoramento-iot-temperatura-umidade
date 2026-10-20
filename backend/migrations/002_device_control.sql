-- Extensão do MVP: mantém 13 tabelas e uma view. Não altera faixas ideais do ambiente.
ALTER TABLE dispositivo
  ADD COLUMN led_aceso BOOLEAN NULL,
  ADD COLUMN limite_led DECIMAL(3,1) NULL,
  ADD COLUMN controle_recebido_em DATETIME(3) NULL,
  ADD COLUMN controle_comando_id CHAR(36) NULL;

-- Dados inteiramente fictícios; não reutiliza o device_id da bancada real.
-- Aplicação controlada pelo comando db:seed:demo; nunca executar automaticamente no deploy.
INSERT INTO empresa(nome,eh_demo) VALUES ('STMA Demonstração — dados simulados',1);
SET @demo_empresa=LAST_INSERT_ID();
INSERT INTO unidade(empresa_id,nome) VALUES (@demo_empresa,'Unidade demonstrativa');
SET @demo_unidade=LAST_INSERT_ID();
INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (@demo_empresa,@demo_unidade,'Automação');
SET @demo_setor=LAST_INSERT_ID();
INSERT INTO ambiente(empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal,temp_tolerancia,umid_min_ideal,umid_max_ideal,umid_tolerancia)
VALUES (@demo_empresa,@demo_setor,'Painel elétrico simulado',18,26,2,30,70,5);
SET @demo_ambiente=LAST_INSERT_ID();
INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,nome,sensor,intervalo_leitura_seg,ultima_leitura_em,ultima_temperatura_c,ultima_umidade_pct,status_conexao)
VALUES (@demo_empresa,@demo_ambiente,'stma-demo-simulado-001','Simulador de portfólio','OUTRO',30,UTC_TIMESTAMP(3),24,55,'offline');
SET @demo_dispositivo=LAST_INSERT_ID();
INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em)
SELECT id,ambiente_id,ultima_temperatura_c,ultima_umidade_pct,ultima_leitura_em FROM dispositivo WHERE id=@demo_dispositivo;

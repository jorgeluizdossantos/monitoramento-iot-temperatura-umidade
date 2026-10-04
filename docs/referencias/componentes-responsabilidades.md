
## 5. Componentes e Responsabilidades

**Firmware ESP32:**
- `sensor_dht` — leitura periódica do DHT22, descarte de leituras inválidas (NaN);
- `mqtt_client` — conexão, publicação QoS 1, LWT configurado, reconexão com backoff;
- `wifi_manager` — conexão e reconexão automática Wi-Fi;
- `config.h` — pinos e parâmetros locais (não versionado).

**Serviço de Ingestão MQTT (backend):** assina `empresa/+/unidade/+/ambiente/+/telemetria`, valida payload JSON, persiste a leitura, atualiza `ultima_leitura_em` do dispositivo e dispara o serviço de alertas.

**Serviço de Alertas (backend):** compara a leitura com as faixas ideais do ambiente e insere registro na tabela `alerta` em caso de violação.

**API REST (Express):**
- `POST /api/auth/login` — bcrypt + JWT (expiração de 8 h);
- CRUDs: `/api/empresas`, `/api/unidades`, `/api/setores`, `/api/ambientes`, `/api/dispositivos`, `/api/usuarios`;
- `GET /api/leituras` — histórico com filtros (`ambiente_id`, `data_inicio`, `data_fim`) e paginação;
- `GET /api/alertas` — listagem de inconformidades;
- Middlewares: JWT, RBAC, validação de entrada, tratamento de erros centralizado.

**Frontend:**
- `mqtt-client.js` — conexão WSS, assinatura dos tópicos autorizados, reconexão automática;
- `api-client.js` — wrapper de `fetch` com JWT; 401 → limpeza de sessão e redirecionamento ao login;
- `dashboard.js` — atualização do DOM, cores por faixa (verde/amarelo/vermelho);
- `charts.js` — gráficos de série temporal (Chart.js);
- `auth.js` — sessão em `sessionStorage`, permissões, logout;
- `ui.js` — modais, navegação hierárquica, toasts.

**Simulador MQTT (`scripts/simulador-mqtt.js`):** gera telemetria sintética para demonstração sem hardware.

## 6. Interfaces entre Módulos

**Contrato MQTT:**
- Telemetria: `empresa/{empresa_id}/unidade/{unidade_id}/ambiente/{ambiente_id}/telemetria`
- Status/LWT: `dispositivo/{dispositivo_id}/status`
```json
{
  "dispositivo": "ESP32-A1",
  "temperatura": 24.6,
  "umidade": 58.2,
  "timestamp": "2026-10-03T14:32:00Z"
}
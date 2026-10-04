# Documento de Projeto (Design) — Sistema Web de Monitoramento IoT de Temperatura e Umidade

> Projeto de Portfólio — Monitoramento IoT com ESP32 e MQTT
> Versão 1.0 — 03/10/2026

---

## 1. Visão Geral do Design

Este documento especifica a solução técnica (o **COMO**) que materializa os requisitos já definidos (o **QUÊ**). A solução adota arquitetura distribuída em quatro camadas: **Borda** (ESP32 + DHT22), **Mensageria** (broker MQTT), **Aplicação** (backend Node.js/Express + MySQL) e **Apresentação** (SPA em HTML/JS/CSS com Tailwind).

Princípios de design:

- **Simplicidade deliberada** — arquitetura legível e auditável por recrutadores;
- **Separação estrita de responsabilidades** — ingestão de telemetria, CRUD e renderização isolados;
- **Mobile-first** — interface priorizada para dispositivos móveis;
- **Segurança por padrão** — credenciais fora do Git, TLS em trânsito, validação em todas as camadas;
- **Observabilidade básica** — LWT para saúde dos dispositivos e tratamento centralizado de erros.

## 2. Objetivos da Fase de Projeto

- Traduzir os requisitos em decisões técnicas verificáveis;
- Definir módulos, interfaces e contratos de dados sem ambiguidade;
- Servir de guia direto para a codificação;
- Permitir avaliação técnica por recrutadores (clareza arquitetural).

**Critérios de saída da fase:**

1. Todos os módulos com responsabilidade e interface definidas;
2. Contratos de API REST documentados;
3. Fluxos principais diagramados;
4. Matriz de decisões arquiteturais justificadas.

## 3. Decisões de Arquitetura

Arquitetura em camadas complementada pelo padrão **Publish/Subscribe**:

1. **Camada de Borda:** ESP32 com firmware C++ (Arduino Core), biblioteca PubSubClient, leitura periódica do DHT22 e publicação QoS 1;
2. **Camada de Mensageria:** Broker MQTT (HiveMQ Cloud com TLS 8883 em demonstração; Mosquitto local em desenvolvimento), tópicos hierárquicos e LWT;
3. **Camada de Aplicação:** Backend Node.js/Express com dupla função — API REST (CRUD + autenticação) e serviço de ingestão MQTT que valida, persiste no MySQL e dispara avaliação de alertas;
4. **Camada de Apresentação:** SPA em HTML5, JavaScript nativo e Tailwind CSS, consumindo a API REST e telemetria em tempo real via MQTT over WebSockets (WSS 8884, MQTT.js).

**Justificativas centrais:**

- **Backend intermediário:** navegadores não acessam MySQL diretamente; o backend isola credenciais, centraliza validação e emite tokens JWT;
- **MQTT over WebSockets direto do navegador:** latência < 100 ms, sem sobrecarga na API, atendendo ao requisito de atualização em até 5 segundos.

**Diagrama de arquitetura:**
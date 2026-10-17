// Verificação local opcional: requer backend compilado, MySQL local e Mosquitto em 18884.
// Cria e remove exclusivamente fixtures identificadas por UUID. Não utiliza credenciais de usuário.
const path = require("node:path");
const express = require("../backend/node_modules/express");
const { randomUUID, randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const backend = (p) => require(path.join(root, "backend/dist", p));
process.env.NODE_ENV = "test";
process.env.DB_TARGET = "local";
const { loadEnvironment } = backend("config/env");
const { createDatabase } = backend("db/mysql");
const { createApp } = backend("app");
const { createLogger } = backend("shared/logger");
const { createAuthService, hashToken } = backend("modules/auth/auth.service");
const { createMysqlAuthRepository } = backend(
  "modules/auth/mysql-auth.repository",
);
const { createMonitoringService } = backend(
  "modules/telemetria/monitoring.service",
);
const { createMysqlMonitoringRepository } = backend(
  "modules/telemetria/mysql-monitoring.repository",
);
const { createMysqlTelemetryRepository } = backend(
  "modules/telemetria/mysql-telemetry.repository",
);
const { createTelemetryService } = backend(
  "modules/telemetria/telemetry.service",
);
const { startMqttConsumer } = backend("modules/telemetria/mqtt-consumer");
const { parseMqttEnvironment } = backend("config/mqtt");
const { createStreamHub } = backend("modules/stream/stream");
const mqtt = require(path.join(root, "backend/node_modules/mqtt"));
const { chromium, expect } = require(
  path.join(root, "frontend/node_modules/@playwright/test"),
);
(async () => {
  const env = {
    ...loadEnvironment(),
    PUBLIC_ORIGIN: "http://127.0.0.1:5174",
    SESSION_COOKIE_SECURE: false,
  };
  if (env.DB_TARGET !== "local") throw new Error("Exige MySQL local.");
  const db = createDatabase(env),
    hub = createStreamHub(),
    logger = createLogger("silent");
  const sql = (text, args = []) =>
    db.withConnection((c) => c.execute(text, args));
  const add = async (text, args) => (await sql(text, args))[0].insertId;
  const suffix = randomUUID(),
    token = randomBytes(32).toString("hex"),
    deviceId = `f4-${suffix}`;
  let company, room, consumer, publisher, server, browser;
  try {
    company = await add("INSERT INTO empresa(nome) VALUES (?)", [
      `fixture-f4-${suffix}`,
    ]);
    const unit = await add(
      "INSERT INTO unidade(empresa_id,nome) VALUES (?,?)",
      [company, "Unidade de teste"],
    );
    const sector = await add(
      "INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)",
      [company, unit, "Setor de teste"],
    );
    room = await add(
      "INSERT INTO ambiente(empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal) VALUES (?,?,?,10,30)",
      [company, sector, "Sala E2E F4"],
    );
    await add(
      "INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,'DHT11')",
      [company, room, deviceId],
    );
    const user = await add(
      "INSERT INTO usuario(empresa_id,nome,email,senha_hash,perfil) VALUES (?,?,?,'unused-test-hash','leitor')",
      [company, "Leitor E2E", `${suffix}@example.test`],
    );
    await sql(
      "INSERT INTO sessao(usuario_id,token_hash,expira_em) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 HOUR))",
      [user, hashToken(token)],
    );
    const auth = await createAuthService(createMysqlAuthRepository(db), 8);
    const app = createApp({
      healthRepository: { ping: async () => {} },
      logger,
      auth: { service: auth, env },
      stream: hub,
      monitoring: createMonitoringService(createMysqlMonitoringRepository(db)),
    });
    // Testa o build distribuível na mesma origem da API, sem disputar o cache do Vite de desenvolvimento.
    const web = express();
    web.use(express.static(path.join(root, "frontend/dist")));
    web.get(["/painel", "/entrar"], (_req, res) =>
      res.sendFile(path.join(root, "frontend/dist/index.html")),
    );
    web.use(app);
    server = web.listen(5174, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const config = parseMqttEnvironment(
      {
        MQTT_ENABLED: "true",
        MQTT_CLIENT_ID: `f4-${suffix}`,
        MQTT_TOPIC_PREFIX: `f4-${suffix.slice(0, 18)}`,
      },
      false,
    );
    consumer = startMqttConsumer(
      config,
      createTelemetryService(
        createMysqlTelemetryRepository(db, (id) => hub.publish(id)),
        config,
        logger,
      ),
      logger,
    );
    await consumer.ready();
    publisher = await mqtt.connectAsync(config.MQTT_URL, {
      clientId: `pub-${suffix}`,
      clean: true,
    });
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    });
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "stma_session",
        value: token,
        url: env.PUBLIC_ORIGIN,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.goto(`${env.PUBLIC_ORIGIN}/painel`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await expect(page.getByText("Tempo real conectado")).toBeVisible();
    const card = page.getByRole("article", { name: "Ambiente Sala E2E F4" });
    await expect(card).toContainText("Sem leitura atual confirmada");
    const publish = (t) =>
      publisher.publishAsync(
        `${config.MQTT_TOPIC_PREFIX}/${deviceId}/dados`,
        JSON.stringify({
          id: deviceId,
          temperatura: t,
          umidade: 55,
          timestamp: new Date().toISOString(),
        }),
        { qos: 1, retain: false },
      );
    const start = Date.now();
    await publish(23.7);
    await expect(card).toContainText("23,7", { timeout: 5000 });
    const latency = Date.now() - start;
    assert(latency < 5000);
    await context.setOffline(true);
    await expect(
      page.getByText("Sem rede · aguardando reconexão"),
    ).toBeVisible();
    await publish(24.2);
    await context.setOffline(false);
    await expect(card).toContainText("24,2", { timeout: 10000 });
    await expect(page.getByText("Tempo real conectado")).toBeVisible({
      timeout: 10000,
    });
    const [[count]] = await sql(
      "SELECT COUNT(*) AS total FROM leitura_telemetria WHERE ambiente_id=?",
      [room],
    );
    assert.equal(Number(count.total), 2);
    console.log(
      JSON.stringify({
        resultado: "PASS",
        mqttAteCartaoMs: latency,
        leiturasPersistidas: 2,
        reconexao: true,
      }),
    );
  } finally {
    if (browser) await browser.close();
    hub.close();

    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    if (publisher) await publisher.endAsync(true);
    if (consumer) await consumer.stop();
    if (company) {
      await sql("DELETE FROM auditoria WHERE empresa_id=?", [company]);
      await sql(
        "DELETE s FROM sessao s JOIN usuario u ON u.id=s.usuario_id WHERE u.empresa_id=?",
        [company],
      );
      if (room) {
        await sql("DELETE FROM alerta WHERE ambiente_id=?", [room]);
        await sql("DELETE FROM leitura_telemetria WHERE ambiente_id=?", [room]);
      }
      for (const table of [
        "dispositivo",
        "ambiente",
        "setor",
        "unidade",
        "usuario",
      ])
        await sql(`DELETE FROM ${table} WHERE empresa_id=?`, [company]);
      await sql("DELETE FROM empresa WHERE id=?", [company]);
    }
    await db.close();
  }
})().catch((error) => {
  console.error("Validação F4 falhou:", error.message);
  process.exitCode = 1;
});

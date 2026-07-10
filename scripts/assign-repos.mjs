#!/usr/bin/env node
/**
 * assign-repos.mjs — Vincula cada artículo con el repositorio público que lo
 * implementa de verdad.
 *
 * REGLA DURA: un artículo declara `repo` sólo si el repositorio contiene la
 * implementación de lo que el artículo explica, verificado leyendo el código.
 * No vale la coincidencia de nombre ni el "tema parecido". Cada entrada de
 * abajo lleva el archivo concreto que la respalda.
 *
 * Lo que deliberadamente NO se vincula, y por qué:
 *  - Colección 09 (accesibilidad): ningún repo usa axe-core. Verificado con
 *    grep sobre los package.json de los 19 repos.
 *  - Capítulos a01–a07 (event-driven, supply chain, progressive delivery,
 *    privacy, data quality, FinOps, fraude): cero ocurrencias de outbox,
 *    asyncapi, sbom, syft, cosign, provenance, canary o feature flag en todo
 *    el GitHub. Los seis repos que la serie *diseña* no existen todavía.
 *  - rag-* y seguridad-asistentes-llm-*: llm-evals-harness no tiene RAG ni
 *    prompt injection en el código (sólo evals de un clasificador).
 *  - cadena-de-suministro-* y quality-gates-auditables-policy-as-code: no hay
 *    SBOM ni OPA/rego en ningún repositorio.
 *
 * Idempotente: reescribe el campo `repo:` del frontmatter, o lo agrega si falta.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const BLOG = join(ROOT, 'src/content/blog');

/** slug → [repo, evidencia leída en el repositorio] */
const MAP = {
  // ── 01 · Arquitectura de Quality Engineering ──
  'arquitectura-quality-engineering-orientada-a-riesgo': ['nexo-quality-platform', 'docs/quality/risk-matrix.md + test-strategy.md'],
  'quality-gates-proporcionales-al-riesgo': ['nexo-quality-platform', 'docs/adr/ADR-003-gates-baratos-primero.md'],
  'metricas-y-trazabilidad-de-calidad': ['nexo-quality-control-tower', 'ingesta de JUnit XML → matriz requisito/prueba/resultado'],
  'datos-y-entornos-de-prueba-reproducibles': ['integration-testing-testcontainers', 'src/db/schema.sql + tests contra Postgres efímero'],

  // ── 02 · Contratos de API ──
  'contratos-api-transferencias-sistemas-distribuidos': ['nexo-transfer-api', 'src/main/java/.../api/TransferController.java'],
  'consumer-driven-contract-testing-cuando-si-cuando-no': ['visual-and-contract-testing', 'contract/consumer.mjs + provider.mjs con @pact-foundation/pact 13'],
  'idempotencia-dinero-eventos-transferencia-una-sola-vez': ['nexo-transfer-api', 'header Idempotency-Key en TransferController + TransferServiceTest'],
  'evolucion-contratos-cambios-rompientes-apis-eventos': ['api-testing-framework-restful-booker', 'src/schemas/*.schema.ts (Zod) detecta rupturas de contrato'],

  // ── 03 · Framework engineering ──
  'framework-engineering-suite-producto-interno': ['playwright-e2e-framework-saucedemo', 'src/pages/BasePage.ts + src/fixtures/pages.fixture.ts'],
  'selectores-sostenibles-contratos-ui': ['playwright-e2e-framework-saucedemo', 'src/pages/*.ts — selectores encapsulados en el POM'],
  'datos-aislados-paralelismo-seguro': ['api-testing-framework-restful-booker', 'src/data/booking.builder.ts + src/fixtures/api.fixture.ts (setup por API)'],
  'confiabilidad-diagnostico-flakiness-evidencia': ['flakiness-hunting-playwright', 'scripts/measure-flakiness.mjs — N corridas con retries=0'],

  // ── 04 · CI/CD y calidad continua ──
  'continuous-quality-pipeline-basado-en-riesgo': ['qa-automation-cicd-pipeline', '.github/workflows/pr-checks.yml + nightly-regression.yml'],
  'gitlab-ci-jenkins-fuente-de-verdad-por-commit': ['nexo-quality-platform', '.gitlab-ci.yml + Jenkinsfile + .github/workflows/ci.yml en un mismo repo'],

  // ── 05 · Entornos y datos de prueba ──
  'entornos-y-datos-de-prueba-reproducibles': ['nexo-quality-platform', 'docker-compose.yml + kind/cluster.yaml + docs/01-entorno-reproducible.md'],

  // ── 06 · Performance, SLO y capacidad ──
  'performance-engineering-de-la-carga-a-una-decision': ['nexo-performance-lab', 'modelo de carga JMeter con SLOs como gate'],
  'experimento-carga-responsable-jmeter': ['nexo-performance-lab', 'plan JMeter + conclusiones medidas sobre SUT propio'],
  'percentiles-capacidad-quality-gates': ['performance-testing-k6', 'scenarios/*.js + thresholds como quality gate'],
  'slis-slos-error-budgets-sin-autoenganarse': ['telco-reliability-lab', 'docs/slo-definition.md + tests/k6/thresholds/thresholds.js'],

  // ── 07 · Observabilidad ──
  'observabilidad-quality-engineering-evidencia-explicable': ['telco-reliability-lab', 'observability/: otel-collector, prometheus, tempo, loki, grafana'],
  'contrato-de-telemetria-privacidad-cardinalidad-gobernanza': ['performance-reliability-testing-suite', 'apps/api/src/observability/{metrics,tracing,instrumentation}.ts'],
  'diagnosticar-test-flaky-con-trazas-metodo-evidencia': ['flakiness-hunting-playwright', 'tests/flaky vs tests/stable + medición reproducible'],

  // ── 08 · Seguridad y threat modeling ──
  'threat-modeling-para-qa-api-transferencias': ['nexo-transfer-api', 'autenticación por token (ADR-002) + autorización por titularidad'],
  'bola-bfla-idempotencia-pruebas-negativas-api': ['nexo-transfer-api', 'src/test/.../transfers.feature — casos negativos de autorización'],
  'quality-gates-seguridad-cicd-proporcionales': ['devsecops-pipeline', 'security/semgrep-rules.yml + scripts/sca-gate.mjs + zap-dast.yml'],

  // ── 10 · Mobile Quality Engineering ──
  'calidad-mobile-por-riesgo': ['nexo-wallet-mobile', 'Appium 9 + Cucumber BDD sobre la billetera Android'],
  'testabilidad-appium-cross-platform': ['nexo-wallet-mobile', 'Page Object Model en Java + modo simulado sin emulador'],
  'red-degradada-lifecycle-idempotencia': ['nexo-wallet-mobile', 'escenarios de ciclo de vida de la app'],
  'ci-matriz-flakiness-evidencia': ['nexo-cross-channel-regression', 'validador estático propio como gate de CI'],

  // ── 11 · Resiliencia y chaos engineering ──
  'resiliencia-chaos-engineering-evidencia-y-gobernanza': ['performance-reliability-testing-suite', 'apps/api/src/modules/faults/service.ts — inyección controlada'],
  'experimento-de-caos-local-transferencia-degradada': ['telco-reliability-lab', 'apps/api/src/faults.ts + tests/k6/scenarios/degradation.js'],
  'patrones-de-resiliencia-con-trade-offs': ['performance-reliability-testing-suite', 'faults con probabilidad, latencia, 5xx y expiración automática'],

  // ── 12 · Liderazgo y operating model ──
  'liderar-calidad-sin-ser-cuello-de-botella-operating-model': ['nexo-quality-platform', 'CODEOWNERS + CONTRIBUTING.md + docs/quality/'],
  'dor-dod-acuerdos-vivos-quality-gates-por-riesgo': ['nexo-quality-platform', 'docs/quality/definition-of-ready.md + definition-of-done.md'],
  'metricas-de-calidad-que-ensenan-y-que-danan': ['nexo-quality-control-tower', 'matriz de trazabilidad como métrica, no como vanity metric'],
  'triage-defectos-sin-culpables-taxonomia-fallos': ['nexo-quality-platform', 'docs/runbooks/incident-triage.md'],

  // ── 13 · Quality Engineering en fintech ──
  'probar-dinero-no-es-probar-formularios': ['nexo-transfer-api', 'invariantes de dominio en TransferService.java'],
  'idempotencia-y-reintentos-en-transferencias': ['telco-reliability-lab', 'infra/postgres/init/01-schema.sql — UNIQUE INDEX sobre idempotency_key'],
  'representar-dinero-decimales-unidades-minimas': ['nexo-transfer-api', '22 usos de BigDecimal en src/main/java (nunca double)'],

  // ── 14 · IA aplicada y evaluación ──
  'evaluacion-continua-sistemas-ia-quality-engineering': ['llm-evals-harness', 'evals/scorers.ts (exact, similitud, LLM-as-judge) + umbral como gate'],

  // ── 15 · Investigación y escritura con evidencia ──
  'hipotesis-medible-experimento-reproducible': ['nexo-performance-lab', 'hipótesis → modelo de carga → conclusión medida'],
  'adr-seleccion-herramienta-katalon-selenium': ['nexo-cross-channel-regression', 'Katalon Studio en uso real, la herramienta que el ADR evalúa'],
  'publicar-evidencia-sin-filtrar-secretos': ['performance-reliability-testing-suite', '.gitleaks.toml + .github/workflows/security.yml'],

  // ── a08 · Platform engineering para QE ──
  'una-quality-platform-es-un-producto-no-un-repo-de-utilidades': ['nexo-quality-platform', 'scripts/platform.mjs + docs/00-empezar-aqui.md'],
  'golden-paths-escape-hatches-y-contrato-de-evidencia': ['nexo-quality-platform', 'docs/learning/guided-exercises.md + evidence/increment-1-plataforma.md'],
  'adopcion-versionado-y-deprecacion-sin-castigar-equipos': ['nexo-quality-platform', 'CONTRIBUTING.md + docs/learning/common-mistakes.md'],

  // ── a13 · RFC y design review ──
  'rfc-adr-y-runbook-tres-documentos-tres-preguntas': ['nexo-quality-platform', 'docs/adr/ y docs/runbooks/ conviviendo en el mismo repo'],
  'facilitar-una-design-review-desde-calidad': ['nexo-quality-platform', '.github/pull_request_template.md + CODEOWNERS'],
};

let updated = 0;
let cleared = 0;
const missing = [];

for (const [slug, [repo]] of Object.entries(MAP)) {
  const file = join(BLOG, `${slug}.md`);
  if (!existsSync(file)) {
    missing.push(slug);
    continue;
  }
  const raw = readFileSync(file, 'utf8');
  const end = raw.indexOf('\n---', 3);
  const fm = raw.slice(0, end);
  const body = raw.slice(end);

  const line = `repo: "${repo}"`;
  let next;
  if (/^repo:.*$/m.test(fm)) {
    next = fm.replace(/^repo:.*$/m, line);
  } else {
    // insertar antes de `icon:` para mantener el orden del schema
    next = fm.replace(/^icon:/m, `${line}\nicon:`);
  }
  if (next !== fm) updated++;
  writeFileSync(file, next + body);
}

// Limpiar `repo` de los artículos que NO están en el mapa: cualquier valor
// previo era una suposición, no evidencia.
import { readdirSync } from 'node:fs';
for (const f of readdirSync(BLOG).filter((x) => x.endsWith('.md'))) {
  const slug = f.slice(0, -3);
  if (MAP[slug]) continue;
  const file = join(BLOG, f);
  const raw = readFileSync(file, 'utf8');
  if (!/^repo:.*$/m.test(raw.slice(0, raw.indexOf('\n---', 3)))) continue;
  writeFileSync(file, raw.replace(/^repo:.*\n/m, ''));
  cleared++;
}

console.log(`✓ ${Object.keys(MAP).length} artículos vinculados a repo (${updated} escritos)`);
if (cleared) console.log(`✓ ${cleared} vínculos sin evidencia eliminados`);
if (missing.length) {
  console.log(`✗ ${missing.length} slugs del mapa no existen:`);
  missing.forEach((m) => console.log(`   ${m}`));
  process.exitCode = 1;
}

const repos = new Set(Object.values(MAP).map(([r]) => r));
console.log(`✓ ${repos.size} repositorios distintos referenciados`);

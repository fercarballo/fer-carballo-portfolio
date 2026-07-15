/**
 * ─────────────────────────────────────────────────────────────
 *  Modelo editorial del blog
 *  16 colecciones. Cada una abre con un artículo PILAR y se
 *  profundiza en SATÉLITES. El corpus se importa con
 *  `scripts/import-blog.mjs` desde la biblioteca editorial.
 * ─────────────────────────────────────────────────────────────
 */
import type { CollectionEntry } from 'astro:content';

export type ClusterMeta = {
  id: string;
  title: string;
  short: string;
  icon: string;
  hue: number;
  blurb: string;
  /** 'base' = fundamentos · 'avanzada' = serie avanzada · 'agentes' = serie de agentes de IA. */
  series: 'base' | 'avanzada' | 'agentes';
};

export const CLUSTERS: ClusterMeta[] = [
  { id: '00', title: 'Mapa de estudio y arquitectura de calidad', short: 'Mapa de estudio', icon: 'grad', hue: 145, blurb: 'La puerta de entrada: cómo encaja todo y en qué orden estudiarlo.', series: 'base' },
  { id: '01', title: 'Arquitectura de Quality Engineering', short: 'Arquitectura de QE', icon: 'shield', hue: 152, blurb: 'Diseñar el sistema de decisiones: riesgo → control → evidencia.', series: 'base' },
  { id: '02', title: 'API contract testing y sistemas distribuidos', short: 'Contratos de API', icon: 'braces', hue: 28, blurb: 'Contratos, idempotencia y evolución sin romper consumidores.', series: 'base' },
  { id: '03', title: 'Framework engineering para automatización', short: 'Framework engineering', icon: 'bot', hue: 210, blurb: 'Tratar la automatización como un producto interno.', series: 'base' },
  { id: '04', title: 'CI/CD y continuous quality', short: 'CI/CD y calidad continua', icon: 'infinity', hue: 200, blurb: 'Pipelines basados en riesgo y quality gates auditables.', series: 'base' },
  { id: '05', title: 'Entornos y datos de prueba', short: 'Entornos y datos', icon: 'container', hue: 190, blurb: 'Reproducibilidad: el entorno también es parte de la prueba.', series: 'base' },
  { id: '06', title: 'Performance engineering, SLO y capacidad', short: 'Performance y SLO', icon: 'chart', hue: 12, blurb: 'De la carga a una decisión: percentiles, SLOs y error budgets.', series: 'base' },
  { id: '07', title: 'Observabilidad para Quality Engineering', short: 'Observabilidad', icon: 'search', hue: 265, blurb: 'Telemetría como contrato: diagnosticar en vez de adivinar.', series: 'base' },
  { id: '08', title: 'Seguridad y threat modeling para QA', short: 'Seguridad para QA', icon: 'shield', hue: 0, blurb: 'Modelar amenazas y probar lo que un atacante probaría.', series: 'base' },
  { id: '09', title: 'Accesibilidad como calidad', short: 'Accesibilidad', icon: 'check', hue: 175, blurb: 'Semántica primero; automatizar lo automatizable y evaluar el resto.', series: 'base' },
  { id: '10', title: 'Mobile Quality Engineering', short: 'Mobile QE', icon: 'phone', hue: 300, blurb: 'Riesgo móvil: red degradada, ciclo de vida y matrices de CI.', series: 'base' },
  { id: '11', title: 'Resiliencia y chaos engineering', short: 'Resiliencia y caos', icon: 'refresh', hue: 45, blurb: 'Experimentos de falla con blast radius mínimo y gobernanza.', series: 'base' },
  { id: '12', title: 'Liderazgo y operating model de calidad', short: 'Liderazgo de calidad', icon: 'chat', hue: 330, blurb: 'Liderar calidad sin ser el cuello de botella.', series: 'base' },
  { id: '13', title: 'Quality Engineering en fintech', short: 'Fintech', icon: 'flask', hue: 88, blurb: 'Probar dinero: idempotencia, representación y reconciliación.', series: 'base' },
  { id: '14', title: 'IA aplicada y evaluación de calidad', short: 'IA y evals', icon: 'sparkle', hue: 280, blurb: 'Evaluar sistemas no deterministas: evals, RAG y abstención.', series: 'base' },
  { id: '15', title: 'Investigación técnica y escritura basada en evidencia', short: 'Escritura con evidencia', icon: 'book', hue: 220, blurb: 'Cómo se investiga, se mide y se publica sin inventar.', series: 'base' },

  /*
   * ── Serie avanzada ──
   * 14 capítulos derivados de la biblioteca `prompts-blog-qa-sr-avanzado`
   * (00–13). El prefijo 'a' evita colisionar con los ids de la serie base
   * manteniendo visible la numeración original del capítulo.
   */
  { id: 'a00', title: 'Mapa avanzado y priorización', short: 'Mapa avanzado', icon: 'command', hue: 160, blurb: 'La puerta de entrada a la serie avanzada: orden de estudio, etapas con salida verificable y los documentos transversales.', series: 'avanzada' },
  { id: 'a01', title: 'Event-driven y contratos asíncronos', short: 'Event-driven', icon: 'bell', hue: 25, blurb: 'Qué cambia cuando las partes se comunican de forma asíncrona: outbox, consumidores idempotentes, DLQ y AsyncAPI.', series: 'avanzada' },
  { id: 'a02', title: 'Supply-chain security: SLSA y SBOM', short: 'Supply chain', icon: 'ship', hue: 355, blurb: 'Cómo saber que el artefacto desplegado proviene del código revisado: SBOM, provenance y verificación de firmas.', series: 'avanzada' },
  { id: 'a03', title: 'Progressive delivery, feature flags y GitOps', short: 'Progressive delivery', icon: 'git', hue: 205, blurb: 'Liberar gradualmente y frenar con seguridad: flags con ciclo de vida, canary con guardrails y rollback ensayado.', series: 'avanzada' },
  { id: 'a04', title: 'Privacy engineering y gobierno de datos de prueba', short: 'Privacy engineering', icon: 'filter', hue: 280, blurb: 'Por dónde se escapan los datos que nadie decidió exponer: sintéticos vs enmascarado, telemetría y retención sin PII.', series: 'avanzada' },
  { id: 'a05', title: 'Data quality, lineage y reconciliación', short: 'Data quality', icon: 'set', hue: 190, blurb: 'Qué dato es correcto y según quién: reconciliación por operación y por totales, late data, backfill y replay idempotente.', series: 'avanzada' },
  { id: 'a06', title: 'FinOps y economía de la calidad', short: 'FinOps de calidad', icon: 'chart', hue: 88, blurb: 'Cuánto riesgo controla cada minuto de pipeline: optimizar ambientes, retención y costo sin degradar el control.', series: 'avanzada' },
  { id: 'a07', title: 'Ingeniería de fraude y motores de reglas', short: 'Fraude y reglas', icon: 'search', hue: 330, blurb: 'Decisiones automatizadas reproducibles y explicables: tablas de decisión, golden datasets, backtesting y tasa base.', series: 'avanzada' },
  { id: 'a08', title: 'Platform engineering para Quality Engineering', short: 'Quality platform', icon: 'kube', hue: 210, blurb: 'Calidad como producto interno sin quitar autonomía: golden paths, escape hatches y adopción sin castigar equipos.', series: 'avanzada' },
  { id: 'a09', title: 'Relevamiento de un proyecto existente', short: 'Relevamiento', icon: 'terminal', hue: 45, blurb: 'Relevar un repositorio antes de recomendar nada: método de diagnóstico y matrices para no opinar a ciegas.', series: 'avanzada' },
  { id: 'a10', title: 'Nueva tanda de proyectos avanzados', short: 'Proyectos avanzados', icon: 'container', hue: 260, blurb: 'Seis repositorios, una narrativa: alcance y no-alcance por repo, y backlog ordenado por dependencias.', series: 'avanzada' },
  { id: 'a11', title: 'Plan de integración con Nexo Finanzas', short: 'Integración Nexo', icon: 'infinity', hue: 152, blurb: 'Integrar sin big bang: contratos primero, incrementos verificables y un catálogo de decisiones pendientes.', series: 'avanzada' },
  { id: 'a12', title: 'Capstone: Nexo Trusted Transfer Platform', short: 'Capstone', icon: 'flask', hue: 12, blurb: 'El proyecto integral y acotado: alcance, invariantes de negocio y qué evidencia demuestra cada control.', series: 'avanzada' },
  { id: 'a13', title: 'RFC y design review de calidad', short: 'RFC y design review', icon: 'book', hue: 220, blurb: 'RFC, ADR y runbook: tres documentos, tres preguntas distintas, y cómo facilitar una design review desde calidad.', series: 'avanzada' },

  /*
   * ── Serie Agentes de IA ──
   * Tercera serie del corpus (prefijo 'g'). Cada colección responde una
   * pregunta del campo agéntico desde Quality Engineering, anclada a repos
   * de referencia reales cuando el artículo lo amerita.
   */
  { id: 'g00', title: 'Mapa agéntico: de LLM apps a agentes', short: 'Mapa agéntico', icon: 'bot', hue: 150, blurb: 'La puerta de entrada: el espectro de autonomía, la evolución 2022–2026 y el glosario que evita discusiones vacías.', series: 'agentes' },
  { id: 'g01', title: 'Anatomía del agente y workflows', short: 'Anatomía y workflows', icon: 'set', hue: 205, blurb: 'Los seis órganos de todo agente y sus modos de fallo, los cinco workflows previos y la condición de parada como requisito.', series: 'agentes' },
  { id: 'g02', title: 'Herramientas y MCP', short: 'Herramientas y MCP', icon: 'braces', hue: 25, blurb: 'De function calling a MCP: el contrato de las herramientas, un servidor MCP de herramientas QA y code execution vs tool-calls.', series: 'agentes' },
  { id: 'g03', title: 'Memoria y context engineering', short: 'Memoria y contexto', icon: 'book', hue: 280, blurb: 'El contexto como recurso finito: compaction, taxonomía de memoria y por qué los archivos versionados siguen ganando.', series: 'agentes' },
  { id: 'g04', title: 'Arquitecturas de agente', short: 'Arquitecturas', icon: 'refresh', hue: 190, blurb: 'ReAct, plan-and-execute, reflection y code agents; el debate multi-agente de 2025 y los agentes durables con journal y replay.', series: 'agentes' },
  { id: 'g05', title: 'Evaluar agentes', short: 'Evaluar agentes', icon: 'flask', hue: 145, blurb: 'Trayectoria vs outcome, pass^k, golden tasks con verificador de estado, simuladores de usuario y observabilidad del agente.', series: 'agentes' },
  { id: 'g06', title: 'Seguridad agéntica', short: 'Seguridad agéntica', icon: 'shield', hue: 355, blurb: 'La tríada letal, red-teaming como regresión continua y el diseño de sandbox y permisos que vuelve operable un agente.', series: 'agentes' },
  { id: 'g07', title: 'Agentes para QA', short: 'Agentes para QA', icon: 'check', hue: 88, blurb: 'El agente propone con evidencia y el humano decide: triage de fallos, self-healing como PR y exploratorio sintético.', series: 'agentes' },
];

/** Etiqueta corta de una colección según su serie. */
export const clusterLabel = (c: ClusterMeta) =>
  c.series === 'avanzada' ? `Avanzada ${c.id.slice(1)}`
  : c.series === 'agentes' ? `Agentes ${c.id.slice(1)}`
  : `Colección ${c.id}`;

/**
 * Puentes curados entre series: la colección base que un lector termina y el
 * capítulo avanzado que la continúa. Es una relación editorial, no algorítmica.
 */
export const BRIDGES: Record<string, string> = {
  '00': 'a00', // mapa base → mapa avanzado
  '02': 'a01', // contratos síncronos → contratos asíncronos
  '03': 'a08', // framework como producto → plataforma de calidad
  '04': 'a02', // evidencia del pipeline → cadena de suministro
  '05': 'a04', // datos de prueba → privacy engineering
  '06': 'a06', // SLOs y error budgets → economía de la calidad
  '07': 'a05', // telemetría como contrato → data quality y lineage
  '08': 'a02', // threat modeling → supply-chain security
  '12': 'a13', // operating model → RFC y design review
  '13': 'a07', // probar dinero → ingeniería de fraude
  '14': 'g00', // IA y evals → mapa agéntico
  'a01': 'g04', // contratos asíncronos → agentes durables
};

/** Colecciones base que recomiendan leer antes un capítulo avanzado dado. */
export const bridgeSourcesOf = (advancedId: string) =>
  Object.entries(BRIDGES).filter(([, adv]) => adv === advancedId).map(([base]) => base);

export const clusterById = (id: string) => CLUSTERS.find((c) => c.id === id);

/**
 * Repos públicos reales de github.com/fercarballo que respaldan artículos.
 *
 * Regla: un artículo sólo declara `repo` si ese repositorio implementa de
 * verdad lo que el artículo explica, verificado leyendo el código — no por
 * coincidencia de nombre. Los capítulos sin implementación pública no
 * declaran repo. Ver scripts/assign-repos.mjs para la evidencia de cada match.
 */
export const REPOS: Record<string, { name: string; blurb: string }> = {
  // ── Ecosistema Nexo Finanzas (7 repos) ──
  'nexo-transfer-api': { name: 'nexo-transfer-api', blurb: 'API de transferencias: Java 21, Spring Boot, Cucumber BDD y REST-assured. Idempotency-Key, autorización por titularidad y BigDecimal.' },
  'nexo-quality-platform': { name: 'nexo-quality-platform', blurb: 'Entorno reproducible (Docker Compose, kind) y pipelines GitLab CI / Jenkins con quality gates. ADRs, runbooks, DoR/DoD.' },
  'nexo-quality-control-tower': { name: 'nexo-quality-control-tower', blurb: 'Trazabilidad requisito → prueba → resultado desde JUnit XML, publicada en Jira/Xray. Gate ante requisitos sin cobertura.' },
  'nexo-performance-lab': { name: 'nexo-performance-lab', blurb: 'Laboratorio de carga con JMeter: hipótesis, modelo de carga, SLOs como gate y conclusiones medidas.' },
  'nexo-cross-channel-regression': { name: 'nexo-cross-channel-regression', blurb: 'Smoke cross-canal (API + Web + Mobile) con Katalon Studio y un validador estático propio como gate de CI.' },
  'nexo-web-banking-e2e': { name: 'nexo-web-banking-e2e', blurb: 'Journeys web de alto riesgo: Selenium 4 + Cucumber BDD + Page Object Model en Java.' },
  'nexo-wallet-mobile': { name: 'nexo-wallet-mobile', blurb: 'Billetera Android y su automatización: Appium 9 + Cucumber BDD + POM, con modo simulado sin emulador.' },

  // ── Laboratorios de fiabilidad y observabilidad ──
  'telco-reliability-lab': { name: 'telco-reliability-lab', blurb: 'API telco instrumentada de punta a punta: k6, observabilidad completa (OpenTelemetry, Prometheus, Tempo, Loki, Grafana), idempotencia impuesta por la base y CI con gate de SLO.' },
  'performance-reliability-testing-suite': { name: 'performance-reliability-testing-suite', blurb: 'Suite de performance y fiabilidad: k6 (load/stress/spike/soak), inyección controlada de fallos, gates de SLO y trazabilidad métrica → traza → log.' },

  // ── Herramientas y frameworks de QA ──
  'visual-and-contract-testing': { name: 'visual-and-contract-testing', blurb: 'Contract testing con Pact (consumidor y proveedor reales) y regresión visual con Playwright.' },
  'flakiness-hunting-playwright': { name: 'flakiness-hunting-playwright', blurb: 'Demostrar, medir y eliminar tests inestables: script que corre N veces cada suite con retries=0 y compara anti-patrones contra la versión estable.' },
  'llm-evals-harness': { name: 'llm-evals-harness', blurb: 'Evals de aplicaciones con IA: golden dataset, scorers (exact match, similitud, LLM-as-judge) y umbral como quality gate.' },
  'devsecops-pipeline': { name: 'devsecops-pipeline', blurb: 'Seguridad automatizada en el pipeline: SAST (Semgrep), SCA con gate por severidad y DAST (ZAP).' },
  'integration-testing-testcontainers': { name: 'integration-testing-testcontainers', blurb: 'Integración contra un Postgres real y efímero con Testcontainers: valida constraints, migraciones y tipos de verdad.' },
  'performance-testing-k6': { name: 'performance-testing-k6', blurb: 'Escenarios de carga realista con k6 (smoke, load, stress, spike, soak) y thresholds como quality gate.' },
  'qa-automation-cicd-pipeline': { name: 'qa-automation-cicd-pipeline', blurb: 'Pipeline CI/CD con GitHub Actions sobre suite UI + API: smoke bloqueante en PR y regresión nocturna con sharding y merge de reportes.' },
  'api-testing-framework-restful-booker': { name: 'api-testing-framework-restful-booker', blurb: 'Framework de testing de API con Playwright, TypeScript y Zod: contratos por schema, builders de datos y setup por API.' },
  'playwright-e2e-framework-saucedemo': { name: 'playwright-e2e-framework-saucedemo', blurb: 'Framework E2E de referencia: Page Object Model, fixtures, cross-browser y CI. La automatización tratada como producto.' },
  'qa-insights': { name: 'qa-insights', blurb: 'Herramienta interna: Test Impact Analysis (correr sólo los tests afectados) y detección de flakiness, sin dependencias de runtime.' },

  // ── Serie Agentes: repos de referencia ──
  'agent-evals-lab': { name: 'agent-evals-lab', blurb: 'Golden tasks con verificador programático del estado final, métricas pass^k vs pass@k con intervalo de Wilson y un gate de CI que se auto-valida. Sin llamadas a modelos: políticas deterministas.' },
  'mcp-qa-toolbox': { name: 'mcp-qa-toolbox', blurb: 'Servidor MCP con herramientas de QA (parseo JUnit, reporte de flakiness, quality gate) y la lógica de negocio separada del protocolo para testearse sin MCP.' },
  'agent-triage-assistant': { name: 'agent-triage-assistant', blurb: 'Triage de fallos de CI con reglas explicables: clasifica producto/entorno/dato/test citando la evidencia exacta. El agente propone; el humano decide.' },
  'prompt-injection-arena': { name: 'prompt-injection-arena', blurb: 'Banco de payloads de inyección versionado + harness que mide tasa de bloqueo y falsos positivos por categoría, con gate de regresión contra baseline.' },
  'durable-agent-workflow': { name: 'durable-agent-workflow', blurb: 'Journal de eventos append-only, crash-resume en cualquier punto, aprobación humana asíncrona y replay determinista con LLM memoizado. El patrón, minimal y legible.' },

  // ── Suites hands-on en Python ──
  'pytest-api-suite': { name: 'pytest-api-suite', blurb: 'Suite de testing de una API REST en tres niveles: unitario (pytest y unittest), integración contra la API real y contrato por JSON Schema, todo en GitHub Actions.' },
  'data-quality-testing': { name: 'data-quality-testing', blurb: 'Un pipeline ETL tratado como sistema que merece pruebas: contratos de datos con Pandera en cada frontera y checks de integridad SQL post-carga, como quality gate.' },
};

export const repoUrl = (repo: string) => `https://github.com/fercarballo/${repo}`;

type Post = CollectionEntry<'blog'>;

/** Orden de lectura canónico: pilar primero, luego satélites por `order`. */
export function sortByReadingOrder(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    if (a.data.type !== b.data.type) return a.data.type === 'pilar' ? -1 : 1;
    return a.data.order - b.data.order;
  });
}

/** Agrupa los posts por colección, en el orden de las 16 colecciones. */
export function groupByCluster(posts: Post[]) {
  return CLUSTERS.map((cluster) => {
    const items = sortByReadingOrder(posts.filter((p) => p.data.cluster === cluster.id));
    return {
      cluster,
      items,
      pillar: items.find((p) => p.data.type === 'pilar') ?? items[0],
      satellites: items.filter((p) => p.data.type !== 'pilar'),
    };
  }).filter((g) => g.items.length > 0);
}

/** Minutos de lectura estimados (200 palabras/min). */
export function readingMinutes(body: string | undefined) {
  const words = body?.trim().split(/\s+/).length ?? 0;
  return Math.max(1, Math.round(words / 200));
}

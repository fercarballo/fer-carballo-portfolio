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
  /** 'base' = fundamentos (primera tanda) · 'avanzada' = serie avanzada. */
  series: 'base' | 'avanzada';
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
];

/** Etiqueta corta de una colección según su serie. */
export const clusterLabel = (c: ClusterMeta) =>
  c.series === 'avanzada' ? `Avanzada ${c.id.slice(1)}` : `Colección ${c.id}`;

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
};

/** Colecciones base que recomiendan leer antes un capítulo avanzado dado. */
export const bridgeSourcesOf = (advancedId: string) =>
  Object.entries(BRIDGES).filter(([, adv]) => adv === advancedId).map(([base]) => base);

export const clusterById = (id: string) => CLUSTERS.find((c) => c.id === id);

/** Repos públicos del ecosistema Nexo Finanzas que implementan lo que el blog explica. */
export const NEXO_REPOS: Record<string, { name: string; blurb: string }> = {
  'nexo-transfer-api': { name: 'nexo-transfer-api', blurb: 'API de transferencias: Java 21, Spring Boot, Cucumber BDD, REST-assured.' },
  'nexo-quality-platform': { name: 'nexo-quality-platform', blurb: 'Entorno reproducible y pipelines GitLab CI / Jenkins con quality gates.' },
  'nexo-quality-control-tower': { name: 'nexo-quality-control-tower', blurb: 'Trazabilidad requisito → prueba → resultado, publicada en Jira/Xray.' },
  'nexo-performance-lab': { name: 'nexo-performance-lab', blurb: 'Laboratorio de carga con JMeter: hipótesis, modelo y SLOs como gate.' },
  'nexo-cross-channel-regression': { name: 'nexo-cross-channel-regression', blurb: 'Smoke cross-canal (API + Web + Mobile) con validador estático en CI.' },
  'nexo-web-banking-e2e': { name: 'nexo-web-banking-e2e', blurb: 'Journeys web de alto riesgo del ecosistema Nexo.' },
  'nexo-wallet-mobile': { name: 'nexo-wallet-mobile', blurb: 'App móvil del ecosistema: base de la estrategia de calidad mobile.' },
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

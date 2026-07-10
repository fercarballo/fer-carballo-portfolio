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
};

export const CLUSTERS: ClusterMeta[] = [
  { id: '00', title: 'Mapa de estudio y arquitectura de calidad', short: 'Mapa de estudio', icon: 'grad', hue: 145, blurb: 'La puerta de entrada: cómo encaja todo y en qué orden estudiarlo.' },
  { id: '01', title: 'Arquitectura de Quality Engineering', short: 'Arquitectura de QE', icon: 'shield', hue: 152, blurb: 'Diseñar el sistema de decisiones: riesgo → control → evidencia.' },
  { id: '02', title: 'API contract testing y sistemas distribuidos', short: 'Contratos de API', icon: 'braces', hue: 28, blurb: 'Contratos, idempotencia y evolución sin romper consumidores.' },
  { id: '03', title: 'Framework engineering para automatización', short: 'Framework engineering', icon: 'bot', hue: 210, blurb: 'Tratar la automatización como un producto interno.' },
  { id: '04', title: 'CI/CD y continuous quality', short: 'CI/CD y calidad continua', icon: 'infinity', hue: 200, blurb: 'Pipelines basados en riesgo y quality gates auditables.' },
  { id: '05', title: 'Entornos y datos de prueba', short: 'Entornos y datos', icon: 'container', hue: 190, blurb: 'Reproducibilidad: el entorno también es parte de la prueba.' },
  { id: '06', title: 'Performance engineering, SLO y capacidad', short: 'Performance y SLO', icon: 'chart', hue: 12, blurb: 'De la carga a una decisión: percentiles, SLOs y error budgets.' },
  { id: '07', title: 'Observabilidad para Quality Engineering', short: 'Observabilidad', icon: 'search', hue: 265, blurb: 'Telemetría como contrato: diagnosticar en vez de adivinar.' },
  { id: '08', title: 'Seguridad y threat modeling para QA', short: 'Seguridad para QA', icon: 'shield', hue: 0, blurb: 'Modelar amenazas y probar lo que un atacante probaría.' },
  { id: '09', title: 'Accesibilidad como calidad', short: 'Accesibilidad', icon: 'check', hue: 175, blurb: 'Semántica primero; automatizar lo automatizable y evaluar el resto.' },
  { id: '10', title: 'Mobile Quality Engineering', short: 'Mobile QE', icon: 'phone', hue: 300, blurb: 'Riesgo móvil: red degradada, ciclo de vida y matrices de CI.' },
  { id: '11', title: 'Resiliencia y chaos engineering', short: 'Resiliencia y caos', icon: 'refresh', hue: 45, blurb: 'Experimentos de falla con blast radius mínimo y gobernanza.' },
  { id: '12', title: 'Liderazgo y operating model de calidad', short: 'Liderazgo de calidad', icon: 'chat', hue: 330, blurb: 'Liderar calidad sin ser el cuello de botella.' },
  { id: '13', title: 'Quality Engineering en fintech', short: 'Fintech', icon: 'flask', hue: 88, blurb: 'Probar dinero: idempotencia, representación y reconciliación.' },
  { id: '14', title: 'IA aplicada y evaluación de calidad', short: 'IA y evals', icon: 'sparkle', hue: 280, blurb: 'Evaluar sistemas no deterministas: evals, RAG y abstención.' },
  { id: '15', title: 'Investigación técnica y escritura basada en evidencia', short: 'Escritura con evidencia', icon: 'book', hue: 220, blurb: 'Cómo se investiga, se mide y se publica sin inventar.' },
];

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

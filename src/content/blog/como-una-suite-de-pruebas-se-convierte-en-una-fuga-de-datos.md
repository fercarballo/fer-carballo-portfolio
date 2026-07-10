---
title: "Cómo una suite de pruebas se convierte en una fuga de datos"
description: "Pilar de privacy engineering para QA: clasificación de datos, purpose limitation, minimización, privacy threat model, y por qué privacidad, seguridad y cumplimiento no son lo mismo."
pubDate: 2026-07-10
tags: ['privacy-engineering', 'test-data-management', 'threat-modeling', 'gdpr', 'nist', 'sdet']
cluster: 'a04'
clusterTitle: "Privacy engineering y gobierno de datos de prueba"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere modelado de datos, SQL y nociones de threat modeling."
icon: 'filter'
iconHue: 280
---

> **Aviso.** Nexo Finanzas es **ficticio**. Todos los datos son sintéticos: ningún nombre, documento, cuenta o correo corresponde a una persona real. **Este contenido no es asesoramiento legal ni de cumplimiento.** No se afirma conformidad con ninguna regulación.

> **Promesa del artículo.** Al terminar vas a poder distinguir privacidad de seguridad y de cumplimiento (y por qué la confusión es cara), construir un privacy threat model para tus entornos de prueba, y clasificar los datos de tu dominio con un criterio que resiste una pregunta incómoda.

## Nadie decidió esto

Reconstruyamos una historia bastante común. Ninguno de estos pasos es malintencionado.

1. Un equipo necesita datos realistas para probar un caso raro. Alguien exporta un subset de producción a un entorno de staging. *"Solo esta vez."*
2. La suite de UI toma screenshots cuando un test falla. Los sube como artefactos del pipeline. Retención por defecto: 30 días, o para siempre.
3. Un test de API falla y el reporte incluye el body completo del response, con el nombre y el documento del titular de la cuenta.
4. El servicio loguea `Transferencia rechazada para usuario {}` con el `userId`, para poder depurar.
5. Alguien agrega una métrica `transferencias_por_usuario{user_id="..."}` porque quería ver el detalle.
6. El entorno de staging usa el mismo proveedor SaaS de reportes que producción, y los reportes se guardan en la nube de un tercero.

Al final, hay copias de datos personales en: una base de staging, los artefactos de N pipelines, la salida de logs, el sistema de métricas, y un tercero. **Ninguna de esas copias tiene una política de retención, un dueño, ni una finalidad declarada.** Y ninguna decisión fue tomada por alguien que se preguntara si correspondía.

> **Tesis del capítulo.** La privacidad no se agrega al final con masking. Se diseña desde la recolección y la clasificación hasta el uso, la retención, el acceso, la evidencia y la eliminación. Y en el ciclo de calidad, los datos se copian más veces que en cualquier otro lugar del sistema.

## Tres palabras que no son sinónimos

Esta distinción hay que tenerla afilada, porque la mayoría de los equipos cree que resolver una resuelve las tres.

| | Pregunta que responde | Un fallo se ve así |
|---|---|---|
| **Seguridad** | ¿Alguien accedió sin autorización? | Un atacante extrae la base |
| **Privacidad** | ¿Se usan los datos personales solo para la finalidad por la que se recolectaron? | Todo el equipo tiene acceso **autorizado** a una copia de producción en test |
| **Cumplimiento** | ¿Podés demostrarle a un tercero que hacés lo que decís? | No podés mostrar el registro de accesos ni la política de retención |

El segundo caso es el importante: **no hubo ninguna brecha de seguridad.** Los accesos estaban autorizados. Y sin embargo, los datos de una persona que abrió una cuenta se están usando para depurar un bug de UI, que no es la finalidad para la que los entregó.

Eso se llama **purpose limitation**, y es el corazón de la privacidad. Un control de acceso perfecto no lo resuelve, porque el problema no es *quién* accede sino *para qué*.

**La consecuencia práctica para un Quality Engineer:** cuando alguien dice "está bien, el entorno de test tiene los mismos controles de acceso que producción", la respuesta correcta es *"el problema no es el acceso, es la finalidad"*.

## Clasificación: el trabajo que habilita todo lo demás

No podés minimizar lo que no clasificaste. La clasificación es el prerrequisito de toda decisión posterior, y también del [capítulo de data quality](/blog/coleccion/a05/).

Un catálogo útil tiene seis columnas. Menos, y no sirve para decidir.

### Catálogo de datos de Nexo Finanzas (ficticio)

| Elemento | Clasificación | Finalidad declarada | Ambientes permitidos | Retención | Técnica de generación |
|---|---|---|---|---|---|
| `accountId` | Pseudónimo | Identificar la cuenta | Todos | Vida de la cuenta | Secuencia determinista `acc_00001` |
| `holderName` | **Personal** | Mostrar en el comprobante | **Solo producción** | Vida de la cuenta | Sintético desde un diccionario ficticio |
| `taxId` | **Personal sensible** | Verificación de identidad | **Solo producción** | Legal (fuera de alcance técnico) | **Nunca se copia.** Sintético con formato *deliberadamente inválido* |
| `email` | **Personal** | Notificaciones | Solo producción | Vida de la cuenta | Sintético `@example.invalid` |
| `balanceMinor` | **Confidencial de negocio** | Operación | Todos, con valores sintéticos | Vida de la cuenta | Generado |
| `transferId` | Pseudónimo | Trazabilidad | Todos | 7 años (ficticio) | UUID |
| `correlationId` | **Opaco** | Correlación técnica | Todos | 30 días | UUID aleatorio, **sin derivar de datos personales** |
| `deviceFingerprint` | **Personal** (identifica indirectamente) | Antifraude | Solo producción | 90 días | Sintético |
| `ipAddress` | **Personal** en varias jurisdicciones | Antifraude | Solo producción | 30 días | Sintético del rango de documentación |

Cuatro cosas que este catálogo hace y la mayoría no:

- **La columna "finalidad" existe.** Sin ella no podés responder "¿para qué está este campo acá?", que es la única pregunta que importa. Un campo sin finalidad declarada **no se recolecta**.
- **`correlationId` está clasificado como opaco y con una prohibición explícita.** Si derivás el `correlationId` de un hash del `userId`, acabás de convertir tu identificador técnico —que viaja por logs, trazas, eventos y el proveedor de flags— en un identificador personal estable. Es un error frecuente y silencioso.
- **`taxId` se genera con un formato deliberadamente inválido.** Si tus documentos sintéticos pasan la validación de checksum de una jurisdicción real, existe la posibilidad de que colisionen con el documento de una persona real. Que sea sintético no basta: tiene que ser **imposible**.
- **`ipAddress` está marcado como personal.** Sorprende a mucha gente. En varias jurisdicciones una dirección IP se considera dato personal cuando permite identificar indirectamente a alguien. *No es asesoramiento legal:* verificá la norma de tu jurisdicción, con su versión y fecha. Pero desde ingeniería, tratarla como personal es la posición defendible.

## Privacy threat model

Un threat model de seguridad pregunta *"¿quién puede acceder sin permiso?"*. Uno de privacidad pregunta *"¿qué datos fluyen a dónde, con qué finalidad, y quién decidió eso?"*.

<figure class="diagram">
  <img src="/blog/diagrams/como-una-suite-de-pruebas-se-convierte-en-una-fuga-de-datos-1.svg" width="512" height="708" alt="Diagrama: como-una-suite-de-pruebas-se-convierte-en-una-fuga-de-datos (1)" loading="lazy" decoding="async" />
</figure>

La rama izquierda es la más poderosa y la menos usada: **no recolectar**. Un dato que no existe no se filtra, no se retiene, no hay que borrarlo y no aparece en un incidente. Es el único control con eficacia del 100 %.

Aplicado al ciclo de calidad, las fugas ocurren en lugares específicos. Enumerémoslos:

| # | Vector | Cómo ocurre | Control |
|---|---|---|---|
| P1 | **Base de datos de test** | Subset de producción "solo esta vez" | Datos sintéticos; ver artículo 2 |
| P2 | **Logs de aplicación** | `log.info("rechazo para {}", user)` | Contrato de logging; ver artículo 3 |
| P3 | **Trazas** | Un atributo de span con el body del request | Allowlist de atributos |
| P4 | **Métricas** | `user_id` como *label* → alta cardinalidad **y** dato personal | Prohibición estructural |
| P5 | **Screenshots de CI** | Test de UI falla en la pantalla de perfil | Retención corta; enmascaramiento en la app bajo bandera de test |
| P6 | **Reportes de test** | El body del response en el mensaje de fallo | Redacción en el reporter |
| P7 | **Proveedor SaaS** | El grid de dispositivos, el servicio de flags, el APM | Evaluación de proveedor; `targetingKey` opaco |
| P8 | **Backups de test** | Nadie sabe que existen | Inventario |
| P9 | **Volcados de depuración** | Un `heap dump` con la memoria del proceso | Prohibido fuera de un procedimiento con aprobación |
| P10 | **El propio blog / portfolio** | Una captura "de ejemplo" sin sanear | Revisión antes de publicar |

**P4 merece una nota.** Poner `user_id` como etiqueta de una métrica es simultáneamente un problema de privacidad y uno de costo: cada valor distinto crea una serie temporal nueva. Un millón de usuarios son un millón de series. El sistema de métricas se cae, y de paso guardaste identificadores personales en un almacén que nadie clasificó como tal. Es el ejemplo perfecto de por qué privacidad y [FinOps](/blog/coleccion/a06/) se tocan.

**P10 no es un chiste.** Esta serie de 31 artículos usa exclusivamente datos sintéticos, dominios `.invalid`, y no contiene una sola captura de pantalla sin sanear. Es una decisión editorial deliberada, y es la misma que deberías aplicar a tu portfolio.

## "Está hasheado, así que es anónimo"

No. Esta frase merece su propia sección porque es probablemente la creencia falsa más extendida.

**Un hash es determinista.** `sha256("12345678")` da siempre lo mismo. Si el espacio de entradas es pequeño o predecible —y el de los números de documento lo es— cualquiera puede calcular el hash de todos los valores posibles y construir una tabla inversa. Un documento de 8 dígitos tiene 10^8 posibilidades: se enumeran en segundos.

Hashear un documento no lo anonimiza. Lo **pseudonimiza**: reemplaza el identificador por otro, y sigue identificando a la misma persona de forma estable.

Y la pseudonimización estable tiene un problema propio: **permite el enlace (linkage)**. Si el mismo hash aparece en tu tabla de test, en tus logs y en un dataset de analítica, podés cruzarlos. Que es exactamente lo que un identificador personal hace.

Tres conceptos, tres garantías distintas:

| Técnica | Qué hace | ¿Reversible? | ¿Permite enlace? |
|---|---|---|---|
| **Hash** (sin sal) | Sustituye por un digest | Sí, por fuerza bruta si el espacio es chico | **Sí** |
| **Hash con sal secreta / tokenización** | Sustituye usando un secreto | Solo con el secreto | Sí, dentro del mismo dominio de sal |
| **Anonimización** | Elimina la posibilidad de reidentificar | No | **No** |

La anonimización real es difícil. Requiere pensar en **cuasi-identificadores**: campos que individualmente no identifican pero en combinación sí. Fecha de nacimiento + código postal + género identifica de forma única a una fracción sorprendente de una población. Podés borrar el nombre y el documento, y el registro sigue siendo reidentificable.

**Conclusión práctica:** si no podés demostrar que un dataset es no reidentificable —y demostrarlo es un trabajo estadístico, no una intuición— tratalo como personal. La opción honesta y barata es **no derivarlo de producción en absoluto**. Eso lleva al artículo 2.

## Evaluación de proveedores SaaS de testing

Tu grid de dispositivos, tu servicio de flags, tu APM y tu plataforma de reportes reciben datos. Cuatro preguntas, antes de firmar:

1. **¿Qué le enviamos, exactamente?** No lo que creemos: lo que el SDK envía. Capturá el tráfico. Un APM que captura bodies de requests por defecto está exfiltrando datos personales, y su documentación probablemente lo dice en una nota al pie.
2. **¿Dónde se almacena y bajo qué jurisdicción?**
3. **¿Cuánto tiempo se retiene y podemos forzar el borrado?**
4. **¿Quién, del lado del proveedor, puede verlo?**

Para un portfolio, la regla es más simple y está en el prompt de diseño de proyectos: **ningún demo básico depende de credenciales pagas.** Y un beneficio colateral: si tu demo no envía nada a terceros, no tenés este problema.

## Métricas de privacidad

Con definición, ventana y acción. Sin metas mágicas.

| Métrica | Definición | Acción que dispara |
|---|---|---|
| Fuentes de datos inventariadas | elementos en el catálogo ÷ elementos detectados en schemas | Si < 100 %, hay campos sin finalidad declarada |
| Artefactos con política de expiración | artefactos de CI con TTL ÷ total | Cualquier artefacto sin TTL es un ticket |
| Hallazgos de secretos/PII | conteo por tipo, por semana | Tendencia creciente ⇒ el control preventivo falla |
| Controles de borrado ensayados | ensayos ejecutados en los últimos 6 meses | Cero ⇒ el procedimiento de borrado es una hipótesis |

La última es la que separa una política de una capacidad. **Un procedimiento de borrado que nunca se ejecutó no se sabe si funciona.** Ensayalo en el sandbox, con datos sintéticos, y registrá la fecha.

## Anti-patrones

- **Copiar producción porque "es más realista".** *Causa:* es el camino de menor resistencia. *Consecuencia:* datos personales en N entornos sin finalidad ni retención. *Alternativa:* generación sintética; ver artículo 2.
- **Hashear un dato y llamarlo anónimo.** *Consecuencia:* pseudonimización presentada como anonimización; permite enlace y a veces reversión. *Alternativa:* nombrar la técnica correcta y sus garantías.
- **Derivar el `correlationId` de un identificador personal.** *Consecuencia:* convertís un identificador técnico ubicuo en uno personal. *Alternativa:* UUID aleatorio.
- **`user_id` como etiqueta de métrica.** *Consecuencia:* explosión de cardinalidad **y** datos personales en el almacén de métricas. *Alternativa:* prohibición estructural.
- **Documentos sintéticos con checksum válido.** *Consecuencia:* pueden colisionar con documentos reales. *Alternativa:* formato deliberadamente inválido.
- **Guardar screenshots indefinidamente.** *Alternativa:* TTL corto por defecto y enmascaramiento en origen.
- **Esconder PII en la UI pero filtrarla en logs.** *Consecuencia:* el control es cosmético. *Alternativa:* el contrato de datos aplica a todas las salidas.
- **Confundir "acceso autorizado" con "uso legítimo".** *Alternativa:* purpose limitation.
- **Declarar GDPR/PCI/BCRA compliant porque se pasó una prueba.** *Consecuencia:* una afirmación falsa y verificable. *Alternativa:* describir el control, no el cumplimiento.

## Qué publicar en GitHub

```text
docs/privacy/data-inventory.md          # el catálogo, con la columna "finalidad"
docs/privacy/test-data-policy.md        # qué se permite en cada ambiente
docs/privacy/retention-matrix.md        # qué se guarda, dónde, cuánto, quién lo borra
docs/privacy/privacy-threat-model.md    # la tabla P1-P10, aplicada a TU sistema
docs/privacy/proveedores.md             # las cuatro preguntas, respondidas
tests/privacy/                          # los tests que fallan ante un patrón prohibido
tools/synthetic-data/                   # ver artículo 2
SECURITY.md
```

## Qué aprendimos / próximos pasos

- Privacidad, seguridad y cumplimiento responden preguntas distintas. Un sistema seguro puede violar la privacidad sin ninguna brecha.
- No podés minimizar lo que no clasificaste. La columna "finalidad" es la que hace útil un catálogo.
- El control más eficaz es **no recolectar**.
- Hashear no es anonimizar. Pseudonimizar permite enlace.
- El ciclo de calidad copia datos en al menos diez lugares, y casi ninguno tiene dueño ni retención.

**Siguiente:** [Datos sintéticos versus subset enmascarado](/blog/datos-sinteticos-versus-subset-enmascarado/).

## Checklist final

- [ ] Existe un catálogo de datos con **finalidad declarada** por elemento.
- [ ] Ningún campo sin finalidad se recolecta.
- [ ] El `correlationId` no deriva de ningún dato personal.
- [ ] Ninguna métrica lleva un identificador de usuario como etiqueta.
- [ ] Los documentos sintéticos tienen formato deliberadamente inválido.
- [ ] El privacy threat model enumera los diez vectores y asigna un control a cada uno.
- [ ] Ningún documento afirma cumplimiento regulatorio.
- [ ] Toda mención de una norma lleva jurisdicción, versión y fecha.
- [ ] Los proveedores SaaS tienen respondidas las cuatro preguntas.
- [ ] El procedimiento de borrado fue **ensayado**, con fecha registrada.
- [ ] El portfolio público no contiene una sola captura sin sanear.

---

## Fuentes (consultadas 2026-07-10)

- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) — la **1.0 es la versión final vigente**. La [1.1 es un borrador (CSWP 40, IPD)](https://csrc.nist.gov/pubs/cswp/40/nist-privacy-framework-11/ipd), con período de comentarios cerrado el 2025-06-13. **No citar la 1.1 como final.**
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OpenTelemetry — Security](https://opentelemetry.io/docs/security/)
- Fuente oficial de la regulación **solo** si se analiza una jurisdicción concreta. Esta serie no analiza ninguna.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)

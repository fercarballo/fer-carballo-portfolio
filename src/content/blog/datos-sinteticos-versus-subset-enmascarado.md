---
title: "Datos sintéticos versus subset enmascarado"
description: "ADR entre datos sintéticos y subset enmascarado de producción, generador determinista de usuarios sintéticos, integridad referencial, casos límite y los límites del enmascaramiento."
pubDate: 2026-07-10
tags: ['test-data-management', 'datos-sinteticos', 'enmascaramiento', 'privacy-engineering', 'sdet']
cluster: 'a04'
clusterTitle: "Privacy engineering y gobierno de datos de prueba"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere SQL, modelado de datos y estrategia de pruebas."
icon: 'filter'
iconHue: 280
---

> **Aviso.** Nexo Finanzas es **ficticio**. Todos los datos son sintéticos. El código es didáctico y **no es código listo para producción**. **No es asesoramiento legal.**

> **Promesa del artículo.** Al terminar vas a poder defender, con un ADR y no con una preferencia, la elección entre generar datos y copiar producción; vas a tener un generador determinista que produce el mismo dataset en cada corrida; y vas a entender por qué el argumento del "realismo" está mal planteado.

> Asume la clasificación y el privacy threat model del [pilar](/blog/como-una-suite-de-pruebas-se-convierte-en-una-fuga-de-datos/).

## El argumento del realismo, refutado

El argumento a favor de copiar producción siempre es el mismo:

> *"Los datos sintéticos son demasiado limpios. Producción tiene casos raros que nunca se nos ocurrirían: nombres con apóstrofes, cuentas con saldo negativo por un ajuste de 2019, transferencias con moneda que ya no existe."*

Es un buen argumento y **está mal planteado**. Fijate qué demuestra en realidad:

- Que tu **conocimiento del dominio** es incompleto.
- Que producción es la única documentación de tus casos límite.

Copiar producción no resuelve ninguno de los dos problemas. Los **oculta**. Seguís sin saber que existe el saldo negativo por ajuste; simplemente, a veces tus tests lo tocan y a veces no, según qué filas cayeron en el subset de esta semana.

Y hay algo peor: **un subset de producción no contiene los casos raros de forma confiable**. Si el 0,001 % de las cuentas tiene saldo negativo y tomás un subset del 1 %, es probable que no haya ninguna. Estás pagando el costo de privacidad completo y no obtenés el beneficio que lo justificaba.

**La alternativa correcta:** cuando descubrís un caso raro en producción, no lo copiás. Lo **entendés**, lo **documentás**, y **agregás un generador para él**. Ahora está en cada corrida, con nombre, y podés probarlo deliberadamente en lugar de esperar que aparezca.

Ese es el giro conceptual del artículo: **los datos sintéticos no son una versión pobre de producción; son una especificación ejecutable de tu dominio.** Cada caso límite que agregás es conocimiento que antes solo vivía en una tabla.

## Las tres opciones, honestamente

| | **Subset enmascarado** | **Datos sintéticos** | **Híbrido** |
|---|---|---|---|
| Riesgo de privacidad | **Alto.** Residual siempre | Nulo | Medio |
| Cobertura de casos raros | Aleatoria y no reproducible | **La que hayas modelado** | Depende |
| Reproducibilidad | Baja: cambia en cada refresh | **Total** | Baja |
| Integridad referencial | Difícil: el subset rompe FKs | Por construcción | Difícil |
| Coste inicial | Bajo (engañoso) | **Alto** | Alto |
| Coste sostenido | **Alto**: refresh, masking, auditoría | Bajo | Alto |
| Volumen para performance | Fácil | Requiere trabajo | Fácil |

**El "coste inicial bajo" del subset es una ilusión contable.** El costo real aparece después: mantener las reglas de masking sincronizadas con cada cambio de schema, auditar los accesos, gestionar la retención, y responder por la copia cuando aparezca en un incidente.

**Dónde el subset sí gana:** pruebas de performance que necesitan volumen y distribución realista. Generar 50 millones de filas con distribución representativa es trabajo real. Ahí un subset **fuertemente** enmascarado y con acceso restringido puede ser defendible, en un entorno aislado, con una decisión escrita. Lo cual nos lleva al ADR.

### El árbol de decisión

<figure class="diagram">
  <img src="/blog/diagrams/datos-sinteticos-versus-subset-enmascarado-1.svg" width="734" height="1667" alt="Diagrama: datos-sinteticos-versus-subset-enmascarado (1)" loading="lazy" decoding="async" />
</figure>

Fijate que **la rama del subset termina en "tratarlo como dato personal igual"**. Enmascarar no cambia la clasificación: cambia el riesgo residual. Y fijate que la primera pregunta liquida el debate para casi todo portfolio.

### ADR-003: estrategia de datos de prueba para Nexo Finanzas

> **Contexto.** Necesitamos datos para: (a) tests unitarios y de integración en CI, (b) journeys de UI y mobile, (c) un ambiente de demo público, (d) una línea base de performance.
>
> **Restricción dura.** El repositorio es público. Ningún dato personal puede existir en él, ni en los artefactos del pipeline, ni en las capturas.
>
> **Opciones.**
> 1. **Subset enmascarado de producción.** Descartada para (a)(b)(c): riesgo residual de reidentificación, no reproducible entre corridas, e imposible en un repositorio público. Además, Nexo Finanzas es ficticio: **no existe producción**. Este ADR documenta el razonamiento para el caso general.
> 2. **Datos sintéticos deterministas.** Elegida para (a)(b)(c).
> 3. **Sintéticos + generación masiva para performance.** Elegida para (d).
>
> **Decisión.** Generación sintética determinista, con semilla fija por escenario. Para (d), el mismo generador con un volumen configurable y distribuciones declaradas.
>
> **Consecuencias.**
> - *Positiva:* el dataset es un artefacto versionado. Un test que falla se reproduce con `--seed 42`.
> - *Positiva:* los casos límite son explícitos y tienen nombre.
> - *Negativa:* la distribución de los datos sintéticos es **la que modelamos**, no la real. Si nuestro modelo del dominio está equivocado, los tests lo confirman felizmente. **Este es el riesgo principal y no tiene mitigación completa.**
> - *Negativa:* el generador es código que hay que mantener y probar.
>
> **Fecha de revisión.** 12 meses, o cuando aparezca un incidente causado por un caso de datos que el generador no producía. Ese incidente es la señal de que el modelo del dominio tenía un hueco, y el remedio es **agregar el caso al generador**, no copiar producción.

La sección de consecuencias negativas es la que hace útil al ADR. Un ADR que solo lista ventajas es marketing.

## El generador determinista

Tres propiedades no negociables:

1. **Determinista.** La misma semilla produce el mismo dataset, siempre. Sin esto, un test que falla en CI no se reproduce localmente, y perdés la tarde.
2. **Referencialmente íntegro.** Toda transferencia apunta a cuentas que existen. El generador emite un grafo, no filas sueltas.
3. **Imposible de confundir con real.** Dominios `.invalid`, documentos con formato inválido, nombres de un diccionario ficticio.

```java
// Pseudocodigo didactico. NO es codigo listo para produccion.
public final class SyntheticAccountGenerator {

    private final Random rng;   // sembrado; NUNCA SecureRandom aca: queremos repetir

    public SyntheticAccountGenerator(long seed) {
        this.rng = new Random(seed);
    }

    public Account generate(int index) {
        return Account.builder()
            // 1) Identificador DETERMINISTA por indice, no aleatorio.
            //    acc_00001 siempre es la misma cuenta, en toda corrida.
            .accountId(String.format("acc_%05d", index))

            // 2) Nombre de un diccionario FICTICIO. Nunca un nombre real,
            //    ni siquiera "comun": un nombre comun es el nombre de alguien.
            .holderName(FICTIONAL_FIRST[rng.nextInt(FICTIONAL_FIRST.length)]
                        + " " + FICTIONAL_LAST[rng.nextInt(FICTIONAL_LAST.length)])

            // 3) Documento con formato DELIBERADAMENTE INVALIDO.
            //    El prefijo XX- garantiza que ninguna jurisdiccion lo acepte.
            .taxId(String.format("XX-%08d", index))

            // 4) RFC 2606 reserva .invalid para uso en ejemplos.
            //    Nunca se resolvera, nunca llegara un mail a nadie.
            .email("titular." + index + "@example.invalid")

            // 5) Dinero como entero en unidades minimas. Nunca float.
            .balanceMinor(rng.nextLong(0, 1_000_000_00L))
            .currency("USD")
            .build();
    }

    /**
     * Los casos limite viven ACA, con nombre, y se generan SIEMPRE.
     * Cada uno documenta un hecho del dominio que descubrimos alguna vez.
     */
    public List<Account> edgeCases() {
        return List.of(
            named("saldo-cero",            b -> b.balanceMinor(0L)),
            named("saldo-negativo-ajuste", b -> b.balanceMinor(-500_00L)),
            named("saldo-maximo",          b -> b.balanceMinor(Long.MAX_VALUE / 2)),
            named("nombre-con-apostrofe",  b -> b.holderName("O'Ficticio Sintetico")),
            named("nombre-unicode",        b -> b.holderName("Ficticio Ñúñez")),
            named("cuenta-cerrada",        b -> b.status(CLOSED)),
            named("moneda-retirada",       b -> b.currency("XTS"))   // ISO 4217: codigo de pruebas
        );
    }
}
```

Comentarios sobre las decisiones cargadas:

- **`Random` con semilla, no `SecureRandom`.** Suena mal y es correcto: acá querés reproducibilidad, no imprevisibilidad. `SecureRandom` en un generador de datos de prueba destruye la propiedad que más te importa.
- **El `taxId` empieza con `XX-`.** Un documento sintético que pasa la validación de checksum de una jurisdicción real puede coincidir con el de una persona real. El prefijo lo hace estructuralmente imposible.
- **`.invalid` está reservado por RFC 2606** precisamente para esto. Nunca resuelve. Un mail sintético a un dominio real que alguien registró es un mail a un desconocido.
- **`XTS` es el código ISO 4217 reservado para pruebas.** Otro caso donde el estándar ya te dio la respuesta.
- **`edgeCases()` es el corazón.** Cada entrada tiene nombre y representa un hecho del dominio. Cuando alguien descubre uno nuevo, se agrega acá. **El generador se vuelve la documentación de tu dominio**, y esa documentación es ejecutable.

### Reset: el procedimiento que hace confiable a todo lo demás

Un dataset de prueba sin procedimiento de reset acumula estado, y la acumulación de estado es la causa raíz de la mayoría de los tests flaky de integración.

```bash
# Propuesta reproducible. No ejecutado.
# El reset debe ser IDEMPOTENTE y RAPIDO. Si tarda, nadie lo corre.
make reset-test-data SEED=42

# Internamente:
#   1. TRUNCATE de las tablas de datos (no DROP: preserva el schema)
#   2. Genera el dataset base con la semilla dada
#   3. Inserta los edge cases, SIEMPRE, sin depender de la semilla
#   4. Verifica invariantes: FKs intactas, suma de asientos = 0
```

El paso 4 no es paranoia. Un generador con un bug produce datos que violan tus invariantes, y entonces tus tests de reconciliación fallan **por culpa de los datos**, no del sistema. Perdés días. **El generador se prueba a sí mismo**, y ese test es de los más rentables que vas a escribir.

## Si aun así necesitás enmascarar

Para el caso (d) del ADR —performance con volumen realista— o cuando la organización ya tiene una copia. Cuatro reglas:

1. **El enmascaramiento se hace en el origen, antes de que los datos salgan del entorno seguro.** Exportar y después enmascarar significa que existió, aunque sea un minuto, una copia sin enmascarar en un entorno menos protegido. Ese minuto es la brecha.

2. **Preservá la integridad referencial.** Si enmascarás `accountId` en la tabla de cuentas, tenés que aplicar **la misma transformación** en la tabla de transferencias. Enmascaramiento **consistente**: la misma entrada produce la misma salida, dentro del dominio de la sal.

3. **Enmascará los cuasi-identificadores, no solo los identificadores.** Borrar nombre y documento no alcanza si dejás fecha de nacimiento exacta + código postal + un saldo distintivo. Esa combinación reidentifica.

4. **Enmascará también los campos de texto libre.** El campo `descripcion` de una transferencia contiene, en cualquier sistema real, nombres, teléfonos y a veces documentos. Ninguna regla basada en el nombre de la columna lo detecta.

Y la advertencia que cierra: **un subset enmascarado sigue siendo dato personal hasta que puedas demostrar lo contrario**, y demostrarlo es un análisis de reidentificación, no una afirmación. Tratalo como personal: acceso restringido, retención corta, registro de accesos, entorno aislado.

## Anti-patrones

- **"Copiamos producción porque es más realista."** *Consecuencia:* pagás el costo de privacidad completo y obtenés cobertura aleatoria de casos raros. *Alternativa:* modelar el caso raro en el generador.
- **Generador no determinista.** *Consecuencia:* un fallo en CI no se reproduce localmente. *Alternativa:* semilla explícita, `Random` sembrado.
- **Documentos sintéticos con checksum válido.** *Alternativa:* prefijo estructuralmente inválido.
- **Correos sintéticos a dominios reales.** *Consecuencia:* le mandás mails a un desconocido. *Alternativa:* `.invalid` (RFC 2606).
- **Enmascarar después de exportar.** *Consecuencia:* existió una copia sin enmascarar. *Alternativa:* enmascarar en origen.
- **Enmascarar solo identificadores directos.** *Consecuencia:* los cuasi-identificadores reidentifican. *Alternativa:* analizar combinaciones; enmascarar texto libre.
- **Enmascaramiento inconsistente entre tablas.** *Consecuencia:* el dataset pierde integridad referencial y los tests fallan por los datos. *Alternativa:* transformación determinista por dominio de sal.
- **Dataset sin procedimiento de reset.** *Consecuencia:* acumulación de estado y flakiness. *Alternativa:* reset idempotente, rápido, con verificación de invariantes.
- **Generador sin tests.** *Consecuencia:* tus tests fallan por culpa de los datos y perdés días. *Alternativa:* el generador verifica sus propias invariantes.

## Qué publicar en GitHub

```text
tools/synthetic-data/                       # el generador
tools/synthetic-data/edge-cases.md          # cada caso límite, con el hecho del dominio que representa
tools/synthetic-data/GeneratorInvariantsTest.java
docs/adr/ADR-003-datos-sinteticos.md        # con la consecuencia negativa declarada
docs/privacy/test-data-policy.md            # qué se permite en cada ambiente
Makefile                                    # `make reset-test-data SEED=42`
```

## Qué aprendimos / próximos pasos

- El argumento del realismo está mal planteado: el subset no garantiza los casos raros y sí garantiza el riesgo.
- Los datos sintéticos son una **especificación ejecutable del dominio**. Cada caso límite con nombre es conocimiento capturado.
- Determinismo > imprevisibilidad, en datos de prueba.
- Los estándares ya te dieron los valores seguros: `.invalid` (RFC 2606), `XTS` (ISO 4217).
- El generador se prueba a sí mismo, o tus tests fallarán por culpa de los datos.
- Un subset enmascarado sigue siendo dato personal hasta que demuestres lo contrario.

**Siguiente:** [Telemetría, artefactos de CI y retención sin PII](/blog/telemetria-artefactos-de-ci-y-retencion-sin-pii/).

## Checklist final

- [ ] Existe un ADR con la decisión y sus **consecuencias negativas**.
- [ ] El generador es determinista y acepta semilla explícita.
- [ ] Los identificadores por índice son estables entre corridas.
- [ ] Los documentos sintéticos son estructuralmente inválidos.
- [ ] Los correos usan `.invalid`.
- [ ] La moneda de prueba usa el código reservado.
- [ ] Los casos límite viven en `edgeCases()`, con nombre, y se generan siempre.
- [ ] Existe `reset-test-data`, es idempotente y verifica invariantes.
- [ ] El generador tiene tests propios.
- [ ] Si hay subset enmascarado: se enmascara en origen, de forma consistente, incluyendo cuasi-identificadores y texto libre.
- [ ] Ningún dataset se declara "anónimo" sin un análisis de reidentificación.

---

## Fuentes (consultadas 2026-07-10)

- [RFC 2606 — Reserved Top Level DNS Names](https://www.rfc-editor.org/rfc/rfc2606) — `.invalid`, `.example`, `.test`.
- [RFC 6761 — Special-Use Domain Names](https://www.rfc-editor.org/rfc/rfc6761)
- [RFC 5737 — IPv4 Address Blocks Reserved for Documentation](https://www.rfc-editor.org/rfc/rfc5737) — `192.0.2.0/24` (TEST-NET-1), `198.51.100.0/24` (TEST-NET-2), `203.0.113.0/24` (TEST-NET-3). **No deben aparecer en la Internet pública.**
- [RFC 3849 — IPv6 Address Prefix Reserved for Documentation](https://www.rfc-editor.org/rfc/rfc3849) — `2001:db8::/32`.
- [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html) — `XTS` reservado para pruebas.
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) — versión **1.0** final; la 1.1 es borrador.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)

---
title: "Validar datos también es testear: contratos y quality gates para un pipeline de datos"
description: "Un endpoint que responde 200 no garantiza que los datos que mueve sean correctos. Cómo le apliqué mentalidad de QA a un pipeline ETL con contratos Pandera y checks de integridad SQL, para frenar los datos malos antes de que lleguen a un dashboard."
pubDate: 2026-06-28
tags: ['data-quality', 'pandera', 'sql', 'test-data', 'sdet']
cluster: '05'
clusterTitle: "Entornos y datos de prueba"
type: satelite
order: 2
readingLevel: "Intermedio"
prerequisites: "SQL básico y nociones de pandas."
repo: "data-quality-testing"
icon: 'set'
iconHue: 190
---

Durante mucho tiempo pensé el testing como algo que le pasa al *código*: funciones, endpoints, botones. Los datos eran "lo que entra y sale", no algo que se testeara. Hasta que entendí que en muchos productos —fintech, analytics, cualquier cosa con un dashboard— **el defecto más caro no está en el código, está en los datos que ese código mueve.**

Un pipeline puede estar perfecto —tests verdes, endpoints en 200— y aun así cargar a la base una transacción con monto negativo, una moneda que no existe, o una que apunta a una cuenta que fue borrada. El código "funcionó". Los datos son basura. Y esa basura aparece tres semanas después, en un reporte que no cuadra, cuando ya nadie se acuerda de dónde salió.

Este post es cómo le apliqué mentalidad de QA a un pipeline de datos, en [`data-quality-testing`](https://github.com/fercarballo/data-quality-testing).

## La idea: tratar el dato como un artefacto que merece pruebas

Si a una función le ponés precondiciones y postcondiciones, ¿por qué no hacerlo con un dataset? Esa es toda la tesis. Puse **contratos** en las fronteras del pipeline: qué debe cumplir el dato que entra, y qué garantizo del dato que sale.

```text
   CSV crudo                          cuentas
      │                                  │
      ▼                                  ▼
 ┌────────────────────────────────────────────┐
 │  CONTRATO DE ENTRADA (Pandera)             │  ← ¿tipos, dominios,
 │  tipos · rangos · unicidad · no-nulos      │     unicidad correctos?
 └────────────────────────────────────────────┘
      │   ✗ → RECHAZO con fila + regla exactas
      ▼
 ┌────────────────────────────────────────────┐
 │  TRANSFORMACIÓN (reglas de negocio)        │
 └────────────────────────────────────────────┘
      ▼
 ┌────────────────────────────────────────────┐
 │  CONTRATO DE SALIDA (Pandera)              │  ← ¿la transformación
 │  garantías sobre columnas derivadas        │     produjo datos válidos?
 └────────────────────────────────────────────┘
      ▼   cargar a la base
 ┌────────────────────────────────────────────┐
 │  INTEGRIDAD SQL (relacional)               │  ← lo que un contrato
 │  referencial · unicidad global · sumas     │     de UNA tabla no ve
 └────────────────────────────────────────────┘
      ▼
   ✅ datos confiables   /   ❌ el gate frena (exit 1)
```

## Contratos con Pandera: precondiciones para dataframes

[Pandera](https://pandera.readthedocs.io) deja declarar un esquema como quien escribe una especificación. Se lee casi como documentación, pero es ejecutable:

```python
RAW_TRANSACTIONS = DataFrameSchema(
    strict=True,   # columna de más = error (esquema cerrado)
    coerce=True,   # normaliza tipos donde es seguro
    columns={
        "transaction_id": Column(str, Check.str_matches(r"^TX-\d{3,}$"), unique=True),
        "amount":         Column(float, Check.gt(0)),           # el signo lo lleva el tipo
        "currency":       Column(str, Check.isin(["ARS", "USD"])),
        "type":           Column(str, Check.isin(["credit", "debit"])),
    },
)
```

Cuando algo no cumple, no falla con un error críptico: te dice **qué fila y qué regla**. Con `lazy=True` junta *todas* las violaciones de una pasada, en vez de morir en la primera. Es la diferencia entre "hay algo mal" y "estas 6 filas violan estas 4 reglas, acá están".

Un detalle que me gustó: separar el contrato de **entrada** del de **salida**. El de entrada valida lo que *recibo* (potencialmente sucio). El de salida valida lo que *entrego* después de transformar — y ahí atrapo mis propios bugs. Si rompo el cálculo de una columna derivada y empieza a producir negativos, el contrato de salida lo frena antes de que toque la base.

## Lo que un contrato de dataframe NO puede ver

Acá está la lección más importante, y la que separa un pipeline con validación de juguete de uno serio.

Pandera valida **una tabla por vez**. Pero los peores bugs de datos viven *entre* tablas y *entre* filas: una transacción que referencia una cuenta que no existe, un duplicado que aparece recién al juntar dos lotes, una suma que no reconcilia. Eso un contrato de una tabla no lo ve. Para eso bajo a **SQL**:

```sql
-- integridad referencial: transacciones que apuntan a una cuenta inexistente
SELECT t.transaction_id
FROM transactions t
LEFT JOIN accounts a ON t.account_id = a.account_id
WHERE a.account_id IS NULL;   -- 0 filas = OK. Cualquier fila = dato huérfano.
```

El patrón que uso: **cada check es una consulta que devuelve las filas ofensoras.** Cero filas, check verde. Simple de leer, de extender y de depurar.

El ejemplo que lo resume todo, del repo: una transacción con `account_id = "ACC-77"`.

| Frontera | Resultado | Por qué |
|---|---|---|
| Contrato de entrada | ✅ pasa | `"ACC-77"` respeta el formato `^ACC-\d{2,}$` |
| Contrato de salida | ✅ pasa | la transformación funciona sobre esa fila |
| Integridad SQL | ❌ **falla** | `ACC-77` no existe en `accounts` |

Sin la tercera frontera, ese dato entra a la base y rompe un reporte semanas después. Con ella, el gate lo frena hoy. **Ningún nivel solo alcanza; cada uno cubre lo que los otros no ven.**

## El quality gate: exit 0 o exit 1

Todo esto se junta en un comando que devuelve un código de salida, pensado para vivir en un pipeline de CI:

```bash
python -m dq transacciones.csv cuentas.csv
#  ✅ QUALITY GATE: OK — 8 filas validadas y cargadas   → exit 0
#  ❌ QUALITY GATE: RECHAZADO (integridad referencial)  → exit 1
```

Y el CI hace algo que me parece clave: **verifica que el gate rechace lo que tiene que rechazar.** Corre el gate contra un dataset roto a propósito y falla si el gate lo deja pasar. Es testear al control de calidad — porque un gate que nunca probaste que frena, no sabés si frena.

## Por qué esto es QA, no "cosa de data engineers"

Lo veo exactamente igual que testear una API: definir qué es "correcto", poner la verificación en la frontera adecuada, y hacer que el sistema frene solo cuando algo no cumple. Cambia el artefacto —un dataframe en vez de un endpoint— pero el criterio es idéntico: precondiciones, postcondiciones, invariantes, y un gate que no negocia.

Y es una habilidad que suma un montón, porque cada vez más productos se apoyan en datos y en modelos que comen esos datos. Un dato malo aguas arriba envenena todo lo que viene después —incluido cualquier modelo de IA que entrenes o evalúes con él—. Poner la vara de calidad ahí, temprano, es de las cosas de más impacto que puede hacer alguien de QA hoy.

> El pipeline completo —contratos de entrada y salida, los cinco checks SQL y el gate que se auto-valida— está en [`data-quality-testing`](https://github.com/fercarballo/data-quality-testing), con 100% de cobertura y dos documentos que explican las tres fronteras y cuándo usar Pandera vs SQL.

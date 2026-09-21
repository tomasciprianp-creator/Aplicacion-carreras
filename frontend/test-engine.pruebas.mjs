// test-engine.pruebas.mjs
//
// Pruebas automatizadas para test-engine.js.
//
// NOTA SOBRE CÓMO CORRER ESTO: test-engine.js importa @supabase/supabase-js
// directamente desde esm.sh (import de red, pensado para navegador, sin
// bundler). Node ya NO soporta imports por URL — la bandera
// --experimental-network-imports que existía en versiones viejas fue
// removida. Verificado en Node v22.
//
// Para correr estas pruebas con `node`, hay que darle a Node una copia local
// del paquete:
//
//   npm init -y
//   npm install @supabase/supabase-js
//
// y cambiar SOLO en una copia de prueba (o vía un alias/import-map) la línea
// de test-engine.js de:
//   import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// a:
//   import { createClient } from "@supabase/supabase-js";
//
// El archivo de producción (el que corre en el navegador) puede quedarse con
// el import por URL — ese sí funciona nativo en cualquier navegador moderno,
// sin build step. Pendiente decidir si vale la pena mantener las dos
// versiones del import o migrar todo a npm + un bundler simple (Vite).
//
// Cobertura:
// 1. calcularPerfilDimensiones — función pura, sin red, probada exhaustivamente.
// 2. filtrarUniversidadesPorPresupuesto y obtenerAreasCandidatas — se prueban
//    con un mock de `supabase` (se sobreescriben sus métodos antes de llamar),
//    para no depender de una base de datos real ni de credenciales.

import test from "node:test";
import assert from "node:assert/strict";
import { supabase, calcularPerfilDimensiones, filtrarUniversidadesPorPresupuesto, obtenerAreasCandidatas } from "./test-engine.js";

// ===========================================================================
// 1. calcularPerfilDimensiones
// ===========================================================================

// Helper: construye un set de respuestas Likert + catálogo de preguntas a
// partir de un mapa { dimension: [valores] }.
function construirCaso(valoresPorDimension) {
  const preguntas = [];
  const respuestas = [];
  let id = 1;

  for (const [dimension, valores] of Object.entries(valoresPorDimension)) {
    for (const valor of valores) {
      preguntas.push({ id, dimensiones: { nombre: dimension } });
      respuestas.push({ pregunta_id: id, valor });
      id++;
    }
  }

  return { preguntas, respuestas };
}

test("perfil claro (top-2) cuando la diferencia 2da vs 3ra suma > 2", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),      // suma 35
    Social: Array(7).fill(4),         // suma 28
    Creativo: Array(7).fill(2),       // suma 14 -> diferencia 28-14=14, > 2
    Tecnico: Array(7).fill(1),        // suma 7
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  assert.equal(resultado.es_perfil_disperso, false);
  assert.deepEqual(resultado.perfil_dimensiones, ["Analitico", "Social"]);
});

test("perfil disperso (top-3) cuando la diferencia 2da vs 3ra suma es <= 2", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),      // suma 35
    Social: Array(7).fill(4),         // suma 28
    Creativo: [4, 4, 4, 4, 4, 4, 3],  // suma 27 -> diferencia 28-27=1, <= 2
    Tecnico: Array(7).fill(1),        // suma 7
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  assert.equal(resultado.es_perfil_disperso, true);
  assert.deepEqual(resultado.perfil_dimensiones, ["Analitico", "Social", "Creativo"]);
});

test("empate exacto entre 2da y 3ra cuenta como perfil disperso (diferencia = 0)", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),  // 35
    Social: Array(7).fill(3),     // 21
    Creativo: Array(7).fill(3),   // 21 -> empate exacto con Social
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  assert.equal(resultado.es_perfil_disperso, true);
  assert.equal(resultado.perfil_dimensiones.length, 3);
});

test("diferencia de exactamente 2 pasos todavía cuenta como casi empate (límite inclusivo)", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),           // 35
    Social: [4, 4, 4, 4, 4, 4, 4],          // 28
    Creativo: [4, 4, 4, 4, 4, 4, 2],        // 26 -> diferencia 28-26=2, límite exacto
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  assert.equal(resultado.es_perfil_disperso, true);
});

test("diferencia de 3 pasos ya NO cuenta como casi empate", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),           // 35
    Social: [4, 4, 4, 4, 4, 4, 4],          // 28
    Creativo: [4, 4, 4, 4, 4, 4, 1],        // 25 -> diferencia 28-25=3
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  assert.equal(resultado.es_perfil_disperso, false);
  assert.deepEqual(resultado.perfil_dimensiones, ["Analitico", "Social"]);
});

test("con menos de 3 dimensiones respondidas, nunca es perfil disperso", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),
    Social: Array(7).fill(5),
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  assert.equal(resultado.es_perfil_disperso, false);
  assert.deepEqual(resultado.perfil_dimensiones, ["Analitico", "Social"]);
});

test("puntaje normalizado: suma mínima (7) da 0, suma máxima (35) da 100", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),  // suma 35 -> puntaje 100
    Social: Array(7).fill(1),     // suma 7  -> puntaje 0
    Creativo: Array(7).fill(3),   // suma 21 -> puntaje 50
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);
  const porNombre = Object.fromEntries(resultado.puntajes.map((p) => [p.dimension, p.puntaje]));

  assert.equal(porNombre.Analitico, 100);
  assert.equal(porNombre.Social, 0);
  assert.equal(porNombre.Creativo, 50);
});

test("ignora respuestas cuya pregunta_id no existe en el catálogo", () => {
  const { preguntas, respuestas } = construirCaso({
    Analitico: Array(7).fill(5),
    Social: Array(7).fill(3),
    Creativo: Array(7).fill(3),
  });

  // Respuesta "huérfana": no corresponde a ninguna pregunta del catálogo.
  respuestas.push({ pregunta_id: 9999, valor: 5 });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);

  // No debe crear una dimensión fantasma ni reventar.
  const dimensionesEnPuntajes = resultado.puntajes.map((p) => p.dimension);
  assert.equal(dimensionesEnPuntajes.length, 3);
});

test("las dimensiones se ordenan de mayor a menor suma", () => {
  const { preguntas, respuestas } = construirCaso({
    Bajo: Array(7).fill(1),
    Alto: Array(7).fill(5),
    Medio: Array(7).fill(3),
  });

  const resultado = calcularPerfilDimensiones(respuestas, preguntas);
  const orden = resultado.puntajes.map((p) => p.dimension);

  assert.deepEqual(orden, ["Alto", "Medio", "Bajo"]);
});

// ===========================================================================
// 2. filtrarUniversidadesPorPresupuesto (con mock de supabase)
// ===========================================================================

function mockSupabaseFrom(tabla, filas) {
  supabase.from = (nombreTabla) => {
    assert.equal(nombreTabla, tabla);
    return {
      select: () => Promise.resolve({ data: filas, error: null }),
    };
  };
}

test("universidad tipo 'fijo' dentro de presupuesto pasa el filtro", async () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "fijo", costo_fijo: 3000000, costos_por_estrato: [] },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 3000000,
    estrato: 3,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });

  assert.deepEqual(resultado, [1]);
});

test("universidad tipo 'fijo' fuera de presupuesto NO pasa el filtro", async () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "fijo", costo_fijo: 5000000, costos_por_estrato: [] },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 3000000,
    estrato: 3,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });

  assert.deepEqual(resultado, []);
});

test("matricula_cero califica con estrato <= 3, sin importar presupuesto", () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "matricula_cero", costos_por_estrato: [] },
  ]);

  return filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 0,
    estrato: 2,
    sisbenGrupo: null,
    ciudadPreferida: null,
  }).then((resultado) => assert.deepEqual(resultado, [1]));
});

test("matricula_cero califica con Sisbén A/B/C aunque el estrato sea alto", async () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "matricula_cero", costos_por_estrato: [] },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 0,
    estrato: 6,
    sisbenGrupo: "B",
    ciudadPreferida: null,
  });

  assert.deepEqual(resultado, [1]);
});

test("matricula_cero NO califica sin estrato bajo ni Sisbén elegible", async () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "matricula_cero", costos_por_estrato: [] },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 5000000,
    estrato: 6,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });

  assert.deepEqual(resultado, []);
});

test("variable_estrato SIN estrato conocido se excluye por seguridad", async () => {
  mockSupabaseFrom("universidades", [
    {
      id: 1,
      ciudad: "Bogotá",
      tipo_costo: "variable_estrato",
      costos_por_estrato: [{ estrato: 3, costo: 1000000 }],
    },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 5000000,
    estrato: null,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });

  assert.deepEqual(resultado, []);
});

test("variable_estrato CON estrato conocido usa el costo de esa fila", async () => {
  mockSupabaseFrom("universidades", [
    {
      id: 1,
      ciudad: "Bogotá",
      tipo_costo: "variable_estrato",
      costos_por_estrato: [
        { estrato: 2, costo: 500000 },
        { estrato: 3, costo: 4000000 },
      ],
    },
  ]);

  const dentro = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 1000000,
    estrato: 2,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });
  assert.deepEqual(dentro, [1]);

  const fuera = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 1000000,
    estrato: 3,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });
  assert.deepEqual(fuera, []);
});

test("filtra por ciudadPreferida cuando se especifica", async () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "fijo", costo_fijo: 1000000, costos_por_estrato: [] },
    { id: 2, ciudad: "Medellín", tipo_costo: "fijo", costo_fijo: 1000000, costos_por_estrato: [] },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 5000000,
    estrato: 3,
    sisbenGrupo: null,
    ciudadPreferida: "Bogotá",
  });

  assert.deepEqual(resultado, [1]);
});

test("sin ciudadPreferida no filtra por ciudad", async () => {
  mockSupabaseFrom("universidades", [
    { id: 1, ciudad: "Bogotá", tipo_costo: "fijo", costo_fijo: 1000000, costos_por_estrato: [] },
    { id: 2, ciudad: "Medellín", tipo_costo: "fijo", costo_fijo: 1000000, costos_por_estrato: [] },
  ]);

  const resultado = await filtrarUniversidadesPorPresupuesto({
    presupuestoMax: 5000000,
    estrato: 3,
    sisbenGrupo: null,
    ciudadPreferida: null,
  });

  assert.deepEqual(resultado.sort(), [1, 2]);
});

// ===========================================================================
// 3. obtenerAreasCandidatas (con mock de supabase)
// ===========================================================================

test("perfil de 2 dimensiones consulta un solo par", async () => {
  let llamadasAMapeo = 0;

  supabase.from = (tabla) => {
    if (tabla === "dimensiones") {
      return {
        select: () =>
          Promise.resolve({
            data: [
              { id: 1, nombre: "Analitico" },
              { id: 2, nombre: "Social" },
              { id: 3, nombre: "Creativo" },
            ],
            error: null,
          }),
      };
    }
    if (tabla === "mapeo_dimensiones_areas") {
      llamadasAMapeo++;
      return {
        select: () => ({
          or: () =>
            Promise.resolve({
              data: [{ areas_carrera: { nombre: "Economía" } }, { areas_carrera: { nombre: "Derecho" } }],
              error: null,
            }),
        }),
      };
    }
    throw new Error(`Tabla inesperada en el mock: ${tabla}`);
  };

  const areas = await obtenerAreasCandidatas(["Analitico", "Social"]);

  assert.equal(llamadasAMapeo, 1);
  assert.deepEqual(areas.sort(), ["Derecho", "Economía"]);
});

test("perfil disperso de 3 dimensiones consulta las 3 combinaciones y une sin duplicados", async () => {
  let llamadasAMapeo = 0;

  supabase.from = (tabla) => {
    if (tabla === "dimensiones") {
      return {
        select: () =>
          Promise.resolve({
            data: [
              { id: 1, nombre: "Analitico" },
              { id: 2, nombre: "Social" },
              { id: 3, nombre: "Creativo" },
            ],
            error: null,
          }),
      };
    }
    if (tabla === "mapeo_dimensiones_areas") {
      llamadasAMapeo++;
      // Cada combinación devuelve "Economía" repetido a propósito, para
      // confirmar que el resultado final no tiene duplicados.
      return {
        select: () => ({
          or: () =>
            Promise.resolve({
              data: [{ areas_carrera: { nombre: "Economía" } }],
              error: null,
            }),
        }),
      };
    }
    throw new Error(`Tabla inesperada en el mock: ${tabla}`);
  };

  const areas = await obtenerAreasCandidatas(["Analitico", "Social", "Creativo"]);

  assert.equal(llamadasAMapeo, 3); // 3 pares posibles entre 3 dimensiones
  assert.deepEqual(areas, ["Economía"]); // unión sin duplicados
});

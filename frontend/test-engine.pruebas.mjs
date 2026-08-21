// test-engine.js
//
// Motor determinístico del test vocacional. Todo lo que hay en este archivo
// corre en el navegador, SIN IA — el cálculo del perfil, el mapeo a áreas de
// carrera, y el filtro de universidades por presupuesto son 100%
// reproducibles y auditables. La única llamada con IA pasa por la Edge
// Function `interpretar-resultado`, al final del flujo (ver generarResultado).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Configuración — reemplazar con los valores reales del proyecto.
// La anon key es pública por diseño (Supabase la protege con RLS, no la
// oculta), así que es seguro que viva en el cliente.
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/interpretar-resultado`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Carga de preguntas (catálogo — se usa para renderizar el test)
// ---------------------------------------------------------------------------

export async function cargarPreguntasLikert() {
  const { data, error } = await supabase
    .from("preguntas_likert")
    .select("id, texto, orden, dimension_id, dimensiones(nombre)")
    .order("orden");
  if (error) throw new Error(`Error cargando preguntas Likert: ${error.message}`);
  return data;
}

export async function cargarPreguntasAbiertas() {
  const { data, error } = await supabase
    .from("preguntas_abiertas")
    .select("id, texto, orden")
    .order("orden");
  if (error) throw new Error(`Error cargando preguntas abiertas: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Cálculo del perfil de dimensiones — determinístico, fórmula fija.
//
// 7 preguntas Likert (1-5) por dimensión → suma entera posible: 7 a 35.
// "Casi empate" se define en PASOS DE SUMA ENTERA, no en puntaje normalizado
// con decimales — esto evita el problema de precisión de punto flotante que
// tenía la versión anterior (umbral fijo de 8.33 contra un paso real de
// 8.3333...). Comparar enteros es exacto: no hay ambigüedad posible.
//
// respuestasLikert: array de { pregunta_id, valor (1-5) }
// preguntas: el array devuelto por cargarPreguntasLikert (para saber a qué
// dimensión pertenece cada pregunta)
// ---------------------------------------------------------------------------

const PREGUNTAS_POR_DIMENSION = 7;
const MIN_SUMA = PREGUNTAS_POR_DIMENSION;      // 7
const MAX_SUMA = PREGUNTAS_POR_DIMENSION * 5;  // 35
const PASOS_CASI_EMPATE = 2; // "hasta 2 pasos de diferencia cuentan como casi empate"

export function calcularPerfilDimensiones(respuestasLikert, preguntas) {
  // Agrupar valores por dimensión.
  const valoresPorDimension = new Map(); // nombre dimensión -> [valores 1-5]

  for (const respuesta of respuestasLikert) {
    const pregunta = preguntas.find((p) => p.id === respuesta.pregunta_id);
    if (!pregunta) continue;
    const nombreDimension = pregunta.dimensiones.nombre;
    if (!valoresPorDimension.has(nombreDimension)) valoresPorDimension.set(nombreDimension, []);
    valoresPorDimension.get(nombreDimension).push(respuesta.valor);
  }

  // Cada dimensión guarda su suma ENTERA (7-35) además del puntaje
  // normalizado 0-100 (el normalizado es solo para mostrar/ordenar; la
  // decisión de "casi empate" se toma siempre sobre la suma entera).
  const puntajes = []; // [{ dimension, suma, puntaje }]
  for (const [dimension, valores] of valoresPorDimension.entries()) {
    const suma = valores.reduce((acc, v) => acc + v, 0);
    const puntaje = ((suma - MIN_SUMA) / (MAX_SUMA - MIN_SUMA)) * 100;
    puntajes.push({ dimension, suma, puntaje });
  }

  puntajes.sort((a, b) => b.suma - a.suma);

  // "Casi empate" = la diferencia de SUMA ENTERA entre la 2ª y 3ª dimensión
  // es de a lo sumo PASOS_CASI_EMPATE (2) preguntas de diferencia.
  const diferenciaSumas2vs3 = puntajes.length >= 3 ? puntajes[1].suma - puntajes[2].suma : Infinity;
  const esPerfilDisperso = diferenciaSumas2vs3 <= PASOS_CASI_EMPATE;

  const dimensionesElegidas = esPerfilDisperso
    ? puntajes.slice(0, 3).map((p) => p.dimension)
    : puntajes.slice(0, 2).map((p) => p.dimension);

  return {
    perfil_dimensiones: dimensionesElegidas,
    es_perfil_disperso: esPerfilDisperso,
    puntajes, // se guarda completo (suma + puntaje normalizado) por si se quiere mostrar un detalle visual
  };
}

// ---------------------------------------------------------------------------
// Áreas de carrera candidatas — consulta la tabla de mapeo en Supabase.
//
// Regla: para 2 dimensiones, un solo par. Para 3 dimensiones (perfil
// disperso), se consultan las 3 combinaciones pareadas posibles y se hace la
// unión sin duplicados.
// ---------------------------------------------------------------------------

function combinacionesDePares(dimensiones) {
  const pares = [];
  for (let i = 0; i < dimensiones.length; i++) {
    for (let j = i + 1; j < dimensiones.length; j++) {
      pares.push([dimensiones[i], dimensiones[j]]);
    }
  }
  return pares;
}

export async function obtenerAreasCandidatas(perfilDimensiones) {
  const { data: todasLasDimensiones, error: errorDim } = await supabase
    .from("dimensiones")
    .select("id, nombre");
  if (errorDim) throw new Error(`Error cargando dimensiones: ${errorDim.message}`);

  const idPorNombre = new Map(todasLasDimensiones.map((d) => [d.nombre, d.id]));
  const pares = combinacionesDePares(perfilDimensiones);

  const areasEncontradas = new Set();

  for (const [dim1, dim2] of pares) {
    const id1 = idPorNombre.get(dim1);
    const id2 = idPorNombre.get(dim2);

    // La tabla de mapeo no garantiza un orden fijo de columnas para el par,
    // así que se consulta en ambos sentidos.
    const { data, error } = await supabase
      .from("mapeo_dimensiones_areas")
      .select("areas_carrera(nombre)")
      .or(
        `and(dimension_1_id.eq.${id1},dimension_2_id.eq.${id2}),and(dimension_1_id.eq.${id2},dimension_2_id.eq.${id1})`,
      );

    if (error) throw new Error(`Error consultando mapeo de áreas: ${error.message}`);

    for (const fila of data ?? []) {
      areasEncontradas.add(fila.areas_carrera.nombre);
    }
  }

  return [...areasEncontradas];
}

// ---------------------------------------------------------------------------
// Filtro de universidades por presupuesto — determinístico, corre antes que
// cualquier interpretación de IA.
// ---------------------------------------------------------------------------

export async function filtrarUniversidadesPorPresupuesto({ presupuestoMax, estrato, sisbenGrupo, ciudadPreferida }) {
  const { data: universidades, error } = await supabase
    .from("universidades")
    .select("id, nombre, ciudad, tipo_costo, costo_fijo, ayuda_financiera, fuente, costos_por_estrato(estrato, costo)");

  if (error) throw new Error(`Error cargando universidades: ${error.message}`);

  const gruposSisbenElegibles = ["A", "B", "C"];

  return (universidades ?? [])
    .filter((u) => !ciudadPreferida || u.ciudad === ciudadPreferida)
    .filter((u) => {
      if (u.tipo_costo === "matricula_cero") {
        // Matrícula Cero aplica a estrato 1-3 o Sisbén A/B/C.
        const califica =
          (estrato != null && estrato <= 3) ||
          (sisbenGrupo != null && gruposSisbenElegibles.includes(sisbenGrupo));
        return califica;
      }

      if (u.tipo_costo === "fijo") {
        return u.costo_fijo <= presupuestoMax;
      }

      // variable_estrato: si no se conoce el estrato del estudiante, no se
      // puede afirmar que está dentro de presupuesto — se excluye por
      // seguridad en vez de asumir el valor más bajo.
      if (estrato == null) return false;
      const filaEstrato = (u.costos_por_estrato ?? []).find((c) => c.estrato === estrato);
      if (!filaEstrato) return false;
      return filaEstrato.costo <= presupuestoMax;
    })
    .map((u) => u.id); // el frontend solo necesita los ids: la Edge Function
                        // vuelve a consultar el detalle completo por seguridad
                        // (ver interpretar-resultado/index.ts)
}

// ---------------------------------------------------------------------------
// Persistencia de la sesión y las respuestas del estudiante
// ---------------------------------------------------------------------------

export async function crearSesion({ presupuestoMax, estrato, sisbenGrupo, ciudadPreferida }) {
  const { data, error } = await supabase
    .from("sesiones_test")
    .insert({
      presupuesto_semestre_max: presupuestoMax,
      estrato: estrato ?? null,
      sisben_grupo: sisbenGrupo ?? null,
      ciudad_preferida: ciudadPreferida ?? "Bogotá",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Error creando sesión: ${error.message}`);
  return data.id;
}

export async function guardarRespuestasLikert(sesionId, respuestas) {
  const filas = respuestas.map((r) => ({ sesion_id: sesionId, pregunta_id: r.pregunta_id, valor: r.valor }));
  const { error } = await supabase.from("respuestas_likert").insert(filas);
  if (error) throw new Error(`Error guardando respuestas Likert: ${error.message}`);
}

export async function guardarRespuestasAbiertas(sesionId, respuestas) {
  const filas = respuestas.map((r) => ({ sesion_id: sesionId, pregunta_id: r.pregunta_id, respuesta: r.respuesta }));
  const { error } = await supabase.from("respuestas_abiertas").insert(filas);
  if (error) throw new Error(`Error guardando respuestas abiertas: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Cierre del flujo: llama a la Edge Function (única parte con IA).
// ---------------------------------------------------------------------------

export async function generarResultado({ sesionId, universidadIds, perfilDimensiones, esPerfilDisperso, areasCandidatas, email }) {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // La Edge Function corre con service role internamente, pero el request
      // HTTP en sí sigue necesitando la anon key para pasar el gateway de Supabase.
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      accion: "generar_resultado",
      sesion_id: sesionId,
      universidad_ids: universidadIds,
      perfil_dimensiones: perfilDimensiones,
      es_perfil_disperso: esPerfilDisperso,
      areas_candidatas: areasCandidatas,
      email: email || undefined,
    }),
  });

  if (!response.ok) throw new Error(`Error generando resultado: ${response.status}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Orquestador de alto nivel — junta todos los pasos anteriores.
// Esto es lo que llamaría la pantalla final del test, con todas las
// respuestas ya recolectadas por la interfaz.
// ---------------------------------------------------------------------------

export async function completarTest({
  presupuestoMax, estrato, sisbenGrupo, ciudadPreferida,
  respuestasLikert, preguntasLikert, respuestasAbiertas,
  email,
}) {
  const sesionId = await crearSesion({ presupuestoMax, estrato, sisbenGrupo, ciudadPreferida });

  await Promise.all([
    guardarRespuestasLikert(sesionId, respuestasLikert),
    guardarRespuestasAbiertas(sesionId, respuestasAbiertas),
  ]);

  const { perfil_dimensiones, es_perfil_disperso } = calcularPerfilDimensiones(respuestasLikert, preguntasLikert);
  const areasCandidatas = await obtenerAreasCandidatas(perfil_dimensiones);
  const universidadIds = await filtrarUniversidadesPorPresupuesto({ presupuestoMax, estrato, sisbenGrupo, ciudadPreferida });

  const resultado = await generarResultado({
    sesionId,
    universidadIds,
    perfilDimensiones: perfil_dimensiones,
    esPerfilDisperso: es_perfil_disperso,
    areasCandidatas,
    email,
  });

  return { sesionId, resultado };
}

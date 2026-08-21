-- =============================================================================
-- SCHEMA: Plataforma de Orientación Universitaria
-- =============================================================================
-- Arquitectura de referencia (ya definida en sesiones anteriores):
--   1. Capa determinística: filtro de presupuesto + test Likert (18 preguntas,
--      6 dimensiones) + tabla de mapeo dimensión→área. Corre en el cliente.
--   2. Capa de IA: solo interpreta lo ya calculado (Edge Function
--      interpretar-resultado). Nunca decide ni inventa.
--   3. Capa de validación: la Edge Function valida el output de la IA contra
--      estos mismos datos antes de guardarlo/mostrarlo.
--
-- Este schema refleja los 3 casos de costo definidos en la sesión anterior:
--   fijo | variable_estrato | matricula_cero
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSIONES
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- -----------------------------------------------------------------------------
-- 1. UNIVERSIDADES
-- -----------------------------------------------------------------------------
create type tipo_costo as enum ('fijo', 'variable_estrato', 'matricula_cero');
create type tipo_calendario as enum ('semestral', 'no_semestral');

create table universidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  ciudad text not null default 'Bogotá',

  tipo_costo tipo_costo not null,
  -- Solo se usa si tipo_costo = 'fijo'. Para 'variable_estrato' el costo vive
  -- en la tabla costos_por_estrato; para 'matricula_cero' se ignora (es 0).
  costo_fijo numeric(12, 0),

  calendario tipo_calendario not null default 'semestral',
  periodos_por_anio int not null default 2, -- ej. El Bosque = 5

  ayuda_financiera text, -- descripción libre de becas/créditos propios de la universidad
  fuente text not null,  -- de dónde salió el dato (para trazabilidad)
  fuente_confiable boolean not null default true, -- false = "no oficial", pendiente de verificar

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Un costo_fijo solo tiene sentido si tipo_costo = 'fijo'; se exige explícitamente
  -- para que la Edge Function nunca reciba un registro ambiguo.
  constraint costo_fijo_coherente check (
    (tipo_costo = 'fijo' and costo_fijo is not null) or
    (tipo_costo != 'fijo' and costo_fijo is null)
  )
);

comment on column universidades.fuente_confiable is
  'false marca datos de agregadores no verificados contra la fuente oficial (ej. Externado, EAFIT, Icesi al momento del research)';

-- -----------------------------------------------------------------------------
-- 2. COSTOS POR ESTRATO (solo para universidades con tipo_costo = 'variable_estrato')
-- -----------------------------------------------------------------------------
create table costos_por_estrato (
  id uuid primary key default gen_random_uuid(),
  universidad_id uuid not null references universidades(id) on delete cascade,
  estrato int not null check (estrato between 1 and 6),
  costo numeric(12, 0) not null,

  unique (universidad_id, estrato)
);

-- -----------------------------------------------------------------------------
-- 3. DIMENSIONES Y ÁREAS DE CARRERA
-- -----------------------------------------------------------------------------
create table dimensiones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique -- Analítico, Técnico, Social, Creativo, Organizacional, Investigativo
);

create table areas_carrera (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text
);

-- -----------------------------------------------------------------------------
-- 4. TABLA DE MAPEO DIMENSIÓN → ÁREA (las 15 combinaciones C(6,2) ya definidas)
-- -----------------------------------------------------------------------------
-- Cada fila conecta un PAR de dimensiones con UNA área candidata resultante.
-- Un mismo par (dim_1, dim_2) puede tener varias filas (varias áreas resultantes).
-- Convención: dimension_1_id siempre debe ser < dimension_2_id (por UUID no aplica
-- orden natural, así que se ordena por nombre en la app al insertar) para evitar
-- duplicar el mismo par en ambos sentidos.
create table mapeo_dimensiones_areas (
  id uuid primary key default gen_random_uuid(),
  dimension_1_id uuid not null references dimensiones(id),
  dimension_2_id uuid not null references dimensiones(id),
  area_id uuid not null references areas_carrera(id),

  constraint dimensiones_distintas check (dimension_1_id != dimension_2_id),
  unique (dimension_1_id, dimension_2_id, area_id)
);

create index idx_mapeo_dim1 on mapeo_dimensiones_areas(dimension_1_id);
create index idx_mapeo_dim2 on mapeo_dimensiones_areas(dimension_2_id);

-- -----------------------------------------------------------------------------
-- 5. PREGUNTAS DEL TEST
-- -----------------------------------------------------------------------------
create table preguntas_likert (
  id uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references dimensiones(id),
  texto text not null,
  orden int not null unique -- 1 a 18, controla el orden de presentación
);

create table preguntas_abiertas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  orden int not null unique -- 1 a 3
);

-- -----------------------------------------------------------------------------
-- 6. SESIÓN DE TEST (una por estudiante que hace el test; anónima, sin login)
-- -----------------------------------------------------------------------------
create table sesiones_test (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),

  -- Datos de presupuesto/filtro capturados al inicio del test.
  presupuesto_semestre_max numeric(12, 0) not null,
  estrato int check (estrato between 1 and 6), -- nullable: el estudiante puede no saberlo
  sisben_grupo text,                            -- 'A', 'B', 'C' o null
  ciudad_preferida text default 'Bogotá',

  -- Email opcional para poder reenviar el resultado (el estudiante puede
  -- perder el link con el uuid de su sesión). Nunca es requerido para hacer
  -- el test — se pide, en el mejor de los casos, justo antes de mostrar el
  -- resultado ("¿quieres que también te lo enviemos por correo?").
  email text,
  email_enviado boolean not null default false,
  email_enviado_en timestamptz,

  completado boolean not null default false,

  constraint email_formato_valido check (
    email is null or email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

comment on column sesiones_test.email is
  'Opcional. Se captura solo si el estudiante quiere recibir su resultado por correo — nunca es obligatorio para completar el test';

-- -----------------------------------------------------------------------------
-- 7. RESPUESTAS DEL ESTUDIANTE
-- -----------------------------------------------------------------------------
create table respuestas_likert (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesiones_test(id) on delete cascade,
  pregunta_id uuid not null references preguntas_likert(id),
  valor int not null check (valor between 1 and 5),

  unique (sesion_id, pregunta_id)
);

create table respuestas_abiertas (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesiones_test(id) on delete cascade,
  pregunta_id uuid not null references preguntas_abiertas(id),
  respuesta text not null,

  unique (sesion_id, pregunta_id)
);

-- -----------------------------------------------------------------------------
-- 8. RESULTADOS (snapshot final: lo que ya se calculó + lo que devolvió la IA)
-- -----------------------------------------------------------------------------
-- Se guarda como SNAPSHOT (no solo referencias) porque los costos de las
-- universidades pueden cambiar con el tiempo — el resultado que vio el
-- estudiante debe quedar fijo tal como se le mostró, no recalcularse después.
create table resultados (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null unique references sesiones_test(id) on delete cascade,

  -- Capa determinística (ya calculada antes de llamar a la IA)
  perfil_dimensiones text[] not null,       -- ej. {'Analítico','Investigativo'}
  es_perfil_disperso boolean not null default false,
  areas_candidatas text[] not null,          -- nombres, no ids, para que el snapshot sea autocontenido
  universidades_filtradas jsonb not null,    -- snapshot completo: nombre, costo (con su tipo), ayuda, fuente

  -- Capa de IA (después de pasar la validación de la Edge Function)
  fuente_interpretacion text not null check (fuente_interpretacion in ('ia', 'fallback')),
  resumen_perfil text not null,
  explicacion_areas text not null,
  nota_respuestas_no_conectadas text,
  disclaimer text not null,

  creado_en timestamptz not null default now()
);

comment on column resultados.universidades_filtradas is
  'Snapshot JSON de las universidades mostradas al estudiante en el momento del resultado, con su costo tal como se le presentó';

-- -----------------------------------------------------------------------------
-- ÍNDICES ADICIONALES DE CONSULTA FRECUENTE
-- -----------------------------------------------------------------------------
create index idx_universidades_tipo_costo on universidades(tipo_costo);
create index idx_universidades_ciudad on universidades(ciudad);
create index idx_respuestas_likert_sesion on respuestas_likert(sesion_id);
create index idx_respuestas_abiertas_sesion on respuestas_abiertas(sesion_id);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- Modelo de acceso para MVP sin login:
--   - Catálogos (universidades, dimensiones, areas_carrera, mapeo, preguntas):
--     lectura pública, escritura solo desde el backend (service role).
--   - sesiones_test / respuestas_* / resultados: un visitante anónimo puede
--     INSERTAR su propia sesión y sus propias respuestas, pero no puede leer
--     ni modificar las de nadie más. La lectura del resultado propio se hace
--     con el id de sesión (uuid), que actúa como "token" de acceso — nunca se
--     expone un listado de sesiones ni se permite select sin filtrar por id.

alter table universidades enable row level security;
alter table costos_por_estrato enable row level security;
alter table dimensiones enable row level security;
alter table areas_carrera enable row level security;
alter table mapeo_dimensiones_areas enable row level security;
alter table preguntas_likert enable row level security;
alter table preguntas_abiertas enable row level security;
alter table sesiones_test enable row level security;
alter table respuestas_likert enable row level security;
alter table respuestas_abiertas enable row level security;
alter table resultados enable row level security;

-- Catálogos: lectura pública para cualquiera (anon), sin escritura desde el cliente.
create policy "catalogos_lectura_publica_universidades" on universidades for select using (true);
create policy "catalogos_lectura_publica_costos_estrato" on costos_por_estrato for select using (true);
create policy "catalogos_lectura_publica_dimensiones" on dimensiones for select using (true);
create policy "catalogos_lectura_publica_areas" on areas_carrera for select using (true);
create policy "catalogos_lectura_publica_mapeo" on mapeo_dimensiones_areas for select using (true);
create policy "catalogos_lectura_publica_preguntas_likert" on preguntas_likert for select using (true);
create policy "catalogos_lectura_publica_preguntas_abiertas" on preguntas_abiertas for select using (true);

-- Sesiones y respuestas: cualquiera puede crear (insert) una sesión/respuesta nueva.
-- No hay policy de "select" pública general — la lectura de una sesión puntual se
-- hace vía la Edge Function con service role, no directo desde el cliente con anon key,
-- para no exponer un método de "adivinar" uuids de otros estudiantes por fuerza bruta.
create policy "sesiones_insert_publico" on sesiones_test for insert with check (true);
create policy "respuestas_likert_insert_publico" on respuestas_likert for insert with check (true);
create policy "respuestas_abiertas_insert_publico" on respuestas_abiertas for insert with check (true);

-- Sin policy de UPDATE pública en sesiones_test: capturar el email en el
-- momento del resultado y marcar email_enviado se hace a través de la Edge
-- Function (service role), no con un update directo del cliente vía anon key.
-- Motivo: con RLS simple no hay forma de restringir el update solo a "mi
-- propia sesión" sin un mecanismo de auth real, y permitir "update using (true)"
-- dejaría que cualquiera con un uuid ajeno sobreescriba el email de otro
-- estudiante. Pasar por la Edge Function evita ese hueco.

-- resultados: solo el service role (Edge Function) escribe. Sin policy de insert/select
-- pública — el cliente nunca lee esta tabla directamente, siempre a través de la
-- Edge Function que ya validó y devuelve el resultado en la respuesta HTTP.

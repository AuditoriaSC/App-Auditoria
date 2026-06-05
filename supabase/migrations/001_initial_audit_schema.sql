-- ====================================================================================
-- DOCUMENTACIÓN DE ROLES Y MATRIZ DE SEGURIDAD REQUERIDA (PASO 25)
-- ====================================================================================
-- 1. 'auditor': Acceso condicionado a evaluaciones de su propia región. Consulta
--    historial local. Bloqueo total de descargas masivas de bases de datos.
-- 2. 'admin': Mismos privilegios que el auditor en su región, con autorización
--    habilitada para exportar la base de datos local en formatos CSV o Excel.
-- 3. 'super_admin': Acceso ilimitado global. Rompe el cerco regional (descarga
--    ambas ciudades unificadas). Visualiza resúmenes estadísticos por reactivo,
--    gestiona catálogo y emite códigos de invitación por cambio de terminal móvil.
-- ====================================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  -- Llave primaria soldada al sistema de autenticación de Supabase Auth
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  
  -- Campos de identificación corporativa obligatorios
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  
  -- Restricción estricta de Roles basada en el requerimiento corporativo
  role TEXT DEFAULT 'auditor' NOT NULL 
    CONSTRAINT profiles_role_check CHECK (role IN ('auditor', 'admin', 'super_admin')),
    
  -- Restricción estricta de Regiones Geográficas operativas de Sweet & Coffee
  region TEXT NOT NULL 
    CONSTRAINT profiles_region_check CHECK (region IN ('Costa', 'Sierra', 'Global')),
    
  -- Auditoría cronológica de registros
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- ====================================================================================
-- 2. TABLA DE LOCALES COMERCIALES (SWEET & COFFEE)
-- ====================================================================================
CREATE TABLE IF NOT EXISTS public.locales (
  -- Usamos el Código Interno de la Empresa como la Llave Primaria única de la sucursal
  -- Ejemplos de entrada: 'GM', 'QE', 'MS'
  codigo_interno TEXT PRIMARY KEY,
  
  -- Nombre comercial descriptivo de la cafetería (Ej: 'Mall del Sol Local', 'Amazonas 1')
  nombre_local TEXT NOT NULL,
  
  -- Región geográfica estricta para la aplicación de filtros RLS (Ej: 'Costa', 'Sierra')
  region TEXT NOT NULL 
    CONSTRAINT locales_region_check CHECK (region IN ('Costa', 'Sierra', 'Oriente')),
    
  -- Fecha de registro de la sucursal en el sistema
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================================
-- CARGA INICIAL DE LOCALES MAESTROS DE PRUEBA
-- ====================================================================================
INSERT INTO public.locales (codigo_interno, nombre_local, region)
VALUES 
  ('GM', 'Mall del Sol Local', 'Costa'),
  ('QE', 'Amazonas 1', 'Sierra')
ON CONFLICT (codigo_interno) DO NOTHING;
-- ====================================================================================
-- 3. TABLA DE PREGUNTAS DEL CHECKLIST DINÁMICO (SWEET & COFFEE)
-- ====================================================================================
CREATE TABLE IF NOT EXISTS public.checklist_questions (
  -- Identificador único de cada pregunta del checklist
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Texto descriptivo de la evaluación (Ej: '¿La máquina de espresso está limpia?')
  question_text TEXT NOT NULL,
  
  
  -- Filtro geográfico de la pregunta para segmentación estricta ('Costa', 'Sierra', 'Global')
  region TEXT NOT NULL 
    CONSTRAINT questions_region_check CHECK (region IN ('Costa', 'Sierra', 'Global')),
    
  -- Filtro operativo por tipo de inspección ('Sabatina', 'Nocturna'))
  visit_type_id TEXT NOT NULL 
    CONSTRAINT questions_visit_check CHECK (visit_type_id IN ('Sabatina', 'Nocturna')),
    
  -- Puntaje o ponderación aritmética asignada a la pregunta (Paso 23)
  score_points NUMERIC DEFAULT 1.0 NOT NULL,
  
  -- Interruptor administrativo para activar o desactivar reactivos (Paso 23)
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Condicional estricta: define si la pregunta exige foto obligatoria (Paso 16)
  evidence_required BOOLEAN DEFAULT false NOT NULL,
  
  -- Registro cronológico
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================================
-- CARGA INICIAL DE PREGUNTAS MAESTRAS DE PRUEBA CORPORATIVAS
-- ====================================================================================
INSERT INTO public.checklist_questions (question_text, region, visit_type_id, score_points, evidence_required)
VALUES 
  ('Revisión albaranes y mensajes pendientes', 'Global', 'Sabatina', 2.0, false),
  ('¿La vitrina de pastelería mantiene la temperatura regulada y limpia?', 'Costa', 'Sabatina', 1.5, true),
  ('¿El personal de barra cuenta con el uniforme completo e higiene impecable?', 'Sierra', 'Nocturna', 1.0, false)
ON CONFLICT (id) DO NOTHING;
-- ====================================================================================
-- 4. TABLA MAESTRA DE REPORTES DE AUDITORÍA (SWEET & COFFEE)
-- ====================================================================================
CREATE TABLE IF NOT EXISTS public.audit_reports (
  -- Identificador único del informe de auditoría generado
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Relación con el usuario logueado en la tabla profiles (quién evalúa)
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Relación con el local comercial evaluado usando su Código Interno (Ej: 'GM')
  local_codigo TEXT REFERENCES public.locales(codigo_interno) ON DELETE RESTRICT,
  
  -- REQUERIMIENTO: Filtro geográfico estricto de Sweet & Coffee (Sin Oriente)
  region TEXT NOT NULL 
    CONSTRAINT reports_region_check CHECK (region IN ('Costa', 'Sierra')),
    
  -- REQUERIMIENTO: Tipos de evaluación obligatorios de la empresa
  visit_type_id TEXT NOT NULL 
    CONSTRAINT reports_visit_check CHECK (visit_type_id IN ('Sabatinas', 'Nocturnas')),
    
  -- Nombre completo del responsable del local capturado in situ (Paso 14)
  responsible_name TEXT NOT NULL,
  
  -- Nombre o equipo evaluador de apoyo registrado en el formulario (Paso 14)
  auditor_team TEXT NOT NULL,
  
  -- Estado del flujo del reporte solicitado ('draft', 'finalized') (Paso 21)
  status TEXT DEFAULT 'draft' NOT NULL 
    CONSTRAINT reports_status_check CHECK (status IN ('draft', 'finalized')),
    
  -- Calificación final escalada en base 10 calculada aritméticamente (Paso 21)
  final_grade NUMERIC DEFAULT 0.0 NOT NULL,
  
  -- Porcentaje de cumplimiento final calculado (Paso 21)
  final_percentage NUMERIC DEFAULT 0 NOT NULL,
  
  -- Enlace público hacia la imagen de la firma del auditor en Storage (Paso 20)
  signature_auditor_url TEXT,
  
  -- Enlace público hacia la imagen de la firma del responsable en Storage (Paso 20)
  signature_responsible_url TEXT,
  
  -- Registro cronológico de control
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
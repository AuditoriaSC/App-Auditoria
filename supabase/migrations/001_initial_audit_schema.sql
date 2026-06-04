-- A. Asegurar campos en la tabla profiles que ya maneja tu autenticación
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'auditor';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- B. Crear tabla de Locales Comerciales
CREATE TABLE IF NOT EXISTS public.locales (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  region TEXT NOT NULL
);

-- C. Crear tabla de Preguntas del Checklist (Paso 15 y 16)
CREATE TABLE IF NOT EXISTS public.checklist_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  category TEXT NOT NULL,
  region TEXT NOT NULL,
  visit_type_id TEXT NOT NULL,  -- 'ordinaria', 'extraordinaria', 'seguimiento'
  score_points NUMERIC DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  evidence_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- D. Tabla Maestra de Reportes de Auditoría (Paso 21)
CREATE TABLE IF NOT EXISTS public.audit_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  local_id TEXT REFERENCES public.locales(id),
  region TEXT NOT NULL,
  visit_type_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft',   -- 'draft', 'finalized'
  final_grade NUMERIC DEFAULT 0.0,
  final_percentage NUMERIC DEFAULT 0,
  signature_auditor_url TEXT,
  signature_responsible_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- E. Tabla de Respuestas Definitivas del Checklist
CREATE TABLE IF NOT EXISTS public.audit_answers_final (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.audit_reports ON DELETE CASCADE,
  question_id UUID REFERENCES public.checklist_questions,
  value TEXT NOT NULL,           -- 'cumple', 'no_cumple'
  observation TEXT,
  evidence_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- F. Tabla Intermedia para Borradores en la Nube
CREATE TABLE IF NOT EXISTS public.audit_answers_draft (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.audit_reports ON DELETE CASCADE,
  question_id UUID REFERENCES public.checklist_questions,
  value TEXT,
  observation TEXT,
  evidence_url TEXT
);

-- G. Tabla de Invitaciones de Acceso (Paso 23)
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  code TEXT NOT NULL,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================================
-- SECCIÓN DE INSERCIÓN: CARGA INICIAL DE DATOS BASE CORPORATIVOS
-- ====================================================================================
INSERT INTO public.locales (id, nombre, region)
VALUES ('local-1', 'Sweet & Coffee Malecón', 'Costa')
ON CONFLICT (id) DO NOTHING;
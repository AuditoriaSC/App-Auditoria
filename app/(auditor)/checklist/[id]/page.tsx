'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/ssr'; // Asegúrate de apuntar a tu cliente de Supabase configurado
import { useParams, useSearchParams } from 'next/navigation';

// Interfaz estricta para la pregunta
interface Question {
  id: string;
  question_text: string;
  category: string;
  region: string;
  visit_type_id: string;
  is_active: boolean;
}

export default function ChecklistDinamicoPage() {
  const params = useParams(); // ID de la auditoría actual
  const searchParams = useSearchParams(); // Captura filtros pasados por URL

  // Filtros obligatorios recibidos de la pantalla anterior
  const region = searchParams.get('region') || '';
  const visitTypeId = searchParams.get('visit_type_id') || '';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inicializar cliente de Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function fetchQuestions() {
      if (!region || !visitTypeId) {
        setError('Faltan parámetros obligatorios (región o tipo de visita) para cargar las preguntas.');
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // CONSULTA SUPABASE: Filtra exactamente por región, tipo de visita y activas
      const { data, error: supabaseError } = await supabase
        .from('checklist_questions')
        .select('*')
        .eq('region', region)
        .eq('visit_type_id', visitTypeId)
        .eq('is_active', true); // Solo preguntas activas

      if (supabaseError) {
        setError(supabaseError.message);
      } else {
        setQuestions(data || []);
      }
      setLoading(false);
    }

    fetchQuestions();
  }, [region, visitTypeId]);

  if (loading) return <div style={{ padding: '20px' }}>Cargando preguntas del checklist...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #333', paddingBottom: '10px' }}>Checklist de Auditoría</h2>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Filtrado para: <strong>{region}</strong> | Tipo de Visita ID: <strong>{visitTypeId}</strong>
      </p>

      {questions.length === 0 ? (
        <p style={{ marginTop: '20px', color: '#999' }}>No se encontraron preguntas activas para esta configuración.</p>
      ) : (
        <form style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          {questions.map((q, index) => (
            <div key={q.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9' }}>
              <p style={{ fontWeight: 'bold', margin: '0 0 10px 0' }}>{index + 1}. {q.question_text}</p>
              
              {/* Opciones de respuesta para el auditor */}
              <div style={{ display: 'flex', gap: '15px' }}>
                <label><input type="radio" name={`question-${q.id}`} value="cumple" /> Cumple</label>
                <label><input type="radio" name={`question-${q.id}`} value="no_cumple" /> No Cumple</label>
                <label><input type="radio" name={`question-${q.id}`} value="no_aplica" /> No Aplica</label>
              </div>
            </div>
          ))}

          <button 
            type="submit"
            style={{ padding: '12px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}
          >
            Finalizar y Guardar Auditoría 💾
          </button>
        </form>
      )}
    </div>
  );
}
import { createClient } from "npm:@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Manejo de peticiones CORS preflight obligatorias para aplicaciones móviles
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reportId } = await req.json()
    if (!reportId) throw new Error("Falta el parámetro reportId obligatorio.")

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno.')
    }

    // Inicializar cliente administrativo de Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Obtener la metadata e información general del reporte finalizado
    const { data: report, error: errReport } = await supabase
      .from('audit_reports')
      .select('*, profiles(full_name, email)')
      .eq('id', reportId)
      .single()

    if (errReport || !report) throw new Error(`Reporte no encontrado: ${errReport?.message}`)

    // 2. Obtener las respuestas consolidadas con sus rutas de evidencias
    const { data: answers, error: errAnswers } = await supabase
      .from('audit_answers_final')
      .select('*, checklist_questions(question_text)')
      .eq('report_id', reportId)

    if (errAnswers) throw new Error(`Error leyendo respuestas: ${errAnswers.message}`)

    // 3. Descargar las imágenes desde Supabase Storage y transformarlas a adjuntos CID en línea
    const attachments = []
    let htmlAnswersList = ""

    for (let i = 0; i < (answers || []).length; i++) {
      const ans = answers[i]
      let imageHtmlTag = ""

      // Verificar si la respuesta guardó un archivo en el Storage
      if (ans.evidence_url) {
        // Extraer la ruta relativa quitando el dominio del bucket público
        const pathParts = ans.evidence_url.split('/storage/v1/object/public/evidencias/')
        const relativePath = pathParts[1]

        if (relativePath) {
          // Descargar binario de la imagen
          const { data: fileData, error: errDownload } = await supabase.storage
            .from('evidencias')
            .download(relativePath)

          if (!errDownload && fileData) {
            const arrayBuffer = await fileData.arrayBuffer()
            let binary = ''
            const bytes = new Uint8Array(arrayBuffer)
            for (const byte of bytes) binary += String.fromCharCode(byte)
            const base64String = btoa(binary)
            const cidName = `evidencia_pregunta_${ans.question_id}`

            // Insertar el binario formateado en la matriz de adjuntos de Resend
            attachments.push({
              content: base64String,
              filename: `evidencia_${i + 1}.jpg`,
              content_id: cidName, // ID para referenciar en el HTML interno
              disposition: 'inline'
            })

            // Generar la etiqueta HTML apuntando al CID interno embebido
            imageHtmlTag = `<br/><img src="cid:${cidName}" alt="Evidencia" style="max-width:100%; height:auto; border-radius:6px; margin-top:8px; border:1px solid #ddd;" />`
          }
        }
      }

      htmlAnswersList += `
        <div style="padding:12px; border-bottom:1px solid #edf2f7; background-color:${ans.value === 'no_cumple' ? '#fff5f5' : '#fff'};">
          <p style="margin:0; font-weight:bold; color:#2d3748;">${i + 1}. ${ans.checklist_questions?.question_text || 'Pregunta'}</p>
          <p style="margin:4px 0; font-size:14px;">
            Resultado: <span style="font-weight:bold; color:${ans.value === 'no_cumple' ? '#e53e3e' : '#38a169'}">${ans.value.toUpperCase()}</span>
          </p>
          <p style="margin:0; font-size:13px; color:#4a5568; font-style:italic;">Obs: ${ans.observation || 'Sin observaciones'}</p>
          ${imageHtmlTag}
        </div>
      `
    }

    // 4. Armar cuerpo estructurado del correo electrónico en formato HTML
    const emailHtmlBody = `
      <div style="font-family:sans-serif; padding:20px; color:#2d3748; max-width:600px; margin:0 auto; background-color:#f7fafc;">
        <div style="background-color:#0070f3; padding:20px; border-radius:8px 8px 0 0; color:#fff; text-align:center;">
          <h2 style="margin:0;">Informe Oficial de Auditoría</h2>
          <p style="margin:5px 0 0 0; opacity:0.9;">Estatus del Reporte: <strong>${report.status.toUpperCase()}</strong></p>
        </div>
        
        <div style="background-color:#fff; padding:20px; border-radius:0 0 8px 8px; border:1px solid #e2e8f0; border-top:none;">
          <h3>Resumen Ejecutivo</h3>
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr><td style="padding:5px 0; color:#718096;">ID Reporte:</td><td style="font-weight:bold;">${report.id}</td></tr>
            <tr><td style="padding:5px 0; color:#718096;">Auditor:</td><td>${report.profiles?.full_name || 'No asignado'}</td></tr>
            <tr><td style="padding:5px 0; color:#718096;">Fecha de Cierre:</td><td>2026-06-01</td></tr>
            <tr style="border-top:2px solid #edf2f7;">
              <td style="padding:10px 0; font-size:16px; color:#2d3748; font-weight:bold;">Nota Final:</td>
              <td style="padding:10px 0; font-size:20px; font-weight:bold; color:${report.final_percentage >= 85 ? '#38a169' : '#e53e3e'};">
                ${report.final_grade}/10 (${report.final_percentage}%)
              </td>
            </tr>
          </table>

          <h3 style="border-top:1px solid #edf2f7; padding-top:15px;">Evaluación Detallada</h3>
          <div style="border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">
            ${htmlAnswersList}
          </div>

          <p style="font-size:12px; color:#a0aec0; text-align:center; margin-top:25px;">
            Este es un correo automático generado por el sistema Corporativo de Auditorías.
          </p>
        </div>
      </div>
    `

    // 5. Enviar a la API REST de Resend incluyendo los binarios adjuntos
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Auditorias Corporativas <reportes@tu-dominio.com>', // Configura tu dominio verificado de Resend aquí
        to: [report.profiles?.email || 'admin@tu-dominio.com'],
        subject: `Informe de Auditoría Finalizado - Nota: ${report.final_grade}/10`,
        html: emailHtmlBody,
        attachments: attachments // Inyección directa de las firmas e imágenes como recursos CID
      }),
    })

    const resendData = await resendResponse.json()

    return new Response(JSON.stringify({ success: true, data: resendData }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 500,
    })
  }
})

import { supabase } from './supabaseClient';

const PUBLIC_MARKER = '/storage/v1/object/public/evidencias/';
const SIGNED_MARKER = '/storage/v1/object/sign/evidencias/';

export function evidencePath(reference: string) {
  if (!reference) return '';
  for (const marker of [PUBLIC_MARKER, SIGNED_MARKER]) {
    const index = reference.indexOf(marker);
    if (index >= 0) return decodeURIComponent(reference.slice(index + marker.length).split('?')[0]);
  }
  return reference.replace(/^evidencias:\/\//, '');
}

export async function signedEvidenceUrl(reference: string, expiresIn = 3600) {
  if (reference.startsWith('data:') || reference.startsWith('file:') || reference.startsWith('blob:')) return reference;
  const path = evidencePath(reference);
  const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function IndexPage() {
  const cookieStore = cookies();
  
  // 1. Conectamos con Supabase para ver si el usuario inició sesión
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Si no ha iniciado sesión, lo mandamos directo al login
  if (!user) {
    redirect('/login');
  }

  // 2. Si está logueado, buscamos su rol en la tabla 'profiles' de Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // 3. Lo redirigimos según su rol
  if (profile?.role === 'admin') {
    redirect('/dashboard'); // Va al dashboard de administrador
  } 
  
  if (profile?.role === 'auditor') {
    redirect('/dashboard'); // Va al dashboard de auditor
  }

  // Si no tiene rol o algo falla, lo mandamos a una pantalla de error
  redirect('/unauthorized');
}
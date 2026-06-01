import { Slot } from 'expo-router';

export default function RootLayout() {
  // Slot renderiza dinámicamente la pantalla en la que se encuentre el usuario
  return <Slot />;
}
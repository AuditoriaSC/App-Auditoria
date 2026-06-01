// src/offlineStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Clave única para identificar los borradores en la memoria del teléfono
const CACHE_KEY_PREFIX = '@checklist_draft_';

export const offlineStorage = {
  /**
   * Guarda las respuestas de una auditoría en la memoria local
   */
  saveDraft: async (reportId: string, answers: any) => {
    try {
      const jsonValue = JSON.stringify(answers);
      await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${reportId}`, jsonValue);
      console.log(`Borrador ${reportId} guardado localmente.`);
    } catch (e) {
      console.error('Error al guardar el borrador local:', e);
    }
  },

  /**
   * Recupera las respuestas guardadas de la memoria local
   */
  getDraft: async (reportId: string) => {
    try {
      const jsonValue = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${reportId}`);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      console.error('Error al obtener el borrador local:', e);
      return null;
    }
  },

  /**
   * Borra el borrador de la memoria una vez sincronizado con éxito
   */
  clearDraft: async (reportId: string) => {
    try {
      await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${reportId}`);
      console.log(`Borrador ${reportId} limpiado de la memoria local.`);
    } catch (e) {
      console.error('Error al eliminar el borrador local:', e);
    }
  }
};

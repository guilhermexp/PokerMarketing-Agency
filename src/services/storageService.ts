
import type { GalleryImage } from '../types';

const DB_NAME = 'DirectorAi_DB';
const STORE_NAME = 'gallery_images';
const STORE_SCHEDULED = 'scheduled_posts';
const DB_VERSION = 2;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject('Erro ao abrir o banco de dados');
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create gallery images store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      // Create scheduled posts store
      if (!db.objectStoreNames.contains(STORE_SCHEDULED)) {
        const store = db.createObjectStore(STORE_SCHEDULED, { keyPath: 'id' });
        store.createIndex('by_date', 'scheduledDate', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_timestamp', 'scheduledTimestamp', { unique: false });
      }
    };
  });
};

export const saveImagesToDB = async (images: GalleryImage[]): Promise<void> => {
  const db = await initDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  // Limpa o store para manter sincronizado com o estado do App (que já faz o slice de MAX_SIZE)
  store.clear();
  images.forEach((img) => store.add(img));

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject('Erro ao salvar imagens');
  });
};

export const loadImagesFromDB = async (): Promise<GalleryImage[]> => {
  const db = await initDB();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('Erro ao carregar imagens');
  });
};

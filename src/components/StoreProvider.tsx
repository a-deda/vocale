import React, { createContext, useContext } from 'react';
import { useWordStore, autoTranslate } from '@/lib/store';

type StoreContextType = ReturnType<typeof useWordStore> & {
  autoTranslate: typeof autoTranslate;
};

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useWordStore();
  return (
    <StoreContext.Provider value={{ ...store, autoTranslate }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

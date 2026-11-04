import { useEffect, useState } from 'react';
import { mealsApi } from '../lib/meals';

/** Foto da refeição: vem de uma rota autenticada, então é buscada como blob. */
export function MealPhoto({ id, className }: { id: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    mealsApi
      .photo(id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* fica o placeholder */
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return url ? (
    <img src={url} alt="" className={`object-cover ${className ?? ''}`} />
  ) : (
    <div className={`animate-pulse bg-leaf-50 ${className ?? ''}`} />
  );
}

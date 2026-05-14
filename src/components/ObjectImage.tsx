import { useEffect, useState } from 'react';

interface ObjectImageProps {
  blob: Blob;
  alt: string;
}

export default function ObjectImage({ blob, alt }: ObjectImageProps) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  if (!url) return null;

  return <img className="card-image" src={url} alt={alt} loading="lazy" />;
}

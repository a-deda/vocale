import { getUniqueAnnotations } from '@/lib/translation-utils';

interface AnnotationTagsProps {
  text: string; // originele vertaling of woord met annotaties
}

/**
 * Geeft kleine tags voor grammaticale annotaties (agg., avv., s.m., etc.)
 * die in een vertaling staan, zodat ze herkenbaar worden getoond
 * zonder het antwoord te beïnvloeden.
 */
export default function AnnotationTags({ text }: AnnotationTagsProps) {
  const tags = getUniqueAnnotations(text);
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-1 mt-1.5">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary/80 border border-primary/20"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

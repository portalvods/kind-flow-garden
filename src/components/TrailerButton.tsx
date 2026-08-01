import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PlayCircle } from "lucide-react";

import { getTrailer } from "@/lib/trailer.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  tmdbId: number | null | undefined;
  contentType: "movie" | "tv";
  title: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost";
};

export function TrailerButton({
  tmdbId,
  contentType,
  title,
  size = "sm",
  variant = "outline",
}: Props) {
  const [open, setOpen] = useState(false);
  const fetchTrailer = useServerFn(getTrailer);

  const { data, isLoading } = useQuery({
    queryKey: ["trailer", contentType, tmdbId],
    queryFn: () => fetchTrailer({ data: { tmdb_id: tmdbId!, content_type: contentType } }),
    enabled: open && !!tmdbId,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });

  if (!tmdbId) return null;

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
        Trailer
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-1">Trailer · {title}</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.key ? (
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${data.key}?autoplay=1&rel=0`}
                title={`Trailer de ${title}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Trailer não disponível para este título.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BuilderProvider, useBuilder } from "@/app/characters/create/BuilderContext";
import { BuilderShell } from "@/app/characters/create/BuilderShell";
import { hydrateBuilderState } from "@/app/characters/create/hydrateState";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";

// ─── Inner component (needs builder context + library) ────────────────────────

interface EditInnerProps {
  id: string;
}

function EditInner({ id }: EditInnerProps) {
  const { dispatch } = useBuilder();
  const { getCharacter } = useCharacterLibrary();
  const router = useRouter();

  useEffect(() => {
    const saved = getCharacter(id);
    if (!saved) {
      // Character not found — redirect back to library
      router.replace("/characters");
      return;
    }
    const hydratedState = hydrateBuilderState(saved.character);
    dispatch({ type: "LOAD_STATE", state: hydratedState });
  }, [id, getCharacter, dispatch, router]);

  const saved = getCharacter(id);
  const editName = saved?.character.static.name ?? "Character";

  return <BuilderShell mode="edit" editId={id} editName={editName} />;
}

// ─── Page export ──────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditCharacterPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <BuilderProvider>
      <EditInner id={id} />
    </BuilderProvider>
  );
}

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
  const { characters, getCharacter } = useCharacterLibrary();
  const router = useRouter();
  const loaded = characters.length > 0 || typeof window === "undefined";

  useEffect(() => {
    if (!loaded) return; // wait for localStorage to load
    const saved = getCharacter(id);
    if (!saved) {
      router.replace("/characters");
      return;
    }
    const hydratedState = hydrateBuilderState(saved.character);
    dispatch({ type: "LOAD_STATE", state: hydratedState });
  }, [id, loaded, getCharacter, dispatch, router]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading character...
      </div>
    );
  }

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

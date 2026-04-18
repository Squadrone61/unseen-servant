"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BuilderProvider, useBuilder } from "@/app/characters/create/BuilderContext";
import { BuilderShell } from "@/app/characters/create/BuilderShell";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";

// ─── Inner component (needs builder context + library) ────────────────────────

interface EditInnerProps {
  id: string;
}

function EditInner({ id }: EditInnerProps) {
  const { dispatch, equipmentDispatch, identityDispatch } = useBuilder();
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
    dispatch({ type: "LOAD_STATE", state: saved.character.builder });
    // Seed the sibling stores from live runtime / static state — those are the
    // real source of truth. Inventory/currency may have been mutated by MCP
    // tools in-game; traits live in static.traits.
    equipmentDispatch({
      type: "LOAD_EQUIPMENT",
      state: {
        inventory: saved.character.dynamic.inventory,
        currency: saved.character.dynamic.currency,
      },
    });
    identityDispatch({
      type: "LOAD_IDENTITY",
      state: { traits: saved.character.static.traits },
    });
  }, [id, loaded, getCharacter, dispatch, equipmentDispatch, identityDispatch, router]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading character...
      </div>
    );
  }

  const saved = getCharacter(id);
  const editName = saved?.character.static.name ?? "Character";

  return (
    <BuilderShell
      mode="edit"
      editId={id}
      editName={editName}
      editDynamicData={saved?.character.dynamic}
    />
  );
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

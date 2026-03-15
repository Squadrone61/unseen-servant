"use client";

import { use } from "react";
import { CharacterBuilder } from "@/components/builder/CharacterBuilder";

export default function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CharacterBuilder editId={id} />;
}

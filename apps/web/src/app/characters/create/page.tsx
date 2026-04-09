"use client";

import { BuilderProvider } from "./BuilderContext";
import { BuilderShell } from "./BuilderShell";

export default function CreateCharacterPage() {
  return (
    <BuilderProvider>
      <BuilderShell mode="create" />
    </BuilderProvider>
  );
}

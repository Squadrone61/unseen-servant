import { TopicCharacterBuilder } from "./TopicCharacterBuilder";
import { TopicStartCampaign } from "./TopicStartCampaign";
import { TopicResumeCampaign } from "./TopicResumeCampaign";
import { TopicEndSession } from "./TopicEndSession";
import { TopicNarrative } from "./TopicNarrative";
import { TopicCombat } from "./TopicCombat";

export type GuideRole = "all" | "host" | "player";

export interface GuideTopic {
  id: string;
  title: string;
  subtitle: string;
  role: GuideRole;
  component: React.ComponentType;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "character",
    title: "Making a Character",
    subtitle: "The character builder",
    role: "all",
    component: TopicCharacterBuilder,
  },
  {
    id: "start",
    title: "Starting a Campaign",
    subtitle: "Create a room, launch the DM",
    role: "host",
    component: TopicStartCampaign,
  },
  {
    id: "resume",
    title: "Resuming a Campaign",
    subtitle: "Pick up where you left off",
    role: "all",
    component: TopicResumeCampaign,
  },
  {
    id: "end",
    title: "Ending a Session",
    subtitle: "Save and wrap up",
    role: "all",
    component: TopicEndSession,
  },
  {
    id: "narrative",
    title: "Playing Narrative",
    subtitle: "Chat, choices, roleplay",
    role: "player",
    component: TopicNarrative,
  },
  {
    id: "combat",
    title: "Playing Combat",
    subtitle: "Battle map, dice, turns",
    role: "player",
    component: TopicCombat,
  },
];

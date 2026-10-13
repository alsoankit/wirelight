/**
 * Discovery cards, collected from each region's file (cards/). Ids are checked by the room
 * validator: every card a room or hint names must exist here.
 */
import { REGION_1_CARDS } from "./cards/region1";
import { REGION_2_CARDS } from "./cards/region2";
import { REGION_3_CARDS } from "./cards/region3";
import { REGION_4_CARDS } from "./cards/region4";
import type { Card } from "./cards/types";

export type { Card } from "./cards/types";
export type CardId = string;

const ALL: Card[] = [...REGION_1_CARDS, ...REGION_2_CARDS, ...REGION_3_CARDS, ...REGION_4_CARDS];

export const cards: Record<CardId, Card> = Object.fromEntries(ALL.map((c) => [c.id, c]));
export const cardIds: CardId[] = ALL.map((c) => c.id);

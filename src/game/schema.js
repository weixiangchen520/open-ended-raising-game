import { STAT_KEYS } from "./data.js";

const statDeltaProperties = Object.fromEntries(
  STAT_KEYS.map((key) => [key, { type: "number", minimum: -12, maximum: 12 }])
);

export const OUTCOME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "narration",
    "mood",
    "statDeltas",
    "relationshipDeltas",
    "memories",
    "newGoal",
    "choices"
  ],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 40 },
    narration: { type: "string", minLength: 1, maxLength: 520 },
    mood: { type: "string", enum: ["calm", "bright", "tense", "strange", "warm"] },
    statDeltas: {
      type: "object",
      additionalProperties: false,
      required: STAT_KEYS,
      properties: statDeltaProperties
    },
    relationshipDeltas: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["npcId", "affinity", "trust"],
        properties: {
          npcId: { type: "string", minLength: 1, maxLength: 32 },
          affinity: { type: "number", minimum: -10, maximum: 10 },
          trust: { type: "number", minimum: -10, maximum: 10 }
        }
      }
    },
    memories: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["owner", "text", "weight"],
        properties: {
          owner: { type: "string", minLength: 1, maxLength: 40 },
          text: { type: "string", minLength: 1, maxLength: 160 },
          weight: { type: "number", minimum: 1, maximum: 5 }
        }
      }
    },
    newGoal: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["text", "progress", "dueDay"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 80 },
            progress: { type: "number", minimum: 0, maximum: 100 },
            dueDay: { type: "number", minimum: 1, maximum: 120 }
          }
        }
      ]
    },
    choices: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "intent"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 24 },
          intent: { type: "string", minLength: 1, maxLength: 80 }
        }
      }
    }
  }
};

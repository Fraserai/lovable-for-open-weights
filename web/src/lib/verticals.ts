// Industries on the landing page, each with models a team in that industry would actually build.
// Picking one fills the prompt box; the rotating placeholder follows the selected industry.
export type Vertical = { id: string; name: string; prompts: string[] };

export const VERTICALS: Vertical[] = [
  {
    id: "super",
    name: "Superannuation",
    prompts: [
      "Build a member services model that knows our PDS, TMD and insurance terms, and stays inside general advice",
      "Train a model that sorts member complaints into AFCA categories and flags potential breaches",
      "Build a model that explains our investment options and fees in plain English, in our voice",
    ],
  },
  {
    id: "banking",
    name: "Banking",
    prompts: [
      "Train a model that routes every customer message to the right one of our 77 intents",
      "Build a model that spots scam, hardship and vulnerability signals in customer chats",
      "Train a model that drafts complaint responses to our standard under the Banking Code of Practice",
    ],
  },
  {
    id: "insurance",
    name: "Insurance",
    prompts: [
      "Train a claims triage model on five years of our claims notes and outcomes",
      "Build a model that reads our policy wordings and answers \"am I covered?\" with the clause",
      "Train a model that extracts loss details from claim emails into our claims system fields",
    ],
  },
  {
    id: "tax",
    name: "Tax",
    prompts: [
      "Train a model on ATO private rulings so it reasons through a question the way our tax team does",
      "Build a model that classifies client queries by tax topic and urgency before they reach an adviser",
      "Train a model that drafts first-pass advice memos in our firm's structure and tone",
    ],
  },
  {
    id: "legal",
    name: "Legal",
    prompts: [
      "Build a contract review model trained on our playbook and a decade of our redlines",
      "Train a model that classifies incoming matters by practice area, risk and conflict checks",
      "Build a model that summarises judgments the way our associates brief partners",
    ],
  },
  {
    id: "health",
    name: "Healthcare",
    prompts: [
      "Train a clinical coding model that maps discharge summaries to ICD-10-AM codes",
      "Build a model that triages patient messages by clinical urgency for our nurses",
      "Train a model that turns clinician notes into referral letters in our format",
    ],
  },
];

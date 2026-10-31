import { PLAYBOOKS } from "../../lib/playbooks.js";

// The playbook catalogue, so the builder shows exactly what the server applies.
export const onRequestGet = () => Response.json({ playbooks: PLAYBOOKS }, { headers: { "cache-control": "public, max-age=300" } });

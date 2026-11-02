import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

await mkdir(".local", { recursive: true });
const body =
  ["COMPOSE_OWNER_PASSWORD", "COMPOSE_APP_PASSWORD", "COMPOSE_REDIS_PASSWORD"]
    .map((name) => `${name}=${randomBytes(24).toString("hex")}`)
    .join("\n") + "\n";
try {
  await writeFile(".local/compose.env", body, { flag: "wx", mode: 0o600 });
  console.log(
    "Created private .local/compose.env. Keep it with your persistent volumes; do not commit it.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .local/compose.env preserved.");
}

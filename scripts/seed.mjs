import { sampleBook } from "../server/seed-data.mjs";
import { seedDatabase, disconnect } from "../server/postgres.mjs";
try {
  const created = await seedDatabase(sampleBook());
  console.log(
    created
      ? "Sample billing workspace created."
      : "The database already contains records. Seed skipped.",
  );
} finally {
  await disconnect();
}

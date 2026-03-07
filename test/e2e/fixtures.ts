import { test as base, type Page } from "@playwright/test";
import type { Server } from "bun";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "../../src/web/server.ts";

type Fixtures = {
  serverInstance: Server;
  login: (page: Page) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  serverInstance: [
    async ({}, use) => {
      const { store, pool } = createEventStore(":memory:");
      const sessionStore = await SQLiteSessionStore(pool);
      const volunteerRepo = await SQLiteVolunteerRepository(pool);
      const recipientRepo = await SQLiteRecipientRepository(pool);

      await createVolunteer({ name: "Test", password: "test" }, store);

      const server = startServer(
        sessionStore,
        volunteerRepo,
        recipientRepo,
        store,
        3001,
      );

      await use(server);

      server.stop(true);
      await pool.close();
    },
    { scope: "test" },
  ],

  login: async ({}, use) => {
    await use(async (page: Page) => {
      await page.goto("/login");
      await page.locator("#name").fill("Test");
      await page.locator("#password").fill("test");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("/");
    });
  },
});

export { expect } from "@playwright/test";

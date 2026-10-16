import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.DOCKGE_TEST_URL || "http://127.0.0.1:5001";
const resultDir = "test-results";
await mkdir(resultDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
const errors = [];
let pollingRequests = 0;
let socketHTTP400s = 0;
let websocketConnections = 0;
context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") {
            errors.push(message.text());
        }
    });
    page.on("request", (request) => {
        if (request.url().includes("/socket.io/") && request.url().includes("transport=polling")) {
            pollingRequests++;
        }
    });
    page.on("response", (response) => {
        if (response.url().includes("/socket.io/") && response.status() === 400) {
            socketHTTP400s++;
        }
    });
    page.on("websocket", () => websocketConnections++);
});

async function dashboard(page) {
    await page.locator("textarea.docker-run").waitFor({ state: "visible" });
    assert.match(await page.title(), /Dockge/);
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(await page.locator(".lost-connection").count(), 0);
    assert.equal(await page.locator("vite-error-overlay").count(), 0);
}

try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.locator('[data-cy="setup-form"]').waitFor();
    const username = "connection-qa";
    const password = randomBytes(24).toString("base64url");
    await page.locator('[data-cy="username-input"]').fill(username);
    await page.locator('[data-cy="password-input"]').fill(password);
    await page.locator('[data-cy="password-repeat-input"]').fill(password);
    await page.locator('[data-cy="submit-setup-form"]').click();
    await dashboard(page);

    for (let attempt = 0; attempt < 3; attempt++) {
        await page.reload();
        await dashboard(page);
    }
    const newTab = await context.newPage();
    await newTab.goto(baseURL);
    await dashboard(newTab);

    await newTab.locator(".dropdown-profile-pic .nav-link").click();
    await newTab.getByRole("button", { name: "Logout", exact: true }).click();
    await newTab.getByLabel("Username", { exact: true }).fill(username);
    await newTab.getByLabel("Password", { exact: true }).fill(password);
    await newTab.getByRole("button", { name: "Login", exact: true }).click();
    await dashboard(newTab);

    // Cover more than two default Engine.IO heartbeat intervals.
    await newTab.waitForTimeout(65000);
    await dashboard(newTab);
    await newTab.screenshot({ path: `${resultDir}/dockge-connected.png`, fullPage: true });
    assert.equal(pollingRequests, 0);
    assert.equal(socketHTTP400s, 0);
    assert.ok(websocketConnections >= 5);
    assert.deepEqual(errors, []);
    const result = {
        status: "passed",
        flow: "setup -> login -> three reloads -> new tab -> logout -> fresh login -> 65-second heartbeat observation",
        pollingRequests,
        socketHTTP400s,
        websocketConnections,
        pageErrors: errors.length,
    };
    await writeFile(`${resultDir}/browser-smoke.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
} catch (error) {
    const pages = context.pages();
    // Do not capture a setup/login form that could contain the temporary password.
    const page = pages.at(-1);
    if (page && await page.locator("textarea.docker-run").isVisible()) {
        await page.screenshot({ path: `${resultDir}/dockge-failure.png`, fullPage: true });
    }
    throw error;
} finally {
    await browser.close();
}

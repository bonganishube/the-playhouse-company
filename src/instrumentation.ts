/**
 * Server startup.
 *
 * Next calls register() once when the server boots, which is the only moment
 * before traffic arrives where the whole environment is known. Checking here
 * means an unsafe production deployment fails immediately and visibly, rather
 * than serving pages that quietly take simulated payments or send every
 * customer's mail to one inbox.
 *
 * Not checked at build time on purpose: a build runs with NODE_ENV=production
 * but without the runtime secrets, so failing there would block deployments
 * for settings that are perfectly well configured on the platform.
 */
export async function register() {
  // Only the Node.js runtime has the full environment; the edge runtime
  // evaluates this file too and must not repeat the work.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertProductionReady, productionReadinessProblems } = await import(
    "./lib/env"
  );

  // Outside production the same list is advisory. It is worth printing,
  // because it is the checklist that has to be empty before go-live.
  if (process.env.NODE_ENV !== "production") {
    const problems = productionReadinessProblems();
    if (problems.length > 0) {
      console.info(
        `[env] ${problems.length} setting${problems.length === 1 ? "" : "s"} ` +
          `would block production: ${problems.map((p) => p.setting).join(", ")}. ` +
          `Run "pnpm preflight" for the detail.`,
      );
    }
    return;
  }

  assertProductionReady();
}

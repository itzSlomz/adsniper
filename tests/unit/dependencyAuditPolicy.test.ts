const {
  FULL_AUDIT_ARGS,
  PRODUCTION_AUDIT_ARGS,
  evaluateAuditPolicy,
  main,
  parseJson,
  redactText,
  runAuditCommand,
} = require("../../scripts/dependency-audit.cjs") as {
  FULL_AUDIT_ARGS: string[];
  PRODUCTION_AUDIT_ARGS: string[];
  evaluateAuditPolicy: (input: Record<string, unknown>) => any;
  main: (argv: string[], options: Record<string, unknown>) => Promise<any>;
  parseJson: (value: string) => { value?: unknown; error: string | null };
  redactText: (value: unknown) => string;
  runAuditCommand: (label: string, args: string[], options: Record<string, unknown>) => Promise<any>;
};

const NOW = new Date("2026-09-06T12:00:00.000Z");
const SUCCESSFUL_SCANS = {
  full: {
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    spawnError: null,
  },
  production: {
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    spawnError: null,
  },
};

type Severity = "info" | "low" | "moderate" | "high" | "critical";

function advisory(
  packageName: string,
  source = 1001,
  severity: Severity = "critical",
  ghsa = "GHSA-aaaa-bbbb-cccc"
) {
  return {
    source,
    name: packageName,
    dependency: packageName,
    title: `${packageName} advisory`,
    url: `https://github.com/advisories/${ghsa}`,
    severity,
    cwe: ["CWE-400"],
    cvss: { score: 9.8, vectorString: null },
    range: "<9.9.9",
  };
}

function vulnerability(
  packageName: string,
  severity: Severity,
  via: Array<string | Record<string, unknown>>,
  nodePath = `node_modules/${packageName}`
) {
  return {
    name: packageName,
    severity,
    isDirect: false,
    via,
    effects: [] as string[],
    range: "<9.9.9",
    nodes: [nodePath],
    fixAvailable: false,
  };
}

function report(
  vulnerabilities: Record<string, ReturnType<typeof vulnerability>> = {},
  dependencyCounts?: Partial<Record<"prod" | "dev" | "optional" | "peer" | "peerOptional" | "total", number>>
) {
  const counts: Record<string, number> = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  };
  for (const value of Object.values(vulnerabilities)) {
    counts[value.severity] += 1;
    counts.total += 1;
  }
  const dependencyNodes = new Set(
    Object.values(vulnerabilities).flatMap((value) => value.nodes)
  ).size;
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: counts,
      dependencies: {
        prod: dependencyNodes + 1,
        dev: 0,
        optional: 0,
        peer: 0,
        peerOptional: 0,
        total: dependencyNodes,
        ...dependencyCounts,
      },
    },
  };
}

function lock(packages: Record<string, Record<string, unknown>> = {}) {
  return {
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "fixture", version: "1.0.0" },
      ...packages,
    },
  };
}

function exception(overrides: Record<string, unknown> = {}) {
  return {
    package: "vulnerable-leaf",
    nodePath: "node_modules/vulnerable-leaf",
    installedVersion: "2.0.0",
    npmSource: 1001,
    advisory: "GHSA-aaaa-bbbb-cccc",
    severity: "critical",
    scope: "production",
    owner: "@itzSlomz",
    trackingItem: "https://github.com/itzSlomz/adsniper/issues/1",
    reason: "The upgrade is being validated against authentication flows.",
    mitigation: "Access remains restricted to allowlisted authenticated users.",
    acceptedOn: "2026-09-01",
    expiresOn: "2026-09-15",
    ...overrides,
  };
}

function affectedNode(overrides: Record<string, unknown> = {}) {
  return {
    package: "vulnerable-leaf",
    nodePath: "node_modules/vulnerable-leaf",
    installedVersion: "2.0.0",
    isDirect: false,
    severity: "critical",
    scope: "production",
    viaPackages: [] as string[],
    advisories: ["GHSA-aaaa-bbbb-cccc"],
    ...overrides,
  };
}

function policy(
  exceptions: Record<string, unknown>[] = [],
  affectedNodes: Record<string, unknown>[] = []
) {
  return { schemaVersion: 1, affectedNodes, exceptions };
}

function validateDependencyAuditWorkflow(workflow: any, packageJson: any) {
  const problems: string[] = [];
  const expectedTriggers = ["main"];
  if (
    JSON.stringify(workflow?.on?.pull_request?.branches) !== JSON.stringify(expectedTriggers) ||
    JSON.stringify(workflow?.on?.push?.branches) !== JSON.stringify(expectedTriggers) ||
    JSON.stringify(Object.keys(workflow?.on?.pull_request || {}).sort()) !==
      JSON.stringify(["branches"]) ||
    JSON.stringify(Object.keys(workflow?.on?.push || {}).sort()) !==
      JSON.stringify(["branches"])
  ) {
    problems.push("triggers");
  }
  if (Object.prototype.hasOwnProperty.call(workflow || {}, "defaults")) {
    problems.push("workflow-defaults");
  }

  const job = workflow?.jobs?.["dependency-audit"];
  if (!job || typeof job !== "object") return [...problems, "job-missing"];
  if (
    JSON.stringify(Object.keys(job).sort()) !==
    JSON.stringify(["name", "runs-on", "steps", "timeout-minutes"].sort())
  ) {
    problems.push("job-shape");
  }
  if (
    job.name !== "Dependency audit" ||
    job["runs-on"] !== "ubuntu-latest" ||
    job["timeout-minutes"] !== 10
  ) {
    problems.push("job-runtime");
  }
  if (Object.prototype.hasOwnProperty.call(job, "if")) problems.push("job-if");
  if (Object.prototype.hasOwnProperty.call(job, "continue-on-error")) {
    problems.push("job-continue-on-error");
  }
  const steps = Array.isArray(job.steps) ? job.steps : [];
  if (steps.length !== 4) problems.push("job-steps");
  const checkoutIndexes = steps
    .map((step: any, index: number) => ({ step, index }))
    .filter(
      ({ step }: any) =>
        step?.uses === "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
    );
  if (checkoutIndexes.length !== 1) {
    problems.push("checkout");
  } else if (
    checkoutIndexes[0].step.name !== "Check out repository" ||
    JSON.stringify(Object.keys(checkoutIndexes[0].step).sort()) !==
      JSON.stringify(["name", "uses"].sort())
  ) {
    problems.push("checkout-override");
  }
  const setupIndexes = steps
    .map((step: any, index: number) => ({ step, index }))
    .filter(
      ({ step }: any) =>
      step?.uses === "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020" &&
      step?.with?.["node-version"] === "22.x"
    );
  if (
    setupIndexes.length !== 1 ||
    setupIndexes[0].step.name !== "Set up Node.js" ||
    JSON.stringify(Object.keys(setupIndexes[0].step).sort()) !==
      JSON.stringify(["name", "uses", "with"].sort()) ||
    JSON.stringify(Object.keys(setupIndexes[0].step.with || {}).sort()) !==
      JSON.stringify(["node-version"])
  ) {
    problems.push("node-22");
  }

  const allAuditSteps = Object.values(workflow?.jobs || {}).flatMap((candidate: any) =>
    Array.isArray(candidate?.steps)
      ? candidate.steps.filter((step: any) => step?.run === "npm run audit:dependencies")
      : []
  );
  const auditIndexes = steps
    .map((step: any, index: number) => ({ step, index }))
    .filter(({ step }: any) => step?.run === "npm run audit:dependencies");
  if (allAuditSteps.length !== 1 || auditIndexes.length !== 1) problems.push("audit-step");
  const audit = auditIndexes[0];
  if (
    audit &&
    (checkoutIndexes.length !== 1 ||
      setupIndexes.length !== 1 ||
      checkoutIndexes[0].index !== 0 ||
      setupIndexes[0].index !== 1 ||
      audit.index !== 2 ||
      checkoutIndexes[0].index >= setupIndexes[0].index ||
      setupIndexes[0].index >= audit.index)
  ) {
    problems.push("setup-order");
  }
  if (
    audit &&
    (Object.prototype.hasOwnProperty.call(audit.step, "if") ||
      Object.prototype.hasOwnProperty.call(audit.step, "continue-on-error") ||
      JSON.stringify(Object.keys(audit.step).sort()) !==
        JSON.stringify(["name", "run"].sort()))
  ) {
    problems.push("audit-optional");
  }

  const uploads = steps
    .map((step: any, index: number) => ({ step, index }))
    .filter(
      ({ step }: any) =>
        step?.uses ===
        "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
    );
  if (uploads.length !== 1) {
    problems.push("upload-step");
  } else {
    const upload = uploads[0];
    if (!audit || upload.index !== 3 || upload.index <= audit.index) {
      problems.push("upload-order");
    }
    if (upload.step.if !== "${{ always() }}") problems.push("upload-condition");
    if (upload.step.with?.path !== "artifacts/dependency-audit/") problems.push("upload-path");
    if (upload.step.with?.["if-no-files-found"] !== "error") problems.push("upload-missing");
    if (upload.step.with?.["retention-days"] !== 30) problems.push("upload-retention");
    if (Object.prototype.hasOwnProperty.call(upload.step, "continue-on-error")) {
      problems.push("upload-continue-on-error");
    }
  }
  if (
    steps.some((step: any) => Object.prototype.hasOwnProperty.call(step || {}, "continue-on-error"))
  ) {
    problems.push("step-continue-on-error");
  }
  if (packageJson?.scripts?.["audit:dependencies"] !== "node scripts/dependency-audit.cjs") {
    problems.push("audit-script");
  }
  return problems;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    fullReport: report(),
    productionReport: report(),
    lockfile: lock(),
    allowlist: policy(),
    scans: SUCCESSFUL_SCANS,
    now: NOW,
    ...overrides,
  };
}

function productionFixture() {
  const vulnerabilities = {
    "runtime-parent": vulnerability("runtime-parent", "critical", ["vulnerable-leaf"]),
    "vulnerable-leaf": vulnerability(
      "vulnerable-leaf",
      "critical",
      [advisory("vulnerable-leaf")]
    ),
  };
  vulnerabilities["vulnerable-leaf"].effects = ["runtime-parent"];
  const lockfile = lock({
    "node_modules/runtime-parent": { version: "1.0.0" },
    "node_modules/vulnerable-leaf": { version: "2.0.0" },
  });
  const affectedNodes = [
    affectedNode({
      package: "runtime-parent",
      nodePath: "node_modules/runtime-parent",
      installedVersion: "1.0.0",
      viaPackages: ["vulnerable-leaf"],
    }),
    affectedNode(),
  ];
  return { vulnerabilities, lockfile, affectedNodes };
}

describe("dependency audit policy", () => {
  test("passes two available, internally consistent clean reports", () => {
    const result = evaluateAuditPolicy(input());

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  test("recursively resolves a meta-vulnerability to one direct blocking advisory", () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        package: "vulnerable-leaf",
        nodePath: "node_modules/vulnerable-leaf",
        installedVersion: "2.0.0",
        npmSource: 1001,
        advisory: "GHSA-aaaa-bbbb-cccc",
        severity: "critical",
        scope: "production",
      }),
    ]);
    expect(result.unexcepted).toHaveLength(1);
  });

  test("rejects a new affected parent even when its leaf advisory is excepted", () => {
    const fixture = productionFixture();
    const vulnerabilities = {
      ...fixture.vulnerabilities,
      "new-critical-parent": vulnerability(
        "new-critical-parent",
        "critical",
        ["vulnerable-leaf"]
      ),
    };
    const lockfile = lock({
      ...fixture.lockfile.packages,
      "node_modules/new-critical-parent": { version: "1.0.0" },
    });
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(vulnerabilities),
        productionReport: report(vulnerabilities),
        lockfile,
        allowlist: policy([exception()], fixture.affectedNodes),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unexpected-affected-node" })])
    );
  });

  test("rejects a new affected path/version for an existing meta-package", () => {
    const fixture = productionFixture();
    const vulnerabilities = JSON.parse(JSON.stringify(fixture.vulnerabilities)) as typeof fixture.vulnerabilities;
    vulnerabilities["runtime-parent"].nodes.push(
      "node_modules/new-consumer/node_modules/runtime-parent"
    );
    const lockfile = lock({
      ...fixture.lockfile.packages,
      "node_modules/new-consumer/node_modules/runtime-parent": { version: "0.9.0" },
    });
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(vulnerabilities),
        productionReport: report(vulnerabilities),
        lockfile,
        allowlist: policy([exception()], fixture.affectedNodes),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unexpected-affected-node" })])
    );
  });

  test("rejects a critical meta-package resolved only to a high advisory", () => {
    const vulnerabilities = {
      "critical-parent": vulnerability("critical-parent", "critical", ["high-leaf"]),
      "high-leaf": vulnerability(
        "high-leaf",
        "high",
        [advisory("high-leaf", 2001, "high", "GHSA-pppp-qqqq-rrrr")]
      ),
    };
    vulnerabilities["high-leaf"].effects = ["critical-parent"];
    const lockfile = lock({
      "node_modules/critical-parent": { version: "1.0.0" },
      "node_modules/high-leaf": { version: "2.0.0" },
    });
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(vulnerabilities),
        productionReport: report(vulnerabilities),
        lockfile,
        allowlist: policy(
          [
            exception({
              package: "high-leaf",
              nodePath: "node_modules/high-leaf",
              npmSource: 2001,
              advisory: "GHSA-pppp-qqqq-rrrr",
              severity: "high",
            }),
          ],
          [
            affectedNode({
              package: "critical-parent",
              nodePath: "node_modules/critical-parent",
              installedVersion: "1.0.0",
              viaPackages: ["high-leaf"],
              advisories: ["GHSA-pppp-qqqq-rrrr"],
            }),
            affectedNode({
              package: "high-leaf",
              nodePath: "node_modules/high-leaf",
              severity: "high",
              advisories: ["GHSA-pppp-qqqq-rrrr"],
            }),
          ]
        ),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-meta-severity" })])
    );
  });

  test("accepts only an exact, active exception tuple", () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
        allowlist: policy([exception()], fixture.affectedNodes),
        scans: {
          full: { ...SUCCESSFUL_SCANS.full, exitCode: 1 },
          production: { ...SUCCESSFUL_SCANS.production, exitCode: 1 },
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.matchedExceptions).toHaveLength(1);
    expect(result.unexcepted).toEqual([]);
  });

  test("fails when an allowed graph edge disappears but advisory closure stays the same", () => {
    const vulnerabilities = {
      parent: vulnerability("parent", "critical", ["leaf-a", "leaf-b"]),
      "leaf-a": vulnerability("leaf-a", "critical", [
        advisory("leaf-a", 1001, "critical", "GHSA-aaaa-bbbb-cccc"),
      ]),
      "leaf-b": vulnerability("leaf-b", "critical", [
        advisory("leaf-b", 1002, "critical", "GHSA-aaaa-bbbb-cccc"),
      ]),
    };
    vulnerabilities["leaf-a"].effects = ["parent"];
    vulnerabilities["leaf-b"].effects = ["parent"];
    const lockfile = lock({
      "node_modules/parent": { version: "1.0.0" },
      "node_modules/leaf-a": { version: "2.0.0" },
      "node_modules/leaf-b": { version: "3.0.0" },
    });
    const allowlist = policy(
      [
        exception({ package: "leaf-a", nodePath: "node_modules/leaf-a" }),
        exception({
          package: "leaf-b",
          nodePath: "node_modules/leaf-b",
          installedVersion: "3.0.0",
          npmSource: 1002,
        }),
      ],
      [
        affectedNode({
          package: "parent",
          nodePath: "node_modules/parent",
          installedVersion: "1.0.0",
          viaPackages: ["leaf-a", "leaf-b"],
        }),
        affectedNode({ package: "leaf-a", nodePath: "node_modules/leaf-a" }),
        affectedNode({
          package: "leaf-b",
          nodePath: "node_modules/leaf-b",
          installedVersion: "3.0.0",
        }),
      ]
    );
    expect(
      evaluateAuditPolicy(
        input({
          fullReport: report(vulnerabilities),
          productionReport: report(vulnerabilities),
          lockfile,
          allowlist,
        })
      ).ok
    ).toBe(true);

    const changed = JSON.parse(JSON.stringify(vulnerabilities)) as typeof vulnerabilities;
    changed.parent.via = ["leaf-a"];
    changed["leaf-b"].effects = [];
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(changed),
        productionReport: report(changed),
        lockfile,
        allowlist,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.unexcepted).toEqual([]);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unexpected-affected-node" }),
        expect.objectContaining({ code: "stale-affected-node" }),
      ])
    );
  });

  test("fails if report directness disagrees with the root lock entry", () => {
    const fixture = productionFixture();
    const changed = JSON.parse(
      JSON.stringify(fixture.vulnerabilities)
    ) as typeof fixture.vulnerabilities;
    changed["vulnerable-leaf"].isDirect = true;
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(changed),
        productionReport: report(changed),
        lockfile: fixture.lockfile,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "report-is-direct-mismatch" }),
      ])
    );
  });

  test("fails if directness changes even when lockfile and report agree", () => {
    const fixture = productionFixture();
    const changed = JSON.parse(
      JSON.stringify(fixture.vulnerabilities)
    ) as typeof fixture.vulnerabilities;
    changed["vulnerable-leaf"].isDirect = true;
    const changedLock = JSON.parse(JSON.stringify(fixture.lockfile));
    changedLock.packages[""].dependencies = { "vulnerable-leaf": "2.0.0" };
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(changed),
        productionReport: report(changed),
        lockfile: changedLock,
        allowlist: policy([exception()], fixture.affectedNodes),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unexpected-affected-node" }),
        expect.objectContaining({ code: "stale-affected-node" }),
      ])
    );
  });

  test.each(["package", "advisory"])("rejects duplicate %s via identities", (kind) => {
    const fixture = productionFixture();
    const changed = JSON.parse(
      JSON.stringify(fixture.vulnerabilities)
    ) as typeof fixture.vulnerabilities;
    if (kind === "package") {
      changed["runtime-parent"].via.push("vulnerable-leaf");
    } else {
      changed["vulnerable-leaf"].via.push(
        JSON.parse(JSON.stringify(changed["vulnerable-leaf"].via[0]))
      );
    }
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(changed),
        productionReport: report(changed),
        lockfile: fixture.lockfile,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-duplicate-via" })])
    );
  });

  test("classifies full-only dev nodes as development", () => {
    const devVulnerabilities = {
      "dev-tool": vulnerability(
        "dev-tool",
        "high",
        [advisory("dev-tool", 2002, "high", "GHSA-dddd-eeee-ffff")]
      ),
    };
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(devVulnerabilities, { prod: 1, dev: 1, total: 1 }),
        productionReport: report({}, { prod: 1, dev: 1, total: 1 }),
        lockfile: lock({ "node_modules/dev-tool": { version: "3.0.0", dev: true } }),
        allowlist: policy(
          [
            exception({
              package: "dev-tool",
              nodePath: "node_modules/dev-tool",
              installedVersion: "3.0.0",
              npmSource: 2002,
              advisory: "GHSA-dddd-eeee-ffff",
              severity: "high",
              scope: "development",
            }),
          ],
          [
            affectedNode({
              package: "dev-tool",
              nodePath: "node_modules/dev-tool",
              installedVersion: "3.0.0",
              severity: "high",
              scope: "development",
              advisories: ["GHSA-dddd-eeee-ffff"],
            }),
          ]
        ),
      })
    );

    expect(result.ok).toBe(true);
    expect(result.findings[0].scope).toBe("development");
  });

  test("records moderate advisories without turning them into blocking findings", () => {
    const moderate = {
      "moderate-package": vulnerability(
        "moderate-package",
        "moderate",
        [advisory("moderate-package", 3003, "moderate", "GHSA-gggg-hhhh-jjjj")]
      ),
    };
    const lockfile = lock({ "node_modules/moderate-package": { version: "1.0.0" } });
    const result = evaluateAuditPolicy(
      input({ fullReport: report(moderate), productionReport: report(moderate), lockfile })
    );

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  test.each([
    ["package", "runtime-parent"],
    ["nodePath", "node_modules/runtime-parent"],
    ["installedVersion", "2.0.1"],
    ["npmSource", 9999],
    ["advisory", "GHSA-xxxx-yyyy-zzzz"],
    ["severity", "high"],
    ["scope", "development"],
  ])("does not broaden an exception when %s differs", (field, value) => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
        allowlist: policy([exception({ [field]: value })]),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.unexcepted).toHaveLength(1);
  });

  test("fails at the first UTC instant of expiresOn", () => {
    const fixture = productionFixture();
    const base = {
      fullReport: report(fixture.vulnerabilities),
      productionReport: report(fixture.vulnerabilities),
      lockfile: fixture.lockfile,
      allowlist: policy(
        [exception({ expiresOn: "2026-09-07" })],
        fixture.affectedNodes
      ),
    };

    expect(
      evaluateAuditPolicy(input({ ...base, now: new Date("2026-09-06T23:59:59.999Z") })).ok
    ).toBe(true);
    const expired = evaluateAuditPolicy(
      input({ ...base, now: new Date("2026-09-07T00:00:00.000Z") })
    );
    expect(expired.ok).toBe(false);
    expect(expired.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "exception-expired" })])
    );
  });

  test("fails an active but unused exception as stale", () => {
    const result = evaluateAuditPolicy(
      input({
        lockfile: lock({ "node_modules/vulnerable-leaf": { version: "2.0.0" } }),
        allowlist: policy([exception()]),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.staleExceptions).toHaveLength(1);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "stale-exception" })])
    );
  });

  test("fails duplicate and unknown exception fields", () => {
    const fixture = productionFixture();
    const duplicate = exception();
    const malformed = { ...exception(), unexpected: true };
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
        allowlist: policy([duplicate, { ...duplicate }, malformed]),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "exception-duplicate" }),
        expect.objectContaining({ code: "exception-fields" }),
      ])
    );
  });

  test("fails missing fields and wildcard exception tuples", () => {
    const fixture = productionFixture();
    const missing = exception();
    delete (missing as Record<string, unknown>).mitigation;
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
        allowlist: policy([missing, exception({ package: "vulnerable-*" })]),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "exception-fields" }),
        expect.objectContaining({ code: "exception-wildcard" }),
      ])
    );
  });

  test("enforces severity-specific maximum TTL and a repository-scoped tracking URL", () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
        allowlist: policy(
          [
            exception({
              expiresOn: "2026-10-01",
              trackingItem: "PR-02 dependency remediation",
            }),
          ],
          fixture.affectedNodes
        ),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "exception-ttl" }),
        expect.objectContaining({ code: "exception-rationale" }),
      ])
    );
  });

  test.each(["0", "999999999999999999999999999999999999"])(
    "rejects invalid pull number %s as a tracking item",
    (pullNumber) => {
      const fixture = productionFixture();
      const result = evaluateAuditPolicy(
        input({
          fullReport: report(fixture.vulnerabilities),
          productionReport: report(fixture.vulnerabilities),
          lockfile: fixture.lockfile,
          allowlist: policy(
            [
              exception({
                trackingItem: `https://github.com/itzSlomz/adsniper/pull/${pullNumber}`,
              }),
            ],
            fixture.affectedNodes
          ),
        })
      );

      expect(result.ok).toBe(false);
      expect(result.problems).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "exception-rationale" })])
      );
    }
  );

  test("fails when the production report is not a subset of full", () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        productionReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
        allowlist: policy([exception()]),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "production-not-subset" })])
    );
  });

  test("fails when full contains a runtime finding omitted by production", () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        lockfile: fixture.lockfile,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "production-scan-missing" })])
    );
  });

  test("fails report counts that do not reconcile", () => {
    const fixture = productionFixture();
    const broken = report(fixture.vulnerabilities);
    broken.metadata.vulnerabilities.critical = 0;
    const result = evaluateAuditPolicy(
      input({ fullReport: broken, productionReport: broken, lockfile: fixture.lockfile })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-count-mismatch" })])
    );
  });

  test("rejects all-zero vulnerability and dependency metadata for a non-empty lock tree", () => {
    const fixture = productionFixture();
    const broken = report(fixture.vulnerabilities);
    for (const key of Object.keys(broken.metadata.vulnerabilities)) {
      broken.metadata.vulnerabilities[key] = 0;
    }
    for (const key of Object.keys(broken.metadata.dependencies)) {
      (broken.metadata.dependencies as Record<string, number>)[key] = 0;
    }
    const result = evaluateAuditPolicy(
      input({
        fullReport: broken,
        productionReport: broken,
        lockfile: fixture.lockfile,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "report-count-mismatch" }),
        expect.objectContaining({ code: "report-dependency-count-mismatch" }),
      ])
    );
  });

  test.each(["prod", "dev", "optional", "peer", "peerOptional", "total"])(
    "reconciles metadata.dependencies.%s against package-lock.json",
    (field) => {
      const lockfile = lock({
        "node_modules/runtime": { version: "1.0.0" },
        "node_modules/dev-tool": { version: "1.0.0", dev: true },
        "node_modules/optional-tool": { version: "1.0.0", optional: true },
        "node_modules/peer-tool": { version: "1.0.0", peer: true },
        "node_modules/peer-optional-tool": {
          version: "1.0.0",
          peer: true,
          peerOptional: true,
        },
      });
      const expected = {
        prod: 2,
        dev: 1,
        optional: 1,
        peer: 2,
        peerOptional: 1,
        total: 5,
      };
      const clean = report({}, expected);
      const changed = JSON.parse(JSON.stringify(clean));
      changed.metadata.dependencies[field] += 1;
      const result = evaluateAuditPolicy(
        input({ fullReport: changed, productionReport: clean, lockfile })
      );

      expect(result.ok).toBe(false);
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "report-dependency-count-mismatch" }),
        ])
      );
    }
  );

  test("rejects unsafe dependency counts and workspaces it cannot validate", () => {
    const unsafe = report();
    unsafe.metadata.dependencies.total = Number.MAX_SAFE_INTEGER + 1;
    const workspaceLock = lock();
    (workspaceLock.packages[""] as Record<string, unknown>).workspaces = ["packages/*"];
    const result = evaluateAuditPolicy(
      input({ fullReport: unsafe, productionReport: unsafe, lockfile: workspaceLock })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "report-dependency-counts" }),
        expect.objectContaining({ code: "lockfile-workspaces-unsupported" }),
      ])
    );
  });

  test("fails a report node that is absent from the lockfile", () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(fixture.vulnerabilities),
        productionReport: report(fixture.vulnerabilities),
        lockfile: lock(),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-lock-path-missing" })])
    );
  });

  test("fails missing and cyclic meta-vulnerability chains", () => {
    const missing = {
      parent: vulnerability("parent", "high", ["absent"]),
    };
    const cycle = {
      alpha: vulnerability("alpha", "high", ["beta"]),
      beta: vulnerability("beta", "high", ["alpha"]),
    };
    const missingResult = evaluateAuditPolicy(
      input({
        fullReport: report(missing),
        productionReport: report(missing),
        lockfile: lock({ "node_modules/parent": { version: "1.0.0" } }),
      })
    );
    const cycleLock = lock({
      "node_modules/alpha": { version: "1.0.0" },
      "node_modules/beta": { version: "1.0.0" },
    });
    const cycleResult = evaluateAuditPolicy(
      input({ fullReport: report(cycle), productionReport: report(cycle), lockfile: cycleLock })
    );

    expect(missingResult.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-via-missing" })])
    );
    expect(cycleResult.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-via-cycle" })])
    );
  });

  test.each([
    ["missing status", { scans: undefined }, "scan-status-unavailable"],
    [
      "scan timeout",
      { scans: { ...SUCCESSFUL_SCANS, full: { ...SUCCESSFUL_SCANS.full, timedOut: true } } },
      "scan-timeout",
    ],
    [
      "scan error exit",
      { scans: { ...SUCCESSFUL_SCANS, production: { ...SUCCESSFUL_SCANS.production, exitCode: 1 } } },
      "scan-exit-code",
    ],
    ["missing report", { fullReport: undefined }, "report-unavailable"],
    ["missing lockfile", { lockfile: undefined }, "lockfile-unavailable"],
    ["missing allowlist", { allowlist: undefined }, "allowlist-unavailable"],
    [
      "incomplete scan status",
      { scans: { ...SUCCESSFUL_SCANS, full: { exitCode: 0 } } },
      "scan-status-shape",
    ],
  ])("fails closed on %s", (_name, override, code) => {
    const result = evaluateAuditPolicy(input(override as Record<string, unknown>));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })])
    );
  });

  test("requires a GHSA for every direct high/critical advisory", () => {
    const bad = {
      package: vulnerability("package", "high", [
        { ...advisory("package", 4004, "high"), url: "https://example.com/advisory/4004" },
      ]),
    };
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(bad),
        productionReport: report(bad),
        lockfile: lock({ "node_modules/package": { version: "1.0.0" } }),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-advisory-ghsa" })])
    );
  });

  test("requires the exact GitHub Advisory Database origin for a GHSA URL", () => {
    const bad = {
      package: vulnerability("package", "high", [
        {
          ...advisory("package", 4006, "high"),
          url: "https://attacker.invalid/advisories/GHSA-aaaa-bbbb-cccc",
        },
      ]),
    };
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(bad),
        productionReport: report(bad),
        lockfile: lock({ "node_modules/package": { version: "1.0.0" } }),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-advisory-ghsa" })])
    );
  });

  test("rejects incomplete npm audit v2 objects", () => {
    const fixture = productionFixture();
    const broken = report(fixture.vulnerabilities);
    delete (broken.metadata as Record<string, unknown>).dependencies;
    delete (broken.vulnerabilities["vulnerable-leaf"] as Record<string, unknown>).range;
    const result = evaluateAuditPolicy(
      input({ fullReport: broken, productionReport: broken, lockfile: fixture.lockfile })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "report-dependency-counts" }),
        expect.objectContaining({ code: "report-vulnerability-fields" }),
      ])
    );
  });

  test("rejects a direct advisory whose package identity is inconsistent", () => {
    const mismatched = {
      package: vulnerability("package", "high", [
        {
          ...advisory("different-package", 4005, "high", "GHSA-kkkk-mmmm-nnnn"),
        },
      ]),
    };
    const result = evaluateAuditPolicy(
      input({
        fullReport: report(mismatched),
        productionReport: report(mismatched),
        lockfile: lock({ "node_modules/package": { version: "1.0.0" } }),
      })
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "report-advisory-package" })])
    );
  });

  test("redacts registry credentials and common npm token forms", () => {
    const value = [
      "https://user:password@registry.example.test/path",
      "npm_abcdefghijklmnopqrstuvwxyz0123456789",
      "Bearer secret.jwt.token",
      "_authToken=top-secret",
    ].join("\n");

    const redacted = redactText(value);
    expect(redacted).not.toContain("password");
    expect(redacted).not.toContain("npm_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(redacted).not.toContain("secret.jwt.token");
    expect(redacted).not.toContain("top-secret");
  });

  test("rejects duplicate keys in raw JSON before semantic validation", () => {
    const parsed = parseJson(
      '{"expiresOn":"2026-09-01","expires\\u004fn":"2026-09-20"}'
    );

    expect(parsed.value).toBeUndefined();
    expect(parsed.error).toContain("Duplicate JSON object key");
    expect(parsed.error).toContain("$.expiresOn");
  });

  test("pins explicit full and production npm audit arguments", () => {
    expect(FULL_AUDIT_ARGS).toEqual([
      "audit",
      "--json",
      "--package-lock-only",
      "--include=prod",
      "--include=dev",
      "--include=optional",
      "--include=peer",
    ]);
    expect(PRODUCTION_AUDIT_ARGS).toEqual([
      "audit",
      "--json",
      "--package-lock-only",
      "--omit=dev",
      "--include=prod",
      "--include=optional",
      "--include=peer",
    ]);
  });

  test("captures child stdout, stderr, and exit status for evidence", async () => {
    const result = await runAuditCommand("fixture", ["ignored"], {
      invocation: {
        command: process.execPath,
        args: [
          "-e",
          "process.stdout.write('audit-json'); process.stderr.write('audit-warning');",
        ],
        shell: false,
      },
      cwd: process.cwd(),
      timeoutMs: 5_000,
      maxBytes: 1_024,
    });

    expect(result).toEqual(
      expect.objectContaining({
        exitCode: 0,
        signal: null,
        timedOut: false,
        outputLimitExceeded: false,
        spawnError: null,
        stdout: "audit-json",
        stderr: "audit-warning",
      })
    );
  });

  test("workflow makes audit policy and evidence upload non-optional", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const yaml = require("js-yaml") as { load: (value: string) => any };
    const workflow = yaml.load(
      fs.readFileSync(
        path.resolve(process.cwd(), ".github", "workflows", "ci.yml"),
        "utf8"
      )
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")
    );

    expect(validateDependencyAuditWorkflow(workflow, packageJson)).toEqual([]);

    const withDisabledJob = JSON.parse(JSON.stringify(workflow));
    withDisabledJob.jobs["dependency-audit"].if = false;
    expect(validateDependencyAuditWorkflow(withDisabledJob, packageJson)).toContain("job-if");

    const withIgnoredAudit = JSON.parse(JSON.stringify(workflow));
    const ignoredAuditStep = withIgnoredAudit.jobs["dependency-audit"].steps.find(
      (step: any) => step.run === "npm run audit:dependencies"
    );
    ignoredAuditStep.run = "npm run audit:dependencies || true";
    expect(validateDependencyAuditWorkflow(withIgnoredAudit, packageJson)).toContain("audit-step");

    const withEarlyUpload = JSON.parse(JSON.stringify(workflow));
    withEarlyUpload.jobs["dependency-audit"].steps.reverse();
    expect(validateDependencyAuditWorkflow(withEarlyUpload, packageJson)).toContain("upload-order");

    const withBaseCheckout = JSON.parse(JSON.stringify(workflow));
    withBaseCheckout.jobs["dependency-audit"].steps[0].with = { ref: "main" };
    expect(validateDependencyAuditWorkflow(withBaseCheckout, packageJson)).toContain(
      "checkout-override"
    );

    const withOtherRepository = JSON.parse(JSON.stringify(workflow));
    withOtherRepository.jobs["dependency-audit"].steps[0].with = {
      repository: "someone/else",
    };
    expect(validateDependencyAuditWorkflow(withOtherRepository, packageJson)).toContain(
      "checkout-override"
    );

    const withDisabledNode = JSON.parse(JSON.stringify(workflow));
    withDisabledNode.jobs["dependency-audit"].steps[1].if = false;
    expect(validateDependencyAuditWorkflow(withDisabledNode, packageJson)).toContain(
      "node-22"
    );

    const withNodeReset = JSON.parse(JSON.stringify(workflow));
    withNodeReset.jobs["dependency-audit"].steps.splice(2, 0, {
      name: "Reset Node",
      uses: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
      with: { "node-version": "20.x" },
    });
    expect(validateDependencyAuditWorkflow(withNodeReset, packageJson)).toContain(
      "job-steps"
    );

    const withLateSetup = JSON.parse(JSON.stringify(workflow));
    const lateSteps = withLateSetup.jobs["dependency-audit"].steps;
    const setup = lateSteps.splice(1, 1)[0];
    lateSteps.splice(2, 0, setup);
    expect(validateDependencyAuditWorkflow(withLateSetup, packageJson)).toContain(
      "setup-order"
    );

    const withIgnoredPackageScript = JSON.parse(JSON.stringify(packageJson));
    withIgnoredPackageScript.scripts["audit:dependencies"] =
      "node scripts/dependency-audit.cjs || true";
    expect(
      validateDependencyAuditWorkflow(workflow, withIgnoredPackageScript)
    ).toContain("audit-script");

    const withConditionalDependency = JSON.parse(JSON.stringify(workflow));
    withConditionalDependency.jobs["dependency-audit"].needs = "disabled-job";
    expect(
      validateDependencyAuditWorkflow(withConditionalDependency, packageJson)
    ).toContain("job-shape");

    const withShellOverride = JSON.parse(JSON.stringify(workflow));
    withShellOverride.jobs["dependency-audit"].steps.find(
      (step: any) => step.run === "npm run audit:dependencies"
    ).shell = 'bash -c "source {0} || true"';
    expect(validateDependencyAuditWorkflow(withShellOverride, packageJson)).toContain(
      "audit-optional"
    );

    const withWorkflowDefaults = JSON.parse(JSON.stringify(workflow));
    withWorkflowDefaults.defaults = { run: { shell: 'bash -c "source {0} || true"' } };
    expect(validateDependencyAuditWorkflow(withWorkflowDefaults, packageJson)).toContain(
      "workflow-defaults"
    );

    const withRestrictedPaths = JSON.parse(JSON.stringify(workflow));
    withRestrictedPaths.on.pull_request.paths = ["docs/**"];
    expect(validateDependencyAuditWorkflow(withRestrictedPaths, packageJson)).toContain(
      "triggers"
    );
  });

  test("runner executes both scans, fails closed, and writes reviewable evidence", async () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const os = require("node:os") as typeof import("node:os");
    const path = require("node:path") as typeof import("node:path");
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adsniper-audit-test-"));
    const calls: string[] = [];
    const exitCodes: number[] = [];
    const cleanReport = report();
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      fs.mkdirSync(path.join(repoRoot, ".github"), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, "package-lock.json"),
        `${JSON.stringify(lock(), null, 2)}\n`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(repoRoot, ".github", "dependency-audit-exceptions.json"),
        `${JSON.stringify(policy(), null, 2)}\n`,
        "utf8"
      );
      const outcome = await main(["--output-dir", "evidence"], {
        repoRoot,
        now: NOW,
        setExitCode: (code: number) => exitCodes.push(code),
        runAuditCommand: async (label: string, args: string[]) => {
          calls.push(label);
          return {
            label,
            args,
            exitCode: label === "full" ? 1 : 0,
            signal: null,
            timedOut: false,
            outputLimitExceeded: false,
            spawnError: null,
            stdout: JSON.stringify(cleanReport),
            stderr: label === "full" ? "registry failed" : "",
            startedAt: NOW.toISOString(),
            durationMs: 1,
          };
        },
      });
      expect(calls).toEqual(["full", "production"]);
      expect(exitCodes).toEqual([1]);
      expect(outcome.result.ok).toBe(false);
      expect(outcome.result.problems).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "scan-exit-code" })])
      );
      for (const file of [
        "exceptions.snapshot.json",
        "exceptions.raw.json",
        "full.audit.json",
        "full.command.json",
        "full.stderr.txt",
        "full.stdout.txt",
        "policy-result.json",
        "production.audit.json",
        "production.command.json",
        "production.stderr.txt",
        "production.stdout.txt",
        "run-metadata.json",
        "summary.md",
      ]) {
        expect(fs.existsSync(path.join(repoRoot, "evidence", file))).toBe(true);
      }
      expect(
        JSON.parse(fs.readFileSync(path.join(repoRoot, "evidence", "policy-result.json"), "utf8")).verdict
      ).toBe("fail");
    } finally {
      consoleSpy.mockRestore();
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

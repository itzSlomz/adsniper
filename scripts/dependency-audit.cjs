#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REPORT_VERSION = 2;
const POLICY_VERSION = 1;
const OUTPUT_LIMIT_BYTES = 25 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 120_000;
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const SCOPES = new Set(["production", "development"]);
const EXCEPTION_KEYS = [
  "acceptedOn",
  "advisory",
  "expiresOn",
  "installedVersion",
  "mitigation",
  "nodePath",
  "npmSource",
  "owner",
  "package",
  "reason",
  "scope",
  "severity",
  "trackingItem",
].sort();
const AFFECTED_NODE_KEYS = [
  "advisories",
  "installedVersion",
  "isDirect",
  "nodePath",
  "package",
  "scope",
  "severity",
  "viaPackages",
].sort();
const SCAN_STATUS_KEYS = [
  "exitCode",
  "outputLimitExceeded",
  "signal",
  "spawnError",
  "timedOut",
].sort();
const VULNERABILITY_KEYS = [
  "effects",
  "fixAvailable",
  "isDirect",
  "name",
  "nodes",
  "range",
  "severity",
  "via",
].sort();
const ADVISORY_KEYS = [
  "cwe",
  "cvss",
  "dependency",
  "name",
  "range",
  "severity",
  "source",
  "title",
  "url",
].sort();
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const FULL_AUDIT_ARGS = [
  "audit",
  "--json",
  "--package-lock-only",
  "--include=prod",
  "--include=dev",
  "--include=optional",
  "--include=peer",
];

const PRODUCTION_AUDIT_ARGS = [
  "audit",
  "--json",
  "--package-lock-only",
  "--omit=dev",
  "--include=prod",
  "--include=optional",
  "--include=peer",
];

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function severityRank(severity) {
  return SEVERITIES.indexOf(severity);
}

function extractGhsa(url) {
  if (typeof url !== "string") return null;
  const match = url.match(
    /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/
  );
  return match ? match[1] : null;
}

function packageNameFromNodePath(nodePath) {
  if (typeof nodePath !== "string" || nodePath.includes("\\")) return null;
  const marker = "node_modules/";
  const index = nodePath.lastIndexOf(marker);
  if (index < 0) return null;
  const tail = nodePath.slice(index + marker.length);
  const parts = tail.split("/");
  if (parts[0]?.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] || null;
}

function findingBaseKey(finding) {
  return [
    finding.package,
    finding.nodePath,
    finding.installedVersion,
    String(finding.npmSource),
    finding.advisory,
    finding.severity,
  ].join("\u0000");
}

function findingTupleKey(finding) {
  return `${findingBaseKey(finding)}\u0000${finding.scope}`;
}

function affectedNodeBaseKey(node) {
  return [
    node.package,
    node.nodePath,
    node.installedVersion,
    node.severity,
    String(node.isDirect),
    node.viaPackages.join(","),
    node.advisories.join(","),
  ].join("\u0000");
}

function affectedNodeTupleKey(node) {
  return `${affectedNodeBaseKey(node)}\u0000${node.scope}`;
}

function compareFindings(a, b) {
  return findingTupleKey(a).localeCompare(findingTupleKey(b));
}

function compareAffectedNodes(a, b) {
  return affectedNodeTupleKey(a).localeCompare(affectedNodeTupleKey(b));
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const milliseconds = Date.UTC(year, month - 1, day);
  const date = new Date(milliseconds);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return milliseconds;
}

function validateScanStatus(label, status, report, problems) {
  if (!isPlainObject(status)) {
    problems.push(issue("scan-status-unavailable", `${label} scan status is unavailable.`, { scan: label }));
    return;
  }
  if (JSON.stringify(Object.keys(status).sort()) !== JSON.stringify(SCAN_STATUS_KEYS)) {
    problems.push(issue("scan-status-shape", `${label} scan status must contain the complete runner result.`, { scan: label }));
  }
  if (
    (status.exitCode !== null && !Number.isInteger(status.exitCode)) ||
    (status.signal !== null && (typeof status.signal !== "string" || status.signal.length === 0)) ||
    typeof status.timedOut !== "boolean" ||
    typeof status.outputLimitExceeded !== "boolean" ||
    (status.spawnError !== null && (typeof status.spawnError !== "string" || status.spawnError.length === 0))
  ) {
    problems.push(issue("scan-status-types", `${label} scan status contains invalid field types.`, { scan: label }));
  }
  if (status.timedOut === true) {
    problems.push(issue("scan-timeout", `${label} npm audit timed out.`, { scan: label }));
  }
  if (status.outputLimitExceeded === true) {
    problems.push(issue("scan-output-limit", `${label} npm audit exceeded the output limit.`, { scan: label }));
  }
  if (typeof status.spawnError === "string" && status.spawnError.length > 0) {
    problems.push(issue("scan-spawn-error", `${label} npm audit could not start: ${status.spawnError}`, { scan: label }));
  }
  if (status.signal !== null && status.signal !== undefined) {
    problems.push(issue("scan-signal", `${label} npm audit ended from signal ${String(status.signal)}.`, { scan: label }));
  }
  const validVulnerabilityExit =
    status.exitCode === 1 &&
    isPlainObject(report) &&
    !Object.prototype.hasOwnProperty.call(report, "error") &&
    Number.isSafeInteger(report.metadata?.vulnerabilities?.total) &&
    report.metadata.vulnerabilities.total > 0;
  if (
    !Number.isInteger(status.exitCode) ||
    (status.exitCode !== 0 && !validVulnerabilityExit)
  ) {
    problems.push(
      issue(
        "scan-exit-code",
        `${label} npm audit returned ${String(status.exitCode)} without a valid non-empty vulnerability report explaining exit code 1.`,
        { scan: label, exitCode: status.exitCode ?? null }
      )
    );
  }
}

function validateLockfile(lockfile, problems) {
  if (!isPlainObject(lockfile)) {
    problems.push(issue("lockfile-unavailable", "package-lock.json is unavailable or is not a JSON object."));
    return null;
  }
  if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 2) {
    problems.push(issue("lockfile-version", "package-lock.json must use lockfileVersion 2 or newer."));
  }
  if (!isPlainObject(lockfile.packages) || !isPlainObject(lockfile.packages[""])) {
    problems.push(issue("lockfile-packages", "package-lock.json does not contain a valid packages map and root entry."));
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(lockfile.packages[""], "workspaces")) {
    problems.push(
      issue(
        "lockfile-workspaces-unsupported",
        "Dependency audit directness validation does not support npm workspaces; update the validator before enabling workspaces."
      )
    );
  }
  return lockfile.packages;
}

function expectedDependencyCounts(lockPackages) {
  const entries = Object.values(lockPackages || {});
  const counts = {
    prod: 0,
    dev: 0,
    optional: 0,
    peer: 0,
    peerOptional: 0,
    total: Math.max(0, entries.length - 1),
  };
  for (const entry of entries) {
    if (!isPlainObject(entry)) continue;
    let production = true;
    for (const type of ["dev", "optional", "peer", "peerOptional"]) {
      if (entry[type] === true) {
        counts[type] += 1;
        production = false;
      }
    }
    if (production) counts.prod += 1;
  }
  return counts;
}

function isRootDependency(packageName, lockPackages, nodePaths = []) {
  const root = lockPackages?.[""];
  if (!isPlainObject(root)) return false;
  const declaredAtRoot = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ].some(
    (field) =>
      isPlainObject(root[field]) &&
      Object.prototype.hasOwnProperty.call(root[field], packageName)
  );
  return declaredAtRoot && nodePaths.includes(`node_modules/${packageName}`);
}

function validateNodePath(packageName, nodePath, lockPackages, label, problems) {
  if (typeof nodePath !== "string" || nodePath.length === 0) {
    problems.push(issue("report-node-path", `${label} contains an empty or non-string dependency node path.`, { package: packageName }));
    return null;
  }
  if (path.posix.isAbsolute(nodePath) || nodePath.includes("\\") || nodePath.split("/").includes("..")) {
    problems.push(issue("report-node-path", `${label} contains an unsafe dependency node path: ${nodePath}.`, { package: packageName, nodePath }));
    return null;
  }
  const lockEntry = lockPackages?.[nodePath];
  if (!isPlainObject(lockEntry) || typeof lockEntry.version !== "string" || lockEntry.version.length === 0) {
    problems.push(issue("report-lock-path-missing", `${label} node ${nodePath} is absent from package-lock.json or has no version.`, { package: packageName, nodePath }));
    return null;
  }
  const pathPackage = packageNameFromNodePath(nodePath);
  if (pathPackage !== packageName) {
    problems.push(
      issue("report-lock-package-mismatch", `${label} reports ${packageName} at ${nodePath}, which resolves to ${String(pathPackage)}.`, {
        package: packageName,
        nodePath,
      })
    );
    return null;
  }
  return lockEntry;
}

function validateFixAvailable(label, packageName, fixAvailable, problems) {
  if (typeof fixAvailable === "boolean") return;
  if (
    !isPlainObject(fixAvailable) ||
    JSON.stringify(Object.keys(fixAvailable).sort()) !==
      JSON.stringify(["isSemVerMajor", "name", "version"]) ||
    typeof fixAvailable.name !== "string" ||
    fixAvailable.name.length === 0 ||
    typeof fixAvailable.version !== "string" ||
    fixAvailable.version.length === 0 ||
    typeof fixAvailable.isSemVerMajor !== "boolean"
  ) {
    problems.push(
      issue("report-fix-available", `${label} vulnerability ${packageName} has an invalid fixAvailable value.`, {
        scan: label,
        package: packageName,
      })
    );
  }
}

function validateAdvisoryShape(label, packageName, advisory, problems) {
  if (JSON.stringify(Object.keys(advisory).sort()) !== JSON.stringify(ADVISORY_KEYS)) {
    problems.push(
      issue("report-advisory-fields", `${label} vulnerability ${packageName} has an advisory with an unsupported shape.`, {
        scan: label,
        package: packageName,
      })
    );
  }
  if (advisory.name !== packageName || advisory.dependency !== packageName) {
    problems.push(
      issue("report-advisory-package", `${label} advisory identity does not match vulnerability ${packageName}.`, {
        scan: label,
        package: packageName,
        advisoryName: advisory.name ?? null,
        advisoryDependency: advisory.dependency ?? null,
      })
    );
    return false;
  }
  if (
    typeof advisory.title !== "string" ||
    advisory.title.length === 0 ||
    typeof advisory.url !== "string" ||
    advisory.url.length === 0 ||
    typeof advisory.range !== "string" ||
    advisory.range.length === 0 ||
    !Array.isArray(advisory.cwe) ||
    advisory.cwe.some((value) => typeof value !== "string" || value.length === 0) ||
    !isPlainObject(advisory.cvss) ||
    JSON.stringify(Object.keys(advisory.cvss).sort()) !== JSON.stringify(["score", "vectorString"]) ||
    typeof advisory.cvss.score !== "number" ||
    (advisory.cvss.vectorString !== null && typeof advisory.cvss.vectorString !== "string")
  ) {
    problems.push(
      issue("report-advisory-description", `${label} vulnerability ${packageName} has incomplete advisory metadata.`, {
        scan: label,
        package: packageName,
      })
    );
    return false;
  }
  if (!Number.isInteger(advisory.source) || advisory.source <= 0 || !SEVERITIES.includes(advisory.severity)) {
    problems.push(
      issue("report-advisory-shape", `${label} vulnerability ${packageName} has an advisory with invalid source or severity.`, {
        scan: label,
        package: packageName,
      })
    );
    return false;
  }
  return true;
}

function normalizeReport(label, report, lockPackages, problems) {
  const findings = new Map();
  const affectedNodes = new Map();
  if (!isPlainObject(report)) {
    problems.push(issue("report-unavailable", `${label} npm audit report is unavailable or invalid JSON.`, { scan: label }));
    return { findings, affectedNodes };
  }
  if (Object.prototype.hasOwnProperty.call(report, "error")) {
    problems.push(issue("report-error", `${label} npm audit returned an error payload.`, { scan: label, error: report.error }));
  }
  if (report.auditReportVersion !== REPORT_VERSION) {
    problems.push(
      issue("report-version", `${label} npm audit report version must be ${REPORT_VERSION}, received ${String(report.auditReportVersion)}.`, {
        scan: label,
      })
    );
  }
  if (!isPlainObject(report.vulnerabilities)) {
    problems.push(issue("report-vulnerabilities", `${label} report has no vulnerabilities object.`, { scan: label }));
    return { findings, affectedNodes };
  }

  if (JSON.stringify(Object.keys(report).sort()) !== JSON.stringify(["auditReportVersion", "metadata", "vulnerabilities"])) {
    problems.push(issue("report-root-shape", `${label} npm audit report has an unsupported root shape.`, { scan: label }));
  }

  const vulnerabilities = report.vulnerabilities;
  const computedCounts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  const entries = new Map();

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!isPlainObject(vulnerability)) {
      problems.push(issue("report-vulnerability-shape", `${label} vulnerability ${packageName} is not an object.`, { scan: label, package: packageName }));
      continue;
    }
    if (JSON.stringify(Object.keys(vulnerability).sort()) !== JSON.stringify(VULNERABILITY_KEYS)) {
      problems.push(
        issue("report-vulnerability-fields", `${label} vulnerability ${packageName} has an unsupported shape.`, {
          scan: label,
          package: packageName,
        })
      );
    }
    if (vulnerability.name !== packageName) {
      problems.push(
        issue("report-vulnerability-name", `${label} vulnerability key ${packageName} does not match its name.`, {
          scan: label,
          package: packageName,
        })
      );
    }
    if (!SEVERITIES.includes(vulnerability.severity)) {
      problems.push(
        issue("report-severity", `${label} vulnerability ${packageName} has unknown severity ${String(vulnerability.severity)}.`, {
          scan: label,
          package: packageName,
        })
      );
    } else {
      computedCounts[vulnerability.severity] += 1;
    }
    if (!Array.isArray(vulnerability.via)) {
      problems.push(issue("report-via", `${label} vulnerability ${packageName} has no via array.`, { scan: label, package: packageName }));
    } else {
      const seenVia = new Set();
      for (const via of vulnerability.via) {
        let identity = null;
        if (typeof via === "string") {
          if (via.length === 0) {
            problems.push(issue("report-via-package", `${label} vulnerability ${packageName} has an empty via package.`, { scan: label, package: packageName }));
          } else {
            identity = `package:${via}`;
          }
        } else if (isPlainObject(via) && Number.isInteger(via.source)) {
          identity = `source:${via.source}`;
        }
        if (identity !== null && seenVia.has(identity)) {
          problems.push(
            issue("report-duplicate-via", `${label} vulnerability ${packageName} repeats via identity ${identity}.`, {
              scan: label,
              package: packageName,
              via: identity,
            })
          );
        }
        if (identity !== null) seenVia.add(identity);
      }
    }
    if (typeof vulnerability.isDirect !== "boolean") {
      problems.push(issue("report-is-direct", `${label} vulnerability ${packageName} has invalid isDirect metadata.`, { scan: label, package: packageName }));
    } else {
      const expectedIsDirect = isRootDependency(
        packageName,
        lockPackages,
        Array.isArray(vulnerability.nodes) ? vulnerability.nodes : []
      );
      if (vulnerability.isDirect !== expectedIsDirect) {
        problems.push(
          issue(
            "report-is-direct-mismatch",
            `${label} vulnerability ${packageName} isDirect=${vulnerability.isDirect} does not match package-lock.json (${expectedIsDirect}).`,
            { scan: label, package: packageName, declared: vulnerability.isDirect, expected: expectedIsDirect }
          )
        );
      }
    }
    if (
      !Array.isArray(vulnerability.effects) ||
      vulnerability.effects.some((value) => typeof value !== "string" || value.length === 0) ||
      new Set(vulnerability.effects).size !== vulnerability.effects.length
    ) {
      problems.push(issue("report-effects", `${label} vulnerability ${packageName} has invalid effects metadata.`, { scan: label, package: packageName }));
    }
    if (typeof vulnerability.range !== "string" || vulnerability.range.length === 0) {
      problems.push(issue("report-range", `${label} vulnerability ${packageName} has no affected range.`, { scan: label, package: packageName }));
    }
    validateFixAvailable(label, packageName, vulnerability.fixAvailable, problems);
    if (!Array.isArray(vulnerability.nodes) || vulnerability.nodes.length === 0) {
      problems.push(issue("report-nodes", `${label} vulnerability ${packageName} has no dependency nodes.`, { scan: label, package: packageName }));
    } else {
      const seenNodes = new Set();
      for (const nodePath of vulnerability.nodes) {
        if (seenNodes.has(nodePath)) {
          problems.push(issue("report-duplicate-node", `${label} vulnerability ${packageName} repeats node ${String(nodePath)}.`, { scan: label, package: packageName }));
        }
        seenNodes.add(nodePath);
        validateNodePath(packageName, nodePath, lockPackages, label, problems);
      }
    }
    entries.set(packageName, vulnerability);
  }

  for (const [packageName, vulnerability] of entries) {
    for (const via of Array.isArray(vulnerability.via) ? vulnerability.via : []) {
      if (typeof via !== "string") continue;
      const cause = entries.get(via);
      if (!cause || !Array.isArray(cause.effects) || !cause.effects.includes(packageName)) {
        problems.push(
          issue("report-via-effect-mismatch", `${label} via edge ${packageName} -> ${via} is not reciprocated by effects metadata.`, {
            scan: label,
            package: packageName,
            via,
          })
        );
      }
    }
    for (const effect of Array.isArray(vulnerability.effects) ? vulnerability.effects : []) {
      const consumer = entries.get(effect);
      if (!consumer || !Array.isArray(consumer.via) || !consumer.via.includes(packageName)) {
        problems.push(
          issue("report-effect-via-mismatch", `${label} effect edge ${packageName} -> ${effect} is not reciprocated by via metadata.`, {
            scan: label,
            package: packageName,
            effect,
          })
        );
      }
    }
  }

  if (
    !isPlainObject(report.metadata) ||
    JSON.stringify(Object.keys(report.metadata).sort()) !== JSON.stringify(["dependencies", "vulnerabilities"])
  ) {
    problems.push(issue("report-metadata", `${label} report has incomplete metadata.`, { scan: label }));
  }
  const dependencyCounts = report.metadata?.dependencies;
  const dependencyCountKeys = ["dev", "optional", "peer", "peerOptional", "prod", "total"];
  if (
    !isPlainObject(dependencyCounts) ||
    JSON.stringify(Object.keys(dependencyCounts).sort()) !== JSON.stringify(dependencyCountKeys) ||
    dependencyCountKeys.some(
      (key) => !Number.isSafeInteger(dependencyCounts[key]) || dependencyCounts[key] < 0
    )
  ) {
    problems.push(issue("report-dependency-counts", `${label} report has invalid metadata.dependencies counts.`, { scan: label }));
  } else {
    const expectedCounts = expectedDependencyCounts(lockPackages);
    for (const key of dependencyCountKeys) {
      if (dependencyCounts[key] !== expectedCounts[key]) {
        problems.push(
          issue(
            "report-dependency-count-mismatch",
            `${label} metadata.dependencies.${key}=${dependencyCounts[key]} does not match package-lock.json (${expectedCounts[key]}).`,
            {
              scan: label,
              dependencyType: key,
              declared: dependencyCounts[key],
              expected: expectedCounts[key],
            }
          )
        );
      }
    }
  }

  const metadataCounts = report.metadata?.vulnerabilities;
  if (!isPlainObject(metadataCounts)) {
    problems.push(issue("report-counts", `${label} report has no metadata.vulnerabilities counts.`, { scan: label }));
  } else {
    if (JSON.stringify(Object.keys(metadataCounts).sort()) !== JSON.stringify([...SEVERITIES, "total"].sort())) {
      problems.push(issue("report-count-fields", `${label} metadata.vulnerabilities has an unsupported shape.`, { scan: label }));
    }
    let sum = 0;
    for (const severity of SEVERITIES) {
      const declared = metadataCounts[severity];
      if (!Number.isInteger(declared) || declared < 0) {
        problems.push(issue("report-count", `${label} count for ${severity} is invalid.`, { scan: label, severity }));
        continue;
      }
      sum += declared;
      if (declared !== computedCounts[severity]) {
        problems.push(
          issue("report-count-mismatch", `${label} declares ${declared} ${severity} package nodes but contains ${computedCounts[severity]}.`, {
            scan: label,
            severity,
            declared,
            computed: computedCounts[severity],
          })
        );
      }
    }
    if (!Number.isInteger(metadataCounts.total) || metadataCounts.total !== sum || sum !== entries.size) {
      problems.push(
        issue("report-total-mismatch", `${label} vulnerability total does not reconcile with severity counts and package nodes.`, {
          scan: label,
          declared: metadataCounts.total ?? null,
          summed: sum,
          entries: entries.size,
        })
      );
    }
  }

  const memo = new Map();
  const resolving = new Set();

  function resolve(packageName) {
    if (memo.has(packageName)) return memo.get(packageName);
    if (resolving.has(packageName)) {
      problems.push(issue("report-via-cycle", `${label} report contains a via cycle at ${packageName}.`, { scan: label, package: packageName }));
      return [];
    }
    const vulnerability = entries.get(packageName);
    if (!vulnerability) {
      problems.push(issue("report-via-missing", `${label} report references missing meta-vulnerability ${packageName}.`, { scan: label, package: packageName }));
      return [];
    }

    resolving.add(packageName);
    const resolved = [];
    const viaItems = Array.isArray(vulnerability.via) ? vulnerability.via : [];
    for (const via of viaItems) {
      if (typeof via === "string") {
        if (!entries.has(via)) {
          problems.push(
            issue("report-via-missing", `${label} vulnerability ${packageName} references missing ${via}.`, {
              scan: label,
              package: packageName,
              via,
            })
          );
          continue;
        }
        resolved.push(...resolve(via));
        continue;
      }
      if (!isPlainObject(via)) {
        problems.push(issue("report-via-shape", `${label} vulnerability ${packageName} has an invalid via item.`, { scan: label, package: packageName }));
        continue;
      }
      if (!validateAdvisoryShape(label, packageName, via, problems)) continue;
      if (!BLOCKING_SEVERITIES.has(via.severity)) continue;
      const advisory = extractGhsa(via.url);
      if (!advisory) {
        problems.push(
          issue("report-advisory-ghsa", `${label} high/critical advisory ${via.source} for ${packageName} has no canonical GHSA URL.`, {
            scan: label,
            package: packageName,
            npmSource: via.source,
          })
        );
        continue;
      }
      for (const nodePath of Array.isArray(vulnerability.nodes) ? vulnerability.nodes : []) {
        const lockEntry = validateNodePath(packageName, nodePath, lockPackages, label, problems);
        if (!lockEntry) continue;
        resolved.push({
          package: packageName,
          nodePath,
          installedVersion: lockEntry.version,
          npmSource: via.source,
          advisory,
          severity: via.severity,
        });
      }
    }
    resolving.delete(packageName);
    const unique = [...new Map(resolved.map((finding) => [findingBaseKey(finding), finding])).values()];
    memo.set(packageName, unique);
    return unique;
  }

  for (const [packageName, vulnerability] of entries) {
    const resolved = resolve(packageName);
    const viaPackages = (Array.isArray(vulnerability.via) ? vulnerability.via : [])
      .filter((via) => typeof via === "string")
      .sort();
    for (const finding of resolved) findings.set(findingBaseKey(finding), finding);
    if (BLOCKING_SEVERITIES.has(vulnerability.severity) && resolved.length === 0) {
      problems.push(
        issue("report-unresolved-blocking-meta", `${label} high/critical package node ${packageName} did not resolve to a direct high/critical advisory.`, {
          scan: label,
          package: packageName,
        })
      );
    }
    if (resolved.length > 0) {
      const highestResolvedSeverity = Math.max(...resolved.map((finding) => severityRank(finding.severity)));
      if (highestResolvedSeverity !== severityRank(vulnerability.severity)) {
        problems.push(
          issue(
            "report-meta-severity",
            `${label} ${vulnerability.severity} package node ${packageName} does not match the highest resolved advisory severity ${SEVERITIES[highestResolvedSeverity]}.`,
            { scan: label, package: packageName, severity: vulnerability.severity }
          )
        );
      }
    }
    if (BLOCKING_SEVERITIES.has(vulnerability.severity) && resolved.length > 0) {
      const advisories = [...new Set(resolved.map((finding) => finding.advisory))].sort();
      for (const nodePath of Array.isArray(vulnerability.nodes) ? vulnerability.nodes : []) {
        const lockEntry = validateNodePath(packageName, nodePath, lockPackages, label, problems);
        if (!lockEntry) continue;
        const node = {
          package: packageName,
          nodePath,
          installedVersion: lockEntry.version,
          severity: vulnerability.severity,
          isDirect: vulnerability.isDirect,
          viaPackages,
          advisories,
        };
        affectedNodes.set(affectedNodeBaseKey(node), node);
      }
    }
  }

  return { findings, affectedNodes };
}

function hasWildcard(value) {
  return typeof value === "string" && /[*?\[\]]/.test(value);
}

function validateAllowlist(allowlist, lockPackages, now, problems) {
  const valid = [];
  const expired = [];
  const affectedNodes = [];
  if (!isPlainObject(allowlist)) {
    problems.push(issue("allowlist-unavailable", "Dependency audit exception policy is unavailable or invalid JSON."));
    return { valid, expired, affectedNodes };
  }
  const rootKeys = Object.keys(allowlist).sort();
  if (JSON.stringify(rootKeys) !== JSON.stringify(["affectedNodes", "exceptions", "schemaVersion"])) {
    problems.push(issue("allowlist-root-shape", "Exception policy root must contain exactly schemaVersion, exceptions, and affectedNodes."));
  }
  if (allowlist.schemaVersion !== POLICY_VERSION) {
    problems.push(issue("allowlist-version", `Exception policy schemaVersion must be ${POLICY_VERSION}.`));
  }
  if (!Array.isArray(allowlist.exceptions)) {
    problems.push(issue("allowlist-exceptions", "Exception policy exceptions must be an array."));
    return { valid, expired, affectedNodes };
  }
  if (!Array.isArray(allowlist.affectedNodes)) {
    problems.push(issue("allowlist-affected-nodes", "Exception policy affectedNodes must be an array."));
    return { valid, expired, affectedNodes };
  }

  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) {
    problems.push(issue("policy-clock", "Policy evaluation time is invalid."));
  }
  const seen = new Set();

  allowlist.exceptions.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      problems.push(issue("exception-shape", `Exception ${index} is not an object.`, { exceptionIndex: index }));
      return;
    }
    if (JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(EXCEPTION_KEYS)) {
      problems.push(issue("exception-fields", `Exception ${index} must contain exactly the documented fields.`, { exceptionIndex: index }));
      return;
    }

    const stringFields = [
      "package",
      "nodePath",
      "installedVersion",
      "advisory",
      "severity",
      "scope",
      "owner",
      "trackingItem",
      "reason",
      "mitigation",
      "acceptedOn",
      "expiresOn",
    ];
    let malformed = false;
    for (const field of stringFields) {
      if (typeof entry[field] !== "string" || entry[field].trim() !== entry[field] || entry[field].length === 0) {
        problems.push(issue("exception-field", `Exception ${index} has an invalid ${field}.`, { exceptionIndex: index, field }));
        malformed = true;
      }
    }
    for (const field of ["package", "nodePath", "installedVersion", "advisory", "scope"]) {
      if (hasWildcard(entry[field])) {
        problems.push(issue("exception-wildcard", `Exception ${index} may not use a wildcard in ${field}.`, { exceptionIndex: index, field }));
        malformed = true;
      }
    }
    if (!Number.isInteger(entry.npmSource) || entry.npmSource <= 0) {
      problems.push(issue("exception-source", `Exception ${index} npmSource must be a positive integer.`, { exceptionIndex: index }));
      malformed = true;
    }
    if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(entry.advisory)) {
      problems.push(issue("exception-advisory", `Exception ${index} advisory must be a canonical GHSA identifier.`, { exceptionIndex: index }));
      malformed = true;
    }
    if (!BLOCKING_SEVERITIES.has(entry.severity)) {
      problems.push(issue("exception-severity", `Exception ${index} severity must be high or critical.`, { exceptionIndex: index }));
      malformed = true;
    }
    if (!SCOPES.has(entry.scope)) {
      problems.push(issue("exception-scope", `Exception ${index} scope must be production or development.`, { exceptionIndex: index }));
      malformed = true;
    }
    if (!/^@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(entry.owner)) {
      problems.push(issue("exception-owner", `Exception ${index} owner must be a GitHub user or team handle.`, { exceptionIndex: index }));
      malformed = true;
    }
    const trackingMatch =
      typeof entry.trackingItem === "string"
        ? entry.trackingItem.match(
            // The repository was renamed adsniper → marketingspy on
            // 2026-09-21. Both names are accepted: GitHub redirects the old
            // one, and exceptions accepted before the rename cite it.
            /^https:\/\/github\.com\/itzSlomz\/(?:marketingspy|adsniper)\/(?:issues|pull)\/(\d+)(?:#[A-Za-z0-9_.-]+)?$/
          )
        : null;
    if (
      entry.reason.length < 10 ||
      entry.mitigation.length < 10 ||
      trackingMatch === null ||
      !Number.isSafeInteger(Number(trackingMatch?.[1])) ||
      Number(trackingMatch?.[1]) < 1
    ) {
      problems.push(issue("exception-rationale", `Exception ${index} needs a concrete tracking item, reason, and mitigation.`, { exceptionIndex: index }));
      malformed = true;
    }
    if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(entry.installedVersion)) {
      problems.push(issue("exception-version", `Exception ${index} installedVersion must be exact, not a range.`, { exceptionIndex: index }));
      malformed = true;
    }

    const acceptedMs = parseDateOnly(entry.acceptedOn);
    const expiresMs = parseDateOnly(entry.expiresOn);
    if (acceptedMs === null || expiresMs === null || expiresMs <= acceptedMs) {
      problems.push(issue("exception-dates", `Exception ${index} has invalid acceptedOn/expiresOn dates.`, { exceptionIndex: index }));
      malformed = true;
    } else {
      const maximumDays = entry.severity === "critical" ? 14 : entry.scope === "production" ? 30 : 45;
      if (expiresMs - acceptedMs > maximumDays * MILLISECONDS_PER_DAY) {
        problems.push(
          issue("exception-ttl", `Exception ${index} exceeds the ${maximumDays}-day maximum for its severity and scope.`, {
            exceptionIndex: index,
            maximumDays,
          })
        );
        malformed = true;
      }
      if (Number.isFinite(nowMs) && acceptedMs > nowMs) {
        problems.push(issue("exception-future", `Exception ${index} was accepted in the future.`, { exceptionIndex: index }));
        malformed = true;
      }
      if (Number.isFinite(nowMs) && nowMs >= expiresMs) {
        problems.push(issue("exception-expired", `Exception ${index} expired at 00:00Z on ${entry.expiresOn}.`, { exceptionIndex: index }));
        expired.push({ index, ...entry });
      }
    }

    if (typeof entry.nodePath === "string") {
      const lockEntry = validateNodePath(entry.package, entry.nodePath, lockPackages, "exception policy", problems);
      if (!lockEntry || lockEntry.version !== entry.installedVersion) {
        problems.push(
          issue("exception-lock-mismatch", `Exception ${index} does not match the package and installed version in package-lock.json.`, {
            exceptionIndex: index,
          })
        );
        malformed = true;
      } else {
        const lockScope = lockEntry.dev === true ? "development" : "production";
        if (SCOPES.has(entry.scope) && entry.scope !== lockScope) {
          problems.push(
            issue("exception-scope-mismatch", `Exception ${index} scope ${entry.scope} does not match lockfile scope ${lockScope}.`, {
              exceptionIndex: index,
            })
          );
          malformed = true;
        }
      }
    }

    const tuple = findingTupleKey(entry);
    if (seen.has(tuple)) {
      problems.push(issue("exception-duplicate", `Exception ${index} duplicates an earlier exact tuple.`, { exceptionIndex: index }));
      malformed = true;
    }
    seen.add(tuple);
    if (!malformed) valid.push({ index, ...entry, expired: expiresMs !== null && Number.isFinite(nowMs) && nowMs >= expiresMs });
  });

  const seenAffectedNodes = new Set();
  allowlist.affectedNodes.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      problems.push(issue("affected-node-shape", `Affected node ${index} is not an object.`, { affectedNodeIndex: index }));
      return;
    }
    if (JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(AFFECTED_NODE_KEYS)) {
      problems.push(issue("affected-node-fields", `Affected node ${index} must contain exactly the documented fields.`, { affectedNodeIndex: index }));
      return;
    }
    let malformed = false;
    for (const field of ["package", "nodePath", "installedVersion", "severity", "scope"]) {
      if (typeof entry[field] !== "string" || entry[field].trim() !== entry[field] || entry[field].length === 0) {
        problems.push(issue("affected-node-field", `Affected node ${index} has an invalid ${field}.`, { affectedNodeIndex: index, field }));
        malformed = true;
      }
      if (["package", "nodePath", "installedVersion", "scope"].includes(field) && hasWildcard(entry[field])) {
        problems.push(issue("affected-node-wildcard", `Affected node ${index} may not use a wildcard in ${field}.`, { affectedNodeIndex: index, field }));
        malformed = true;
      }
    }
    if (!BLOCKING_SEVERITIES.has(entry.severity)) {
      problems.push(issue("affected-node-severity", `Affected node ${index} severity must be high or critical.`, { affectedNodeIndex: index }));
      malformed = true;
    }
    if (!SCOPES.has(entry.scope)) {
      problems.push(issue("affected-node-scope", `Affected node ${index} scope must be production or development.`, { affectedNodeIndex: index }));
      malformed = true;
    }
    if (typeof entry.isDirect !== "boolean") {
      problems.push(issue("affected-node-is-direct", `Affected node ${index} isDirect must be boolean.`, { affectedNodeIndex: index }));
      malformed = true;
    }
    if (
      !Array.isArray(entry.viaPackages) ||
      entry.viaPackages.some(
        (value) =>
          typeof value !== "string" ||
          value.length === 0 ||
          !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(value)
      ) ||
      new Set(entry.viaPackages).size !== entry.viaPackages.length ||
      JSON.stringify(entry.viaPackages) !== JSON.stringify([...entry.viaPackages].sort())
    ) {
      problems.push(issue("affected-node-via-packages", `Affected node ${index} viaPackages must be a sorted, unique package-name list.`, { affectedNodeIndex: index }));
      malformed = true;
    }
    if (
      !Array.isArray(entry.advisories) ||
      entry.advisories.length === 0 ||
      entry.advisories.some((value) => typeof value !== "string" || !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(value)) ||
      new Set(entry.advisories).size !== entry.advisories.length ||
      JSON.stringify(entry.advisories) !== JSON.stringify([...entry.advisories].sort())
    ) {
      problems.push(issue("affected-node-advisories", `Affected node ${index} advisories must be a sorted, unique, non-empty GHSA list.`, { affectedNodeIndex: index }));
      malformed = true;
    }
    if (typeof entry.installedVersion === "string" && !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(entry.installedVersion)) {
      problems.push(issue("affected-node-version", `Affected node ${index} installedVersion must be exact.`, { affectedNodeIndex: index }));
      malformed = true;
    }
    if (typeof entry.nodePath === "string") {
      const lockEntry = validateNodePath(entry.package, entry.nodePath, lockPackages, "affected-node policy", problems);
      if (!lockEntry || lockEntry.version !== entry.installedVersion) {
        problems.push(issue("affected-node-lock-mismatch", `Affected node ${index} does not match package-lock.json.`, { affectedNodeIndex: index }));
        malformed = true;
      } else {
        const lockScope = lockEntry.dev === true ? "development" : "production";
        if (SCOPES.has(entry.scope) && entry.scope !== lockScope) {
          problems.push(issue("affected-node-scope-mismatch", `Affected node ${index} scope does not match package-lock.json.`, { affectedNodeIndex: index }));
          malformed = true;
        }
      }
    }
    if (!malformed) {
      const tuple = affectedNodeTupleKey(entry);
      if (seenAffectedNodes.has(tuple)) {
        problems.push(issue("affected-node-duplicate", `Affected node ${index} duplicates an earlier exact tuple.`, { affectedNodeIndex: index }));
      } else {
        seenAffectedNodes.add(tuple);
        affectedNodes.push({ index, ...entry });
      }
    }
  });

  return { valid, expired, affectedNodes };
}

function countFindings(findings) {
  const counts = {
    production: { high: 0, critical: 0, total: 0 },
    development: { high: 0, critical: 0, total: 0 },
  };
  for (const finding of findings) {
    counts[finding.scope][finding.severity] += 1;
    counts[finding.scope].total += 1;
  }
  return counts;
}

/**
 * Pure, fail-closed policy evaluator. It performs no filesystem, process,
 * network, clock, or environment access; callers must supply every input.
 */
function evaluateAuditPolicy({
  fullReport,
  productionReport,
  lockfile,
  allowlist,
  scans,
  now,
}) {
  const problems = [];
  validateScanStatus("full", scans?.full, fullReport, problems);
  validateScanStatus("production", scans?.production, productionReport, problems);
  const lockPackages = validateLockfile(lockfile, problems);
  const full = normalizeReport("full", fullReport, lockPackages, problems);
  const production = normalizeReport("production", productionReport, lockPackages, problems);

  for (const [key, finding] of production.findings) {
    if (!full.findings.has(key)) {
      problems.push(
        issue("production-not-subset", `Production finding ${finding.package} ${finding.advisory} is absent from the full audit.`, {
          finding,
        })
      );
    }
    const lockEntry = lockPackages?.[finding.nodePath];
    if (lockEntry?.dev === true) {
      problems.push(
        issue("production-includes-development", `Production audit includes dev-only node ${finding.nodePath}.`, { finding })
      );
    }
  }

  for (const [key, finding] of full.findings) {
    const lockEntry = lockPackages?.[finding.nodePath];
    if (lockEntry && lockEntry.dev !== true && !production.findings.has(key)) {
      problems.push(
        issue("production-scan-missing", `Production audit omitted runtime node ${finding.nodePath} for ${finding.advisory}.`, { finding })
      );
    }
  }

  for (const [key, node] of production.affectedNodes) {
    if (!full.affectedNodes.has(key)) {
      problems.push(
        issue("production-node-not-subset", `Production affected node ${node.package}@${node.installedVersion} is absent from the full audit.`, { affectedNode: node })
      );
    }
  }

  for (const [key, node] of full.affectedNodes) {
    const lockEntry = lockPackages?.[node.nodePath];
    if (lockEntry && lockEntry.dev !== true && !production.affectedNodes.has(key)) {
      problems.push(
        issue("production-affected-node-missing", `Production audit omitted runtime affected node ${node.nodePath}.`, { affectedNode: node })
      );
    }
  }

  const unified = new Map();
  for (const [key, finding] of full.findings) {
    const scope = production.findings.has(key) ? "production" : "development";
    unified.set(findingTupleKey({ ...finding, scope }), { ...finding, scope });
  }
  for (const [key, finding] of production.findings) {
    const scoped = { ...finding, scope: "production" };
    unified.set(findingTupleKey(scoped), scoped);
    if (!full.findings.has(key)) {
      // Keep the production-only evidence visible even though the subset
      // invariant has already failed.
      unified.set(findingTupleKey(scoped), scoped);
    }
  }
  const findings = [...unified.values()].sort(compareFindings);

  const unifiedAffectedNodes = new Map();
  for (const [key, node] of full.affectedNodes) {
    const scope = production.affectedNodes.has(key) ? "production" : "development";
    const scoped = { ...node, scope };
    unifiedAffectedNodes.set(affectedNodeTupleKey(scoped), scoped);
  }
  for (const node of production.affectedNodes.values()) {
    const scoped = { ...node, scope: "production" };
    unifiedAffectedNodes.set(affectedNodeTupleKey(scoped), scoped);
  }
  const affectedNodes = [...unifiedAffectedNodes.values()].sort(compareAffectedNodes);

  const policy = validateAllowlist(allowlist, lockPackages, now, problems);
  const exceptionByTuple = new Map(
    policy.valid.filter((entry) => !entry.expired).map((entry) => [findingTupleKey(entry), entry])
  );
  const matchedIndexes = new Set();
  const matchedExceptions = [];
  const unexcepted = [];

  for (const finding of findings) {
    const exception = exceptionByTuple.get(findingTupleKey(finding));
    if (!exception) {
      unexcepted.push(finding);
      problems.push(
        issue("unexcepted-finding", `${finding.scope} ${finding.severity} finding is not excepted: ${finding.package} ${finding.advisory} at ${finding.nodePath}.`, {
          finding,
        })
      );
      continue;
    }
    matchedIndexes.add(exception.index);
    matchedExceptions.push(exception);
  }

  const staleExceptions = [];
  for (const exception of policy.valid) {
    if (exception.expired || matchedIndexes.has(exception.index)) continue;
    staleExceptions.push(exception);
    problems.push(
      issue("stale-exception", `Exception ${exception.index} does not match any current high/critical finding.`, {
        exceptionIndex: exception.index,
      })
    );
  }

  const expectedAffectedByTuple = new Map(
    policy.affectedNodes.map((node) => [affectedNodeTupleKey(node), node])
  );
  const matchedAffectedNodeIndexes = new Set();
  const unexpectedAffectedNodes = [];
  for (const node of affectedNodes) {
    const expected = expectedAffectedByTuple.get(affectedNodeTupleKey(node));
    if (!expected) {
      unexpectedAffectedNodes.push(node);
      problems.push(
        issue("unexpected-affected-node", `${node.scope} ${node.severity} package node is not in the exact baseline: ${node.package}@${node.installedVersion} at ${node.nodePath}.`, {
          affectedNode: node,
        })
      );
    } else {
      matchedAffectedNodeIndexes.add(expected.index);
    }
  }
  const staleAffectedNodes = [];
  for (const expected of policy.affectedNodes) {
    if (matchedAffectedNodeIndexes.has(expected.index)) continue;
    staleAffectedNodes.push(expected);
    problems.push(
      issue("stale-affected-node", `Affected-node baseline ${expected.index} no longer matches the audit graph.`, {
        affectedNodeIndex: expected.index,
      })
    );
  }

  return {
    schemaVersion: POLICY_VERSION,
    verdict: problems.length === 0 ? "pass" : "fail",
    ok: problems.length === 0,
    evaluatedAt: now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : null,
    counts: countFindings(findings),
    findings,
    affectedNodes,
    unexpectedAffectedNodes,
    staleAffectedNodes,
    matchedExceptions,
    unexcepted,
    expiredExceptions: policy.expired,
    staleExceptions,
    problems,
  };
}

function redactText(value) {
  return String(value ?? "")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\b(npm_[A-Za-z0-9]{20,})\b/g, "[REDACTED_NPM_TOKEN]")
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/((?:_authToken|authToken|token)\s*[=:]\s*)[^\s"']+/gi, "$1[REDACTED]");
}

function npmVersionFromUserAgent(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|\s)npm\/([^\s]+)/);
  return match ? match[1] : null;
}

function currentNpmVersion() {
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath === "string" && npmExecPath.length > 0) {
    try {
      const npmPackage = JSON.parse(
        fs.readFileSync(path.resolve(path.dirname(npmExecPath), "..", "package.json"), "utf8")
      );
      if (typeof npmPackage.version === "string" && npmPackage.version.length > 0) {
        return npmPackage.version;
      }
    } catch {
      // The user-agent is a safe fallback when npm's installation metadata
      // is unavailable or the runner invokes this script outside npm.
    }
  }
  return npmVersionFromUserAgent(process.env.npm_config_user_agent);
}

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args], shell: false };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args,
    shell: process.platform === "win32",
  };
}

function runAuditCommand(label, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? OUTPUT_LIMIT_BYTES;
  const invocation = options.invocation ?? npmInvocation(args);
  const startedAt = new Date();

  return new Promise((resolve) => {
    let child;
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let spawnError = null;
    let settled = false;
    let timer = null;
    let forceTimer = null;

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      resolve({
        label,
        args,
        exitCode,
        signal: signal ?? null,
        timedOut,
        outputLimitExceeded,
        spawnError,
        stdout,
        stderr,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      });
    };

    try {
      child = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: invocation.shell,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      spawnError = error instanceof Error ? error.message : String(error);
      finish(null, null);
      return;
    }

    const append = (kind, chunk) => {
      const text = chunk.toString("utf8");
      const bytes = Buffer.byteLength(text);
      if (kind === "stdout") {
        stdoutBytes += bytes;
        if (stdoutBytes <= maxBytes) stdout += text;
      } else {
        stderrBytes += bytes;
        if (stderrBytes <= maxBytes) stderr += text;
      }
      if (stdoutBytes > maxBytes || stderrBytes > maxBytes) {
        outputLimitExceeded = true;
        child.kill("SIGTERM");
        if (!forceTimer) {
          forceTimer = setTimeout(() => {
            child.kill("SIGKILL");
            finish(null, "SIGKILL");
          }, 5_000);
        }
      }
    };

    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.on("error", (error) => {
      spawnError = error instanceof Error ? error.message : String(error);
      finish(null, null);
    });
    child.on("close", (code, signal) => finish(code, signal));

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(null, "SIGKILL");
      }, 5_000);
    }, timeoutMs);
  });
}

function formatJsonPath(parts) {
  let output = "$";
  for (const part of parts) {
    if (typeof part === "number") {
      output += `[${part}]`;
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)) {
      output += `.${part}`;
    } else {
      output += `[${JSON.stringify(part)}]`;
    }
  }
  return output;
}

function inspectJsonText(text) {
  let index = 0;
  const duplicates = [];

  const fail = (message) => {
    throw new SyntaxError(`${message} at character ${index}.`);
  };
  const skipWhitespace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };
  const parseString = () => {
    if (text[index] !== '"') fail("Expected a JSON string");
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    fail("Unterminated JSON string");
  };
  const parseValue = (jsonPath) => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") return parseObject(jsonPath);
    if (character === "[") return parseArray(jsonPath);
    if (character === '"') {
      parseString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      index += number[0].length;
      return;
    }
    fail("Expected a JSON value");
  };
  const parseObject = (jsonPath) => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) duplicates.push(formatJsonPath([...jsonPath, key]));
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") fail("Expected ':' after an object key");
      index += 1;
      parseValue([...jsonPath, key]);
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail("Expected ',' or '}' in an object");
      index += 1;
    }
    fail("Unterminated JSON object");
  };
  const parseArray = (jsonPath) => {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    let item = 0;
    while (index < text.length) {
      parseValue([...jsonPath, item]);
      item += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail("Expected ',' or ']' in an array");
      index += 1;
    }
    fail("Unterminated JSON array");
  };

  parseValue([]);
  skipWhitespace();
  if (index !== text.length) fail("Unexpected content after the JSON value");
  return duplicates;
}

function parseJson(text) {
  try {
    if (typeof text !== "string") throw new TypeError("JSON input must be a string.");
    const duplicates = inspectJsonText(text);
    if (duplicates.length > 0) {
      throw new SyntaxError(`Duplicate JSON object key${duplicates.length === 1 ? "" : "s"}: ${duplicates.join(", ")}`);
    }
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: undefined, error: error instanceof Error ? error.message : String(error) };
  }
}

function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = parseJson(text);
    return { ...parsed, text };
  } catch (error) {
    return { value: undefined, text: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, redactText(value), { encoding: "utf8", mode: 0o600 });
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function scanStatus(scan) {
  return {
    exitCode: scan.exitCode,
    signal: scan.signal,
    timedOut: scan.timedOut,
    outputLimitExceeded: scan.outputLimitExceeded,
    spawnError: scan.spawnError,
  };
}

function renderSummary(result, metadata) {
  const fullNodes = metadata.packageNodeCounts.full;
  const productionNodes = metadata.packageNodeCounts.production;
  const lines = [
    "# Dependency audit",
    "",
    `**Verdict:** ${result.verdict.toUpperCase()}`,
    "",
    `- Node: ${metadata.nodeVersion}`,
    `- npm: ${metadata.npmVersion ?? "unavailable"}`,
    `- Lockfile SHA-256: \`${metadata.lockfileSha256 ?? "unavailable"}\``,
    `- Full-tree npm package nodes: ${fullNodes?.critical ?? "unavailable"} critical, ${fullNodes?.high ?? "unavailable"} high`,
    `- Production-tree npm package nodes: ${productionNodes?.critical ?? "unavailable"} critical, ${productionNodes?.high ?? "unavailable"} high`,
    `- Normalized production source records: ${result.counts.production.critical} critical, ${result.counts.production.high} high`,
    `- Normalized development source records: ${result.counts.development.critical} critical, ${result.counts.development.high} high`,
    `- Matched exceptions: ${result.matchedExceptions.length}`,
    `- Unexcepted findings: ${result.unexcepted.length}`,
    `- Expired exceptions: ${result.expiredExceptions.length}`,
    `- Stale exceptions: ${result.staleExceptions.length}`,
    `- Exact affected package nodes: ${result.affectedNodes.length}`,
    `- Unexpected affected package nodes: ${result.unexpectedAffectedNodes.length}`,
    `- Stale affected-node baselines: ${result.staleAffectedNodes.length}`,
  ];
  if (result.problems.length > 0) {
    lines.push("", "## Policy failures", "");
    for (const problem of result.problems) lines.push(`- **${problem.code}:** ${problem.message}`);
  }
  if (result.findings.length > 0) {
    lines.push("", "## Normalized high/critical findings", "");
    for (const finding of result.findings) {
      lines.push(
        `- ${finding.scope} · ${finding.severity} · \`${finding.package}@${finding.installedVersion}\` · ${finding.advisory} / npm:${finding.npmSource} · \`${finding.nodePath}\``
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseOutputDirectory(argv, repoRoot) {
  if (argv.length === 0) return path.join(repoRoot, "artifacts", "dependency-audit");
  if (argv.length === 2 && argv[0] === "--output-dir" && argv[1]) return path.resolve(repoRoot, argv[1]);
  if (argv.length === 1 && argv[0].startsWith("--output-dir=")) {
    const value = argv[0].slice("--output-dir=".length);
    if (value) return path.resolve(repoRoot, value);
  }
  throw new Error("Usage: dependency-audit.cjs [--output-dir <path>]");
}

async function main(argv = process.argv.slice(2), options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, "..");
  const setExitCode = options.setExitCode ?? ((code) => {
    process.exitCode = code;
  });
  let outputDirectory;
  try {
    outputDirectory = parseOutputDirectory(argv, repoRoot);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    setExitCode(1);
    return null;
  }
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });

  const executeScan = options.runAuditCommand ?? runAuditCommand;
  const full = await executeScan("full", FULL_AUDIT_ARGS, { cwd: repoRoot });
  // This call is intentionally unconditional: a failed full scan must not
  // prevent collection of the independently useful production report.
  const production = await executeScan("production", PRODUCTION_AUDIT_ARGS, { cwd: repoRoot });

  for (const scan of [full, production]) {
    writeText(path.join(outputDirectory, `${scan.label}.stdout.txt`), scan.stdout);
    writeText(path.join(outputDirectory, `${scan.label}.stderr.txt`), scan.stderr);
    writeJson(path.join(outputDirectory, `${scan.label}.command.json`), {
      args: scan.args,
      exitCode: scan.exitCode,
      signal: scan.signal,
      timedOut: scan.timedOut,
      outputLimitExceeded: scan.outputLimitExceeded,
      spawnError: scan.spawnError,
      startedAt: scan.startedAt,
      durationMs: scan.durationMs,
    });
  }

  const fullParsed = parseJson(full.stdout);
  const productionParsed = parseJson(production.stdout);
  if (fullParsed.value !== undefined) writeJson(path.join(outputDirectory, "full.audit.json"), fullParsed.value);
  if (productionParsed.value !== undefined) writeJson(path.join(outputDirectory, "production.audit.json"), productionParsed.value);

  const lockPath = path.join(repoRoot, "package-lock.json");
  const policyPath = path.join(repoRoot, ".github", "dependency-audit-exceptions.json");
  const lock = readJson(lockPath);
  const policy = readJson(policyPath);
  writeText(path.join(outputDirectory, "exceptions.raw.json"), policy.text);
  if (policy.value !== undefined) {
    writeJson(path.join(outputDirectory, "exceptions.snapshot.json"), policy.value);
  }
  const now = options.now ?? new Date();
  const result = evaluateAuditPolicy({
    fullReport: fullParsed.value,
    productionReport: productionParsed.value,
    lockfile: lock.value,
    allowlist: policy.value,
    scans: { full: scanStatus(full), production: scanStatus(production) },
    now,
  });

  if (fullParsed.error) {
    result.problems.push(issue("full-json-parse", `Full audit JSON could not be parsed: ${fullParsed.error}`));
  }
  if (productionParsed.error) {
    result.problems.push(issue("production-json-parse", `Production audit JSON could not be parsed: ${productionParsed.error}`));
  }
  if (lock.error) result.problems.push(issue("lockfile-read", `package-lock.json could not be read: ${lock.error}`));
  if (policy.error) result.problems.push(issue("allowlist-read", `Exception policy could not be read: ${policy.error}`));
  if (result.problems.length > 0) {
    result.ok = false;
    result.verdict = "fail";
  }

  const lockfileSha256 = lock.text
    ? crypto.createHash("sha256").update(lock.text, "utf8").digest("hex")
    : null;
  const metadata = {
    generatedAt: now.toISOString(),
    nodeVersion: process.version,
    npmVersion: currentNpmVersion(),
    platform: process.platform,
    architecture: process.arch,
    lockfile: path.relative(repoRoot, lockPath).replaceAll("\\", "/"),
    lockfileSha256,
    policy: path.relative(repoRoot, policyPath).replaceAll("\\", "/"),
    outputDirectory: path.relative(repoRoot, outputDirectory).replaceAll("\\", "/"),
    packageNodeCounts: {
      full: fullParsed.value?.metadata?.vulnerabilities ?? null,
      production: productionParsed.value?.metadata?.vulnerabilities ?? null,
    },
  };
  const summary = renderSummary(result, metadata);
  writeJson(path.join(outputDirectory, "run-metadata.json"), metadata);
  writeJson(path.join(outputDirectory, "policy-result.json"), result);
  writeText(path.join(outputDirectory, "summary.md"), summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, redactText(summary), "utf8");
    } catch (error) {
      console.error(`Could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(summary);
  setExitCode(result.ok ? 0 : 1);
  return { result, metadata, outputDirectory };
}

module.exports = {
  FULL_AUDIT_ARGS,
  PRODUCTION_AUDIT_ARGS,
  evaluateAuditPolicy,
  extractGhsa,
  findingTupleKey,
  main,
  packageNameFromNodePath,
  parseJson,
  redactText,
  runAuditCommand,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(redactText(error instanceof Error ? error.stack ?? error.message : String(error)));
    process.exitCode = 1;
  });
}

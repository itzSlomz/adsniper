jest.mock("node-cron", () => ({
  __esModule: true,
  default: { schedule: jest.fn() },
}));
jest.mock("@/lib/db", () => ({
  prisma: {
    jobRun: { create: jest.fn(), update: jest.fn() },
  },
}));

import cron from "node-cron";
import { jobs, scheduledJobs, visibleJobs } from "@/jobs/index";
import { startCron } from "@/jobs/cron";

const scheduleMock = cron.schedule as unknown as jest.Mock;
const cronFlags = globalThis as unknown as { __cronStarted?: boolean };

const LEGACY_JOBS = [
  "x-poll",
  "x-metrics-refresh",
  "linkedin-poll",
  "ads-poll",
  "daily-brief",
  "weekly-brief",
  "brief-auto-publish",
  "media-migrate",
  "resolve-identities",
];
const LEGACY_SCHEDULED = LEGACY_JOBS.filter((name) => jobs[name].cron);
const MENTION_JOBS = ["mentions-poll", "mentions-classify", "mentions-retention"];

const originalExpiry = process.env.LICENSE_EXPIRES_AT;
const originalFeatures = process.env.LICENSE_FEATURES;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function flagOff() {
  process.env.LICENSE_EXPIRES_AT = "2099-01-01";
  delete process.env.LICENSE_FEATURES;
}

function flagOn() {
  process.env.LICENSE_EXPIRES_AT = "2099-01-01";
  process.env.LICENSE_FEATURES = "mentions";
}

describe("job registry", () => {
  beforeEach(() => {
    delete process.env.LICENSE_EXPIRES_AT;
    delete process.env.LICENSE_FEATURES;
  });

  afterAll(() => {
    restore("LICENSE_EXPIRES_AT", originalExpiry);
    restore("LICENSE_FEATURES", originalFeatures);
  });

  test("keeps the nine legacy jobs first, in order, with their schedules", () => {
    expect(Object.keys(jobs)).toEqual([...LEGACY_JOBS, ...MENTION_JOBS]);
    expect(LEGACY_SCHEDULED).toHaveLength(7);
    for (const name of LEGACY_JOBS) {
      expect(jobs[name].feature).toBeUndefined();
      expect(jobs[name].alwaysRun).toBeUndefined();
    }
  });

  test("gates every mentions job behind the mentions feature", () => {
    for (const name of MENTION_JOBS) expect(jobs[name].feature).toBe("mentions");
  });

  test("marks only mentions-retention as an alwaysRun duty", () => {
    const duties = Object.entries(jobs).filter(([, def]) => def.alwaysRun).map(([name]) => name);
    expect(duties).toEqual(["mentions-retention"]);
    expect(jobs["mentions-retention"].cron).toBe("20 3 * * *");
  });

  test("never schedules poll or classify — every pull is a manual, billed decision", () => {
    expect(jobs["mentions-poll"].cron).toBeNull();
    expect(jobs["mentions-classify"].cron).toBeNull();
  });

  test("visibleJobs() hides all three mentions jobs when unlicensed", () => {
    flagOff();
    expect(Object.keys(visibleJobs())).toEqual(LEGACY_JOBS);
  });

  test("visibleJobs({ mentionRows }) adds only the retention duty while leftovers exist", () => {
    flagOff();
    expect(Object.keys(visibleJobs({ mentionRows: 1 }))).toEqual([...LEGACY_JOBS, "mentions-retention"]);
    expect(Object.keys(visibleJobs({ mentionRows: 0 }))).toEqual(LEGACY_JOBS);
  });

  test("visibleJobs() shows every job when licensed or unconfigured", () => {
    flagOn();
    expect(Object.keys(visibleJobs())).toEqual([...LEGACY_JOBS, ...MENTION_JOBS]);
    delete process.env.LICENSE_EXPIRES_AT;
    expect(Object.keys(visibleJobs())).toEqual([...LEGACY_JOBS, ...MENTION_JOBS]);
  });

  test.each([
    ["off", flagOff],
    ["on", flagOn],
  ])("scheduledJobs() is the 7 legacy schedules plus the retention duty with the flag %s", (_label, setup) => {
    setup();
    const names = Object.keys(scheduledJobs());
    expect(names).toEqual([...LEGACY_SCHEDULED, "mentions-retention"]);
    expect(names).toHaveLength(8);
  });
});

describe("startCron", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    cronFlags.__cronStarted = false;
    scheduleMock.mockReset();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    cronFlags.__cronStarted = false;
  });

  afterAll(() => {
    restore("LICENSE_EXPIRES_AT", originalExpiry);
    restore("LICENSE_FEATURES", originalFeatures);
  });

  test.each([
    ["off", flagOff],
    ["on", flagOn],
  ])("registers exactly 8 schedules with the flag %s and logs only those", (_label, setup) => {
    setup();

    startCron();

    const expected = [...LEGACY_SCHEDULED, "mentions-retention"];
    expect(scheduleMock).toHaveBeenCalledTimes(8);
    expect(scheduleMock.mock.calls.map(([expr]) => expr)).toEqual(expected.map((n) => jobs[n].cron));
    expect(logSpy).toHaveBeenCalledWith(`[cron] scheduled: ${expected.join(", ")}`);
    const logged = (logSpy.mock.calls[0][0] as string).replace("[cron] scheduled: ", "").split(", ");
    expect(logged).not.toContain("mentions-poll");
    expect(logged).not.toContain("media-migrate");
  });

  test("starts only once per process", () => {
    flagOn();
    startCron();
    startCron();
    expect(scheduleMock).toHaveBeenCalledTimes(8);
  });
});

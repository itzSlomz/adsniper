jest.mock("@/lib/db", () => ({
  prisma: {
    jobRun: { create: jest.fn(), update: jest.fn() },
    providerCallLog: { create: jest.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { CostCeilingError } from "@/lib/costs";
import { runJob } from "@/jobs/runner";

const createMock = prisma.jobRun.create as jest.Mock;
const updateMock = prisma.jobRun.update as jest.Mock;
const providerLogMock = prisma.providerCallLog.create as jest.Mock;

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

function expired() {
  process.env.LICENSE_EXPIRES_AT = "2000-01-01";
  delete process.env.LICENSE_FEATURES;
}

describe("runJob entitlement semantics", () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ id: "run-1" });
    updateMock.mockReset().mockResolvedValue({});
    providerLogMock.mockReset();
    delete process.env.LICENSE_EXPIRES_AT;
    delete process.env.LICENSE_FEATURES;
  });

  afterAll(() => {
    restore("LICENSE_EXPIRES_AT", originalExpiry);
    restore("LICENSE_FEATURES", originalFeatures);
  });

  test("skips a gated job when the feature is not licensed", async () => {
    flagOff();
    const fn = jest.fn();

    const result = await runJob("j", fn, { feature: "mentions" });

    expect(fn).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped_entitlement");
    expect(result.itemsIngested).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^\(info\) feature "mentions" is not included/);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "skipped_entitlement",
        itemsIngested: 0,
        errorsJson: result.errors,
      }),
    });
    expect(providerLogMock).not.toHaveBeenCalled();
  });

  test("runs a gated job when the feature is licensed", async () => {
    flagOn();
    const fn = jest.fn(async (ctx) => {
      ctx.itemsIngested = 3;
    });

    const result = await runJob("j", fn, { feature: "mentions" });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "success", itemsIngested: 3, errors: [] });
  });

  test("runs a gated job on an unconfigured (dev/demo) instance", async () => {
    const fn = jest.fn();
    const result = await runJob("j", fn, { feature: "mentions" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
  });

  test("runs an ungated job even when the feature list is empty", async () => {
    flagOff();
    const fn = jest.fn();

    const result = await runJob("j", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
  });

  test("passes the manual flag through unchanged", async () => {
    let seen: boolean | undefined;
    await runJob("j", async (ctx) => { seen = ctx.manual; }, { manual: false });
    expect(seen).toBe(false);
    await runJob("j", async (ctx) => { seen = ctx.manual; });
    expect(seen).toBe(true);
  });

  test("records a cost ceiling abort as stopped_budget", async () => {
    flagOn();
    const fn = jest.fn(async () => {
      throw new CostCeilingError("ads", 12, 10);
    });

    const result = await runJob("j", fn, { feature: "mentions" });

    expect(result.status).toBe("stopped_budget");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "stopped_budget" }) })
    );
  });

  test("lets expiry win over entitlement: expired + flag off is stopped_license", async () => {
    expired();
    const fn = jest.fn();

    const result = await runJob("j", fn, { feature: "mentions" });

    expect(fn).not.toHaveBeenCalled();
    expect(result.status).toBe("stopped_license");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toMatch(/^\(info\)/);
  });

  test("still stops an ungated job on an expired license", async () => {
    expired();
    const fn = jest.fn();
    const result = await runJob("j", fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result.status).toBe("stopped_license");
  });

  test("runs an alwaysRun duty with the flag off", async () => {
    flagOff();
    const fn = jest.fn();

    const result = await runJob("j", fn, { feature: "mentions", alwaysRun: true });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
  });

  test("runs an alwaysRun duty on an expired license", async () => {
    expired();
    const fn = jest.fn();

    const result = await runJob("j", fn, { feature: "mentions", alwaysRun: true });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
  });

  test("keeps the rule that any (info) line makes the run partial", async () => {
    flagOn();
    const result = await runJob("j", async (ctx) => {
      ctx.errors.push("(info) no mention rows");
    }, { feature: "mentions", alwaysRun: true });
    expect(result.status).toBe("partial");
  });
});

describe("triggerJob", () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ id: "run-1" });
    updateMock.mockReset().mockResolvedValue({});
  });

  test("forwards the registry's feature and alwaysRun flags to runJob", async () => {
    const runJobMock = jest.fn().mockResolvedValue({ status: "success", itemsIngested: 0, errors: [] });
    let triggerJob: typeof import("@/jobs/index").triggerJob;
    jest.isolateModules(() => {
      jest.doMock("@/jobs/runner", () => ({ runJob: runJobMock }));
      ({ triggerJob } = require("@/jobs/index"));
    });

    await triggerJob!("mentions-retention", { manual: false });
    expect(runJobMock).toHaveBeenLastCalledWith(
      "mentions-retention",
      expect.any(Function),
      { manual: false, feature: "mentions", alwaysRun: true }
    );

    await triggerJob!("mentions-poll");
    expect(runJobMock).toHaveBeenLastCalledWith(
      "mentions-poll",
      expect.any(Function),
      { feature: "mentions", alwaysRun: undefined }
    );

    await triggerJob!("ads-poll");
    expect(runJobMock).toHaveBeenLastCalledWith(
      "ads-poll",
      expect.any(Function),
      { feature: undefined, alwaysRun: undefined }
    );

    await expect(triggerJob!("nope")).rejects.toThrow('Unknown job "nope"');
  });
});

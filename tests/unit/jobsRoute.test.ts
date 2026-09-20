jest.mock("@/lib/authorization", () => ({
  getAdminSession: jest.fn(),
}));
jest.mock("@/jobs/index", () => ({
  jobs: { "known-job": jest.fn() },
  triggerJob: jest.fn(),
}));
jest.mock("@/lib/costs", () => ({
  budgetStatus: jest.fn(),
}));

import { POST } from "@/app/api/jobs/[job]/route";
import { getAdminSession } from "@/lib/authorization";
import { triggerJob } from "@/jobs/index";
import { budgetStatus } from "@/lib/costs";

const getAdminSessionMock = getAdminSession as jest.Mock;
const triggerJobMock = triggerJob as jest.Mock;
const budgetStatusMock = budgetStatus as jest.Mock;

async function post(job: string) {
  return POST(new Request(`https://adsniper.test/api/jobs/${job}`, {
    method: "POST",
  }), { params: { job } });
}

describe("POST /api/jobs/[job]", () => {
  beforeEach(() => {
    getAdminSessionMock.mockReset();
    triggerJobMock.mockReset();
    budgetStatusMock.mockReset();
  });

  test.each(["anonymous", "viewer"])(
    "returns the existing 403 for %s",
    async () => {
      getAdminSessionMock.mockResolvedValue(null);

      const response = await post("known-job");

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "forbidden" });
      expect(triggerJobMock).not.toHaveBeenCalled();
      expect(budgetStatusMock).not.toHaveBeenCalled();
    }
  );

  test("returns 404 for an admin requesting an unknown job", async () => {
    getAdminSessionMock.mockResolvedValue({ user: { role: "admin" } });

    const response = await post("not-a-job");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "unknown job" });
    expect(triggerJobMock).not.toHaveBeenCalled();
    expect(budgetStatusMock).not.toHaveBeenCalled();
  });

  test("allows an admin to reach a known job", async () => {
    getAdminSessionMock.mockResolvedValue({ user: { role: "admin" } });
    triggerJobMock.mockResolvedValue({ status: "success", items: 2, errors: [] });
    budgetStatusMock.mockResolvedValue([{ group: "ads", spentUsd: 1 }]);

    const response = await post("known-job");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: "known-job",
      status: "success",
      items: 2,
      errors: [],
      budget: [{ group: "ads", spentUsd: 1 }],
    });
    expect(triggerJobMock).toHaveBeenCalledTimes(1);
    expect(triggerJobMock).toHaveBeenCalledWith("known-job");
    expect(budgetStatusMock).toHaveBeenCalledTimes(1);
  });
});
